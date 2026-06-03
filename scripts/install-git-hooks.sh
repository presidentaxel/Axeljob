#!/usr/bin/env bash
# Configure ce dépôt pour utiliser les hooks dans .githooks/ (pre-push = CI locale).
set -euo pipefail
cd "$(dirname "$0")/.."
git config core.hooksPath .githooks
chmod +x .githooks/pre-push .cursor/hooks/before-git-push.sh 2>/dev/null || true
echo "OK : git config core.hooksPath=.githooks (pre-push lance scripts/pre-push.sh ou pre-push.ps1)."
echo "Cursor : .cursor/hooks.json bloque aussi les git push de l'agent si la CI locale échoue."
echo "Contournement urgence : SKIP_PREPUSH=1 git push"
