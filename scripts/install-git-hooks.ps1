# Configure ce depot pour utiliser les hooks dans .githooks/ (pre-push = CI locale).
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $RepoRoot
git config core.hooksPath .githooks
Write-Host 'OK : git config core.hooksPath=.githooks (pre-push lance scripts/pre-push.ps1 ou pre-push.sh).' -ForegroundColor Green
