<?php

declare(strict_types=1);

const API_MAX_BODY_BYTES = 32768;
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_SECONDS = 900;
const ALLOWED_STARTING_SCORES = [301, 501, 701, 901];
const ALLOWED_LEGS_TO_WIN = [1, 2, 3, 5];

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');
header('Pragma: no-cache');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');

ini_set('display_errors', '0');

final class ApiProblem extends RuntimeException
{
    public int $status;
    public string $errorCode;
    public ?array $details;

    public function __construct(int $status, string $errorCode, string $message, ?array $details = null)
    {
        parent::__construct($message);
        $this->status = $status;
        $this->errorCode = $errorCode;
        $this->details = $details;
    }
}

function sendJson(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    exit;
}

function sendData(array $data, int $status = 200): void
{
    sendJson($status, ['ok' => true, 'data' => $data]);
}

function problem(int $status, string $code, string $message, ?array $details = null): void
{
    throw new ApiProblem($status, $code, $message, $details);
}

function requireMethod(string $expected): void
{
    $actual = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    if ($actual !== $expected) {
        header('Allow: ' . $expected);
        problem(405, 'method-not-allowed', 'Ta operacja nie obsługuje metody ' . $actual . '.');
    }
}

function readJsonBody(): array
{
    $contentType = strtolower((string) ($_SERVER['CONTENT_TYPE'] ?? ''));
    if (strpos($contentType, 'application/json') !== 0) {
        problem(415, 'content-type-required', 'Wyślij dane jako application/json.');
    }

    $length = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($length > API_MAX_BODY_BYTES) {
        problem(413, 'body-too-large', 'Przesłane dane są zbyt duże.');
    }

    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }
    if (strlen($raw) > API_MAX_BODY_BYTES) {
        problem(413, 'body-too-large', 'Przesłane dane są zbyt duże.');
    }

    try {
        $decoded = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
    } catch (JsonException $exception) {
        problem(400, 'invalid-json', 'Nieprawidłowy format JSON.');
    }

    if (!is_array($decoded)) {
        problem(400, 'invalid-json-object', 'Treść żądania musi być obiektem JSON.');
    }

    return $decoded;
}

function requiredInt(array $data, string $key, int $minimum, int $maximum): int
{
    if (!array_key_exists($key, $data)) {
        problem(422, 'missing-field', 'Brakuje pola „' . $key . '”.', ['field' => $key]);
    }

    $value = $data[$key];
    if (is_string($value) && preg_match('/^-?\d+$/D', $value) === 1) {
        $value = (int) $value;
    }

    if (!is_int($value) || $value < $minimum || $value > $maximum) {
        problem(422, 'invalid-field', 'Pole „' . $key . '” ma nieprawidłową wartość.', ['field' => $key]);
    }

    return $value;
}

function requiredBool(array $data, string $key): bool
{
    if (!array_key_exists($key, $data) || !is_bool($data[$key])) {
        problem(422, 'invalid-field', 'Pole „' . $key . '” musi mieć wartość true albo false.', ['field' => $key]);
    }

    return $data[$key];
}

function loadConfiguration(): array
{
    $path = __DIR__ . '/config.local.php';
    if (!is_file($path)) {
        problem(503, 'setup-required', 'API nie jest jeszcze skonfigurowane. Utwórz plik api/config.local.php.');
    }

    $config = require $path;
    if (!is_array($config)) {
        problem(503, 'invalid-configuration', 'Plik konfiguracji API jest nieprawidłowy.');
    }

    $passwordHash = $config['password_hash'] ?? '';
    $hashInfo = is_string($passwordHash) ? password_get_info($passwordHash) : [];
    if (!is_string($passwordHash) || $passwordHash === '' || ($hashInfo['algoName'] ?? 'unknown') === 'unknown') {
        problem(503, 'setup-required', 'W konfiguracji brakuje prawidłowego hasha hasła.');
    }

    if (isset($config['secure_cookie']) && !is_bool($config['secure_cookie'])) {
        problem(503, 'invalid-configuration', 'Opcja secure_cookie musi być wartością logiczną.');
    }

    return $config;
}

function configureSession(array $config): void
{
    $sessionName = (string) ($config['session_name'] ?? 'dart_online_session');
    if (preg_match('/^[A-Za-z0-9_-]{3,48}$/D', $sessionName) !== 1) {
        problem(503, 'invalid-configuration', 'Nazwa sesji w konfiguracji jest nieprawidłowa.');
    }

    $lifetime = (int) ($config['session_lifetime'] ?? 43200);
    if ($lifetime < 900 || $lifetime > 604800) {
        problem(503, 'invalid-configuration', 'Czas życia sesji musi mieścić się między 900 a 604800 sekund.');
    }

    $scriptName = str_replace('\\', '/', (string) ($_SERVER['SCRIPT_NAME'] ?? '/api/index.php'));
    $cookiePath = rtrim(dirname(dirname($scriptName)), '/') . '/';
    if ($cookiePath === '//' || $cookiePath === './') {
        $cookiePath = '/';
    }

    ini_set('session.use_only_cookies', '1');
    ini_set('session.use_strict_mode', '1');
    ini_set('session.cookie_httponly', '1');
    ini_set('session.gc_maxlifetime', (string) $lifetime);
    session_name($sessionName);
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => $cookiePath,
        'domain' => '',
        'secure' => (bool) ($config['secure_cookie'] ?? true),
        'httponly' => true,
        'samesite' => 'Strict',
    ]);

    if (!session_start()) {
        problem(503, 'session-unavailable', 'Nie udało się uruchomić bezpiecznej sesji.');
    }
}

function openDatabase(): PDO
{
    if (!in_array('sqlite', PDO::getAvailableDrivers(), true)) {
        problem(503, 'sqlite-unavailable', 'Na serwerze nie jest dostępne rozszerzenie PDO SQLite.');
    }

    $directory = __DIR__ . '/data';
    if (!is_dir($directory) && !mkdir($directory, 0770, true) && !is_dir($directory)) {
        problem(503, 'storage-unavailable', 'Nie można utworzyć katalogu bazy danych.');
    }
    if (!is_writable($directory)) {
        problem(503, 'storage-not-writable', 'Katalog api/data nie jest zapisywalny przez PHP.');
    }

    try {
        $pdo = new PDO('sqlite:' . $directory . '/dart-online.sqlite', null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::ATTR_TIMEOUT => 5,
        ]);
        $pdo->exec('PRAGMA foreign_keys = ON');
        $pdo->exec('PRAGMA busy_timeout = 5000');
        $pdo->exec('PRAGMA journal_mode = WAL');
        $pdo->exec('PRAGMA synchronous = NORMAL');
        return $pdo;
    } catch (PDOException $exception) {
        error_log('Dart Online database error: ' . $exception->getMessage());
        problem(503, 'database-unavailable', 'Nie można otworzyć bazy danych. Sprawdź uprawnienia katalogu api/data.');
    }
}

function tableExists(PDO $pdo, string $table): bool
{
    $statement = $pdo->prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = :name");
    $statement->execute(['name' => $table]);
    return (bool) $statement->fetchColumn();
}

function columnExists(PDO $pdo, string $table, string $column): bool
{
    $columns = $pdo->query('PRAGMA table_info(' . $table . ')')->fetchAll();
    foreach ($columns as $item) {
        if (($item['name'] ?? null) === $column) {
            return true;
        }
    }
    return false;
}

function ensureColumn(PDO $pdo, string $table, string $column, string $definition): void
{
    if (!columnExists($pdo, $table, $column)) {
        $pdo->exec('ALTER TABLE ' . $table . ' ADD COLUMN ' . $column . ' ' . $definition);
    }
}

function migrateDatabase(PDO $pdo): void
{
    $pdo->exec(<<<'SQL'
        CREATE TABLE IF NOT EXISTS schema_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS players (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL COLLATE NOCASE UNIQUE,
            games_played INTEGER NOT NULL DEFAULT 0,
            games_won INTEGER NOT NULL DEFAULT 0,
            total_points INTEGER NOT NULL DEFAULT 0,
            total_darts_thrown INTEGER NOT NULL DEFAULT 0,
            count_100 INTEGER NOT NULL DEFAULT 0,
            count_140 INTEGER NOT NULL DEFAULT 0,
            count_180 INTEGER NOT NULL DEFAULT 0,
            hi_score INTEGER NOT NULL DEFAULT 0,
            highest_checkout INTEGER NOT NULL DEFAULT 0,
            best_leg_darts INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );

        CREATE TABLE IF NOT EXISTS games (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player1_id INTEGER NOT NULL,
            player2_id INTEGER NOT NULL,
            winner_id INTEGER,
            legs_to_win INTEGER NOT NULL,
            starting_score INTEGER NOT NULL DEFAULT 501,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            finished_at TEXT,
            FOREIGN KEY (player1_id) REFERENCES players(id) ON DELETE CASCADE,
            FOREIGN KEY (player2_id) REFERENCES players(id) ON DELETE CASCADE,
            FOREIGN KEY (winner_id) REFERENCES players(id) ON DELETE SET NULL,
            CHECK (player1_id <> player2_id),
            CHECK (legs_to_win IN (1, 2, 3, 5)),
            CHECK (starting_score IN (301, 501, 701, 901))
        );

        CREATE TABLE IF NOT EXISTS visits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            game_id INTEGER NOT NULL,
            leg_no INTEGER NOT NULL,
            visit_no INTEGER NOT NULL,
            player_id INTEGER NOT NULL,
            declared_score INTEGER NOT NULL,
            applied_score INTEGER NOT NULL,
            darts_used INTEGER NOT NULL,
            is_bust INTEGER NOT NULL DEFAULT 0,
            is_checkout INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
            FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
            UNIQUE (game_id, visit_no),
            CHECK (leg_no >= 1),
            CHECK (visit_no >= 1),
            CHECK (declared_score BETWEEN 0 AND 180),
            CHECK (applied_score BETWEEN 0 AND 180),
            CHECK (darts_used BETWEEN 1 AND 3),
            CHECK (is_bust IN (0, 1)),
            CHECK (is_checkout IN (0, 1))
        );

        CREATE TABLE IF NOT EXISTS login_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip_hash TEXT NOT NULL,
            attempted_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_visits_game_order ON visits(game_id, visit_no);
        CREATE INDEX IF NOT EXISTS idx_visits_player ON visits(player_id);
        CREATE INDEX IF NOT EXISTS idx_games_players ON games(player1_id, player2_id);
        CREATE INDEX IF NOT EXISTS idx_games_winner ON games(winner_id);
        CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time ON login_attempts(ip_hash, attempted_at);
        SQL);

    ensureColumn($pdo, 'players', 'games_played', 'INTEGER NOT NULL DEFAULT 0');
    ensureColumn($pdo, 'players', 'games_won', 'INTEGER NOT NULL DEFAULT 0');
    ensureColumn($pdo, 'players', 'total_points', 'INTEGER NOT NULL DEFAULT 0');
    ensureColumn($pdo, 'players', 'total_darts_thrown', 'INTEGER NOT NULL DEFAULT 0');
    ensureColumn($pdo, 'players', 'count_100', 'INTEGER NOT NULL DEFAULT 0');
    ensureColumn($pdo, 'players', 'count_140', 'INTEGER NOT NULL DEFAULT 0');
    ensureColumn($pdo, 'players', 'count_180', 'INTEGER NOT NULL DEFAULT 0');
    ensureColumn($pdo, 'players', 'hi_score', 'INTEGER NOT NULL DEFAULT 0');
    ensureColumn($pdo, 'players', 'highest_checkout', 'INTEGER NOT NULL DEFAULT 0');
    ensureColumn($pdo, 'players', 'best_leg_darts', 'INTEGER NOT NULL DEFAULT 0');
    ensureColumn($pdo, 'players', 'created_at', 'TEXT');
    $pdo->exec("UPDATE players SET created_at = COALESCE(created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))");

    ensureColumn($pdo, 'games', 'starting_score', 'INTEGER NOT NULL DEFAULT 501');
    ensureColumn($pdo, 'games', 'created_at', 'TEXT');
    ensureColumn($pdo, 'games', 'updated_at', 'TEXT');
    ensureColumn($pdo, 'games', 'finished_at', 'TEXT');
    $pdo->exec("UPDATE games SET updated_at = COALESCE(updated_at, created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))");

    $version = (int) ($pdo->query("SELECT value FROM schema_meta WHERE key = 'schema_version'")->fetchColumn() ?: 0);
    if ($version < 2) {
        transaction($pdo, static function () use ($pdo): void {
            migrateLegacyThrows($pdo);
            rebuildAllPlayerStats($pdo);
            $statement = $pdo->prepare("INSERT INTO schema_meta(key, value) VALUES ('schema_version', '2') ON CONFLICT(key) DO UPDATE SET value = excluded.value");
            $statement->execute();
        });
    }
}

function migrateLegacyThrows(PDO $pdo): void
{
    if (!tableExists($pdo, 'throws')) {
        return;
    }
    // Wersja nie została oznaczona jako ukończona, więc ewentualne częściowe
    // kopiowanie z poprzedniej próby trzeba rozpocząć od nowa w tej transakcji.
    $pdo->exec('DELETE FROM visits');

    $games = $pdo->query('SELECT id, player1_id, player2_id, winner_id, legs_to_win, starting_score FROM games ORDER BY id')->fetchAll();
    $selectThrows = $pdo->prepare('SELECT id, player_id, score, darts_used, created_at FROM throws WHERE game_id = :game_id ORDER BY id');
    $insertVisit = $pdo->prepare(<<<'SQL'
        INSERT INTO visits(game_id, leg_no, visit_no, player_id, declared_score, applied_score, darts_used, is_bust, is_checkout, created_at)
        VALUES (:game_id, :leg_no, :visit_no, :player_id, :declared_score, :applied_score, :darts_used, :is_bust, :is_checkout, :created_at)
        SQL);
    $setWinner = $pdo->prepare("UPDATE games SET winner_id = :winner_id, finished_at = COALESCE(finished_at, updated_at, created_at) WHERE id = :id");

    foreach ($games as $game) {
        $selectThrows->execute(['game_id' => (int) $game['id']]);
        $legacyThrows = $selectThrows->fetchAll();
        $p1 = (int) $game['player1_id'];
        $p2 = (int) $game['player2_id'];
        $startingScore = in_array((int) $game['starting_score'], ALLOWED_STARTING_SCORES, true) ? (int) $game['starting_score'] : 501;
        $legsToWin = in_array((int) $game['legs_to_win'], ALLOWED_LEGS_TO_WIN, true) ? (int) $game['legs_to_win'] : 3;
        $scores = [$p1 => $startingScore, $p2 => $startingScore];
        $legs = [$p1 => 0, $p2 => 0];
        $legNo = 1;
        $visitNo = 0;
        $derivedWinner = null;

        foreach ($legacyThrows as $legacy) {
            $playerId = (int) $legacy['player_id'];
            if ($playerId !== $p1 && $playerId !== $p2) {
                continue;
            }
            $visitNo++;
            $score = max(0, min(180, (int) $legacy['score']));
            $darts = max(1, min(3, (int) ($legacy['darts_used'] ?? 3)));
            $remaining = $scores[$playerId] - $score;
            $isBust = $remaining < 0 || $remaining === 1;
            $isCheckout = !$isBust && $remaining === 0;
            $applied = $isBust ? 0 : $score;

            $insertVisit->execute([
                'game_id' => (int) $game['id'],
                'leg_no' => $legNo,
                'visit_no' => $visitNo,
                'player_id' => $playerId,
                'declared_score' => $score,
                'applied_score' => $applied,
                'darts_used' => $darts,
                'is_bust' => $isBust ? 1 : 0,
                'is_checkout' => $isCheckout ? 1 : 0,
                'created_at' => $legacy['created_at'] ?? gmdate('c'),
            ]);

            if ($isCheckout) {
                $legs[$playerId]++;
                if ($legs[$playerId] >= $legsToWin) {
                    $derivedWinner = $playerId;
                } else {
                    $legNo++;
                    $scores = [$p1 => $startingScore, $p2 => $startingScore];
                }
            } elseif (!$isBust) {
                $scores[$playerId] = $remaining;
            }
        }

        if ($derivedWinner !== null) {
            $setWinner->execute(['winner_id' => $derivedWinner, 'id' => (int) $game['id']]);
        }
    }

    $selectThrows->closeCursor();
    unset($selectThrows);
    $pdo->exec('DROP TABLE throws');
}

function rebuildAllPlayerStats(PDO $pdo): void
{
    $pdo->exec(<<<'SQL'
        UPDATE players
        SET
            total_points = COALESCE((
                SELECT SUM(v.applied_score) FROM visits v WHERE v.player_id = players.id
            ), 0),
            total_darts_thrown = COALESCE((
                SELECT SUM(v.darts_used) FROM visits v WHERE v.player_id = players.id
            ), 0),
            count_100 = COALESCE((
                SELECT COUNT(*) FROM visits v
                WHERE v.player_id = players.id AND v.applied_score BETWEEN 100 AND 139
            ), 0),
            count_140 = COALESCE((
                SELECT COUNT(*) FROM visits v
                WHERE v.player_id = players.id AND v.applied_score BETWEEN 140 AND 179
            ), 0),
            count_180 = COALESCE((
                SELECT COUNT(*) FROM visits v
                WHERE v.player_id = players.id AND v.applied_score = 180
            ), 0),
            hi_score = COALESCE((
                SELECT MAX(v.applied_score) FROM visits v WHERE v.player_id = players.id
            ), 0),
            highest_checkout = COALESCE((
                SELECT MAX(v.applied_score) FROM visits v
                WHERE v.player_id = players.id AND v.is_checkout = 1
            ), 0),
            best_leg_darts = COALESCE((
                SELECT MIN(winning_leg.leg_darts)
                FROM (
                    SELECT v.player_id, v.game_id, v.leg_no, SUM(v.darts_used) AS leg_darts, MAX(v.is_checkout) AS won_leg
                    FROM visits v
                    GROUP BY v.player_id, v.game_id, v.leg_no
                ) AS winning_leg
                WHERE winning_leg.player_id = players.id AND winning_leg.won_leg = 1
            ), 0),
            games_played = COALESCE((
                SELECT COUNT(*) FROM games g
                WHERE g.winner_id IS NOT NULL AND (g.player1_id = players.id OR g.player2_id = players.id)
            ), 0),
            games_won = COALESCE((
                SELECT COUNT(*) FROM games g WHERE g.winner_id = players.id
            ), 0)
        SQL);
}

function transaction(PDO $pdo, callable $callback): mixed
{
    $pdo->beginTransaction();
    try {
        $result = $callback();
        $pdo->commit();
        return $result;
    } catch (Throwable $exception) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $exception;
    }
}

function requireAuthentication(): void
{
    if (!hasCurrentAuthentication()) {
        problem(401, 'authentication-required', 'Zaloguj się, aby korzystać z aplikacji.');
    }
}

function hasCurrentAuthentication(): bool
{
    $expiresAt = $_SESSION['expires_at'] ?? null;
    $csrfToken = $_SESSION['csrf_token'] ?? null;
    $authenticated = ($_SESSION['authenticated'] ?? false) === true
        && is_int($expiresAt)
        && $expiresAt > time()
        && is_string($csrfToken)
        && $csrfToken !== '';

    if (!$authenticated && (isset($_SESSION['authenticated']) || isset($_SESSION['expires_at']))) {
        $_SESSION = [];
    }

    return $authenticated;
}

function requireCsrf(): void
{
    $sessionToken = $_SESSION['csrf_token'] ?? null;
    $requestToken = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? null;
    if (!is_string($sessionToken) || !is_string($requestToken) || !hash_equals($sessionToken, $requestToken)) {
        problem(403, 'invalid-csrf-token', 'Sesja wygasła albo token bezpieczeństwa jest nieprawidłowy. Odśwież stronę.');
    }
}

function currentSessionData(): array
{
    $authenticated = hasCurrentAuthentication();
    return [
        'authenticated' => $authenticated,
        'csrf_token' => $authenticated ? (string) ($_SESSION['csrf_token'] ?? '') : null,
    ];
}

function clientIpHash(): string
{
    return hash('sha256', (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
}

function login(PDO $pdo, array $config): array
{
    $input = readJsonBody();
    $password = $input['password'] ?? null;
    if (!is_string($password) || $password === '' || strlen($password) > 256) {
        problem(422, 'invalid-credentials', 'Wpisz PIN lub hasło.');
    }

    $ipHash = clientIpHash();
    $now = time();
    $windowStart = $now - LOGIN_WINDOW_SECONDS;
    $pdo->prepare('DELETE FROM login_attempts WHERE attempted_at < :expiry')->execute(['expiry' => $now - 86400]);
    $attemptQuery = $pdo->prepare('SELECT COUNT(*) AS attempts, MIN(attempted_at) AS oldest FROM login_attempts WHERE ip_hash = :ip_hash AND attempted_at >= :window_start');
    $attemptQuery->execute(['ip_hash' => $ipHash, 'window_start' => $windowStart]);
    $attempts = $attemptQuery->fetch();
    if ((int) ($attempts['attempts'] ?? 0) >= LOGIN_MAX_ATTEMPTS) {
        $retryAfter = max(1, LOGIN_WINDOW_SECONDS - ($now - (int) $attempts['oldest']));
        header('Retry-After: ' . $retryAfter);
        problem(429, 'login-rate-limited', 'Zbyt wiele prób logowania. Spróbuj ponownie później.', ['retry_after' => $retryAfter]);
    }

    if (!password_verify($password, (string) $config['password_hash'])) {
        $pdo->prepare('INSERT INTO login_attempts(ip_hash, attempted_at) VALUES (:ip_hash, :attempted_at)')
            ->execute(['ip_hash' => $ipHash, 'attempted_at' => $now]);
        usleep(250000);
        problem(401, 'invalid-credentials', 'Nieprawidłowy PIN lub hasło.');
    }

    $pdo->prepare('DELETE FROM login_attempts WHERE ip_hash = :ip_hash')->execute(['ip_hash' => $ipHash]);
    session_regenerate_id(true);
    $_SESSION['authenticated'] = true;
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    $_SESSION['authenticated_at'] = $now;
    $_SESSION['expires_at'] = $now + (int) ($config['session_lifetime'] ?? 43200);
    return currentSessionData();
}

function logout(): array
{
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $parameters = session_get_cookie_params();
        setcookie(session_name(), '', [
            'expires' => time() - 42000,
            'path' => $parameters['path'],
            'domain' => $parameters['domain'],
            'secure' => $parameters['secure'],
            'httponly' => $parameters['httponly'],
            'samesite' => $parameters['samesite'] ?? 'Strict',
        ]);
    }
    session_destroy();
    return ['authenticated' => false, 'csrf_token' => null];
}

function normalizePlayer(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'name' => (string) $row['name'],
        'games_played' => (int) $row['games_played'],
        'games_won' => (int) $row['games_won'],
        'total_points' => (int) $row['total_points'],
        'total_darts_thrown' => (int) $row['total_darts_thrown'],
        'count_100' => (int) $row['count_100'],
        'count_140' => (int) $row['count_140'],
        'count_180' => (int) $row['count_180'],
        'hi_score' => (int) $row['hi_score'],
        'highest_checkout' => (int) $row['highest_checkout'],
        'best_leg_darts' => (int) $row['best_leg_darts'],
        'created_at' => (string) $row['created_at'],
    ];
}

function getPlayers(PDO $pdo): array
{
    $rows = $pdo->query('SELECT * FROM players ORDER BY name COLLATE NOCASE, id')->fetchAll();
    return array_map('normalizePlayer', $rows);
}

function normalizeVisit(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'game_id' => (int) $row['game_id'],
        'leg_no' => (int) $row['leg_no'],
        'visit_no' => (int) $row['visit_no'],
        'player_id' => (int) $row['player_id'],
        'declared_score' => (int) $row['declared_score'],
        'applied_score' => (int) $row['applied_score'],
        'darts_used' => (int) $row['darts_used'],
        'is_bust' => (bool) $row['is_bust'],
        'is_checkout' => (bool) $row['is_checkout'],
        'created_at' => (string) $row['created_at'],
    ];
}

function fetchGameRow(PDO $pdo, int $gameId): array
{
    $statement = $pdo->prepare(<<<'SQL'
        SELECT g.*, p1.name AS player1_name, p2.name AS player2_name
        FROM games g
        JOIN players p1 ON p1.id = g.player1_id
        JOIN players p2 ON p2.id = g.player2_id
        WHERE g.id = :id
        SQL);
    $statement->execute(['id' => $gameId]);
    $game = $statement->fetch();
    if (!$game) {
        problem(404, 'game-not-found', 'Nie znaleziono meczu.');
    }
    return $game;
}

function fetchGameVisits(PDO $pdo, int $gameId): array
{
    $statement = $pdo->prepare('SELECT * FROM visits WHERE game_id = :game_id ORDER BY visit_no, id');
    $statement->execute(['game_id' => $gameId]);
    return array_map('normalizeVisit', $statement->fetchAll());
}

function replayGame(array $game, array $visits): array
{
    $p1 = (int) $game['player1_id'];
    $p2 = (int) $game['player2_id'];
    $startingScore = (int) $game['starting_score'];
    $legsToWin = (int) $game['legs_to_win'];
    $scores = [$p1 => $startingScore, $p2 => $startingScore];
    $legs = [$p1 => 0, $p2 => 0];
    $points = [$p1 => 0, $p2 => 0];
    $darts = [$p1 => 0, $p2 => 0];
    $high = [$p1 => 0, $p2 => 0];
    $currentLegDarts = [$p1 => 0, $p2 => 0];
    $currentLeg = 1;
    $currentPlayer = $p1;
    $derivedWinner = null;

    foreach ($visits as $visit) {
        $playerId = (int) $visit['player_id'];
        if ($playerId !== $p1 && $playerId !== $p2) {
            continue;
        }

        $visitLeg = max(1, (int) $visit['leg_no']);
        if ($visitLeg > $currentLeg) {
            $currentLeg = $visitLeg;
            $scores = [$p1 => $startingScore, $p2 => $startingScore];
            $currentLegDarts = [$p1 => 0, $p2 => 0];
            $currentPlayer = $currentLeg % 2 === 1 ? $p1 : $p2;
        }

        $applied = max(0, (int) $visit['applied_score']);
        $used = max(1, min(3, (int) $visit['darts_used']));
        $scores[$playerId] = max(0, $scores[$playerId] - $applied);
        $points[$playerId] += $applied;
        $darts[$playerId] += $used;
        $high[$playerId] = max($high[$playerId], $applied);
        $currentLegDarts[$playerId] += $used;

        if ((bool) $visit['is_checkout']) {
            $legs[$playerId]++;
            if ($legs[$playerId] >= $legsToWin) {
                $derivedWinner = $playerId;
                $currentPlayer = null;
            } else {
                $currentLeg++;
                $scores = [$p1 => $startingScore, $p2 => $startingScore];
                $currentLegDarts = [$p1 => 0, $p2 => 0];
                $currentPlayer = $currentLeg % 2 === 1 ? $p1 : $p2;
            }
        } elseif ($derivedWinner === null) {
            $currentPlayer = $playerId === $p1 ? $p2 : $p1;
        }
    }

    $storedWinner = $game['winner_id'] === null ? null : (int) $game['winner_id'];
    $winnerId = $storedWinner ?? $derivedWinner;
    if ($winnerId !== null) {
        $currentPlayer = null;
    }

    $playerState = static function (int $id, string $name, int $position) use ($scores, $legs, $points, $darts, $high, $currentLegDarts): array {
        return [
            'id' => $id,
            'name' => $name,
            'position' => $position,
            'remaining' => $scores[$id],
            'legs' => $legs[$id],
            'points' => $points[$id],
            'darts' => $darts[$id],
            'average' => $darts[$id] > 0 ? round(($points[$id] / $darts[$id]) * 3, 2) : 0.0,
            'highest_visit' => $high[$id],
            'current_leg_darts' => $currentLegDarts[$id],
        ];
    };

    return [
        'game' => [
            'id' => (int) $game['id'],
            'player1_id' => $p1,
            'player2_id' => $p2,
            'winner_id' => $winnerId,
            'legs_to_win' => $legsToWin,
            'starting_score' => $startingScore,
            'status' => $winnerId === null ? 'active' : 'finished',
            'current_leg' => $currentLeg,
            'max_legs' => $legsToWin * 2 - 1,
            'current_player_id' => $currentPlayer,
            'leg_starter_id' => $currentLeg % 2 === 1 ? $p1 : $p2,
            'created_at' => (string) $game['created_at'],
            'updated_at' => (string) ($game['updated_at'] ?? $game['created_at']),
            'finished_at' => $game['finished_at'] === null ? null : (string) $game['finished_at'],
        ],
        'players' => [
            $playerState($p1, (string) $game['player1_name'], 1),
            $playerState($p2, (string) $game['player2_name'], 2),
        ],
        'visits' => array_values($visits),
        'can_undo' => count($visits) > 0,
    ];
}

function fetchGameSnapshot(PDO $pdo, int $gameId): array
{
    return replayGame(fetchGameRow($pdo, $gameId), fetchGameVisits($pdo, $gameId));
}

function snapshotSummary(array $snapshot): array
{
    return [
        'id' => $snapshot['game']['id'],
        'player1' => $snapshot['players'][0],
        'player2' => $snapshot['players'][1],
        'winner_id' => $snapshot['game']['winner_id'],
        'legs_to_win' => $snapshot['game']['legs_to_win'],
        'starting_score' => $snapshot['game']['starting_score'],
        'status' => $snapshot['game']['status'],
        'current_leg' => $snapshot['game']['current_leg'],
        'current_player_id' => $snapshot['game']['current_player_id'],
        'created_at' => $snapshot['game']['created_at'],
        'updated_at' => $snapshot['game']['updated_at'],
        'finished_at' => $snapshot['game']['finished_at'],
        'visit_count' => count($snapshot['visits']),
    ];
}

function fetchGameRows(PDO $pdo, bool $finished): array
{
    $where = $finished ? 'g.winner_id IS NOT NULL' : 'g.winner_id IS NULL';
    $limit = $finished ? ' LIMIT 50' : '';
    return $pdo->query(<<<SQL
        SELECT g.*, p1.name AS player1_name, p2.name AS player2_name
        FROM games g
        JOIN players p1 ON p1.id = g.player1_id
        JOIN players p2 ON p2.id = g.player2_id
        WHERE {$where}
        ORDER BY COALESCE(g.finished_at, g.updated_at, g.created_at) DESC, g.id DESC{$limit}
        SQL)->fetchAll();
}

function fetchVisitsGrouped(PDO $pdo, array $gameIds): array
{
    if ($gameIds === []) {
        return [];
    }
    $placeholders = implode(',', array_fill(0, count($gameIds), '?'));
    $statement = $pdo->prepare('SELECT * FROM visits WHERE game_id IN (' . $placeholders . ') ORDER BY game_id, visit_no, id');
    $statement->execute($gameIds);
    $grouped = [];
    foreach ($statement->fetchAll() as $row) {
        $visit = normalizeVisit($row);
        $grouped[$visit['game_id']][] = $visit;
    }
    return $grouped;
}

function getDashboard(PDO $pdo): array
{
    $activeRows = fetchGameRows($pdo, false);
    $historyRows = fetchGameRows($pdo, true);
    $allRows = array_merge($activeRows, $historyRows);
    $ids = array_map(static fn (array $row): int => (int) $row['id'], $allRows);
    $visits = fetchVisitsGrouped($pdo, $ids);
    $summaries = [];
    foreach ($allRows as $row) {
        $gameId = (int) $row['id'];
        $summaries[$gameId] = snapshotSummary(replayGame($row, $visits[$gameId] ?? []));
    }

    return [
        'players' => getPlayers($pdo),
        'active_games' => array_map(static fn (array $row): array => $summaries[(int) $row['id']], $activeRows),
        'history' => array_map(static fn (array $row): array => $summaries[(int) $row['id']], $historyRows),
    ];
}

function createPlayer(PDO $pdo, array $input): array
{
    $name = $input['name'] ?? null;
    if (!is_string($name)) {
        problem(422, 'invalid-player-name', 'Podaj nazwę zawodnika.');
    }
    $name = preg_replace('/\s+/u', ' ', trim($name)) ?? '';
    $length = function_exists('mb_strlen') ? mb_strlen($name, 'UTF-8') : strlen($name);
    if ($length < 1 || $length > 40 || preg_match('/[\x00-\x1F\x7F]/u', $name) === 1) {
        problem(422, 'invalid-player-name', 'Nazwa zawodnika musi mieć od 1 do 40 znaków.');
    }

    return transaction($pdo, static function () use ($pdo, $name): array {
        $duplicate = $pdo->prepare('SELECT id FROM players WHERE name = :name COLLATE NOCASE LIMIT 1');
        $duplicate->execute(['name' => $name]);
        if ($duplicate->fetchColumn() !== false) {
            problem(409, 'player-name-exists', 'Zawodnik o tej nazwie już istnieje.');
        }

        try {
            $statement = $pdo->prepare('INSERT INTO players(name) VALUES (:name)');
            $statement->execute(['name' => $name]);
        } catch (PDOException $exception) {
            if ((string) ($exception->errorInfo[0] ?? '') === '23000') {
                problem(409, 'player-name-exists', 'Zawodnik o tej nazwie już istnieje.');
            }
            throw $exception;
        }

        $id = (int) $pdo->lastInsertId();
        $statement = $pdo->prepare('SELECT * FROM players WHERE id = :id');
        $statement->execute(['id' => $id]);
        return normalizePlayer($statement->fetch());
    });
}

function deletePlayer(PDO $pdo, int $playerId): array
{
    return transaction($pdo, static function () use ($pdo, $playerId): array {
        $statement = $pdo->prepare('SELECT name FROM players WHERE id = :id');
        $statement->execute(['id' => $playerId]);
        $name = $statement->fetchColumn();
        if ($name === false) {
            problem(404, 'player-not-found', 'Nie znaleziono zawodnika.');
        }
        if (tableExists($pdo, 'throws')) {
            $legacy = $pdo->prepare('DELETE FROM throws WHERE game_id IN (SELECT id FROM games WHERE player1_id = :id1 OR player2_id = :id2)');
            $legacy->execute(['id1' => $playerId, 'id2' => $playerId]);
        }
        $deleteGames = $pdo->prepare('DELETE FROM games WHERE player1_id = :id1 OR player2_id = :id2');
        $deleteGames->execute(['id1' => $playerId, 'id2' => $playerId]);
        $pdo->prepare('DELETE FROM players WHERE id = :id')->execute(['id' => $playerId]);
        rebuildAllPlayerStats($pdo);
        return ['deleted' => true, 'id' => $playerId, 'name' => (string) $name];
    });
}

function createGame(PDO $pdo, array $input): array
{
    $player1 = requiredInt($input, 'player1_id', 1, PHP_INT_MAX);
    $player2 = requiredInt($input, 'player2_id', 1, PHP_INT_MAX);
    $legsToWin = requiredInt($input, 'legs_to_win', 1, 5);
    $startingScore = requiredInt($input, 'starting_score', 301, 901);

    if ($player1 === $player2) {
        problem(422, 'players-must-differ', 'Wybierz dwóch różnych zawodników.');
    }
    if (!in_array($legsToWin, ALLOWED_LEGS_TO_WIN, true)) {
        problem(422, 'invalid-legs', 'Dozwolona liczba legów do wygrania to 1, 2, 3 albo 5.');
    }
    if (!in_array($startingScore, ALLOWED_STARTING_SCORES, true)) {
        problem(422, 'invalid-starting-score', 'Dozwolony wynik startowy to 301, 501, 701 albo 901.');
    }

    return transaction($pdo, static function () use ($pdo, $player1, $player2, $legsToWin, $startingScore): array {
        $statement = $pdo->prepare('SELECT COUNT(*) FROM players WHERE id IN (:player1, :player2)');
        $statement->execute(['player1' => $player1, 'player2' => $player2]);
        if ((int) $statement->fetchColumn() !== 2) {
            problem(422, 'player-not-found', 'Co najmniej jeden z wybranych zawodników nie istnieje.');
        }

        $insert = $pdo->prepare('INSERT INTO games(player1_id, player2_id, legs_to_win, starting_score) VALUES (:player1, :player2, :legs, :score)');
        $insert->execute(['player1' => $player1, 'player2' => $player2, 'legs' => $legsToWin, 'score' => $startingScore]);
        return fetchGameSnapshot($pdo, (int) $pdo->lastInsertId());
    });
}

function legalDartScores(): array
{
    static $scores = null;
    if ($scores !== null) {
        return $scores;
    }
    $values = [0, 25, 50];
    for ($number = 1; $number <= 20; $number++) {
        $values[] = $number;
        $values[] = $number * 2;
        $values[] = $number * 3;
    }
    $scores = array_values(array_unique($values));
    return $scores;
}

function legalDoubles(): array
{
    $values = [50];
    for ($number = 1; $number <= 20; $number++) {
        $values[] = $number * 2;
    }
    return $values;
}

function isPossibleVisitScore(int $score, int $dartsUsed): bool
{
    foreach (legalDartScores() as $first) {
        if ($dartsUsed === 1 && $first === $score) {
            return true;
        }
        if ($dartsUsed >= 2) {
            foreach (legalDartScores() as $second) {
                if ($dartsUsed === 2 && $first + $second === $score) {
                    return true;
                }
                if ($dartsUsed === 3) {
                    foreach (legalDartScores() as $third) {
                        if ($first + $second + $third === $score) {
                            return true;
                        }
                    }
                }
            }
        }
    }
    return false;
}

function isPossibleCheckout(int $score, int $dartsUsed): bool
{
    foreach (legalDoubles() as $double) {
        if ($dartsUsed === 1 && $double === $score) {
            return true;
        }
        if ($dartsUsed >= 2) {
            foreach (legalDartScores() as $first) {
                if ($dartsUsed === 2 && $first + $double === $score) {
                    return true;
                }
                if ($dartsUsed === 3) {
                    foreach (legalDartScores() as $second) {
                        if ($first + $second + $double === $score) {
                            return true;
                        }
                    }
                }
            }
        }
    }
    return false;
}

function finishGame(PDO $pdo, int $gameId, int $winnerId): void
{
    $statement = $pdo->prepare(<<<'SQL'
        UPDATE games
        SET winner_id = :winner_id,
            finished_at = COALESCE(finished_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = :id AND winner_id IS NULL
        SQL);
    $statement->execute(['winner_id' => $winnerId, 'id' => $gameId]);

    $check = $pdo->prepare('SELECT winner_id FROM games WHERE id = :id');
    $check->execute(['id' => $gameId]);
    $storedWinner = $check->fetchColumn();
    if ($storedWinner === false || (int) $storedWinner !== $winnerId) {
        problem(409, 'winner-conflict', 'Mecz ma już innego zwycięzcę.');
    }
}

function recordVisit(PDO $pdo, array $input): array
{
    $gameId = requiredInt($input, 'game_id', 1, PHP_INT_MAX);
    $playerId = requiredInt($input, 'player_id', 1, PHP_INT_MAX);
    $score = requiredInt($input, 'score', 0, 180);
    $dartsUsed = requiredInt($input, 'darts_used', 1, 3);
    $doubleConfirmed = requiredBool($input, 'double_confirmed');

    return transaction($pdo, static function () use ($pdo, $gameId, $playerId, $score, $dartsUsed, $doubleConfirmed): array {
        $snapshot = fetchGameSnapshot($pdo, $gameId);
        if ($snapshot['game']['winner_id'] !== null) {
            problem(409, 'game-finished', 'Ten mecz jest już zakończony. Możesz cofnąć ostatnią wizytę.');
        }
        if ($snapshot['game']['current_player_id'] !== $playerId) {
            problem(409, 'wrong-player-turn', 'Rzut należy teraz do innego zawodnika.', ['current_player_id' => $snapshot['game']['current_player_id']]);
        }

        $playerState = null;
        foreach ($snapshot['players'] as $candidate) {
            if ($candidate['id'] === $playerId) {
                $playerState = $candidate;
                break;
            }
        }
        if ($playerState === null) {
            problem(422, 'player-not-in-game', 'Zawodnik nie bierze udziału w tym meczu.');
        }

        $remainingAfter = $playerState['remaining'] - $score;
        $isCheckout = $remainingAfter === 0 && $doubleConfirmed;
        $isBust = $remainingAfter < 0 || $remainingAfter === 1 || ($remainingAfter === 0 && !$doubleConfirmed);

        if (!isPossibleVisitScore($score, $dartsUsed)) {
            problem(422, 'impossible-visit-score', 'Tego wyniku nie da się uzyskać podaną liczbą legalnych lotek.');
        }
        if ($doubleConfirmed && $remainingAfter !== 0) {
            problem(422, 'double-not-applicable', 'Potwierdzenie podwójnego pola jest dozwolone tylko przy zejściu do zera.');
        }
        if ($isCheckout) {
            if (!isPossibleCheckout($score, $dartsUsed)) {
                problem(422, 'impossible-checkout', 'Tego wyniku nie da się zakończyć na podwójnym polu podaną liczbą lotek.');
            }
        } elseif (!$isBust && $dartsUsed !== 3) {
            problem(422, 'invalid-darts-used', 'Dla wizyty bez checkoutu zapisywane są trzy lotki.');
        }

        $appliedScore = $isBust ? 0 : $score;
        $visitNumber = count($snapshot['visits']) + 1;
        $insert = $pdo->prepare(<<<'SQL'
            INSERT INTO visits(game_id, leg_no, visit_no, player_id, declared_score, applied_score, darts_used, is_bust, is_checkout)
            VALUES (:game_id, :leg_no, :visit_no, :player_id, :declared_score, :applied_score, :darts_used, :is_bust, :is_checkout)
            SQL);
        $insert->execute([
            'game_id' => $gameId,
            'leg_no' => $snapshot['game']['current_leg'],
            'visit_no' => $visitNumber,
            'player_id' => $playerId,
            'declared_score' => $score,
            'applied_score' => $appliedScore,
            'darts_used' => $dartsUsed,
            'is_bust' => $isBust ? 1 : 0,
            'is_checkout' => $isCheckout ? 1 : 0,
        ]);

        $pdo->prepare("UPDATE games SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = :id")
            ->execute(['id' => $gameId]);

        if ($isCheckout && $playerState['legs'] + 1 >= $snapshot['game']['legs_to_win']) {
            finishGame($pdo, $gameId, $playerId);
        }

        rebuildAllPlayerStats($pdo);
        return fetchGameSnapshot($pdo, $gameId);
    });
}

function finishCompletedGame(PDO $pdo, int $gameId): array
{
    return transaction($pdo, static function () use ($pdo, $gameId): array {
        $game = fetchGameRow($pdo, $gameId);
        $snapshot = replayGame($game, fetchGameVisits($pdo, $gameId));
        if ($game['winner_id'] !== null) {
            return $snapshot;
        }
        $winnerId = null;
        foreach ($snapshot['players'] as $player) {
            if ($player['legs'] >= $snapshot['game']['legs_to_win']) {
                $winnerId = $player['id'];
                break;
            }
        }
        if ($winnerId === null) {
            problem(409, 'game-not-complete', 'Mecz nie ma jeszcze wymaganej liczby wygranych legów.');
        }
        finishGame($pdo, $gameId, $winnerId);
        rebuildAllPlayerStats($pdo);
        return fetchGameSnapshot($pdo, $gameId);
    });
}

function undoLastVisit(PDO $pdo, int $gameId): array
{
    return transaction($pdo, static function () use ($pdo, $gameId): array {
        fetchGameRow($pdo, $gameId);
        $statement = $pdo->prepare('SELECT id FROM visits WHERE game_id = :game_id ORDER BY visit_no DESC, id DESC LIMIT 1');
        $statement->execute(['game_id' => $gameId]);
        $visitId = $statement->fetchColumn();
        if ($visitId === false) {
            problem(409, 'nothing-to-undo', 'Ten mecz nie ma jeszcze żadnej zapisanej wizyty.');
        }

        $pdo->prepare('DELETE FROM visits WHERE id = :id')->execute(['id' => (int) $visitId]);
        $pdo->prepare(<<<'SQL'
            UPDATE games
            SET winner_id = NULL,
                finished_at = NULL,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = :id
            SQL)->execute(['id' => $gameId]);
        rebuildAllPlayerStats($pdo);
        return fetchGameSnapshot($pdo, $gameId);
    });
}

function deleteGame(PDO $pdo, int $gameId): array
{
    return transaction($pdo, static function () use ($pdo, $gameId): array {
        fetchGameRow($pdo, $gameId);
        if (tableExists($pdo, 'throws')) {
            $pdo->prepare('DELETE FROM throws WHERE game_id = :id')->execute(['id' => $gameId]);
        }
        $pdo->prepare('DELETE FROM games WHERE id = :id')->execute(['id' => $gameId]);
        rebuildAllPlayerStats($pdo);
        return ['deleted' => true, 'id' => $gameId];
    });
}

try {
    $configuration = loadConfiguration();
    configureSession($configuration);
    $database = openDatabase();
    migrateDatabase($database);

    $action = (string) ($_GET['action'] ?? 'session');

    if ($action === 'session') {
        requireMethod('GET');
        sendData(currentSessionData());
    }
    if ($action === 'login') {
        requireMethod('POST');
        sendData(login($database, $configuration));
    }

    requireAuthentication();

    if ($action === 'logout') {
        requireMethod('POST');
        requireCsrf();
        sendData(logout());
    }
    if ($action === 'dashboard') {
        requireMethod('GET');
        sendData(getDashboard($database));
    }
    if ($action === 'game') {
        requireMethod('GET');
        $gameId = filter_input(INPUT_GET, 'id', FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        if (!is_int($gameId)) {
            problem(422, 'invalid-game-id', 'Podaj prawidłowy identyfikator meczu.');
        }
        sendData(fetchGameSnapshot($database, $gameId));
    }

    requireMethod('POST');
    requireCsrf();
    $body = readJsonBody();

    if ($action === 'player-create') {
        sendData(createPlayer($database, $body), 201);
    }
    if ($action === 'player-delete') {
        sendData(deletePlayer($database, requiredInt($body, 'player_id', 1, PHP_INT_MAX)));
    }
    if ($action === 'game-create') {
        sendData(createGame($database, $body), 201);
    }
    if ($action === 'visit-create') {
        sendData(recordVisit($database, $body), 201);
    }
    if ($action === 'visit-undo') {
        sendData(undoLastVisit($database, requiredInt($body, 'game_id', 1, PHP_INT_MAX)));
    }
    if ($action === 'game-finish') {
        sendData(finishCompletedGame($database, requiredInt($body, 'game_id', 1, PHP_INT_MAX)));
    }
    if ($action === 'game-delete') {
        sendData(deleteGame($database, requiredInt($body, 'game_id', 1, PHP_INT_MAX)));
    }

    problem(404, 'unknown-action', 'Nieznana operacja API.');
} catch (ApiProblem $exception) {
    $error = [
        'code' => $exception->errorCode,
        'message' => $exception->getMessage(),
    ];
    if ($exception->details !== null) {
        $error['details'] = $exception->details;
    }
    sendJson($exception->status, ['ok' => false, 'error' => $error]);
} catch (Throwable $exception) {
    error_log('Dart Online API failure: ' . $exception->getMessage());
    sendJson(500, [
        'ok' => false,
        'error' => [
            'code' => 'internal-error',
            'message' => 'Wystąpił nieoczekiwany błąd serwera.',
        ],
    ]);
}
