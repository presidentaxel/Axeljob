#!/usr/bin/env bash
# Dev local / Cursor Cloud : materialise .env puis lance API + frontend.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"
export PYTHONPATH="$REPO_ROOT${PYTHONPATH:+:$PYTHONPATH}"

if [[ -x "$REPO_ROOT/.venv/bin/python" ]]; then
  PYTHON="$REPO_ROOT/.venv/bin/python"
else
  PYTHON="${PYTHON:-python3}"
fi

"$PYTHON" "$REPO_ROOT/scripts/materialize_dotenv.py" --root "$REPO_ROOT"

UVICORN="$REPO_ROOT/.venv/bin/uvicorn"
if [[ ! -x "$UVICORN" ]]; then
  UVICORN="uvicorn"
fi

"$UVICORN" backend.main:app --reload --host 0.0.0.0 --port 8000 &
BACK_PID=$!
cleanup() {
  kill "$BACK_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

npm --prefix frontend run dev -- --host 0.0.0.0 --port 5173
