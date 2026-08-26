# Observabilité AxeL Job — Sentry (AXE-366)

Spike : [AXE-366](https://linear.app/axel-project/issue/AXE-366) · 2026-08-26  
Décalque CRM : [AXE-22](https://linear.app/axel-project/issue/AXE-22) (Done), [AXE-271](https://linear.app/axel-project/issue/AXE-271) (sampling front), [AXE-269](https://linear.app/axel-project/issue/AXE-269) (alertes), [AXE-270](https://linear.app/axel-project/issue/AXE-270) (pas de routes de test).  
Consentement : même logique que [AXE-363](https://linear.app/axel-project/issue/AXE-363) (PostHog = CMP / Sentry ≠ CMP).

**Pas de SDK dans ce ticket.** Code : [AXE-367](https://linear.app/axel-project/issue/AXE-367) (backend), [AXE-368](https://linear.app/axel-project/issue/AXE-368) (frontend), [AXE-369](https://linear.app/axel-project/issue/AXE-369) (env), [AXE-370](https://linear.app/axel-project/issue/AXE-370) (contextes métier), [AXE-371](https://linear.app/axel-project/issue/AXE-371) (recette + alertes).

---

## Verdict

**Go Sentry** pour le diagnostic d’erreurs (front React + back FastAPI).  
**Pas** un outil analytics. **Pas** de Session Replay. **Pas** derrière la CMP.

État `main` (août 2026) : 0 dépendance Sentry, 0 DSN, Prometheus seulement (`monitoring_ops.py` / `/metrics`). Ça reste : Prometheus = volume ; Sentry = stack + contexte.

---

## Décisions figées

### Org / projets

| | Décision |
|---|---|
| Org | Réutiliser l’org CRM **`axel-project`** ([axel-project.sentry.io](https://axel-project.sentry.io)) — mêmes membres, même canal d’alerte email ([AXE-269](https://linear.app/axel-project/issue/AXE-269)) |
| Projets Job | **2 nouveaux** : `axel-job-frontend` et `axel-job-backend` (DSN distincts). **Ne pas** réutiliser `javascript-react` / `python-fastapi` (CRM) |
| Région | Org actuelle = **US** `sentry.io` (comme le CRM). Écart vs « EU obligatoire » du ticket : **accepté** — le CV ne doit **jamais** partir (scrub), les autres sous-traitants US (Supabase, Stripe, Gemini) sont déjà déclarés avec CCT. Si un org EU (`de.sentry.io`) est créé plus tard : seuls les DSN changent |

Créer les deux projets **avant** [AXE-367](https://linear.app/axel-project/issue/AXE-367) / [AXE-368](https://linear.app/axel-project/issue/AXE-368) (sinon no-op silencieux en prod).

### Sampling

Leçon CRM [AXE-271](https://linear.app/axel-project/issue/AXE-271) : un build Vite Docker a `MODE=production` même sur staging. **Ne pas** dériver le sample rate du `import.meta.env.MODE`. Utiliser `VITE_SENTRY_ENVIRONMENT`.

| Environnement | Erreurs | Traces | Profiling | Replay |
|---|---|---|---|---|
| local / CI (`SENTRY_DSN` / `VITE_SENTRY_DSN` vide) | no-op | no-op | off | off |
| `staging` | 100 % | 100 % (`1.0`) | off | **off** |
| `production` | 100 % | 10 % (`0.1`) | off | **off** |

Backend : `SENTRY_ENVIRONMENT` sinon `ENVIRONMENT`. Frontend : `VITE_SENTRY_ENVIRONMENT` (défaut `production` seulement si la variable est absente **et** qu’un DSN est posé).

### PII — liste noire (never send)

`send_default_pii=False`. `before_send` / `beforeSend` + filtrage breadcrumbs.

| Jamais | Exemples |
|---|---|
| Contenu de CV | JSON `cv`, HTML preview, PDF, texte collé, photo |
| Texte d’annonce | `annonce`, job description, `offer_text` |
| Identifiants nominatifs | email, nom, téléphone, adresse |
| Secrets | JWT Supabase, `GEMINI_API_KEY`, `STRIPE_*`, `SUPABASE_SERVICE_KEY`, `SENTRY_AUTH_TOKEN` |
| Corps HTTP sensibles | `POST /api/adapt*`, `/api/import*`, `/api/cv*`, webhooks Stripe |
| Chemins fichiers utilisateur | uploads locaux |
| `setUser` | **pas d’email**. `id` = UUID Supabase (opaque) + tag `plan` = `free` \| `pro` |

OK : route, status HTTP, `flow`, moteur PDF, durée, taille fichier, code d’erreur fournisseur, `release`, `environment`.

### Consentement (RGPD)

| | Décision |
|---|---|
| Base légale | **Intérêt légitime** art. 6(1)(f) — sécurité / continuité du service (diagnostic d’erreurs techniques) |
| CMP | **Hors CMP.** Refuser « Mesure d’audience » ne doit **pas** couper Sentry (sinon on est aveugles sur `/app`) |
| vs PostHog / GA4 | Analytics = consentement ([AXE-363](https://linear.app/axel-project/issue/AXE-363) no-go PostHog ; GA4 derrière la bannière). Sentry ≠ mesure d’audience |
| Session Replay | **Non** tant que l’éditeur affiche un CV. Un replay = capture d’écran de données pro + coordonnées → consentement + risque inacceptable |
| Information | Ligne sous-traitant + finalité dans `/confidentialite` (**HTML et JSX**, ils divergent déjà) |

### Session Replay / autres signaux

- Replay : **off**, et le rester (critère [AXE-368](https://linear.app/axel-project/issue/AXE-368)).
- Autocapture / tracing des corps `fetch` : URL ok, body **strip** sur adapt/import/cv.
- Pages HTML statiques (FAQ, ATS, guides) : **pas** de SDK v1. SPA seulement (`/`, `/login`, `/app/*`) — même périmètre que `entry-conditional.js`.
- Pas de route `/sentry-test` en prod ([AXE-270](https://linear.app/axel-project/issue/AXE-270)).

### Environnements et releases

| Tag Sentry | Source |
|---|---|
| `environment` | `staging` \| `production` (local = DSN vide, no-op) |
| `release` | SHA git du **build Docker** (`SENTRY_RELEASE` / `VITE_SENTRY_RELEASE`) — pour attacher les source maps |

`ENVIRONMENT=production` dans `docker-compose.yml` prod. Staging DO : poser `VITE_SENTRY_ENVIRONMENT=staging` au build front (leçon AXE-271).

---

## Variables (pour [AXE-369](https://linear.app/axel-project/issue/AXE-369))

Aucune n’est à committer en dur. DSN vide = no-op (dev + CI).

| Variable | Où | Rôle |
|---|---|---|
| `SENTRY_DSN` | backend runtime | DSN `axel-job-backend` |
| `VITE_SENTRY_DSN` | **build arg** frontend (comme `VITE_AXEL_GTM_ID`) | DSN `axel-job-frontend` |
| `SENTRY_ENVIRONMENT` | backend runtime | sinon `ENVIRONMENT` |
| `VITE_SENTRY_ENVIRONMENT` | build arg frontend | tag + sample rate traces ; **ne pas** utiliser `MODE` |
| `SENTRY_RELEASE` | build backend | SHA git |
| `VITE_SENTRY_RELEASE` | build arg frontend | SHA git (source maps) |
| `SENTRY_TRACES_SAMPLE_RATE` | optionnel, les deux | override ; défauts = tableau sampling |
| `SENTRY_AUTH_TOKEN` | **secret de build uniquement** | upload source maps — **jamais** dans l’image finale |

`.env.example` + `frontend/Dockerfile` ARG : ticket 369, pas ici.

---

## Mention `/confidentialite` (posée dans ce spike)

À garder alignée HTML (`frontend/public/confidentialite.html`) **et** React (`LegalPages.jsx`) :

- Finalité : diagnostic des erreurs techniques / sécurité du service — **intérêt légitime**.
- Sous-traitant : Functional Software, Inc. (Sentry) — diagnostic d’erreurs, hors CMP.
- Cookies : Sentry n’est **pas** un traceur de mesure d’audience ; pas dans la bannière GA4.

---

## Suite (ordre)

1. **Ops** : créer `axel-job-frontend` + `axel-job-backend` dans l’org `axel-project` (Louis / admin Sentry).
2. [AXE-369](https://linear.app/axel-project/issue/AXE-369) env/secrets (peut chevaucher 367/368).
3. [AXE-367](https://linear.app/axel-project/issue/AXE-367) + [AXE-368](https://linear.app/axel-project/issue/AXE-368) en parallèle.
4. [AXE-370](https://linear.app/axel-project/issue/AXE-370) contextes métier.
5. [AXE-371](https://linear.app/axel-project/issue/AXE-371) smoke + alertes email high-priority (même recette que CRM AXE-269 : pas Slack v1).

---

## Hors scope v1

- Grafana / logs Sentry / metrics Sentry (Prometheus reste).
- Slack Sentry (CRM : email seulement).
- Source maps des HTML statiques.
- Replay, profiling, Crons, Seer AI comme prérequis.
