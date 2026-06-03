#!/usr/bin/env bash
# Gate local avant push : aligne .github/workflows/ci.yml + security.yml (sauf CodeQL).
#
# Usage (depuis la racine du repo) :
#   bash scripts/pre-push.sh
#   bash scripts/pre-push.sh --with-e2e
#   bash scripts/pre-push.sh --skip-extras
#   bash scripts/pre-push.sh --skip-gitleaks
#
# Prérequis : .venv à la racine (python -m venv .venv && pip install … comme en CI).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"
export PYTHONPATH="$REPO_ROOT"

WITH_E2E=0
SKIP_EXTRAS=0
SKIP_GITLEAKS=0
for arg in "$@"; do
  case "$arg" in
    --with-e2e) WITH_E2E=1 ;;
    --skip-extras) SKIP_EXTRAS=1 ;;
    --skip-gitleaks) SKIP_GITLEAKS=1 ;;
  esac
done

die() { echo "Echec: $*" >&2; exit 1; }

phase() { echo ""; echo "=== $* ==="; }

if [[ ! -f "$REPO_ROOT/.venv/bin/activate" ]]; then
  die ".venv introuvable. Créer : python3 -m venv .venv && source .venv/bin/activate && pip install -r backend/requirements.txt -r backend/requirements-dev.txt && pip install black==24.10.0 ruff==0.8.4 mypy==1.13.0 pytest==8.3.3 pytest-cov==6.0.0"
fi

# shellcheck source=/dev/null
source "$REPO_ROOT/.venv/bin/activate"

phase "Backend (ruff)"
ruff check .

phase "Backend (black)"
black --check .

phase "Backend (mypy)"
mypy backend

phase "Backend (pytest + couverture CV, même args que CI)"
pytest tests -v --tb=short \
  --cov=backend.services.cv_render_helpers \
  --cov=backend.cv_html_render \
  --cov-report=term-missing \
  --cov-fail-under=62

if [[ "$SKIP_EXTRAS" -eq 0 ]]; then
  if [[ "$SKIP_GITLEAKS" -eq 0 ]] && command -v gitleaks >/dev/null 2>&1; then
    phase "Secrets (gitleaks)"
    gitleaks detect --source . --redact --verbose
  elif [[ "$SKIP_GITLEAKS" -eq 0 ]]; then
    echo "Gitleaks absent du PATH — installe https://github.com/gitleaks/gitleaks ou passe --skip-gitleaks / --skip-extras." >&2
  fi

  phase "Backend (pip-audit)"
  python -m pip install -q pip-audit
  pip-audit -r backend/requirements.txt

  phase "Backend (bandit)"
  python -m pip install -q bandit
  bandit -r backend -c pyproject.toml
fi

phase "Frontend (npm ci + lint + build)"
cd "$REPO_ROOT/frontend"
npm ci

if [[ "$SKIP_EXTRAS" -eq 0 ]]; then
  phase "Frontend (npm audit --audit-level=high)"
  npm audit --audit-level=high
fi

npm run lint
npm run build

phase "Frontend (tests unitaires node:test)"
npm run test:unit

if [[ "$WITH_E2E" -eq 1 ]]; then
  phase "Frontend (Playwright)"
  npm run test:e2e
fi

echo ""
echo "OK — pre-push terminé sans erreur."
