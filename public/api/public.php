<?php
declare(strict_types=1);

// A public panel is a capability, never an authenticated person or device.
const PUBLIC_WEB_COMMANDS = [
    'player-create','player-delete','profile-create','profile-save','profile-archive','profile-merge','equipment-save',
    'game-create','game-delete','game-finish','game-metadata','game-rematch','template-save','template-delete',
    'visit-create','remaining-create','dart-create','visit-undo','dart-correct','visit-correct','history-apply',
    'starter-select','game-pause','game-resume','game-adjudicate','result-confirm','result-reopen',
    'device-code-create','device-revoke','camera-select','observation-review','history-preview',
];

function panelManager(array $actor): bool
{
    return in_array($actor['role'], ['admin','public'], true);
}

function migratePublicAccess(PDO $pdo): void
{
    if ((int)$pdo->query("SELECT value FROM schema_meta WHERE key='schema_version'")->fetchColumn() >= 8) { return; }
    transaction($pdo, static function () use ($pdo): void {
        if ((int)$pdo->query("SELECT value FROM schema_meta WHERE key='schema_version'")->fetchColumn() >= 8) { return; }
        $pdo->exec('CREATE TABLE web_request_limits (
            ip_hash TEXT NOT NULL, kind TEXT NOT NULL, window_start INTEGER NOT NULL, requests INTEGER NOT NULL,
            PRIMARY KEY(ip_hash,kind)); CREATE INDEX idx_web_limits_time ON web_request_limits(window_start);');
        ensureColumn($pdo,'games','import_mode','TEXT');
        // Recover the explicit v7 decision from its audit. Missing evidence stays unknown, never shared.
        $imports = sqlRows($pdo,'SELECT origin_id,local_game_id,game_id FROM local_imports');
        $modes = [];
        foreach ($pdo->query("SELECT details_json FROM audit WHERE action='local-game-import' ORDER BY id") as $row) {
            $input = json_decode($row['details_json'],true)['input'] ?? [];
            if (isset($input['origin_id'],$input['local_game_id']) && is_bool($input['share'] ?? null)) {
                $modes[$input['origin_id'].':'.$input['local_game_id']] = $input['share'] ? 'shared' : 'archive';
            }
        }
        foreach ($imports as $import) {
            $mode = $modes[$import['origin_id'].':'.$import['local_game_id']] ?? 'unknown';
            $pdo->prepare('UPDATE games SET import_mode=? WHERE id=?')->execute([$mode,$import['game_id']]);
        }
        $pdo->exec("UPDATE schema_meta SET value='8' WHERE key='schema_version'");
    });
}

function publicSessionData(array $config): array
{
    if (!is_string($_SESSION['web_csrf_token'] ?? null) || (int)($_SESSION['web_expires_at'] ?? 0) <= time()) {
        $_SESSION['web_csrf_token'] = bin2hex(random_bytes(32));
        $_SESSION['web_expires_at'] = time() + (int)($config['session_lifetime'] ?? 43200);
    }
    return ['access'=>'public','authenticated'=>false,'csrf_token'=>$_SESSION['web_csrf_token'],'expires_at'=>$_SESSION['web_expires_at']];
}

function publicRateLimit(PDO $pdo, string $action): void
{
    $kind = $action === 'analysis-export' ? 'export' : (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST' ? 'write' : 'read');
    $maximum = ['read'=>600,'write'=>180,'export'=>8][$kind];
    $now = time();
    $start = intdiv($now,60) * 60;
    $count = transaction($pdo,static function () use ($pdo,$kind,$start,$now): int {
        $pdo->prepare('DELETE FROM web_request_limits WHERE window_start<?')->execute([$now-86400]);
        $pdo->prepare('INSERT INTO web_request_limits(ip_hash,kind,window_start,requests) VALUES(?,?,?,1)
            ON CONFLICT(ip_hash,kind) DO UPDATE SET requests=CASE WHEN window_start=excluded.window_start THEN requests+1 ELSE 1 END,window_start=excluded.window_start')
            ->execute([clientIpHash(),$kind,$start]);
        return (int)sqlOne($pdo,'SELECT requests FROM web_request_limits WHERE ip_hash=? AND kind=?',[clientIpHash(),$kind])['requests'];
    });
    if ($count > $maximum) {
        $retry = 60-($now-$start);
        header('Retry-After: '.$retry);
        problem(429,'public-rate-limited','Zbyt wiele żądań. Spróbuj ponownie za chwilę.',['retry_after'=>$retry]);
    }
}

function importOrigin(array $game): array
{
    $mode = $game['import_mode'] ?? null;
    return ['kind'=>$mode === null ? 'server' : 'android','mode'=>$mode,
        'read_only'=>$mode !== null && $mode !== 'shared'];
}
