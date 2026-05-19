# Audit de conformite au guide

Ce document suit l'avancement de la mise en conformite avec `docs/guide-bonnes-pratiques.md`.

## Statut global

- Architecture backend (delegation services): en cours
- Tests backend sensibles (auth/permissions/billing): en cours
- E2E parcours critiques: en cours
- Sync docs/DoD: en cours

## Quality gates de reference

- Backend: `ruff`, `black --check`, `mypy backend`, `pytest` (gate couverture CI sur `cv_render_helpers` + `cv_html_render`, voir `ci.yml`)
- Security: `bandit`, `pip-audit`, workflow `security.yml`
- Frontend: `npm --prefix frontend run lint`, `npm --prefix frontend run build`

## Checklist de revue conformite

- [ ] Les routes FastAPI restent fines et deleguent la logique metier
- [ ] Les secrets restent limites aux variables d'environnement serveur
- [ ] Les tests couvrent auth/permissions/endpoints sensibles
- [ ] Les parcours critiques frontend sont verifies en E2E
- [ ] Les docs de contribution et standards sont a jour
