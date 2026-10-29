param([Parameter(Mandatory=$true)][string]$Directory)
$ErrorActionPreference = 'Stop'
$repoDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$artifactsDirectory = [IO.Path]::GetFullPath((Join-Path $repoDirectory '.tools/artifacts'))
$releaseDirectory = [IO.Path]::GetFullPath($Directory)
if (-not $releaseDirectory.StartsWith($artifactsDirectory + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Release directory must stay inside this repository artifacts folder.' }
if (-not (Test-Path -LiteralPath (Join-Path $releaseDirectory 'release-manifest.json'))) { throw 'Verified release manifest required.' }
$zipFile = $releaseDirectory + '.zip'
if (Test-Path -LiteralPath $zipFile) { throw 'Preserve the existing release archive.' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($releaseDirectory, $zipFile, [IO.Compression.CompressionLevel]::Optimal, $false)
$archive = [IO.Compression.ZipFile]::OpenRead($zipFile)
try {
  $entries = @($archive.Entries | ForEach-Object { $_.FullName.Replace('\','/') })
  foreach ($requiredEntry in @('public/api/.htaccess','public/api/data/.htaccess','public/api/public.php','release-manifest.json','private-tools/backup.php')) { if ($entries -notcontains $requiredEntry) { throw "Archive entry missing: $requiredEntry" } }
  if ($entries -contains 'public/.htaccess' -or ($entries | Where-Object { $_ -match 'config\.local|\.sqlite|device-secret|\.log$' })) { throw 'Unexpected private file in archive.' }
} finally { $archive.Dispose() }
$hashAlgorithm = [Security.Cryptography.SHA256]::Create()
$zipStream = [IO.File]::OpenRead($zipFile)
try { $checksum = [BitConverter]::ToString($hashAlgorithm.ComputeHash($zipStream)).Replace('-','').ToLowerInvariant() }
finally { $zipStream.Dispose(); $hashAlgorithm.Dispose() }
[IO.File]::WriteAllText($zipFile + '.sha256', $checksum + '  ' + [IO.Path]::GetFileName($zipFile) + "`n", [Text.UTF8Encoding]::new($false))
@{ zip=$zipFile; sha256=$checksum; files=$entries.Count } | ConvertTo-Json -Compress
