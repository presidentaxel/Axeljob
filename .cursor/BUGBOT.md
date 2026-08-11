# Bugbot — AxeL Job (Axeljob)

Règles de revue automatique pour les PRs GitHub.

## Produit

- Ne pas casser l’éditeur Beta canvas (`CvEditorBetaView`, layout v3) ni le parcours Stable (`ProfileView`).
- Toute persistance CV passe par `PUT/PATCH /api/cv` ; le layout doit rester v3 valide (pas de data URL image — AXE-40).
- Autosave : flush à l’unmount, `isActive=false`, `pagehide` / onglet caché ; après undo/redo inclure `layout` dans le payload (AXE-29).

## Sécurité

- Pas de HTML riche hors whitelist (`strong`/`em`/`u`/`s`/`span` style limité) côté front et backend.
- Pas d’`eval`, pas d’injection dans `dangerouslySetInnerHTML` sans sanitize.
- Pas de secrets (`.env`, clés Stripe/Supabase) dans le diff.

## Qualité CI

- Aligné sur `scripts/pre-push.sh` : ruff, black **24.10.0**, mypy, pytest, eslint, `test:unit`.
- Ne pas reformater avec Black 26.x.
- Pas de push direct sur `main` ; 1 issue Linear = 1 branche = 1 PR (`Fixes AXE-XX` + `Closes #N`).

## Frontend

- Respecter `docs/DESIGN-cohere.md` / tokens design system pour l’UI shell.
- Préférer des changements ciblés ; pas de refactors hors scope du ticket.

## Backend

- Erreurs layout → HTTP 400 claires (`LayoutValidationError`).
- Uploads images canvas via `/api/cv/upload-canvas-asset`, pas d’embed base64 dans le JSON.
