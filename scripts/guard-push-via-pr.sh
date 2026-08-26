#!/usr/bin/env bash
# Refuse un push direct vers main/master/prod - les changements passent par PR.
# Usage :
#   guard-push-via-pr.sh --git-command "git push origin main"
#   guard-push-via-pr.sh --pre-push-stdin   (lit les refs du hook pre-push)
set -euo pipefail

PROTECTED_RE='^(main|master|prod)$'
MSG='Push direct vers main/master/prod interdit - créer une branche et ouvrir une PR (gh pr create).'

deny() {
  echo "$MSG" >&2
  exit 1
}

is_protected_branch() {
  local ref="$1"
  local branch="${ref#refs/heads/}"
  [[ "$branch" =~ $PROTECTED_RE ]]
}

if [[ "${1:-}" == "--git-command" ]]; then
  command="${2:-}"
  if [[ -z "$command" ]] || ! printf '%s' "$command" | grep -qE 'git[[:space:]]+push'; then
    exit 0
  fi

  if printf '%s' "$command" | grep -qE '(HEAD:main|HEAD:master|HEAD:prod|:refs/heads/main|:refs/heads/master|:refs/heads/prod|\s(main|master|prod)\s*$)'; then
    deny
  fi

  # Destination explicite autre que HEAD (ex. git push origin feat/x) : autoriser
  # même si le checkout local est main — sinon la CI GitHub sur main refuse à tort
  # un --git-command de test / un push vers une branche feature.
  last="${command##* }"
  case "$last" in
    push|origin|upstream|-u|--set-upstream|--force|-f|HEAD)
      current="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
      if [[ "$current" =~ $PROTECTED_RE ]]; then
        deny
      fi
      ;;
  esac
  exit 0
fi

if [[ "${1:-}" == "--pre-push-stdin" ]]; then
  while read -r _local_ref _local_sha remote_ref _remote_sha; do
    if is_protected_branch "$remote_ref"; then
      deny
    fi
  done
  exit 0
fi

echo "Usage: guard-push-via-pr.sh --git-command \"…\" | --pre-push-stdin" >&2
exit 2
