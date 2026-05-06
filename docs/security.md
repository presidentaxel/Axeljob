# Politique de securite

Reference securite `cv-bot` (application, operations, contribution).

## Sommaire

1. Perimetre
2. Signalement de vulnerabilite
3. Baseline de developpement securise
4. Hardening operationnel
5. Secrets et donnees sensibles
6. Checklist avant merge

## 1) Perimetre

Cette politique couvre :

- backend FastAPI ;
- frontend React/Vite ;
- configuration de deploiement et d'infrastructure versionnee dans le depot.

## 2) Signalement de vulnerabilite

- Ne pas ouvrir d'issue publique pour une faille securite.
- Contacter les mainteneurs en prive avec :
  - composant impacte ;
  - etapes de reproduction ;
  - impact estime ;
  - proposition de correction ou mitigation.

> [!WARNING]
> Toute preuve de faille doit rester privee jusqu'au correctif.

## 3) Baseline de developpement securise

- Ne jamais commit de `.env`, secrets, tokens ou credentials.
- Executer lint, checks types, tests et checks securite avant merge.
- Exiger CI verte + workflow securite vert (`.github/workflows/security.yml`).
- Garder `/docs` et `/redoc` desactives en production.
- Limiter CORS/trusted hosts aux domaines necessaires.

## 4) Hardening operationnel

- Forcer HTTPS au niveau edge/proxy.
- Exposer uniquement les ports strictement necessaires (en general `22`, `80`, `443`).
- Proteger `/metrics` avec `METRICS_AUTH_TOKEN`.
- Conserver les buckets Supabase prives.
- Activer des sauvegardes et tester regulierement la restauration.

## 5) Secrets et donnees sensibles

- Stocker les secrets uniquement dans l'environnement d'execution.
- Ne pas logger de JWT, cles API, payloads complets contenant des donnees personnelles.
- Masquer ou tronquer les donnees sensibles dans les traces d'erreur.

## 6) Checklist securite avant merge

- [ ] Aucun secret dans le diff.
- [ ] Impact auth/permissions analyse.
- [ ] Impact SQL/Supabase valide.
- [ ] Checks securite locaux et CI verts.
- [ ] Documentation mise a jour si posture securite modifiee.
