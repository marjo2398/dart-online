<?php

declare(strict_types=1);

const API_MAX_BODY_BYTES = 32768;
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_SECONDS = 900;
const ALLOWED_STARTING_SCORES = [301, 501, 701, 901];
const ALLOWED_LEGS_TO_WIN = [1, 2, 3, 5];

require_once __DIR__ . '/sync.php';
require_once __DIR__ . '/formats.php';
require_once __DIR__ . '/operations.php';
require_once __DIR__ . '/profiles.php';
require_once __DIR__ . '/analysis.php';

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
    global $database;
    if ($database instanceof PDO && $database->inTransaction()) { $database->commit(); }
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

    if (!is_array($decoded) || substr(ltrim($raw), 0, 1) !== '{') {
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
    if (tableExists($pdo, 'schema_meta') && (int) $pdo->query("SELECT value FROM schema_meta WHERE key = 'schema_version'")->fetchColumn() >= 3) {
        migrateFormats($pdo);
        migrateOperations($pdo);
        migrateProfiles($pdo);
        return;
    }
    transaction($pdo, static function () use ($pdo): void {
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
            $statement = $pdo->prepare("INSERT INTO schema_meta(key, value) VALUES ('schema_version', '2') ON CONFLICT(key) DO UPDATE SET value = excluded.value");
            $statement->execute();
        });
    }
    migrateSync($pdo);
    });
    migrateFormats($pdo);
    migrateOperations($pdo);
    migrateProfiles($pdo);
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
                SELECT SUM(v.applied_score) FROM visits v WHERE v.game_id IN (SELECT id FROM games WHERE legacy_compatible=1 AND stats_eligible=1) AND v.active=1 AND v.player_id = players.id
            ), 0),
            total_darts_thrown = COALESCE((
                SELECT SUM(v.darts_used) FROM visits v WHERE v.game_id IN (SELECT id FROM games WHERE legacy_compatible=1 AND stats_eligible=1) AND v.active=1 AND v.player_id = players.id
            ), 0),
            count_100 = COALESCE((
                SELECT COUNT(*) FROM visits v
                WHERE v.game_id IN (SELECT id FROM games WHERE legacy_compatible=1 AND stats_eligible=1) AND v.active=1 AND v.player_id = players.id AND v.applied_score BETWEEN 100 AND 139
            ), 0),
            count_140 = COALESCE((
                SELECT COUNT(*) FROM visits v
                WHERE v.game_id IN (SELECT id FROM games WHERE legacy_compatible=1 AND stats_eligible=1) AND v.active=1 AND v.player_id = players.id AND v.applied_score BETWEEN 140 AND 179
            ), 0),
            count_180 = COALESCE((
                SELECT COUNT(*) FROM visits v
                WHERE v.game_id IN (SELECT id FROM games WHERE legacy_compatible=1 AND stats_eligible=1) AND v.active=1 AND v.player_id = players.id AND v.applied_score = 180
            ), 0),
            hi_score = COALESCE((
                SELECT MAX(v.applied_score) FROM visits v WHERE v.game_id IN (SELECT id FROM games WHERE legacy_compatible=1 AND stats_eligible=1) AND v.active=1 AND v.player_id = players.id
            ), 0),
            highest_checkout = COALESCE((
                SELECT MAX(v.applied_score) FROM visits v
                WHERE v.game_id IN (SELECT id FROM games WHERE legacy_compatible=1 AND stats_eligible=1) AND v.active=1 AND v.player_id = players.id AND v.is_checkout = 1
            ), 0),
            best_leg_darts = COALESCE((
                SELECT MIN(winning_leg.leg_darts)
                FROM (
                    SELECT v.player_id, v.game_id, v.leg_no, SUM(v.darts_used) AS leg_darts, MAX(v.is_checkout) AS won_leg
                    FROM visits v
                    WHERE v.game_id IN (SELECT id FROM games WHERE legacy_compatible=1 AND stats_eligible=1) AND v.active=1
                    GROUP BY v.player_id, v.game_id, v.leg_no
                ) AS winning_leg
                WHERE winning_leg.player_id = players.id AND winning_leg.won_leg = 1
            ), 0),
            games_played = COALESCE((
                SELECT COUNT(*) FROM games g
                WHERE g.legacy_compatible=1 AND g.stats_eligible=1 AND (g.decision_json IS NULL OR EXISTS(SELECT 1 FROM visits WHERE game_id=g.id AND active=1)) AND g.winner_id IS NOT NULL AND (g.player1_id = players.id OR g.player2_id = players.id)
            ), 0),
            games_won = COALESCE((
                SELECT COUNT(*) FROM games g WHERE g.legacy_compatible=1 AND g.stats_eligible=1 AND (g.decision_json IS NULL OR EXISTS(SELECT 1 FROM visits WHERE game_id=g.id AND active=1)) AND g.winner_id = players.id
            ), 0)
        SQL);
}

function transaction(PDO $pdo, callable $callback)
{
    static $depth = [];
    $id = spl_object_hash($pdo);
    if (($depth[$id] ?? 0) > 0) {
        return $callback();
    }
    // PDO on PHP 7.4 does not track an explicit BEGIN IMMEDIATE transaction.
    $pdo->exec('BEGIN IMMEDIATE');
    $depth[$id] = 1;
    try {
        $result = $callback();
        $pdo->exec('COMMIT');
        return $result;
    } catch (Throwable $exception) {
        $pdo->exec('ROLLBACK');
        throw $exception;
    } finally {
        unset($depth[$id]);
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
    return profileFields($row) + [
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
    $rows = $pdo->query('SELECT * FROM players WHERE archived=0 AND merged_into IS NULL ORDER BY name COLLATE NOCASE, id')->fetchAll();
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
        'mode' => (string) ($row['mode'] ?? 'aggregate'),
        'is_complete' => (bool) ($row['is_complete'] ?? true),
        'opened_after' => (bool) ($row['opened_after'] ?? true),
        'double_confirmed' => (bool) ($row['double_confirmed'] ?? $row['is_checkout']),
        'input_mode' => $row['input_mode'] ?? 'score',
        'recording_level' => $row['recording_level'] ?? null,
        'checkout_attempts' => isset($row['checkout_attempts']) ? (int)$row['checkout_attempts'] : null,
        'source' => $row['source'] ?? null,
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
    $statement = $pdo->prepare('SELECT * FROM visits WHERE game_id = :game_id AND active=1 ORDER BY visit_no, id');
    $statement->execute(['game_id' => $gameId]);
    return array_map('normalizeVisit', $statement->fetchAll());
}

function replayGame(array $game, array $visits): array
{
    return operationSnapshot($game,replayFormat($game,$visits));
}

function fetchGameSnapshot(PDO $pdo, int $gameId): array
{
    $row = fetchGameRow($pdo, $gameId);
    return enrichSnapshot($pdo, $row, replayGame($row, fetchGameVisits($pdo, $gameId)));
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
        'config' => $snapshot['game']['config'],
        'format_description' => $snapshot['game']['format_description'],
        'legacy_compatible' => $snapshot['game']['legacy_compatible'],
        'result' => $snapshot['game']['result'],
        'operation_state' => $snapshot['game']['operation_state'],
        'decision' => $snapshot['game']['decision'],
    ];
}

function fetchGameRows(PDO $pdo, bool $finished): array
{
    $where = $finished ? '(g.finished_at IS NOT NULL OR g.winner_id IS NOT NULL)' : '(g.finished_at IS NULL AND g.winner_id IS NULL)';
    if (!supportsFormats()) { $where .= ' AND g.legacy_compatible=1'; }
    if (!supportsOperations()) { $where .= ' AND g.is_paused=0 AND g.confirmed_at IS NULL AND g.decision_json IS NULL'; }
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
    $statement = $pdo->prepare('SELECT * FROM visits WHERE active=1 AND game_id IN (' . $placeholders . ') ORDER BY game_id, visit_no, id');
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
        'templates' => supportsFormats() ? listTemplates($pdo) : [],
        'statistics_scope' => 'Wyłącznie dotychczasowe formaty: 301/501/701/901, straight-in/double-out, do 1/2/3/5 legów, naprzemienny start od zawodnika 1. Inne formaty mają statystyki w meczu. Punkty i średnie obejmują także grę w toku; bilans obejmuje rozstrzygnięcia, również przed zatwierdzeniem. Walkower, przerwanie i anulowanie są wyłączone.',
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

    return transaction($pdo, static function () use ($pdo, $name, $input): array {
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
        if (array_key_exists('is_guest',$input)) { $pdo->prepare('UPDATE players SET is_guest=? WHERE id=?')->execute([(int)requiredBool($input,'is_guest'),$id]); }
        $statement = $pdo->prepare('SELECT * FROM players WHERE id = :id');
        $statement->execute(['id' => $id]);
        return normalizePlayer($statement->fetch());
    });
}

function deletePlayer(PDO $pdo, int $playerId): array
{
    profileRow($pdo,$playerId);
    problem(409,'player-delete-disabled','Historia jest chroniona. Zarchiwizuj profil w WWW; usuwanie zawodnika jest wyłączone także dla starszych klientów.');
}
function createGame(PDO $pdo, array $input): array
{
    return createFormattedGame($pdo,$input);
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

function recordVisit(PDO $pdo, array $input): array
{
    $gameId = requiredInt($input, 'game_id', 1, PHP_INT_MAX);
    $playerId = requiredInt($input, 'player_id', 1, PHP_INT_MAX);
    $score = requiredInt($input, 'score', 0, 180);
    $dartsUsed = requiredInt($input, 'darts_used', 1, 3);
    $doubleConfirmed = requiredBool($input, 'double_confirmed');

    return transaction($pdo, static function () use ($pdo, $gameId, $playerId, $score, $dartsUsed, $doubleConfirmed): array {
        assertMatchOperation(fetchGameRow($pdo,$gameId),'visit-create');
        $snapshot = fetchGameSnapshot($pdo, $gameId);
        if ($snapshot['partial_visit'] !== null) {
            problem(409, 'partial-visit-exists', 'Dokończ pojedyncze lotki albo cofnij je przed wpisaniem całej sumy.');
        }
        if ($snapshot['game']['status'] === 'finished') {
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

        [$declaredScore,$appliedScore,$dartsUsed,$isBust,$isCheckout] = evaluateAggregate($snapshot['game']['config'],$playerState['remaining'],$playerState['opened'],$score,$dartsUsed,$doubleConfirmed);
        $visitNumber = $snapshot['game']['context']['visit_no'];
        $insert = $pdo->prepare(<<<'SQL'
            INSERT INTO visits(game_id, leg_no, visit_no, player_id, declared_score, applied_score, darts_used, is_bust, is_checkout, double_confirmed)
            VALUES (:game_id, :leg_no, :visit_no, :player_id, :declared_score, :applied_score, :darts_used, :is_bust, :is_checkout, :double_confirmed)
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
            'double_confirmed' => (int)$doubleConfirmed,
        ]);

        $pdo->prepare("UPDATE games SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = :id")
            ->execute(['id' => $gameId]);

        persistCompletion($pdo,$gameId);

        rebuildAllPlayerStats($pdo);
        return fetchGameSnapshot($pdo, $gameId);
    });
}

function finishCompletedGame(PDO $pdo, int $gameId): array
{
    $snapshot=fetchGameSnapshot($pdo,$gameId);
    if ($snapshot['game']['status']!=='finished') { problem(409,'game-not-complete','Mecz nie został jeszcze rozstrzygnięty.'); }
    persistCompletion($pdo,$gameId);
    return fetchGameSnapshot($pdo,$gameId);
}

function deleteGame(PDO $pdo, int $gameId): array
{
    return transaction($pdo, static function () use ($pdo, $gameId): array {
        fetchGameRow($pdo, $gameId);
        if (sqlOne($pdo,'SELECT id FROM visits WHERE game_id=? LIMIT 1',[$gameId]) || sqlOne($pdo,'SELECT id FROM result_decisions WHERE game_id=? LIMIT 1',[$gameId])) { problem(409,'history-protected','Mecz ma zapisaną historię. Anuluj go z uzasadnieniem zamiast usuwać.'); }
        if (tableExists($pdo, 'throws')) {
            $pdo->prepare('DELETE FROM throws WHERE game_id = :id')->execute(['id' => $gameId]);
        }
        $pdo->prepare('DELETE FROM games WHERE id = :id')->execute(['id' => $gameId]);
        rebuildAllPlayerStats($pdo);
        return ['deleted' => true, 'id' => $gameId];
    });
}

if (defined('DART_API_LIBRARY_ONLY')) { return; }

try {
    $configuration = loadConfiguration();
    if (($configuration['secure_cookie'] ?? true) && strtolower((string) ($_SERVER['HTTPS'] ?? '')) !== 'on' && (int) ($_SERVER['SERVER_PORT'] ?? 0) !== 443) {
        problem(400, 'https-required', 'Wymagane jest bezpieczne połączenie HTTPS.');
    }
    $hasBearer = isset($_SERVER['HTTP_AUTHORIZATION']) || isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION']);
    if (!$hasBearer) { configureSession($configuration); }
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
    if ($action === 'device-join') {
        requireMethod('POST');
        sendData(joinDevice($database, readJsonBody()));
    }
    $actor = authenticateActor($database);
    $GLOBALS['snapshotActor']=$actor;
    if ($action === 'logout') {
        requireMethod('POST');
        requireCsrf();
        sendData(logout());
    }
    // Release the PHP session file lock. SQLite, not a shared session, serializes writes.
    if (session_status() === PHP_SESSION_ACTIVE) { session_write_close(); }
    // A snapshot consists of several SELECTs: pin one WAL read view across all of them.
    if (strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')) === 'GET') { $database->beginTransaction(); }
    if (in_array($action,['profiles','profile','analysis','match-analysis','history-search','analysis-export'],true)) {
        requireMethod('GET'); assertProfileAdmin($actor); handleAnalysisRead($database,$action,$_GET);
    }
    if ($action === 'dashboard') {
        requireMethod('GET');
        $data = getDashboard($database);
        $assigned = $actor['device']['game_id'] ?? null;
        if ($assigned !== null) {
            assertFormatClient(fetchGameRow($database,$assigned));
            assertOperationsRead(fetchGameRow($database,$assigned));
            $snapshot = fetchGameSnapshot($database, $assigned);
            $ids = [$snapshot['game']['player1_id'], $snapshot['game']['player2_id']];
            $data['players'] = array_map('normalizePlayer',sqlRows($database,'SELECT * FROM players WHERE id IN (?,?)',$ids));
            foreach (['active_games','history'] as $key) {
                $data[$key] = array_values(array_filter($data[$key], static fn(array $g): bool => $g['id'] === $assigned));
            }
        }
        sendData($data);
    }
    if ($action === 'game') {
        requireMethod('GET');
        $gameId = filter_input(INPUT_GET, 'id', FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        if (!is_int($gameId)) {
            problem(422, 'invalid-game-id', 'Podaj prawidłowy identyfikator meczu.');
        }
        assertScope($actor, $gameId);
        assertFormatClient(fetchGameRow($database,$gameId));
        assertOperationsRead(fetchGameRow($database,$gameId));
        sendData(fetchGameSnapshot($database, $gameId));
    }
    if ($action === 'devices') {
        requireMethod('GET');
        if ($actor['role'] !== 'admin') { problem(403,'admin-required','Wymagany administrator.'); }
        sendData(['devices' => array_map('publicDevice', sqlRows($database,'SELECT * FROM devices ORDER BY name,id'))]);
    }
    if ($action==='checkout-hints') {
        requireMethod('GET');
        $gameId=requiredInt($_GET,'game_id',1,PHP_INT_MAX); assertScope($actor,$gameId);
        assertFormatClient(fetchGameRow($database,$gameId)); assertOperationsRead(fetchGameRow($database,$gameId));
        sendData(checkoutHints(fetchGameSnapshot($database,$gameId),$_GET));
    }
    if ($action === 'device-self') {
        requireMethod('GET');
        if (!$actor['device']) { problem(403,'device-required','Wymagane urządzenie.'); }
        sendData(['device' => $actor['device']]);
    }
    if ($action === 'command-status') {
        requireMethod('GET');
        $commandId = requiredUuid($_GET, 'command_id');
        $saved = sqlOne($database, 'SELECT game_id,result FROM commands WHERE actor=? AND command_id=?', [$actor['actor'],$commandId]);
        if ($saved && $saved['game_id'] !== null) { assertScope($actor,(int)$saved['game_id']); }
        if ($saved && $saved['game_id'] !== null && sqlOne($database,'SELECT id FROM games WHERE id=?',[$saved['game_id']])) { assertFormatClient(fetchGameRow($database,(int)$saved['game_id'])); }
        $result=$saved ? json_decode($saved['result'],true,512,JSON_THROW_ON_ERROR) : null;
        if ($result!==null) { assertResultClient($result); }
        sendData($saved ? ['status'=>'saved','result'=>$result] : ['status'=>'unknown']);
    }
    if ($action === 'observation-status') {
        requireMethod('GET');
        $gameId = requiredInt($_GET,'game_id',1,PHP_INT_MAX);
        assertScope($actor,$gameId);
        $row = sqlOne($database,'SELECT * FROM observations WHERE game_id=? AND id=?',[$gameId,requiredUuid($_GET,'observation_id')]);
        if (!$row) { problem(404,'observation-not-found','Brak obserwacji.'); }
        sendData(normalizeObservation($row));
    }

    requireMethod('POST');
    if (!$hasBearer) { requireCsrf(); }
    $body = readJsonBody();
    if ($action==='profile-merge-preview') { assertProfileAdmin($actor); $database->beginTransaction(); sendData(mergePreview($database,$body)); }
    if ($action==='history-preview') {
        if (!supportsOperations()) { problem(409,'client-update-required','Podgląd korekty wymaga obsługi operacji v2.'); }
        authorizeCommand($database,$actor,$action,$body);
        $database->beginTransaction();
        sendData(publicCorrectionPlan(correctionPlan($database,$body)));
    }
    if ($action === 'format-preview') {
        if (!supportsFormats()) { problem(409,'client-update-required','Wymagana obsługa formatów v1.'); }
        $c=validateFormat(formatObject($body,'config'));
        sendData(['config'=>$c,'description'=>formatDescription($c),'legacy_compatible'=>compatibleFormat($c)]);
    }
    sendData(runCommand($database, $action, $body));
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
