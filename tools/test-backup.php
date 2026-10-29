<?php
declare(strict_types=1);

// Isolated real-SQLite regression. Keeps its unique temp directory for inspection.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
if (!extension_loaded('pdo_sqlite') || !extension_loaded('sqlite3')) {
    fwrite(STDERR, "Test requires pdo_sqlite and sqlite3.\n"); exit(1);
}
function checkBackup(bool $condition, string $label): void {
    if (!$condition) { throw new RuntimeException($label); }
}
function runBackup(array $parameters, bool $native = true): array {
    $command = [PHP_BINARY, '-n', '-d', 'extension_dir=' . ini_get('extension_dir'), '-d', 'extension=pdo_sqlite'];
    if ($native) { array_push($command, '-d', 'extension=sqlite3'); }
    $command[] = __DIR__ . '/backup.php';
    foreach ($parameters as $key => $value) { $command[] = '--' . $key . '=' . $value; }
    $process = proc_open($command, [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
    if (!is_resource($process)) { throw new RuntimeException('Cannot start backup process.'); }
    fclose($pipes[0]);
    $stdout = stream_get_contents($pipes[1]); fclose($pipes[1]);
    $stderr = stream_get_contents($pipes[2]); fclose($pipes[2]);
    return [proc_close($process), $stdout, $stderr];
}
function passBackup(string $label): void { fwrite(STDOUT, "PASS " . $label . "\n"); }

$scratch = sys_get_temp_dir() . '/dart-backup-test-' . bin2hex(random_bytes(6));
try {
    mkdir($scratch, 0700);
    $public = $scratch . '/public_html'; $api = $public . '/dart/api';
    mkdir($api . '/data', 0700, true);
    mkdir($scratch . '/private-backups', 0700);
    $config = "<?php return ['password_hash'=>'FAKE-ONLY-FOR-ISOLATED-TEST'];\n";
    $secret = random_bytes(32);
    file_put_contents($api . '/config.local.php', $config);
    file_put_contents($api . '/data/device-secret.bin', $secret);
    $databasePath = $api . '/data/dart-online.sqlite';
    $source = new PDO('sqlite:' . $databasePath, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $source->exec('PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE players(id INTEGER PRIMARY KEY, name TEXT); CREATE TABLE visits(id INTEGER PRIMARY KEY, points INTEGER); CREATE TABLE schema_meta(key TEXT PRIMARY KEY,value TEXT)');
    $source->exec("INSERT INTO players VALUES (3,'TEST-A'),(9,'TEST-B'); INSERT INTO visits VALUES (7,60),(8,180); INSERT INTO schema_meta VALUES ('schema_version','2')");
    checkBackup(file_exists($databasePath . '-wal') && filesize($databasePath . '-wal') > 0, 'Fixture must have committed rows still in WAL.');
    $original = $source->query('SELECT * FROM visits ORDER BY id')->fetchAll(PDO::FETCH_ASSOC);
    foreach ([true, false] as $native) {
        $destination = $scratch . '/private-backups/' . ($native ? 'native' : 'pdo');
        $parameters = ['api-dir' => $api, 'public-root' => $public, 'destination' => $destination];
        [$exit, $stdout, $stderr] = runBackup($parameters, $native);
        checkBackup($exit === 0, 'Backup failed: ' . $stderr);
        $copy = new PDO('sqlite:' . $destination . '/dart-online.sqlite');
        checkBackup($copy->query('PRAGMA integrity_check')->fetchColumn() === 'ok', 'Copied SQLite is corrupt.');
        checkBackup($copy->query('SELECT * FROM visits ORDER BY id')->fetchAll(PDO::FETCH_ASSOC) === $original, 'WAL rows or IDs changed.');
        checkBackup(file_get_contents($destination . '/config.local.php') === $config, 'Config changed.');
        checkBackup(file_get_contents($destination . '/device-secret.bin') === $secret, 'Device key changed.');
        $manifest = json_decode(file_get_contents($destination . '/backup-manifest.json'), true, 512, JSON_THROW_ON_ERROR);
        checkBackup($manifest['method'] === ($native ? 'sqlite3-backup' : 'pdo-vacuum-into') && $manifest['table_counts']['visits'] === 2 && $manifest['table_counts']['players'] === 2, 'Wrong backup manifest.');
        checkBackup(strpos($stdout . $stderr, 'FAKE-ONLY') === false, 'Private config leaked to output.');
        $copy = null;
        $beforeHash = hash_file('sha256', $destination . '/dart-online.sqlite');
        [$repeatExit] = runBackup($parameters, $native);
        checkBackup($repeatExit === 1 && hash_file('sha256', $destination . '/dart-online.sqlite') === $beforeHash, 'Existing backup was overwritten.');
        passBackup(($native ? 'SQLite3 backup' : 'PDO VACUUM INTO') . ': WAL snapshot, IDs, config/key, manifest and overwrite refusal');
    }
    checkBackup($source->query('SELECT * FROM visits ORDER BY id')->fetchAll(PDO::FETCH_ASSOC) === $original, 'Backup mutated source data.');
    $source->exec('INSERT INTO visits VALUES(10,20)');
    passBackup('source unchanged and write lock released');
    foreach ([$public . '/must-not-exist', $api . '/must-not-exist', 'relative-backup'] as $badDestination) {
        [$exit] = runBackup(['api-dir' => $api, 'public-root' => $public, 'destination' => $badDestination]);
        checkBackup($exit === 1 && !file_exists($badDestination), 'Unsafe destination accepted.');
    }
    passBackup('public_html, source and relative destination rejected');
    unlink($api . '/data/device-secret.bin'); // Explicitly disposable isolated fixture only.
    $destination = $scratch . '/private-backups/pre-device-migration';
    [$exit, , $stderr] = runBackup(['api-dir' => $api, 'public-root' => $public, 'destination' => $destination]);
    checkBackup($exit === 0, 'Old schema backup without key failed: ' . $stderr);
    $manifest = json_decode(file_get_contents($destination . '/backup-manifest.json'), true);
    checkBackup($manifest['device_secret_present'] === false && !file_exists($destination . '/device-secret.bin'), 'Old schema gained an invented device key.');
    passBackup('pre-migration database without device secret preserved');
    file_put_contents($api . '/data/device-secret.bin', 'invalid-key');
    $destination = $scratch . '/private-backups/invalid-key';
    [$exit] = runBackup(['api-dir' => $api, 'public-root' => $public, 'destination' => $destination]);
    checkBackup($exit === 1 && !file_exists($destination), 'Invalid key did not fail before destination creation.');
    passBackup('invalid device key fails before creating backup');
    $canonicalApi = $public . '/dart-lens-app/public/api';
    mkdir($canonicalApi . '/data', 0700, true);
    copy($scratch . '/private-backups/native/dart-online.sqlite', $canonicalApi . '/data/dart-online.sqlite');
    file_put_contents($canonicalApi . '/config.local.php', $config);
    file_put_contents($canonicalApi . '/data/device-secret.bin', $secret);
    foreach ([true, false] as $native) {
        $destination = $scratch . '/private-backups/canonical-' . ($native ? 'native' : 'pdo');
        [$exit, , $stderr] = runBackup(['api-dir'=>$canonicalApi,'public-root'=>$public,'destination'=>$destination], $native);
        checkBackup($exit === 0, 'Canonical deployment backup failed: ' . $stderr);
        $canonicalCopy = new PDO('sqlite:' . $destination . '/dart-online.sqlite');
        checkBackup($canonicalCopy->query('SELECT * FROM visits ORDER BY id')->fetchAll(PDO::FETCH_ASSOC) === $original, 'Canonical copy differs.');
        $canonicalCopy = null;
        checkBackup(file_get_contents($destination . '/device-secret.bin') === $secret, 'Canonical key changed.');
    }
    passBackup('canonical dart-lens-app/public/api accepted by both consistent backup methods');
    $wrongApi = $public . '/unrelated/api';
    mkdir($wrongApi, 0700, true);
    $destination = $scratch . '/private-backups/unrelated-layout';
    [$exit] = runBackup(['api-dir'=>$wrongApi,'public-root'=>$public,'destination'=>$destination]);
    checkBackup($exit === 1 && !file_exists($destination), 'Unrelated API layout accepted.');
    passBackup('unrelated API layout remains rejected');
    fwrite(STDOUT, "RESULT 8 PASS; isolated fixtures retained.\n");
} catch (Throwable $error) {
    fwrite(STDERR, $error->getMessage() . "\n"); exit(1);
}
