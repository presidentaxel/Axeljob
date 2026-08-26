# Observabilité AxeL Job — Sentry (AXE-366)

Spike : [AXE-366](https://linear.app/axel-project/issue/AXE-366) · 2026-08-26  
Décalque CRM : [AXE-22](https://linear.app/axel-project/issue/AXE-22) (Done), [AXE-271](https://linear.app/axel-project/issue/AXE-271) (sampling front), [AXE-269](https://linear.app/axel-project/issue/AXE-269) (alertes), [AXE-270](https://linear.app/axel-project/issue/AXE-270) (pas de routes de test).  
Consentement : même logique que [AXE-363](https://linear.app/axel-project/issue/AXE-363) (PostHog = CMP / Sentry ≠ CMP).

**Pas de SDK dans ce ticket.** Code : [AXE-367](https://linear.app/axel-project/issue/AXE-367) (backend), [AXE-368](https://linear.app/axel-project/issue/AXE-368) (frontend), [AXE-369](https://linear.app/axel-project/issue/AXE-369) (env), [AXE-370](https://linear.app/axel-project/issue/AXE-370) (contextes métier), [AXE-371](https://linear.app/axel-project/issue/AXE-371) (recette + alertes).

---

## Verdict

**Go Sentry** pour le diagnostic d’erreurs (front React + back FastAPI).  
**Pas** un outil analytics. **Pas** de Session Replay. **Pas** derrière la CMP.

État `main` (août 2026) : SDK backend [AXE-367](https://linear.app/axel-project/issue/AXE-367) (`sentry-sdk`, DSN vide = no-op). Frontend : [AXE-368](https://linear.app/axel-project/issue/AXE-368). Contextes métier : [AXE-370](https://linear.app/axel-project/issue/AXE-370) (`backend/sentry_business.py`). Prometheus reste (`monitoring_ops.py` / `/metrics`) = volume ; Sentry = diagnostic.

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

OK : route, status HTTP, `flow`, `kind`, moteur PDF, durée, taille fichier, code d’erreur fournisseur, `release`, `environment`.

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
- Pages HTML statiques (FAQ, ATS, guides) : **pas** de SDK v1. SPA seulement (`/`, `/login`, `/app/*`) — même périmètre que `entry-conditional.js`. SDK React : [AXE-368](https://linear.app/axel-project/issue/AXE-368) (`@sentry/react`, DSN vide = no-op, Replay off).
- Pas de route `/sentry-test` en prod ([AXE-270](https://linear.app/axel-project/issue/AXE-270)).

### Environnements et releases

| Tag Sentry | Source |
|---|---|
| `environment` | `staging` \| `production` (local = DSN vide, no-op) |
| `release` | SHA git du **build Docker** (`SENTRY_RELEASE` / `VITE_SENTRY_RELEASE`) — pour attacher les source maps |

`ENVIRONMENT=production` dans `docker-compose.yml` (y compris un Docker local). Pour une recette laptop, **forcer** `SENTRY_ENVIRONMENT=staging` et `VITE_SENTRY_ENVIRONMENT=staging` — sinon les smokes partent en `production`. Staging DO : poser `VITE_SENTRY_ENVIRONMENT=staging` au build front (leçon AXE-271).

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
| `SENTRY_TRACES_SAMPLE_RATE` | backend runtime, optionnel | override traces ; défauts = tableau sampling |
| `VITE_SENTRY_TRACES_SAMPLE_RATE` | build arg frontend, optionnel | idem côté client (Vite n’expose que `VITE_*`) |
| `SENTRY_AUTH_TOKEN` | **secret de build uniquement** | upload source maps — **jamais** dans l’image finale |

`.env.example`, `frontend/.env.example`, `backend/Dockerfile`, `frontend/Dockerfile` et `docker-compose.yml` : [AXE-369](https://linear.app/axel-project/issue/AXE-369). DSN **vides** dans Git. `SENTRY_AUTH_TOKEN` n'est **pas** une clé de `.env`.

---

## Events métier (AXE-370)

Helper : `backend/sentry_business.py` → `capture_business_event(flow, message, kind=...)`.

Les 4xx FastAPI sont ignorés par `before_send` (AXE-367). Un quota Gemini (429), un JWT invalide (401) ou un webhook Stripe rejeté (400) **ne lèvent donc pas** d’issue Sentry tout seuls : le helper envoie un `capture_message` **warning** avant la conversion HTTP. DSN vide = no-op.

| `flow` | `kind` (exemples) | Quand |
|---|---|---|
| `adapt` | `gemini_quota` / `gemini_timeout` / `gemini_api_error` / `gemini_unparseable` / `gemini_empty` | Budget `ensure_budget`, timeout/API Gemini, JSON illisible |
| `export` | `empty_pdf` / `pdf_timeout` / `pdf_engine_fail` / `pdf_pool_saturated` | PDF 0 octet, Chromium indisponible (repli), file d’attente saturée |
| `import` | `pdf_unreadable` / `docx_unreadable` / `pymupdf_fail` | pdfplumber / docx / ouverture PyMuPDF |
| `billing` | `stripe_bad_signature` / `stripe_bad_payload` / `stripe_orphan_subscription` | Webhook rejeté ou checkout sans `user_id` |
| `auth` | `jwt_burst` / `pg_pool` | Rafale de JWT invalides (seuil, pas un 401 isolé) ; `PoolTimeout` psycopg |

Fingerprint : `["axel-job", flow, kind]` — quota ≠ erreur API. Extras autorisés : `size_bytes`, `engine`, `duration_ms`, `provider_code`, `burst_count`, `qsize`… Jamais CV / annonce / e-mail. Ce n’est **pas** un doublon des compteurs Prometheus (`/metrics`) : Sentry = un incident identifiable, Prometheus = volume.

---

## Recette DSN + alertes ([AXE-371](https://linear.app/axel-project/issue/AXE-371))

Ops, pas de route `/sentry-test` ([AXE-270](https://linear.app/axel-project/issue/AXE-270)). Aucune valeur DSN dans Git ni dans un ticket. Compose n’a pas de bind-mount : **rebuild** après changement d’env.

### 1. Créer les projets (une fois)

Org [axel-project.sentry.io](https://axel-project.sentry.io) — **ne pas** réutiliser `javascript-react` / `python-fastapi`.

| Projet | Plateforme Sentry |
|---|---|
| `axel-job-frontend` | React / JavaScript |
| `axel-job-backend` | Python / FastAPI |

Settings → Client Keys (DSN) : un DSN par projet, ne pas les croiser.

### 2. Coller les DSN (`.env` local ou serveur, jamais Git)

| Variable | Où | Projet |
|---|---|---|
| `SENTRY_DSN` | runtime backend | `axel-job-backend` |
| `VITE_SENTRY_DSN` | **build arg** frontend | `axel-job-frontend` |
| `SENTRY_ENVIRONMENT` / `VITE_SENTRY_ENVIRONMENT` | runtime / build | `staging` (laptop) ou `production` (serveur `prod`) |

Dev quotidien : DSN vides (no-op). Recette : DSN collés + `staging`. `docker-compose.yml` force `ENVIRONMENT=production` — d’où le override `SENTRY_ENVIRONMENT`.

```bash
docker compose build backend frontend
docker compose up -d --force-recreate backend frontend
```

Changer `VITE_SENTRY_DSN` sans rebuild front = SDK absent du bundle.

`SENTRY_AUTH_TOKEN` : uniquement au **build** front (source maps). Jamais dans `.env` (`env_file` l’injecterait au backend). Sans token, le build réussit ; les `.map` sont supprimés ; la stack front reste minifiée.

### 3. Smoke sans route de test

SDK SPA seulement : `/`, `/login`, `/app/*` — pas `/confidentialite` ni `/faq`.

**Backend** (conteneur, DSN déjà dans l’env runtime) :

```bash
docker compose exec backend python -c "
from backend.sentry_config import init_sentry
import sentry_sdk
assert init_sentry(), 'DSN vide — Sentry no-op'
sentry_sdk.capture_message('AXE-371 recette smoke backend', level='error')
sentry_sdk.flush(timeout=5)
print('flushed')
"
```

**Frontend** : ouvrir `/login`, DevTools → Network (filtre `ingest`) + Console :

```javascript
(function () {
  const c = window.__SENTRY__;
  if (!c) { console.warn('Sentry absent (DSN vide ou page statique)'); return; }
  const client = (typeof c.getClient === 'function' && c.getClient())
    || c.defaultClient
    || (c.hub && c.hub.getClient && c.hub.getClient());
  if (!client) { console.warn('Client introuvable — ne plus tester .hub seul (SDK v10)'); return; }
  const opts = client.getOptions ? client.getOptions() : {};
  console.log('Sentry OK', { env: opts.environment, release: opts.release });
  client.captureMessage('AXE-371 recette smoke frontend', 'error');
})();
```

Attendu : 1 issue `axel-job-backend` + 1 issue `axel-job-frontend`, tag `environment:staging` (laptop) ou `production` (serveur). Puis **Resolved** / delete les deux smokes. Vérifier : pas de CV, pas d’e-mail, `user` = UUID ou absent.

Nginx Job n’a **pas** de `Content-Security-Policy` `connect-src` (leçon CRM [AXE-268](https://linear.app/axel-project/issue/AXE-268) : CSP trop stricte bloquait l’ingest). Si une CSP est ajoutée plus tard : autoriser `*.sentry.io` et `*.ingest.sentry.io` (org US).

### 4. Alertes email (décalque [AXE-269](https://linear.app/axel-project/issue/AXE-269), pas Slack v1)

Sur **chaque** projet Job : Alerts → Issue Alert.

| Règle | Condition | Filtre | Action | Fréquence |
|---|---|---|---|---|
| High priority | nouvelle issue **high priority** | aucun `environment:` (écart CRM accepté) | Email Issue owners / ActiveMembers | 30 min |
| Billing (backend seulement) | nouvelle issue | tag `flow` = `billing` | Email idem | 30 min |

La règle billing est **séparée** : les events métier [AXE-370](https://linear.app/axel-project/issue/AXE-370) partent en `warning`, pas en high-priority. Un échec Stripe (`stripe_bad_signature`, etc.) ne réveillerait pas la règle CRM classique.

Pic d’erreurs v1 = high-priority (pas de metric alert dédiée, même écart que le CRM). Tester la règle high-priority avec le smoke `error` ci-dessus, puis résoudre l’issue.

### 5. Checklist post-deploy

Voir [`docs/deploy.md`](deploy.md) §7 (bloc Sentry) et §8.

---

## Mention `/confidentialite` (posée dans ce spike)

À garder alignée HTML (`frontend/public/confidentialite.html`) **et** React (`LegalPages.jsx`) :

- Finalité : diagnostic des erreurs techniques / sécurité du service — **intérêt légitime**.
- Données transmises (contrat 367/368) : stack traces, tags `environment` / `release`, identifiant technique de compte (UUID, pas l’e-mail), tag `plan` (`free` / `pro`).
- Sous-traitant : Functional Software, Inc. (Sentry) — hors CMP.
- Cookies : Sentry n’est **pas** un traceur de mesure d’audience ; pas dans la bannière GA4.

---

## Suite (ordre)

1. **Ops** : créer `axel-job-frontend` + `axel-job-backend` dans l’org `axel-project` (cette recette, § ci-dessus).
2. [AXE-369](https://linear.app/axel-project/issue/AXE-369) placeholders env — **Done** (DSN vides dans Git).
3. [AXE-367](https://linear.app/axel-project/issue/AXE-367) + [AXE-368](https://linear.app/axel-project/issue/AXE-368) SDK — **Done** sur `main`.
4. [AXE-370](https://linear.app/axel-project/issue/AXE-370) contextes métier — **Done** sur `main` (`backend/sentry_business.py`).
5. [AXE-371](https://linear.app/axel-project/issue/AXE-371) coller DSN + smoke + alertes email (ce document).

---

## Hors scope v1

- Grafana / logs Sentry / metrics Sentry (Prometheus reste).
- Slack Sentry (CRM : email seulement).
- Source maps des HTML statiques.
- Replay, profiling, Crons, Seer AI comme prérequis.
