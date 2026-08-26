# Guide de deploiement (production)

Reference de deploiement `cv-bot` avec Docker.

Branche Git de production : **`prod`**. `main` est l'integration — voir [`ADR_MAIN_PROD.md`](ADR_MAIN_PROD.md).

## Sommaire

1. Prerequis
2. Installation initiale
3. Verification post-deploiement
4. Promote `main` → `prod`
5. Mise a jour serveur (depuis `prod`)
6. Configuration critique
7. Checklist production
8. Sentry (observabilite)
9. Fallback CD (jusqu'a AXE-317)

## 1) Prerequis

- Serveur Linux (2 Go RAM minimum recommande).
- Nom de domaine et DNS.
- Projet Supabase configure.
- Cle API Gemini.
- Docker + plugin Docker Compose.

## 2) Installation initiale

Le clone par defaut GitHub pointe sur `main` (integration). En production, checkout **`prod`** avant le premier build.

```bash
cd /opt
git clone <repo-url> cv-bot
cd cv-bot
git checkout prod
cp .env.example .env
# renseigner les valeurs production dans .env
docker compose build
docker compose up -d
```

## 3) Verification post-deploiement

```bash
docker compose ps
docker compose logs --tail 200 backend
curl http://localhost/health
```

Resultat attendu :

- backend sain ;
- frontend actif ;
- endpoint `/health` sur statut `ok`.

## 4) Promote `main` → `prod`

Rien n'arrive en production tant qu'une PR dont la **base** est `prod` n'est pas mergee.

```bash
gh pr create --base prod --head main \
  --title "release: promote main → prod" \
  --body "$(cat <<'EOF'
## Summary
Promote integration (`main`) vers production (`prod`).

## Linear
Fixes AXE-XX

## Test plan
- [ ] CI verte sur cette PR
- [ ] Apres merge : CD (AXE-317) ou fallback §9
- [ ] `curl …/health` → ok
EOF
)"
```

Hotfix urgence : brancher depuis `origin/prod`, PR vers `prod`, puis backport `main`. Detail : [`git-workflow.md`](git-workflow.md).

> [!WARNING]
> Ne pas merger une PR feature directement dans `prod` (sauf hotfix). Ne pas deployer depuis `main`.

## 5) Mise a jour serveur (depuis `prod`)

Apres merge de la PR promote (ou hotfix) dans `prod` :

```bash
cd /opt/cv-bot
git fetch origin
git checkout prod
git pull origin prod
docker compose build
docker compose up -d
```

> [!WARNING]
> Ne plus `git pull origin main` sur le serveur de production. `main` n'est plus la prod.

Quand [AXE-317](https://linear.app/axel-project/issue/AXE-317) sera livre, un `push` sur `prod` declenchera le CD (`deploy-prod.yml`) et cette etape manuelle ne sera plus le chemin nominal — garder §9 si le CD est down.

## 6) Configuration critique

- Configurer un reverse proxy HTTPS (Caddy, nginx ou Cloudflare).
- Definir un `METRICS_AUTH_TOKEN` robuste.
- Laisser Swagger/ReDoc desactive en production.
- Garder les buckets Supabase prives par defaut.
- Aligner `CV_BOT_API_BASE_URL` et `CV_BOT_FRONTEND_URL` sur les URLs publiques reelles.

> [!WARNING]
> Ne pas deployer sans valider les variables d'environnement et le healthcheck.

## 7) Checklist production

- [ ] PR promote (ou hotfix) mergee dans `prod` — pas un simple merge `main`.
- [ ] Serveur sur la branche `prod` (`git rev-parse --abbrev-ref HEAD`).
- [ ] Variables d'environnement completees et verifiees.
- [ ] Build Docker ok.
- [ ] Healthcheck valide.
- [ ] Logs backend sans erreur bloquante.
- [ ] Workflow securite CI vert.

Pour les commandes d'exploitation quotidiennes, voir `docs/ops-commands.md`.

## 8) Sentry (observabilite)

Decisions figées : [`docs/observabilite.md`](observabilite.md) ([AXE-366](https://linear.app/axel-project/issue/AXE-366)).
Placeholders env : ce guide + `.env.example` ([AXE-369](https://linear.app/axel-project/issue/AXE-369)). **Aucune valeur DSN dans Git.**

SDK : [AXE-367](https://linear.app/axel-project/issue/AXE-367) / [AXE-368](https://linear.app/axel-project/issue/AXE-368). DSN vide = no-op (dev / CI) — voulu tant que les DSN ne sont pas colles **sur le serveur**.

### Ou coller les valeurs (serveur / PC, pas Git)

1. **Local** : laisser `SENTRY_DSN` et `VITE_SENTRY_DSN` **vides** (pas d'events depuis le laptop).
2. **Prod / staging** (`.env` a la racine du clone Docker) :
   - `SENTRY_DSN` = DSN projet `axel-job-backend` (runtime backend)
   - `VITE_SENTRY_DSN` = DSN projet `axel-job-frontend` (**build arg** frontend)
   - `SENTRY_ENVIRONMENT` / `VITE_SENTRY_ENVIRONMENT` = `production` ou `staging` (lecon AXE-271 : pas `MODE` Vite)
   - optionnel : `SENTRY_RELEASE` / `VITE_SENTRY_RELEASE` = SHA git ; `SENTRY_TRACES_SAMPLE_RATE` / `VITE_SENTRY_TRACES_SAMPLE_RATE`
3. Puis **rebuild front** : `docker compose build frontend && docker compose up -d` — changer le `.env` sans rebuild ne met pas Sentry dans le bundle.
4. Backend : `docker compose up -d --force-recreate backend` (lit `.env` au runtime).

`SENTRY_AUTH_TOKEN` : secret de **build** uniquement (source maps, AXE-368). **Pas** dans `.env`. `env_file: .env` injecte toutes les cles : Compose n'a pas d'exclude, donc `environment` force `SENTRY_AUTH_TOKEN=` vide (gagne sur un oubli). Retirer `env_file` pour une allowlist complete casserait GEMINI/Stripe/Supabase — hors scope. Jamais dans l'image nginx.

Recuperer les DSN : Sentry → projet → Settings → Client Keys (DSN). Un DSN par projet, ne pas les melanger.

Session Replay : **off**. CV / annonce : **jamais** dans un event.
Recette post-deploy : [AXE-371](https://linear.app/axel-project/issue/AXE-371).

## 9) Fallback CD (jusqu'a AXE-317)

Le workflow GitHub `deploy-prod.yml` n'existe pas encore. Apres merge dans `prod` :

1. Executer §5 a la main (toujours `prod`, jamais `main`).
2. Verifier `/health`.

Si le CD est down plus tard : **meme fallback**.
