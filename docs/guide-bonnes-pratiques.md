# Guide de bonnes pratiques - AxeL Job (cv-bot)

Document interne pour coder de facon coherente, sure et maintenable sur ce depot.

En cas de doute, ce guide prime sur les habitudes legacy. Si une zone ancienne ne suit pas encore ces regles, aligner progressivement le code lors des PR.

## Sommaire

1. Carte du projet
2. Style et outillage frontend
3. API HTTP et auth
4. Backend FastAPI
5. Supabase, SQL et migrations
6. IA, PDF et services sensibles
7. Securite transverse
8. Git, PR et revue
9. Deploiement et configuration
10. Checklist PR
11. En cas de doute

> [!NOTE]
> Ce document est la reference prioritaire de style et de securite pour toutes les contributions.

---

## 1. Carte du projet

| Zone | Role |
| --- | --- |
| `frontend/` | SPA React 19 + Vite 7, auth Supabase (anon), parcours utilisateur et UX |
| `backend/` | API FastAPI (Python), logique metier IA, PDF, billing Stripe, controle d'acces |
| `backend/services/` | Services metier testables (adaptation, generation, scoring ATS, export) |
| `backend/supabase_*.sql` | Schema SQL et migrations appliquees au projet Supabase |
| `templates/` | Templates CV HTML/CSS/meta statiques (classic, modern, minimal, etc.) |
| `tests/` | Tests backend et non-regression logique |
| `docs/` | Documentation contribution, securite, deploiement et standards |

Avant de modifier du code : identifier **ou** vit la regle (UI, API, SQL, template, infra) pour eviter la duplication et les incoherences de securite.

---

## 2. Style et outillage (frontend)

### 2.1 Outils

- **Node** : utiliser une version recente compatible Vite 7 (Node 18+ minimum).
- **ESLint** : configuration dans `frontend/eslint.config.js` ; traiter les erreurs et warnings avant merge.
- **Build** : `npm run build` declenche aussi `build:brand-assets` ; ne pas contourner cette etape pour valider une livraison.
- **E2E** : Playwright disponible via `npm run test:e2e` pour les parcours critiques.

### 2.2 React

- **Hooks** : respecter strictement les regles des hooks et les dependances d'effets.
- **Etat** : garder l'etat local quand possible ; partager via contexte seulement quand c'est justifie.
- **Composants** : privilegier des composants simples et modulaires plutot que des blocs monolithiques.
- **Navigation** : conserver la coherence avec `react-router-dom` et les routes definies dans `src/lib/appRoutes.js`.

### 2.3 Modules et chemins

- Suivre l'organisation `src/components`, `src/lib`, `src/styles`, `src/content`.
- Eviter les imports circulaires ; preferer des utilitaires dedies dans `src/lib`.
- Ne pas ajouter de logique metier dans `public/` (fichiers statiques uniquement).

### 2.4 Variables d'environnement (Vite)

- Toute variable exposee au navigateur doit commencer par `VITE_`.
- Les secrets serveurs (service role, Stripe secret, tokens) ne doivent **jamais** etre exposes en frontend.

---

## 3. API HTTP et auth (frontend <-> backend)

- Le frontend appelle l'API via les modules centraux (`frontend/src/api.js` et helpers associes) : eviter de multiplier des clients HTTP ad hoc.
- Toute route metier doit supposer un contexte utilisateur authentifie quand c'est necessaire (JWT Supabase).
- Les erreurs auth (401/403) doivent conduire a un comportement UX explicite (reconnexion, message clair), sans fuite d'informations.

---

## 4. Backend Python (FastAPI)

### 4.1 Structure

- Garder les routes API lisibles dans `backend/main.py` et deleguer la logique metier a `backend/services/`.
- Centraliser configuration et acces env dans `backend/config.py`.
- Utiliser `backend/db.py` comme point d'acces donnees pour conserver un comportement homogenei (Supabase + fallback).

### 4.2 Qualite

- Respecter PEP 8, types explicites sur les interfaces publiques, et fonctions courtes.
- Appliquer l'outillage du projet : `ruff`, `black`, `mypy`, `pytest`.
- La CI impose une couverture minimale sur le pipeline rendu CV (`backend.services.cv_render_helpers`, `backend.cv_html_render`, voir `.github/workflows/ci.yml`).

### 4.3 Tests backend

- Ajouter des tests pour les zones sensibles : auth, permissions, adaptation IA, generation PDF, export.
- Lancer au minimum les tests impactes dans `tests/` avant PR.

### 4.4 Erreurs et observabilite

- Retourner des codes HTTP coherents avec des messages actionnables cote client.
- Eviter de logger des secrets ou donnees personnelles brutes dans les logs.
- Preserver les endpoints d'ops (`/health`, `/metrics`) et leur securisation.

---

## 5. Supabase, SQL et migrations

### 5.1 Regles generales

- Supabase est la source de verite de persistance en production.
- Le backend utilise la cle `service_role` : les controles d'acces doivent donc etre appliques cote API.
- Le frontend ne doit utiliser que la cle `anon`.

### 5.2 Migrations SQL

- Une migration = une intention claire, nommee explicitement.
- Ne pas modifier silencieusement des scripts historiques deja appliques ; ajouter une nouvelle migration a la place.
- Eviter les changements destructifs sans plan de rollback/data migration.

### 5.3 Stockage et templates personnalises

- Les buckets Supabase (`cv_photos`, `application_docs`) doivent rester coherents avec les regles d'acces.
- Les templates personnalises (`cv_templates`) doivent respecter ownership et perimetre utilisateur (`owner_user_id`, `allowed_user_ids`).

---

## 6. IA, PDF et services metier sensibles

- Toute evolution des appels Gemini doit considerer quota, timeouts, retries et fallback.
- Les services PDF (`cv_pdf_weasyprint`, renderer HTML/CSS) doivent rester deterministes entre environnements dev/prod.
- Conserver une separation nette : parsing/offre, adaptation, scoring ATS, export package, lettre.

---

## 7. Securite (rappels transverses)

- **Moindre privilege** : anon cote navigateur, service role uniquement cote serveur.
- **Secrets** : jamais de cles/API tokens dans le code versionne.
- **CORS et URLs publiques** : aligner `CV_BOT_FRONTEND_URL` et `CV_BOT_API_BASE_URL` sur l'environnement cible.
- **Journalisation** : pas de tokens, pas de donnees personnelles sensibles en clair.
- **Dependances** : suivre les alertes Dependabot et workflows securite (`security.yml`, `pip-audit`, CodeQL, Gitleaks).

---

## 8. Git, PR et revue

- **Branches** : courtes, scope clair, une intention principale par PR.
- **Commits** : utiliser Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`).
- **Description PR** : expliquer le pourquoi, l'impact utilisateur, les risques et le plan de test.
- **Avant merge** : CI verte, checks securite verts, documentation mise a jour si comportement modifie.

### 8.1 Verification locale recommandee avant PR

```bash
ruff check .
black --check .
mypy backend
pytest tests
pytest tests --cov=backend.services.cv_render_helpers --cov=backend.cv_html_render --cov-report=term-missing --cov-fail-under=62
bandit -r backend -c pyproject.toml
pip-audit -r backend/requirements.txt
npm --prefix frontend run lint
```

---

## 9. Deploiement et configuration

- Ne pas casser le contrat de routage infra (`/api`, `/health`, assets frontend).
- Maintenir la coherence des variables d'environnement entre `.env`, `docker-compose.yml` et documentation.
- Toute nouvelle variable doit etre ajoutee a `.env.example` et documentee dans `README.md` (impact + securite).

---

## 10. Checklist rapide avant une PR

1. Changement limite au besoin (pas de refacto hors sujet).
2. Aucun secret ni jeu de donnees sensible dans le diff.
3. Auth/perimetre utilisateur verifies pour les routes API touchees.
4. Impacts SQL/Supabase verifies (schema, migration, stockage).
5. Lint/tests lances sur la zone impactee (frontend et/ou backend).
6. Documentation mise a jour si une commande, variable ou comportement change.
7. Risques identifies et explicites dans la PR.
8. Audit de conformite mis a jour (`docs/conformity-audit.md`).

---

## 11. En cas de doute

- S'aligner sur un fichier proche deja merge dans le meme dossier.
- Se referer d'abord aux docs du depot : `docs/contributing.md`, `docs/security.md`, `docs/deploy.md`, `docs/engineering-standards.md`.
- En cas de conflit entre deux pratiques, privilegier securite, lisibilite et testabilite.

---

*Derniere mise a jour : guide aligne sur la structure actuelle de `cv-bot` (React/Vite, FastAPI, Supabase, Stripe, WeasyPrint).*
