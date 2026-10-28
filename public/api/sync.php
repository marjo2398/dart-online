<?php
declare(strict_types=1);

// Extensions of the existing SQLite engine; no independent score history.
function migrateSync(PDO $pdo): void
{
    ensureColumn($pdo, 'games', 'revision', 'INTEGER NOT NULL DEFAULT 0');
    ensureColumn($pdo, 'games', 'active_camera_id', 'TEXT');
    ensureColumn($pdo, 'games', 'camera_epoch', 'INTEGER NOT NULL DEFAULT 0');
    ensureColumn($pdo, 'visits', 'mode', "TEXT NOT NULL DEFAULT 'aggregate'");
    ensureColumn($pdo, 'visits', 'is_complete', 'INTEGER NOT NULL DEFAULT 1');
    $pdo->exec(<<<'SQL'
CREATE TABLE IF NOT EXISTS commands (
 actor TEXT NOT NULL, command_id TEXT NOT NULL, payload_hash TEXT NOT NULL,
 action TEXT NOT NULL, game_id INTEGER, result TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 PRIMARY KEY(actor,command_id)
);
CREATE TABLE IF NOT EXISTS devices (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL,
 game_id INTEGER, token_hash TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL,
 revoked INTEGER NOT NULL DEFAULT 0, join_id TEXT NOT NULL UNIQUE, join_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS device_codes (
 code_hash TEXT PRIMARY KEY, role TEXT NOT NULL, game_id INTEGER,
 expires_at INTEGER NOT NULL, device_lifetime INTEGER NOT NULL, used_by TEXT
);
CREATE TABLE IF NOT EXISTS join_attempts (ip_hash TEXT NOT NULL, attempted_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_join_attempts ON join_attempts(ip_hash,attempted_at);
CREATE TABLE IF NOT EXISTS darts (
 id TEXT PRIMARY KEY, game_id INTEGER NOT NULL, leg_no INTEGER NOT NULL,
 visit_id INTEGER NOT NULL, visit_no INTEGER NOT NULL, player_id INTEGER NOT NULL,
 dart_no INTEGER NOT NULL, field TEXT NOT NULL, source TEXT NOT NULL,
 device_id TEXT, observation_id TEXT, active INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_darts_game ON darts(game_id,active,visit_no,dart_no);
CREATE TABLE IF NOT EXISTS observations (
 id TEXT PRIMARY KEY, game_id INTEGER NOT NULL, device_id TEXT NOT NULL,
 revision INTEGER NOT NULL, player_id INTEGER NOT NULL, leg_no INTEGER NOT NULL,
 visit_no INTEGER NOT NULL, dart_no INTEGER NOT NULL, camera_epoch INTEGER NOT NULL,
 field TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
 accepted_dart_id TEXT, accepted_revision INTEGER,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_observations_game ON observations(game_id,status,created_at);
CREATE TABLE IF NOT EXISTS audit (
 id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, command_id TEXT NOT NULL,
 game_id INTEGER, action TEXT NOT NULL, target_id TEXT, original TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_game ON audit(game_id,id);
INSERT INTO schema_meta(key,value) VALUES ('schema_version','3')
 ON CONFLICT(key) DO UPDATE SET value=excluded.value;
SQL
    );
}

function sqlOne(PDO $pdo, string $sql, array $parameters = []): ?array
{
    $statement = $pdo->prepare($sql);
    $statement->execute($parameters);
    $row = $statement->fetch();
    return $row === false ? null : $row;
}

function sqlRows(PDO $pdo, string $sql, array $parameters = []): array
{
    $statement = $pdo->prepare($sql);
    $statement->execute($parameters);
    return $statement->fetchAll();
}

function uuid(): string
{
    $bytes = random_bytes(16);
    $bytes[6] = chr((ord($bytes[6]) & 15) | 64);
    $bytes[8] = chr((ord($bytes[8]) & 63) | 128);
    $hex = bin2hex($bytes);
    return substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-' . substr($hex, 12, 4) . '-' . substr($hex, 16, 4) . '-' . substr($hex, 20);
}

function requiredUuid(array $input, string $key): string
{
    $value = $input[$key] ?? null;
    if (!is_string($value) || !preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/Di', $value)) {
        problem(422, 'invalid-uuid', 'Wymagany UUID w polu ' . $key . '.');
    }
    return strtolower($value);
}

function canonicalJson($value): string
{
    if (is_array($value)) {
        ksort($value);
        foreach ($value as $key => $item) {
            if (is_array($item)) { $value[$key] = json_decode(canonicalJson($item), true); }
        }
    }
    return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
}

function publicDevice(array $row): array
{
    return ['id' => $row['id'], 'name' => $row['name'], 'role' => $row['role'],
        'game_id' => $row['game_id'] === null ? null : (int) $row['game_id'],
        'expires_at' => (int) $row['expires_at'], 'revoked' => (bool) $row['revoked'],
        'permissions' => ($row['permissions_json'] ?? null)===null ? ($row['role']==='operator'?['score','correct_last']:[]) : json_decode($row['permissions_json'],true,32,JSON_THROW_ON_ERROR)];
}

function normalizeObservation(array $row): array
{
    foreach (['game_id','revision','player_id','leg_no','visit_no','dart_no','camera_epoch'] as $key) { $row[$key] = (int) $row[$key]; }
    $row['accepted_revision'] = $row['accepted_revision'] === null ? null : (int) $row['accepted_revision'];
    $row['expires_at'] = (int) strtotime($row['created_at']) + 60;
    if ($row['status'] === 'pending' && $row['expires_at'] <= time()) { $row['status'] = 'stale'; }
    return $row;
}

function enrichSnapshot(PDO $pdo, array $game, array $snapshot): array
{
    $id = (int) $game['id'];
    $last = count($snapshot['visits']) > 0 ? $snapshot['visits'][count($snapshot['visits']) - 1] : null;
    $partial = $last && !$last['is_complete'] ? $last : null;
    $snapshot['game']['revision'] = (int) ($game['revision'] ?? 0);
    $snapshot['game']['active_camera_id'] = $game['active_camera_id'] ?? null;
    $snapshot['game']['camera_epoch'] = (int) ($game['camera_epoch'] ?? 0);
    $snapshot['game']['context'] = [
        'revision' => $snapshot['game']['revision'], 'player_id' => $snapshot['game']['current_player_id'],
        'leg_no' => $snapshot['game']['current_leg'], 'visit_no' => $partial ? $partial['visit_no'] : (($last['visit_no'] ?? 0) + 1),
        'dart_no' => $partial ? $partial['darts_used'] + 1 : 1, 'camera_epoch' => $snapshot['game']['camera_epoch'],
    ];
    $snapshot['partial_visit'] = $partial;
    $snapshot['darts'] = sqlRows($pdo, 'SELECT * FROM darts WHERE game_id=? AND active=1 ORDER BY visit_no,dart_no', [$id]);
    foreach ($snapshot['darts'] as &$dart) {
        foreach (['game_id','leg_no','visit_id','visit_no','player_id','dart_no'] as $key) { $dart[$key] = (int) $dart[$key]; }
        $dart['active'] = (bool) $dart['active'];
    }
    unset($dart);
    $snapshot['observations'] = array_map('normalizeObservation', sqlRows($pdo,
        "SELECT * FROM observations WHERE game_id=? ORDER BY CASE WHEN status='pending' THEN 0 ELSE 1 END, rowid DESC LIMIT 100", [$id]));
    $snapshot['devices'] = array_map('publicDevice', sqlRows($pdo,
        "SELECT * FROM devices WHERE revoked=0 AND expires_at>? AND (game_id=? OR (role='operator' AND game_id IS NULL)) ORDER BY name,id", [time(),$id]));
    $snapshot['audit'] = sqlRows($pdo, 'SELECT id,command_id,action,target_id,created_at,actor_context FROM audit WHERE game_id=? ORDER BY id DESC LIMIT 100', [$id]);
    foreach ($snapshot['audit'] as &$entry) { $entry['id'] = (int) $entry['id']; }
    unset($entry);
    $snapshot['withdrawn_visits']=array_map('normalizeVisit',sqlRows($pdo,'SELECT * FROM visits WHERE game_id=? AND active=0 ORDER BY id',[$id]));
    $snapshot['withdrawn_darts']=sqlRows($pdo,'SELECT * FROM darts WHERE game_id=? AND active=0 ORDER BY visit_no,dart_no,id',[$id]);
    $snapshot['record_versions']=sqlRows($pdo,'SELECT * FROM record_versions WHERE game_id=? ORDER BY id',[$id]);
    $snapshot['result_decisions']=sqlRows($pdo,'SELECT * FROM result_decisions WHERE game_id=? ORDER BY id',[$id]);
    $snapshot['permissions']=actorPermissions($GLOBALS['snapshotActor'] ?? ['role'=>'viewer','device'=>null]);
    return $snapshot;
}

function authenticateActor(PDO $pdo): array
{
    $header = (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
    if ($header !== '') {
        if (!preg_match('/^Bearer ([A-Za-z0-9_-]{43})$/D', $header, $matches)) { problem(401,'invalid-device-token','Poświadczenie urządzenia jest nieprawidłowe.'); }
        $device = sqlOne($pdo, 'SELECT * FROM devices WHERE token_hash=?', [hash('sha256',$matches[1])]);
        if (!$device || (bool) $device['revoked'] || (int) $device['expires_at'] <= time()) { problem(401,'device-expired','Dostęp urządzenia wygasł lub został odwołany. Sparuj je ponownie.'); }
        if ($device['game_id'] !== null && !sqlOne($pdo,'SELECT id FROM games WHERE id=?',[$device['game_id']])) { problem(403,'game-access-ended','Przypisany mecz został usunięty.'); }
        return ['actor' => 'device:' . $device['id'], 'role' => $device['role'], 'device' => publicDevice($device)];
    }
    requireAuthentication();
    return ['actor' => 'administrator', 'role' => 'admin', 'device' => null];
}

function assertScope(array $actor, ?int $gameId): void
{
    $assigned = $actor['device']['game_id'] ?? null;
    if ($assigned !== null && $assigned !== $gameId) { problem(403,'game-access-denied','Urządzenie nie ma dostępu do tego meczu.'); }
}

function authorizeCommand(PDO $pdo, array $actor, string $action, array $input): void
{
    if (strpos($action,'template-')===0 && ($actor['role']!=='admin' || !supportsFormats())) { problem(403,'admin-required','Szablony edytuje administrator WWW.'); }
    $adminOnly = ['player-delete','game-delete','device-code-create','device-revoke'];
    if (in_array($action,$adminOnly,true) && $actor['role'] !== 'admin') { problem(403,'admin-required','Ta operacja wymaga administratora WWW.'); }
    if (in_array($action,['player-create','game-create'],true)) {
        if (!in_array($actor['role'],['admin','operator'],true)) { problem(403,'operator-required','Ta operacja wymaga operatora.'); }
        assertScope($actor,null);
        if (!in_array('score',actorPermissions($actor),true)) { problem(403,'permission-required','Brak uprawnienia: score.'); }
        return;
    }
    if (isset($input['game_id'])) {
        $id=requiredInt($input,'game_id',1,PHP_INT_MAX); assertScope($actor,$id);
        assertFormatClient(fetchGameRow($pdo,$id));
    }
    if ($action === 'observation-create') {
        if (!$actor['device'] || !in_array($actor['role'],['operator','camera'],true)) { problem(403,'camera-required','Publikować może aktywne urządzenie kamery.'); }
    } elseif (!in_array($actor['role'],['admin','operator'],true)) { problem(403,'operator-required','Ta operacja wymaga operatora.'); }
    requireOperationPermission($actor,$action);
    if ($action==='game-rematch') { assertScope($actor,null); }
}

function bumpGame(PDO $pdo, int $gameId): void
{
    $pdo->prepare("UPDATE games SET revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?")->execute([$gameId]);
    $pdo->prepare("UPDATE observations SET status='stale' WHERE game_id=? AND status='pending'")->execute([$gameId]);
}

function runCommand(PDO $pdo, string $action, array $body): array
{
    $newActions=['remaining-create','history-apply','game-pause','game-resume','game-adjudicate','result-confirm','result-reopen','game-rematch'];
    $known = array_merge($newActions,['template-save','template-delete','starter-select','player-create','player-delete','game-create','game-delete','game-finish','visit-create','visit-undo','visit-correct','dart-create','dart-correct','device-code-create','device-revoke','camera-select','observation-create','observation-review']);
    if (!in_array($action,$known,true)) { problem(404,'unknown-action','Nieznana operacja API.'); }
    $commandId = requiredUuid($body,'command_id');
    $revision = requiredInt($body,'expected_revision',0,PHP_INT_MAX);
    $hash = hash('sha256',canonicalJson(['action'=>$action,'body'=>$body]));
    return transaction($pdo, static function () use ($pdo,$action,$body,$commandId,$revision,$hash): array {
        $actor = authenticateActor($pdo); // Recheck expiry/revocation after acquiring write lock, before deduplication.
        $GLOBALS['snapshotActor']=$actor;
        authorizeCommand($pdo,$actor,$action,$body);
        $previous = sqlOne($pdo,'SELECT * FROM commands WHERE actor=? AND command_id=?',[$actor['actor'],$commandId]);
        if ($previous) {
            if (!hash_equals($previous['payload_hash'],$hash)) { problem(409,'command-payload-conflict','Ten identyfikator komendy był użyty z innymi danymi.'); }
            $result=json_decode($previous['result'],true,512,JSON_THROW_ON_ERROR);
            assertResultClient($result);
            return $result;
        }
        if (in_array($action,['remaining-create','history-apply','game-pause','game-resume','game-adjudicate','result-confirm','result-reopen','game-rematch'],true) && !supportsOperations()) { problem(409,'client-update-required','Ta operacja wymaga WWW z obsługą operacji v2.'); }
        $gameActions = ['remaining-create','history-apply','game-pause','game-resume','game-adjudicate','result-confirm','result-reopen','game-rematch','starter-select','game-delete','game-finish','visit-create','visit-undo','visit-correct','dart-create','dart-correct','camera-select','observation-create','observation-review'];
        $gameId = in_array($action,$gameActions,true) ? requiredInt($body,'game_id',1,PHP_INT_MAX) : null;
        $before = $gameId !== null ? fetchGameSnapshot($pdo,$gameId) : null;
        if (($before['game']['revision'] ?? 0) !== $revision) { problem(409,'revision-conflict','Mecz zmienił się na innym ekranie. Odśwież wynik i podejmij decyzję ponownie.',['revision'=>$before['game']['revision'] ?? 0]); }
        if ($gameId!==null) { assertMatchOperation(fetchGameRow($pdo,$gameId),$action,$body); }
        $target = $body['dart_id'] ?? $body['visit_id'] ?? $body['observation_id'] ?? $body['device_id'] ?? null;
        if ($action === 'visit-undo' && $before && count($before['visits']) > 0) {
            $lastVisit = $before['visits'][count($before['visits']) - 1];
            $lastDarts = array_values(array_filter($before['darts'], static fn(array $d): bool => $d['visit_id'] === $lastVisit['id']));
            $target = $lastVisit['mode'] === 'darts' && $lastDarts ? $lastDarts[count($lastDarts) - 1]['id'] : (string) $lastVisit['id'];
        }
        $result = dispatchCommand($pdo,$actor,$action,$body);
        $changesScore = in_array($action,['remaining-create','history-apply','game-pause','game-resume','game-adjudicate','result-confirm','result-reopen','starter-select','game-finish','visit-create','visit-undo','visit-correct','dart-create','dart-correct','camera-select'],true)
            || ($action === 'observation-review' && ($body['decision'] ?? '') === 'accept');
        if ($gameId !== null && $changesScore) {
            bumpGame($pdo,$gameId);
            rebuildAllPlayerStats($pdo);
        }
        $pdo->prepare('INSERT INTO audit(actor,command_id,game_id,action,target_id,original,actor_context,details_json) VALUES (?,?,?,?,?,?,?,?)')->execute([
            $actor['actor'],$commandId,$gameId,$action,$target === null ? null : (string) $target,
            canonicalJson($before ?? ['input'=>array_diff_key($body,['command_id'=>true])]),canonicalJson(actorContext($actor)),canonicalJson(['input'=>$body])
        ]);
        if ($gameId !== null && !in_array($action,['game-delete','game-rematch'],true)) { $result = fetchGameSnapshot($pdo,$gameId); }
        $pdo->prepare('INSERT INTO commands(actor,command_id,payload_hash,action,game_id,result) VALUES (?,?,?,?,?,?)')->execute([
            $actor['actor'],$commandId,$hash,$action,$gameId,canonicalJson($result)
        ]);
        return $result;
    });
}

function dispatchCommand(PDO $pdo, array $actor, string $action, array $body): array
{
    switch ($action) {
        case 'remaining-create': return remainingVisit($pdo,$body);
        case 'history-apply': return applyCorrection($pdo,$body);
        case 'game-rematch': return rematch($pdo,$body);
        case 'game-pause': case 'game-resume': case 'game-adjudicate': case 'result-confirm': case 'result-reopen': return changeMatchState($pdo,$actor,$action,$body);
        case 'template-save': return saveTemplate($pdo,$body);
        case 'template-delete': return deleteTemplate($pdo,$body);
        case 'starter-select': return selectStarter($pdo,$body);
        case 'player-create': return createPlayer($pdo,$body);
        case 'player-delete': return deletePlayer($pdo,requiredInt($body,'player_id',1,PHP_INT_MAX));
        case 'game-create': return createGame($pdo,$body);
        case 'game-delete': return deleteGame($pdo,requiredInt($body,'game_id',1,PHP_INT_MAX));
        case 'game-finish': return finishCompletedGame($pdo,requiredInt($body,'game_id',1,PHP_INT_MAX));
        case 'visit-create': return recordVisit($pdo,$body);
        case 'visit-undo': return undoScoring($pdo,(int)$body['game_id']);
        case 'dart-create': return recordDart($pdo,$body,$actor,null);
        case 'dart-correct': return correctDart($pdo,$body,$actor);
        case 'visit-correct': return correctVisit($pdo,$body);
        case 'device-code-create': return createDeviceCode($pdo,$body);
        case 'device-revoke': return revokeDevice($pdo,$body);
        case 'camera-select': return selectCamera($pdo,$body);
        case 'observation-create': return createObservation($pdo,$body,$actor);
        case 'observation-review': return reviewObservation($pdo,$body,$actor);
    }
    problem(404,'unknown-action','Nieznana operacja API.');
}

function dartValue($field): array
{
    if ($field === 'MISS') { return [0,false]; }
    if ($field === '25') { return [25,false]; }
    if ($field === '50') { return [50,true]; }
    if (!is_string($field) || !preg_match('/^([SDT])([1-9]|1[0-9]|20)$/D',$field,$m)) { problem(422,'invalid-field','Wybierz S/D/T1–20, 25, 50 albo MISS.'); }
    return [(int)$m[2] * ['S'=>1,'D'=>2,'T'=>3][$m[1]],$m[1] === 'D'];
}

function recordDart(PDO $pdo, array $body, array $actor, ?string $observationId): array
{
    $id = requiredInt($body,'game_id',1,PHP_INT_MAX);
    assertMatchOperation(fetchGameRow($pdo,$id),'dart-create');
    $player = requiredInt($body,'player_id',1,PHP_INT_MAX);
    dartValue($body['field'] ?? null);
    $snapshot = fetchGameSnapshot($pdo,$id);
    if ($snapshot['game']['status'] !== 'active') { problem(409,'game-finished','Mecz jest zakończony.'); }
    if ($snapshot['game']['current_player_id'] !== $player) { problem(409,'wrong-player-turn','Rzuca inny zawodnik.'); }
    $partial = $snapshot['partial_visit'];
    $used = ($partial['darts_used'] ?? 0) + 1;
    $values = [0,0,$used,0,0,0];
    if ($partial) {
        $visitId = $partial['id'];
        $pdo->prepare('UPDATE visits SET declared_score=?,applied_score=?,darts_used=?,is_bust=?,is_checkout=?,is_complete=? WHERE id=?')->execute(array_merge($values,[$visitId]));
    } else {
        $pdo->prepare("INSERT INTO visits(declared_score,applied_score,darts_used,is_bust,is_checkout,is_complete,game_id,leg_no,visit_no,player_id,mode) VALUES (?,?,?,?,?,?,?,?,?,?,'darts')")
            ->execute(array_merge($values,[$id,$snapshot['game']['current_leg'],$snapshot['game']['context']['visit_no'],$player]));
        $visitId = (int)$pdo->lastInsertId();
    }
    $dartId = uuid();
    $pdo->prepare('INSERT INTO darts(id,game_id,leg_no,visit_id,visit_no,player_id,dart_no,field,source,device_id,observation_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)')->execute([
        $dartId,$id,$snapshot['game']['current_leg'],$visitId,$snapshot['game']['context']['visit_no'],$player,$used,$body['field'],
        $observationId !== null ? 'camera-confirmed' : 'manual',$actor['device']['id'] ?? null,$observationId
    ]);
    recalculateDartVisit($pdo,$id,$visitId);
    persistCompletion($pdo,$id);
    return ['dart_id'=>$dartId];
}

function undoScoring(PDO $pdo, int $gameId): array
{
    $visit = sqlOne($pdo,'SELECT * FROM visits WHERE game_id=? AND active=1 ORDER BY visit_no DESC LIMIT 1',[$gameId]);
    if (!$visit) { problem(409,'nothing-to-undo','Brak operacji do cofnięcia.'); }
    $g=fetchGameRow($pdo,$gameId);
    $results=json_decode($g['starter_results'],true,32,JSON_THROW_ON_ERROR);
    foreach ($results as $leg=>$value) { if ((int)$leg>(int)$visit['leg_no']) { unset($results[$leg]); } }
    $pdo->prepare('UPDATE games SET starter_results=? WHERE id=?')->execute([json_encode((object)$results,JSON_THROW_ON_ERROR),$gameId]);
    if ($visit['mode'] === 'darts') {
        $dart = sqlOne($pdo,'SELECT * FROM darts WHERE visit_id=? AND active=1 ORDER BY dart_no DESC LIMIT 1',[$visit['id']]);
        if (!$dart) { problem(409,'invalid-dart-history','Brak szczegółowej lotki.'); }
        $pdo->prepare('UPDATE darts SET active=0 WHERE id=?')->execute([$dart['id']]);
        if ((int)$visit['darts_used'] > 1) {
            recalculateDartVisit($pdo,$gameId,(int)$visit['id']);
        } else {
            $pdo->prepare('UPDATE visits SET active=0 WHERE id=?')->execute([$visit['id']]);
        }
    } else {
        $pdo->prepare('UPDATE visits SET active=0 WHERE id=?')->execute([$visit['id']]);
    }
    // Visits are current projections. Original data survive in audit and inactive darts.
    $pdo->prepare('UPDATE games SET winner_id=NULL,finished_at=NULL WHERE id=?')->execute([$gameId]);
    return [];
}

function correctDart(PDO $pdo, array $body, array $actor): array
{
    $dartId = requiredUuid($body,'dart_id');
    dartValue($body['field'] ?? null);
    $lastVisit = sqlOne($pdo,'SELECT * FROM visits WHERE game_id=? AND active=1 ORDER BY visit_no DESC LIMIT 1',[$body['game_id']]);
    $last = $lastVisit ? sqlOne($pdo,'SELECT * FROM darts WHERE visit_id=? AND active=1 ORDER BY dart_no DESC LIMIT 1',[$lastVisit['id']]) : null;
    if (!$lastVisit || $lastVisit['mode'] !== 'darts' || !$last || $last['id'] !== $dartId) { problem(409,'not-last-dart','Najpierw cofnij nowsze operacje. Poprawić można ostatnią lotkę.'); }
    undoScoring($pdo,(int)$body['game_id']);
    $body['player_id'] = (int)$last['player_id'];
    return recordDart($pdo,$body,$actor,null);
}

function correctVisit(PDO $pdo, array $body): array
{
    $visitId = requiredInt($body,'visit_id',1,PHP_INT_MAX);
    $visit = sqlOne($pdo,'SELECT * FROM visits WHERE game_id=? AND active=1 ORDER BY visit_no DESC LIMIT 1',[$body['game_id']]);
    if (!$visit || (int)$visit['id'] !== $visitId || $visit['mode'] !== 'aggregate') { problem(409,'not-last-visit','Poprawić można ostatnią wizytę sumaryczną.'); }
    undoScoring($pdo,(int)$body['game_id']);
    $body['player_id'] = (int)$visit['player_id'];
    return recordVisit($pdo,$body);
}

function createDeviceCode(PDO $pdo, array $body): array
{
    $role = $body['role'] ?? '';
    if (!in_array($role,['operator','viewer','camera'],true)) { problem(422,'invalid-role','Nieprawidłowe uprawnienie.'); }
    $permissions=grantPermissions($body,$role);
    $gameId = ($body['game_id'] ?? null) === null ? null : requiredInt($body,'game_id',1,PHP_INT_MAX);
    if ($gameId !== null) { fetchGameRow($pdo,$gameId); }
    if ($role !== 'operator' && $gameId === null) { problem(422,'game-required','Widz i kamera wymagają przypisania do meczu.'); }
    $hours = requiredInt($body,'expires_hours',1,168);
    $code = strtoupper(bin2hex(random_bytes(6)));
    $expires = time() + 600;
    $pdo->prepare('INSERT INTO device_codes(code_hash,role,game_id,expires_at,device_lifetime,permissions_json) VALUES (?,?,?,?,?,?)')->execute([hash('sha256',$code),$role,$gameId,$expires,$hours*3600,canonicalJson($permissions)]);
    return ['code'=>$code,'expires_at'=>$expires,'role'=>$role,'game_id'=>$gameId];
}

function deviceSecret(): string
{
    $path = __DIR__ . '/data/device-secret.bin';
    $handle = fopen($path,'c+b');
    if (!$handle || !flock($handle,LOCK_EX)) { problem(503,'device-secret-unavailable','Nie można odczytać klucza urządzeń.'); }
    try {
        $secret = stream_get_contents($handle);
        if ($secret === '') {
            $secret = random_bytes(32);
            if (fwrite($handle,$secret) !== 32 || !fflush($handle)) { problem(503,'device-secret-unavailable','Nie można zapisać klucza urządzeń.'); }
            @chmod($path,0600);
        }
        if (strlen($secret) !== 32) { problem(503,'device-secret-unavailable','Klucz urządzeń jest uszkodzony.'); }
        return $secret;
    } finally { flock($handle,LOCK_UN); fclose($handle); }
}

function deviceToken(string $id, string $joinId): string
{
    return rtrim(strtr(base64_encode(hash_hmac('sha256',$id . ':' . $joinId,deviceSecret(),true)),'+/','-_'),'=');
}

function joinDevice(PDO $pdo, array $body): array
{
    $joinId = requiredUuid($body,'join_id');
    $code = $body['code'] ?? null;
    $name = $body['device_name'] ?? null;
    if (!is_string($code) || !preg_match('/^[0-9A-F]{12}$/D',$code) || !is_string($name) || trim($name)==='' || strlen($name)>120 || preg_match('/[\x00-\x1F\x7F]/',$name)) { problem(422,'invalid-device-join','Sprawdź kod i nazwę urządzenia.'); }
    $hash = hash('sha256',canonicalJson($body));
    // Attempt accounting commits even when the following join transaction is rejected.
    transaction($pdo,static function () use ($pdo): void {
        $now = time();
        $pdo->prepare('DELETE FROM join_attempts WHERE attempted_at<?')->execute([$now-900]);
        $count = sqlOne($pdo,'SELECT COUNT(*) AS n FROM join_attempts WHERE ip_hash=?',[clientIpHash()]);
        if ((int)$count['n'] >= 30) { problem(429,'pairing-rate-limited','Zbyt wiele prób parowania. Spróbuj później.'); }
        $pdo->prepare('INSERT INTO join_attempts(ip_hash,attempted_at) VALUES (?,?)')->execute([clientIpHash(),$now]);
    });
    return transaction($pdo,static function () use ($pdo,$body,$joinId,$code,$name,$hash): array {
        $old = sqlOne($pdo,'SELECT * FROM devices WHERE join_id=?',[$joinId]);
        if ($old) {
            if ($old['game_id']!==null) { assertFormatClient(fetchGameRow($pdo,(int)$old['game_id'])); }
            if (!hash_equals($old['join_hash'],$hash)) { problem(409,'join-payload-conflict','Identyfikator parowania miał inne dane.'); }
            if ((bool)$old['revoked'] || (int)$old['expires_at']<=time()) { problem(401,'device-expired','Dostęp wygasł. Użyj nowego kodu.'); }
            return ['token'=>deviceToken($old['id'],$joinId),'device'=>publicDevice($old)];
        }
        $grant = sqlOne($pdo,'SELECT * FROM device_codes WHERE code_hash=?',[hash('sha256',$code)]);
        if (!$grant || $grant['used_by']!==null || (int)$grant['expires_at']<=time()) { problem(401,'invalid-pairing-code','Kod jest nieważny, wykorzystany lub wygasł.'); }
        if ($grant['game_id'] !== null) { assertFormatClient(fetchGameRow($pdo,(int)$grant['game_id'])); }
        $id=uuid(); $token=deviceToken($id,$joinId);
        $pdo->prepare('INSERT INTO devices(id,name,role,game_id,token_hash,expires_at,join_id,join_hash,permissions_json) VALUES (?,?,?,?,?,?,?,?,?)')->execute([
            $id,trim($name),$grant['role'],$grant['game_id'],hash('sha256',$token),time()+(int)$grant['device_lifetime'],$joinId,$hash,$grant['permissions_json']
        ]);
        $pdo->prepare('UPDATE device_codes SET used_by=? WHERE code_hash=?')->execute([$id,$grant['code_hash']]);
        return ['token'=>$token,'device'=>publicDevice(sqlOne($pdo,'SELECT * FROM devices WHERE id=?',[$id]))];
    });
}

function revokeDevice(PDO $pdo, array $body): array
{
    $id=requiredUuid($body,'device_id');
    if (!sqlOne($pdo,'SELECT id FROM devices WHERE id=?',[$id])) { problem(404,'device-not-found','Brak urządzenia.'); }
    $pdo->prepare('UPDATE devices SET revoked=1 WHERE id=?')->execute([$id]);
    foreach(sqlRows($pdo,'SELECT id FROM games WHERE active_camera_id=?',[$id]) as $game) {
        $pdo->prepare('UPDATE games SET active_camera_id=NULL,camera_epoch=camera_epoch+1 WHERE id=?')->execute([$game['id']]);
        bumpGame($pdo,(int)$game['id']);
    }
    return ['revoked'=>true,'device_id'=>$id];
}

function selectCamera(PDO $pdo, array $body): array
{
    $id=($body['device_id']??null)===null ? null : requiredUuid($body,'device_id');
    if ($id!==null) {
        $device=sqlOne($pdo,'SELECT * FROM devices WHERE id=?',[$id]);
        if (!$device || (bool)$device['revoked'] || (int)$device['expires_at']<=time() || !in_array($device['role'],['operator','camera'],true) || ($device['game_id']!==null && (int)$device['game_id']!==(int)$body['game_id'])) { problem(403,'camera-access-denied','Urządzenie nie może być kamerą tego meczu.'); }
        // Moving it must not silently mutate another game's revision/context.
        if (sqlOne($pdo,'SELECT id FROM games WHERE active_camera_id=? AND id<>?',[$id,$body['game_id']])) {
            problem(409,'camera-in-other-game','Najpierw wyłącz tę kamerę w poprzednim meczu.');
        }
    }
    $pdo->prepare('UPDATE games SET active_camera_id=?,camera_epoch=camera_epoch+1 WHERE id=?')->execute([$id,$body['game_id']]);
    return [];
}

function createObservation(PDO $pdo, array $body, array $actor): array
{
    $id=requiredUuid($body,'observation_id');
    dartValue($body['field']??null);
    $snapshot=fetchGameSnapshot($pdo,(int)$body['game_id']);
    if ($snapshot['game']['status']!=='active' || $snapshot['game']['active_camera_id']!==$actor['device']['id']) { problem(409,'inactive-camera','To urządzenie nie jest aktywną kamerą meczu.'); }
    foreach (['player_id','leg_no','visit_no','dart_no','camera_epoch'] as $key) {
        if (requiredInt($body,$key,$key==='camera_epoch'?0:1,PHP_INT_MAX)!==$snapshot['game']['context'][$key]) { problem(409,'observation-context-stale','Kontekst odczytu już się zmienił.'); }
    }
    if (sqlOne($pdo,'SELECT id FROM observations WHERE id=?',[$id])) { problem(409,'observation-exists','Ta obserwacja już istnieje.'); }
    $pdo->prepare("UPDATE observations SET status='stale' WHERE game_id=? AND status='pending' AND created_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now','-60 seconds')")->execute([$body['game_id']]);
    if (sqlOne($pdo,"SELECT id FROM observations WHERE game_id=? AND status='pending'",[$body['game_id']])) { problem(409,'observation-pending','Najpierw rozstrzygnij poprzednią obserwację.'); }
    $pdo->prepare('INSERT INTO observations(id,game_id,device_id,revision,player_id,leg_no,visit_no,dart_no,camera_epoch,field) VALUES (?,?,?,?,?,?,?,?,?,?)')->execute([
        $id,$body['game_id'],$actor['device']['id'],$body['expected_revision'],$body['player_id'],$body['leg_no'],$body['visit_no'],$body['dart_no'],$body['camera_epoch'],$body['field']
    ]);
    return [];
}

function reviewObservation(PDO $pdo, array $body, array $actor): array
{
    $id=requiredUuid($body,'observation_id');
    $row=sqlOne($pdo,'SELECT * FROM observations WHERE id=? AND game_id=?',[$id,$body['game_id']]);
    if (!$row) { problem(404,'observation-not-found','Brak obserwacji.'); }
    $snapshot=fetchGameSnapshot($pdo,(int)$body['game_id']);
    if (normalizeObservation($row)['status']!=='pending' || (int)$row['revision']!==$snapshot['game']['revision'] || $row['device_id']!==$snapshot['game']['active_camera_id'] || (int)$row['camera_epoch']!==$snapshot['game']['camera_epoch']) { problem(409,'observation-context-stale','Odczyt został rozstrzygnięty lub utracił aktualność.'); }
    $device=sqlOne($pdo,'SELECT * FROM devices WHERE id=?',[$row['device_id']]);
    if (!$device || (bool)$device['revoked'] || (int)$device['expires_at']<=time()) { problem(409,'observation-context-stale','Dostęp kamery wygasł.'); }
    $decision=$body['decision']??'';
    if ($decision==='reject') {
        $pdo->prepare("UPDATE observations SET status='rejected' WHERE id=?")->execute([$id]);
    } elseif ($decision==='accept') {
        $dart=recordDart($pdo,['game_id'=>(int)$body['game_id'],'player_id'=>(int)$row['player_id'],'field'=>$body['field']??$row['field']],
            ['device'=>['id'=>$row['device_id']]],$id);
        $pdo->prepare("UPDATE observations SET status='accepted',accepted_dart_id=?,accepted_revision=? WHERE id=?")->execute([$dart['dart_id'],$snapshot['game']['revision']+1,$id]);
    } else { problem(422,'invalid-decision','Wybierz accept lub reject.'); }
    return [];
}
