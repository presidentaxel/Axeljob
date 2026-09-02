#!/usr/bin/env bash
# Déploiement production AxeL Job depuis la branche `prod`.
#
# Chemin nominal : appelé par .github/workflows/deploy-prod.yml (SSH après
# `git checkout -B prod origin/prod`).
# Fallback si le CD GitHub est down :
#   cd /opt/cv-bot && git fetch origin && git checkout -B prod origin/prod
#   bash scripts/deploy-prod.sh --skip-pull
#
# Ne jamais lancer ce script sur `main` ni une feature.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SKIP_PULL=0
DRY_RUN=0
HEALTH_URL="${DEPLOY_HEALTH_URL:-http://127.0.0.1/health}"
HEALTH_RETRIES="${DEPLOY_HEALTH_RETRIES:-30}"
HEALTH_INTERVAL_SEC="${DEPLOY_HEALTH_INTERVAL_SEC:-5}"

usage() {
  cat <<'EOF'
Usage: bash scripts/deploy-prod.sh [--skip-pull] [--dry-run] [--health-url URL]

  --skip-pull     Ne pas git fetch/pull (le CD a déjà aligné HEAD sur origin/prod).
  --dry-run       Vérifie que HEAD est `prod`, n'exécute ni Docker ni curl.
  --health-url    Override DEPLOY_HEALTH_URL (défaut: http://127.0.0.1/health).
EOF
}

die() {
  echo "deploy-prod.sh: $*" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-pull) SKIP_PULL=1 ;;
    --dry-run) DRY_RUN=1 ;;
    --health-url)
      [[ $# -ge 2 ]] || die "--health-url attend une URL"
      HEALTH_URL="$2"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      die "argument inconnu: $1"
      ;;
  esac
  shift
done

branch="$(git symbolic-ref --short HEAD 2>/dev/null || git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
[[ "$branch" == "prod" ]] || die "refuse (HEAD=${branch:-?}, besoin prod)"

if [[ "$SKIP_PULL" -eq 0 ]]; then
  git fetch origin
  git pull --ff-only origin prod
  branch="$(git symbolic-ref --short HEAD 2>/dev/null || git rev-parse --abbrev-ref HEAD)"
  [[ "$branch" == "prod" ]] || die "refuse après pull (HEAD=$branch, besoin prod)"
fi

dirty="$(git status --porcelain --untracked-files=no || true)"
if [[ -n "$dirty" ]]; then
  echo "$dirty" >&2
  die "working tree tracked dirty — refuser un deploy ambigu"
fi

export SENTRY_RELEASE="${SENTRY_RELEASE:-$(git rev-parse HEAD)}"

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "dry-run: HEAD=prod SHA=$SENTRY_RELEASE smoke=$HEALTH_URL"
  echo "dry-run: docker compose build && docker compose up -d"
  exit 0
fi

echo "deploy-prod: SHA=$SENTRY_RELEASE health=$HEALTH_URL"
docker compose build
docker compose up -d

health_ok() {
  local body
  body="$(curl -fsS --max-time 5 "$HEALTH_URL" 2>/dev/null || true)"
  [[ "$body" == *'"status":"ok"'* || "$body" == *'"status": "ok"'* ]]
}

i=1
while [[ "$i" -le "$HEALTH_RETRIES" ]]; do
  if health_ok; then
    echo "deploy-prod: smoke OK ($HEALTH_URL) SHA=$SENTRY_RELEASE"
    exit 0
  fi
  echo "deploy-prod: health pas encore ok ($i/$HEALTH_RETRIES), retry ${HEALTH_INTERVAL_SEC}s"
  sleep "$HEALTH_INTERVAL_SEC"
  i=$((i + 1))
done

die "smoke /health KO après ${HEALTH_RETRIES} essais ($HEALTH_URL)"
