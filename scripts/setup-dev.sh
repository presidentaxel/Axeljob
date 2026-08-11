#!/usr/bin/env bash
# Configuration dev one-shot : .venv (versions CI), hook pre-push Git, rappel hook Cursor.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "=== Python .venv (versions alignées CI) ==="
if [[ ! -d .venv ]]; then
  python3 -m venv .venv
fi
# shellcheck source=/dev/null
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r backend/requirements.txt -r backend/requirements-dev.txt
pip install black==24.10.0 ruff==0.8.4 mypy==1.13.0 pytest==8.3.3 pytest-cov==6.0.0 pre-commit

echo ""
echo "=== Hook Git pre-push (chaque git push) ==="
bash "$REPO_ROOT/scripts/install-git-hooks.sh"

if command -v pre-commit >/dev/null 2>&1; then
  echo ""
  echo "=== pre-commit (commit uniquement ; pre-push = .githooks pour éviter double CI) ==="
  pre-commit install --hook-type pre-commit 2>/dev/null || true
fi

echo ""
echo "=== Cursor ==="
echo "Les hooks projet sont dans .cursor/hooks.json (bloque git push si la CI locale échoue)."
echo "Règle agent : .cursor/rules/pre-push-ci.mdc"
echo ""
echo "OK - setup dev terminé. Tester : bash scripts/pre-push.sh --skip-extras --skip-gitleaks"
