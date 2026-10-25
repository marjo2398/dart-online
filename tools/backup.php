<?php
declare(strict_types=1);

// Run from a private directory, never expose an HTTP backup endpoint.
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
ini_set('display_errors', '0');
umask(0077);

function failBackup(string $message): void { throw new RuntimeException($message); }
function absolutePath(string $path): bool { return preg_match('~^(?:[A-Za-z]:[\\\\/]|/)~', $path) === 1; }
function normalizedPath(string $path): string {
    $path = rtrim(str_replace('\\', '/', $path), '/');
    return PHP_OS_FAMILY === 'Windows' ? strtolower($path) : $path;
}
function within(string $path, string $root): bool {
    $path = normalizedPath($path); $root = normalizedPath($root);
    return $path === $root || strpos($path, $root . '/') === 0;
}
function directoryPath(string $value): string {
    if (!absolutePath($value) || !is_dir($value)) { failBackup('Wymagana istniejąca bezwzględna ścieżka katalogu.'); }
    $resolved = realpath($value);
    if ($resolved === false) { failBackup('Nie można rozwiązać ścieżki katalogu.'); }
    return $resolved;
}
function privateSource(string $path, string $apiDirectory, bool $optional = false): ?string {
    if (!file_exists($path)) {
        if ($optional) { return null; }
        failBackup('Brakuje wymaganej bazy lub konfiguracji.');
    }
    $resolved = realpath($path);
    if (!$resolved || !is_file($resolved) || is_link($path) || !within($resolved, $apiDirectory) || !is_readable($resolved)) {
        failBackup('Plik źródłowy musi być zwykłym czytelnym plikiem we wskazanym api.');
    }
    return $resolved;
}
function readPrivate(string $path): string {
    $handle = fopen($path, 'rb');
    if (!$handle || !flock($handle, LOCK_SH)) { failBackup('Nie można zablokować prywatnego pliku do odczytu.'); }
    try {
        $content = stream_get_contents($handle);
        if ($content === false) { failBackup('Nie można odczytać prywatnego pliku.'); }
        return $content;
    } finally { flock($handle, LOCK_UN); fclose($handle); }
}
function writeNew(string $path, string $content): void {
    $handle = fopen($path, 'xb');
    if (!$handle) { failBackup('Nie można utworzyć nowego pliku kopii.'); }
    try {
        $written = 0;
        while ($written < strlen($content)) {
            $count = fwrite($handle, substr($content, $written));
            if ($count === false || $count === 0) { failBackup('Niepełny zapis pliku kopii.'); }
            $written += $count;
        }
        if (!fflush($handle)) { failBackup('Nie można zatwierdzić zapisu pliku kopii.'); }
    } finally { fclose($handle); }
    @chmod($path, 0600);
}
function openPdo(string $path): PDO {
    $pdo = new PDO('sqlite:' . $path, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
    $pdo->exec('PRAGMA busy_timeout=10000');
    return $pdo;
}
function tableCounts(PDO $pdo): array {
    $counts = [];
    $tables = $pdo->query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")->fetchAll(PDO::FETCH_COLUMN);
    foreach ($tables as $table) {
        $quoted = '"' . str_replace('"', '""', $table) . '"';
        $counts[$table] = (int) $pdo->query('SELECT COUNT(*) FROM ' . $quoted)->fetchColumn();
    }
    return $counts;
}

$locked = false;
$source = null;
$created = false;
try {
    $options = getopt('', ['api-dir:', 'public-root:', 'destination:'], $rest);
    if ($rest !== $argc || count($options) !== 3 || !isset($options['api-dir'], $options['public-root'], $options['destination'])) {
        failBackup('Użycie: php backup.php --api-dir=/.../public_html/dart/api --public-root=/.../public_html --destination=/.../private-backups/dart-YYYYMMDD-HHMMSS');
    }
    foreach ($options as $value) { if (!is_string($value)) { failBackup('Każdy argument należy podać dokładnie raz.'); } }
    $apiDirectory = directoryPath($options['api-dir']);
    $publicRoot = directoryPath($options['public-root']);
    if (!within($apiDirectory, $publicRoot) || basename($apiDirectory) !== 'api' || basename(dirname($apiDirectory)) !== 'dart') {
        failBackup('Źródło musi wskazywać katalog dart/api we wskazanym public root.');
    }
    $destination = $options['destination'];
    if (!absolutePath($destination) || preg_match('~(?:^|[\\\\/])public_html(?:[\\\\/]|$)~i', $destination)) {
        failBackup('Kopia musi mieć bezwzględną ścieżkę poza public_html.');
    }
    $parent = directoryPath(dirname($destination));
    $name = basename($destination);
    if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/D', $name) || $name === '.' || $name === '..') { failBackup('Nieprawidłowa nazwa nowego katalogu kopii.'); }
    $destination = $parent . DIRECTORY_SEPARATOR . $name;
    if (within($destination, $publicRoot) || preg_match('~(?:^|[\\\\/])public_html(?:[\\\\/]|$)~i', $destination) || file_exists($destination) || is_link($destination)) {
        failBackup('Katalog kopii musi być nowy i znajdować się poza katalogiem publicznym.');
    }
    $databasePath = privateSource($apiDirectory . '/data/dart-online.sqlite', $apiDirectory);
    $configPath = privateSource($apiDirectory . '/config.local.php', $apiDirectory);
    if (!extension_loaded('pdo_sqlite')) { failBackup('Wymagane rozszerzenie pdo_sqlite.'); }
    $source = openPdo($databasePath);
    $version = (string) $source->query('SELECT sqlite_version()')->fetchColumn();
    $nativeBackup = extension_loaded('sqlite3') && method_exists('SQLite3', 'backup');
    if (!$nativeBackup && version_compare($version, '3.27.0', '<')) {
        failBackup('Ta wersja SQLite wymaga rozszerzenia sqlite3 z metodą backup; brak bezpiecznej metody kopii. Nie rozpoczęto kopiowania.');
    }
    // This reserved write lock freezes committed data without interrupting existing readers.
    // PHP 7.4 PDO does not track explicit BEGIN IMMEDIATE, so COMMIT/ROLLBACK are explicit.
    $source->exec('BEGIN IMMEDIATE'); $locked = true;
    $counts = tableCounts($source);
    $config = readPrivate($configPath);
    $secretPath = privateSource($apiDirectory . '/data/device-secret.bin', $apiDirectory, true);
    $secret = $secretPath === null ? null : readPrivate($secretPath);
    if ($secret !== null && strlen($secret) !== 32) { failBackup('Nieprawidłowy rozmiar istniejącego klucza urządzeń.'); }
    if (!mkdir($destination, 0700)) { failBackup('Nie można utworzyć prywatnego katalogu kopii.'); }
    $created = true;
    $backupPath = $destination . '/dart-online.sqlite';
    if ($nativeBackup) {
        $reader = new SQLite3($databasePath, SQLITE3_OPEN_READONLY);
        $reader->busyTimeout(10000);
        $target = new SQLite3($backupPath, SQLITE3_OPEN_READWRITE | SQLITE3_OPEN_CREATE);
        try {
            if (!$reader->backup($target)) { failBackup('SQLite nie potwierdził wykonania spójnej kopii.'); }
        } finally { $target->close(); $reader->close(); }
        $method = 'sqlite3-backup';
    } else {
        $reader = openPdo($databasePath);
        $reader->exec('VACUUM INTO ' . $reader->quote($backupPath));
        $reader = null;
        $method = 'pdo-vacuum-into';
    }
    @chmod($backupPath, 0600);
    $backup = openPdo($backupPath);
    if ($backup->query('PRAGMA integrity_check')->fetchAll(PDO::FETCH_COLUMN) !== ['ok'] || tableCounts($backup) !== $counts) {
        failBackup('Walidacja spójności lub liczby rekordów kopii nie powiodła się.');
    }
    $backup = null;
    // Detect out-of-band config/key changes; do not label a mixed backup as complete.
    if (!hash_equals(hash('sha256', $config), hash('sha256', readPrivate($configPath)))) { failBackup('Konfiguracja zmieniła się podczas kopii.'); }
    $currentSecretPath = privateSource($apiDirectory . '/data/device-secret.bin', $apiDirectory, true);
    if (($secretPath === null) !== ($currentSecretPath === null) || ($secret !== null && !hash_equals($secret, readPrivate($currentSecretPath)))) {
        failBackup('Klucz urządzeń zmienił się podczas kopii.');
    }
    writeNew($destination . '/config.local.php', $config);
    if ($secret !== null) { writeNew($destination . '/device-secret.bin', $secret); }
    $manifest = [
        'format' => 1, 'completed_at_utc' => gmdate('c'), 'method' => $method, 'sqlite_version' => $version,
        'integrity_check' => 'ok', 'table_counts' => $counts,
        'database_sha256' => hash_file('sha256', $backupPath), 'config_sha256' => hash('sha256', $config),
        'device_secret_present' => $secret !== null,
        'device_secret_sha256' => $secret === null ? null : hash('sha256', $secret),
    ];
    writeNew($destination . '/backup-manifest.json', json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) . "\n");
    $source->exec('ROLLBACK'); $locked = false; // The source was never changed.
    fwrite(STDOUT, "Backup verified: " . $method . "; integrity_check=ok; table counts match.\n");
    exit(0);
} catch (Throwable $error) {
    if ($locked && $source instanceof PDO) { try { $source->exec('ROLLBACK'); } catch (Throwable $ignored) {} }
    // Partial files stay private for diagnosis; a missing manifest means not a valid completed backup.
    $known = $error instanceof RuntimeException && !($error instanceof PDOException);
    fwrite(STDERR, ($known ? $error->getMessage() : 'Kopia nie została wykonana: błąd operacji SQLite lub pliku.') . ($created ? ' Nie używaj nieukończonego katalogu kopii do odtworzenia.' : '') . "\n");
    exit(1);
}
