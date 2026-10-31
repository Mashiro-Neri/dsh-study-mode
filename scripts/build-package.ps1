# Build this bundle into a distributable npm package (.tgz) plus a SHA256 file.
#
# Usage (PowerShell):
#   powershell -ExecutionPolicy Bypass -File scripts/build-package.ps1
#
# Output: dist/<slug>-<version>.tgz and dist/<slug>-<version>.tgz.sha256
#
# NOTE: keep this file ASCII-only. Windows PowerShell 5.1 reads BOM-less files
# using the system codepage, which corrupts non-ASCII characters and breaks parsing.
#
# We use `npm pack` rather than hand-rolled tar so the package.json `files`
# allowlist is honoured and the result is installable by dsh-plugin-manager.

$ErrorActionPreference = 'Stop'

$root     = Split-Path -Parent $PSScriptRoot
$dist     = Join-Path $root 'dist'
$manifest = Get-Content (Join-Path $root 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json

$name    = $manifest.name
$version = $manifest.version
# npm tarball filename: drop the scope '@' and replace '/' with '-'
$slug    = ($name -replace '^@', '' -replace '/', '-')

Write-Host "Packing $name@$version"

# 1) Pre-flight checks: bundle declaration, patch file, skill bundles, roster shim.
$patch = Join-Path $root 'cordis.patch.yml'
if (-not (Test-Path $patch)) { throw "missing cordis.patch.yml: $patch" }
if (-not $manifest.dsh.bundle.patch) { throw "package.json has no dsh.bundle.patch declaration" }

# The roster shim hides the internal practice preset from the mode picker. A
# tarball without it ships a bundle whose child preset leaks into the UI, so
# fail the build instead of discovering that after an install.
$shimDir  = Join-Path $root 'plugin'
$shimFile = Join-Path $shimDir 'hide-internal-presets.js'
if (-not (Test-Path $shimFile)) { throw "missing plugin/hide-internal-presets.js - the practice preset would leak into the mode picker" }
if (-not ($manifest.files -contains 'plugin')) { throw "package.json files[] does not ship plugin/" }

$skillsDir = Join-Path $root 'skills'
if (-not (Test-Path $skillsDir)) { throw "missing skills/ directory: $skillsDir" }
$skills = @(Get-ChildItem $skillsDir -Directory)
if ($skills.Count -eq 0) { throw "skills/ contains no skill directories" }
foreach ($s in $skills) {
    $skillMd = Join-Path $s.FullName 'SKILL.md'
    if (-not (Test-Path $skillMd)) { throw "skill '$($s.Name)' is missing SKILL.md" }
}

# 1b) Bundle self-check: preset references, removed fields, structural read-only,
# skill frontmatter, roster shim, package manifest.
$node = (Get-Command node -ErrorAction SilentlyContinue)
if ($node) {
    & node (Join-Path $PSScriptRoot 'check-bundle.cjs')
    if ($LASTEXITCODE -ne 0) { throw "check-bundle.cjs failed" }
} else {
    Write-Host "node not on PATH - skipping check-bundle.cjs"
}

# 2) Rebuild dist from scratch.
if (Test-Path $dist) { Remove-Item $dist -Recurse -Force }
New-Item -ItemType Directory -Path $dist -Force | Out-Null

# 3) npm pack (honours the files allowlist).
$prevEap = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
Push-Location $root
try {
    $out = & npm pack --pack-destination $dist 2>&1
    $code = $LASTEXITCODE
}
finally {
    Pop-Location
    $ErrorActionPreference = $prevEap
}
$out | Where-Object { "$_" -notmatch '^npm notice' } | ForEach-Object { Write-Host "$_" }
if ($code -ne 0) { throw "npm pack failed with exit code $code" }

# 4) SHA256 sidecar.
$tgz = Join-Path $dist "$slug-$version.tgz"
if (-not (Test-Path $tgz)) {
    $found = @(Get-ChildItem $dist -Filter '*.tgz')
    if ($found.Count -ne 1) { throw "expected one .tgz; dist contains: $((Get-ChildItem $dist).Name -join ', ')" }
    $tgz = $found[0].FullName
}

$hash  = (Get-FileHash $tgz -Algorithm SHA256).Hash.ToLower()
$lines = "$hash  $(Split-Path -Leaf $tgz)"
# LF, not CRLF: a trailing CR breaks `sha256sum -c` on Linux/macOS and in Git Bash.
[System.IO.File]::WriteAllText("$tgz.sha256", $lines + "`n", [System.Text.Encoding]::ASCII)

$size = [math]::Round((Get-Item $tgz).Length / 1KB, 1)
Write-Host ""
Write-Host "Done:"
Write-Host "  package: $tgz  ($size KB)"
Write-Host "  sha256 : $lines"
