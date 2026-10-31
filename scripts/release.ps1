# Release helper: verify, build, tag, push, and publish a GitHub Release whose
# notes come from CHANGELOG.md. All output text lives in CHANGELOG.md, so this
# file stays ASCII only -- Windows PowerShell 5.1 decodes BOM-less files with the
# system codepage and breaks on non-ASCII source.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/release.ps1 -Version 2.0.0
#   powershell -ExecutionPolicy Bypass -File scripts/release.ps1 -Version 2.0.0 -DryRun
#
# Runtime checks (host contract snapshot + real-host preset verification) run
# only when DSH_RUNTIME points at an extracted 0.2.1-rc.x runtime; otherwise they
# are reported as skipped so a docs-only release is still possible.
#
# Prerequisites: clean working tree, package.json already at -Version, a
# "## [<version>]" section in CHANGELOG.md. For the publish step: an `origin`
# remote and `gh` logged in. Without an origin remote the script builds and tags
# locally and stops before publishing.

param(
  [Parameter(Mandatory = $true)][string]$Version,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
# Keep Chinese preview readable on a legacy console. The notes file itself is
# always written as UTF-8 without BOM, so this only affects the terminal.
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Fail($message) {
  Write-Output "FAIL  $message"
  exit 1
}
function Run-Step($label, $block) {
  Write-Output "== $label"
  & $block
  if ($LASTEXITCODE -ne 0) { Fail "$label failed." }
}

# 1. Version must match package.json.
$pkg = Get-Content 'package.json' -Raw -Encoding UTF8 | ConvertFrom-Json
if ($pkg.version -ne $Version) {
  Fail "package.json is $($pkg.version), expected $Version. Bump it first."
}

# 2. CHANGELOG must carry a non-empty section for this version.
$changelogPath = Join-Path $root 'CHANGELOG.md'
if (-not (Test-Path $changelogPath)) { Fail 'CHANGELOG.md is missing.' }
$changelog = Get-Content $changelogPath -Raw -Encoding UTF8
$pattern = '(?m)^## \[' + [regex]::Escape($Version) + '\][^\r\n]*\r?\n'
$match = [regex]::Match($changelog, $pattern)
if (-not $match.Success) { Fail "CHANGELOG.md has no '## [$Version]' section." }
$rest = $changelog.Substring($match.Index + $match.Length)
$next = [regex]::Match($rest, '(?m)^## \[')
$notes = if ($next.Success) { $rest.Substring(0, $next.Index).Trim() } else { $rest.Trim() }
if ([string]::IsNullOrWhiteSpace($notes)) { Fail "The [$Version] section is empty." }

# 3. Working tree must be clean (skipped for a dry run).
if (-not $DryRun) {
  $status = (& git status --porcelain) | Out-String
  if ($status.Trim() -ne '') { Fail 'Working tree is not clean. Commit first.' }
}

# 4. Generated patch must be in sync, and every static check must pass.
Run-Step 'render cordis.patch.yml from src/' { & node scripts/build-patch.mjs --check }
Run-Step 'check-bundle.cjs' { & node scripts/check-bundle.cjs }

# 5. Host-dependent checks (optional but strongly recommended).
if ($env:DSH_RUNTIME) {
  Run-Step 'check-host-contract.mjs' { & node scripts/check-host-contract.mjs --runtime $env:DSH_RUNTIME }
  Run-Step 'verify-preset.mjs (default roster)' { & node scripts/verify-preset.mjs --runtime $env:DSH_RUNTIME }
  Run-Step 'verify-preset.mjs (child preset visible)' { & node scripts/verify-preset.mjs --runtime $env:DSH_RUNTIME --with-internal }
  Run-Step 'verify-preset.mjs (broken child stays visible)' { & node scripts/verify-preset.mjs --runtime $env:DSH_RUNTIME --broken-internal }
} else {
  Write-Output 'SKIP  host-dependent checks: set DSH_RUNTIME to an extracted 0.2.1-rc.x runtime to enable them.'
}

# 6. Build both distribution artifacts (the zip embeds the freshly packed tgz).
Run-Step 'build-package.ps1' { & powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-package.ps1 }
Run-Step 'build-zip.ps1' { & powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-zip.ps1 }

$tag = "v$Version"
$origin = (& git remote) | Out-String
$hasOrigin = $origin -match '(?m)^origin\s*$'
$publishHint = if ($hasOrigin) { ', push main + tag, and create the GitHub release' } else { ' (local only: no origin remote)' }

if ($DryRun) {
  Write-Output ''
  Write-Output "DRY RUN: would tag $tag$publishHint."
  Write-Output 'DRY RUN: no tag, commit or release was touched.'
  Write-Output '--- release notes preview ---'
  Write-Output $notes
  exit 0
}

# 7. Annotated tag (reused when it already exists).
$existing = (& git tag -l $tag) | Out-String
if ($existing.Trim() -ne '') {
  Write-Output "Tag $tag already exists locally; reusing it."
} else {
  & git tag -a $tag -m "v$Version"
  if ($LASTEXITCODE -ne 0) { Fail "Could not create tag $tag." }
}

if (-not $hasOrigin) {
  Write-Output ''
  Write-Output "No 'origin' remote configured: built dist/ and created local tag $tag."
  Write-Output 'Add the remote, push, and publish the GitHub release when the repository exists:'
  Write-Output "  git remote add origin <url>; git push -u origin main; git push origin $tag"
  exit 0
}

# 8. Push commit and tag.
& git push origin main
if ($LASTEXITCODE -ne 0) { Fail 'git push main failed.' }
& git push origin $tag
if ($LASTEXITCODE -ne 0) { Fail "git push $tag failed." }

# 9. GitHub Release (created or updated from the changelog section).
$notesFile = [System.IO.Path]::GetTempFileName()
try {
  [System.IO.File]::WriteAllText($notesFile, $notes, (New-Object System.Text.UTF8Encoding($false)))
  # Windows PowerShell 5.1 turns a native command's stderr into a terminating
  # error while ErrorActionPreference is Stop, so probe with Continue and read
  # the exit code instead.
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  & gh release view $tag 2>$null | Out-Null
  $exists = $LASTEXITCODE -eq 0
  $ErrorActionPreference = $previous
  if ($exists) {
    & gh release edit $tag --title $tag --notes-file $notesFile
    if ($LASTEXITCODE -ne 0) { Fail "gh release edit $tag failed." }
    Write-Output "Updated existing GitHub release $tag."
  } else {
    & gh release create $tag --title $tag --notes-file $notesFile
    if ($LASTEXITCODE -ne 0) { Fail "gh release create $tag failed." }
    Write-Output "Created GitHub release $tag."
  }
} finally {
  Remove-Item $notesFile -ErrorAction SilentlyContinue
}

Write-Output ''
Write-Output "Released $tag."
