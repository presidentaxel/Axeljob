#!/usr/bin/env bash
# Configure ce dépôt pour utiliser les hooks dans .githooks/ (pre-push = CI locale).
set -euo pipefail
cd "$(dirname "$0")/.."
git config core.hooksPath .githooks
chmod +x .githooks/pre-push .cursor/hooks/before-git-push.sh scripts/guard-push-via-pr.sh 2>/dev/null || true
echo "OK : git config core.hooksPath=.githooks (pre-push = CI locale + blocage push main)."
echo "Cursor : .cursor/hooks.json bloque push main/master et git push si la CI locale échoue."
echo "Workflow : branche feature → CI → git push -u origin HEAD → gh pr create --base main"
echo "Contournement urgence : SKIP_PREPUSH=1 git push"
