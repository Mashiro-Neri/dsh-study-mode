# Build a distributable ZIP of this bundle: source tree + the packed tarball.
#
# Usage (PowerShell):
#   powershell -ExecutionPolicy Bypass -File scripts/build-zip.ps1
#
# Output: dist/dsh-study-mode-<version>.zip and .sha256
#
# Layout inside the archive: a single top-level folder named
# dsh-study-mode-<version>/, so extracting it does not spray files into cwd.
#
# NOTE: keep this file ASCII-only. Windows PowerShell 5.1 reads BOM-less files
# using the system codepage, which corrupts non-ASCII characters and breaks parsing.

$ErrorActionPreference = 'Stop'

$root     = Split-Path -Parent $PSScriptRoot
$dist     = Join-Path $root 'dist'
$manifest = Get-Content (Join-Path $root 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$version  = $manifest.version
$folder   = "dsh-study-mode-$version"
$zip      = Join-Path $dist "$folder.zip"

Write-Host "Packing $folder.zip"

# 1) The npm tarball is part of the deliverable, so make sure it exists first.
$tgz = Join-Path $dist "dsh-community-dsh-study-mode-$version.tgz"
if (-not (Test-Path $tgz)) {
    Write-Host "tarball missing - running build-package.ps1 first"
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'build-package.ps1')
    if ($LASTEXITCODE -ne 0) { throw "build-package.ps1 failed" }
}
if (-not (Test-Path $tgz)) { throw "expected tarball not found: $tgz" }

# 2) Stage a clean copy under a temp folder. Copying beats archiving in place:
#    it keeps the archive root tidy and lets us drop files without touching the
#    working tree.
$stage = Join-Path ([System.IO.Path]::GetTempPath()) "dsh-study-mode-zip-$([guid]::NewGuid().ToString('N'))"
$dest  = Join-Path $stage $folder
New-Item -ItemType Directory -Path $dest -Force | Out-Null

try {
    # Whole tree, minus anything that is not source or is regenerable.
    $excludeDirs  = @('node_modules', '.git', '.dsh-market', '.plugin-manager')
    $excludeNames = @('*.log')

    Get-ChildItem -Path $root -Recurse -File -Force | ForEach-Object {
        $rel = $_.FullName.Substring($root.Length).TrimStart('\')
        $parts = $rel -split '\\'
        # skip excluded directories anywhere in the path
        if ($parts | Where-Object { $excludeDirs -contains $_ }) { return }
        foreach ($pat in $excludeNames) { if ($_.Name -like $pat) { return } }
        $target = Join-Path $dest $rel
        New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
        Copy-Item $_.FullName $target -Force
    }

    # 3) Report what actually went in, so the archive contents are not a mystery.
    $files = Get-ChildItem -Path $dest -Recurse -File -Force
    $bytes = ($files | Measure-Object -Property Length -Sum).Sum
    Write-Host ("Staged {0} files, {1:N1} KB" -f $files.Count, ($bytes / 1KB))
    foreach ($f in ($files | Sort-Object FullName)) {
        Write-Host ("  {0,8}  {1}" -f $f.Length, $f.FullName.Substring($dest.Length).TrimStart('\'))
    }

    # 4) Compress. Remove a stale archive first: Compress-Archive updates in
    #    place and would otherwise keep entries that no longer exist.
    if (Test-Path $zip) { Remove-Item $zip -Force }
    Compress-Archive -Path $dest -DestinationPath $zip -CompressionLevel Optimal

    $hash  = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
    $lines = "$hash  $(Split-Path -Leaf $zip)"
    # LF, not CRLF: a trailing CR breaks `sha256sum -c` on Linux/macOS and in Git Bash.
    [System.IO.File]::WriteAllText("$zip.sha256", $lines + "`n", [System.Text.Encoding]::ASCII)

    $size = [math]::Round((Get-Item $zip).Length / 1KB, 1)
    Write-Host ""
    Write-Host "Done:"
    Write-Host "  archive: $zip  ($size KB)"
    Write-Host "  sha256 : $lines"
}
finally {
    if (Test-Path $stage) { Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue }
}
