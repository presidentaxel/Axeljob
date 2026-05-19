# Gate local avant push : aligne `.github/workflows/ci.yml` + `security.yml` (sauf CodeQL, action GitHub uniquement).
#
# Usage (depuis n'importe quel cwd) :
#   .\scripts\pre-push.ps1
#   .\scripts\pre-push.ps1 -WithE2E          # Playwright apres lint/build (+ long).
#   .\scripts\pre-push.ps1 -SkipExtras       # Pas pip-audit / bandit / npm audit / gitleaks.
#   .\scripts\pre-push.ps1 -SkipGitleaks     # Gitleaks absent sur la machine : ignorer le scan secrets.
#
# Prerequis : `.venv` a la racine avec deps CI (voir docs/COMMANDS.md).

[CmdletBinding()]
param(
    [switch]$WithE2E,
    [switch]$SkipExtras,
    [switch]$SkipGitleaks
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$VenvActivate = Join-Path $RepoRoot '.venv\Scripts\Activate.ps1'
$VenvPython = Join-Path $RepoRoot '.venv\Scripts\python.exe'
$Frontend = Join-Path $RepoRoot 'frontend'

$OriginalCwd = Get-Location
$PreviousPythonPath = $env:PYTHONPATH
Set-Location $RepoRoot
# Importer `backend.*` depuis `tests/` comme en CI (racine du repo sur PYTHONPATH).
$env:PYTHONPATH = $RepoRoot

function Write-Phase {
    param([string]$Message)
    Write-Host ''
    Write-Host "=== $Message ===" -ForegroundColor Cyan
}

function Assert-NativeExit {
    param(
        [Parameter(Mandatory = $true)][string]$Step,
        [int]$Expect = 0
    )
    if ($LASTEXITCODE -ne $Expect) {
        throw "$Step a echoue (sortie $LASTEXITCODE)."
    }
}

try {
    if (-not (Test-Path $VenvPython)) {
        throw ".venv introuvable a la racine. Creer puis installer : pip install -r backend/requirements.txt -r backend/requirements-dev.txt (voir docs/COMMANDS.md)."
    }

    Write-Phase 'Backend (ruff)'
    . $VenvActivate
    python -m ruff check .
    Assert-NativeExit 'ruff'

    Write-Phase 'Backend (black)'
    python -m black --check .
    Assert-NativeExit 'black'

    Write-Phase 'Backend (mypy)'
    python -m mypy backend
    Assert-NativeExit 'mypy'

    Write-Phase 'Backend (pytest + couverture CV, meme args que CI)'
    pytest tests -v --tb=short `
        --cov=backend.services.cv_render_helpers `
        --cov=backend.cv_html_render `
        --cov-report=term-missing `
        --cov-fail-under=62
    Assert-NativeExit 'pytest'

    if (-not $SkipExtras) {
        if (-not $SkipGitleaks) {
            $gitleaks = Get-Command gitleaks -ErrorAction SilentlyContinue
            if ($gitleaks) {
                Write-Phase 'Secrets (gitleaks, comme security.yml)'
                Set-Location $RepoRoot
                gitleaks detect --source . --redact --verbose
                Assert-NativeExit 'gitleaks'
            } else {
                Write-Host 'Gitleaks non trouve dans le PATH — installe https://github.com/gitleaks/gitleaks ou passe -SkipGitleaks / -SkipExtras.' -ForegroundColor Yellow
            }
        }

        Write-Phase 'Backend (pip-audit sur requirements)'
        python -m pip install -q pip-audit
        Assert-NativeExit 'pip install pip-audit'
        pip-audit -r backend/requirements.txt
        Assert-NativeExit 'pip-audit'

        Write-Phase 'Backend (bandit, comme security.yml)'
        python -m pip install -q bandit
        Assert-NativeExit 'pip install bandit'
        python -m bandit -r backend -c pyproject.toml
        Assert-NativeExit 'bandit'
    }

    if (-not (Test-Path $Frontend)) {
        throw "Dossier frontend introuvable : $Frontend"
    }

    Write-Phase 'Frontend (npm ci + lint + build)'
    Set-Location $Frontend

    npm ci
    Assert-NativeExit 'npm ci'

    if (-not $SkipExtras) {
        Write-Phase 'Frontend (npm audit --audit-level=high, comme security.yml)'
        npm audit --audit-level=high
        Assert-NativeExit 'npm audit'
    }

    npm run lint
    Assert-NativeExit 'eslint (npm run lint)'

    npm run build
    Assert-NativeExit 'vite build'

    Write-Phase 'Frontend (tests unitaires node:test)'
    npm run test:unit
    Assert-NativeExit 'node --test (npm run test:unit)'

    if ($WithE2E) {
        Write-Phase 'Frontend (Playwright)'
        npm run test:e2e
        Assert-NativeExit 'playwright'
    }

    Write-Host ''
    Write-Host 'OK - pre-push termine sans erreur.' -ForegroundColor Green
    exit 0
}
catch {
    Write-Host ''
    Write-Host "Echec : $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
finally {
    if ($null -ne $PreviousPythonPath -and $PreviousPythonPath -ne '') {
        $env:PYTHONPATH = $PreviousPythonPath
    } else {
        Remove-Item Env:\PYTHONPATH -ErrorAction SilentlyContinue
    }
    Set-Location $OriginalCwd
}
