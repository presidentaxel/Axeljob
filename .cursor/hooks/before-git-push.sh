#!/usr/bin/env bash
# Bloque "git push" tant que la gate CI locale (scripts/pre-push.sh) n'a pas réussi.
# Contournement d'urgence : SKIP_PREPUSH=1 git push …
set -euo pipefail

if [[ -n "${SKIP_PREPUSH:-}" ]]; then
  printf '%s\n' '{"permission":"allow"}'
  exit 0
fi

input="$(cat)"
command="$(printf '%s' "$input" | python3 -c "import sys,json; print(json.load(sys.stdin).get('command',''))" 2>/dev/null || true)"

if [[ -z "$command" ]] || ! printf '%s' "$command" | grep -qE 'git[[:space:]]+push'; then
  printf '%s\n' '{"permission":"allow"}'
  exit 0
fi

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$repo_root" || {
  printf '%s\n' '{"permission":"deny","user_message":"Dépôt Git introuvable pour lancer la CI locale."}'
  exit 2
}

if ! bash "$repo_root/scripts/pre-push.sh" --skip-extras --skip-gitleaks >&2; then
  printf '%s\n' "$(cat <<'EOF'
{"permission":"deny","user_message":"CI locale échouée — corriger avant le push. Contournement : SKIP_PREPUSH=1 git push","agent_message":"Exécuter bash scripts/pre-push.sh --skip-extras --skip-gitleaks depuis la racine du repo, corriger toutes les erreurs (black 24.10.0, ruff, mypy, pytest, npm lint/build/test:unit), puis relancer git push."}
EOF
)"
  exit 2
fi

printf '%s\n' '{"permission":"allow"}'
exit 0
