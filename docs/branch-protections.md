# Protections branches GitHub (Axel Job / cv-bot)

> Repo : [`presidentaxel/Axeljob`](https://github.com/presidentaxel/Axeljob) (**public**).  
> Modèle branches : **Option C** — **`main` = intégration**, **`prod` = production** ([`ADR_MAIN_PROD.md`](ADR_MAIN_PROD.md)).  
> Workflow quotidien : [`git-workflow.md`](git-workflow.md) · Linear : [`linear-github-workflow.md`](linear-github-workflow.md).  
> Pattern aligné sur `axel-crm/docs/BRANCH_PROTECTIONS.md` et `whatsapp-inbox/docs/equipe/branch-protections.md`.

---

## 1. État actuel (août 2026)

| Contrôle | Statut | Notes |
|----------|--------|-------|
| Branch protection `main` | **Non activée** | Repo public → disponible sans GitHub Pro ; **pas encore configurée** (API 404). Ticket [AXE-318](https://linear.app/axel-project/issue/AXE-318) |
| Branch protection `prod` | **Non activée** | Même ticket AXE-318 — clics Settings |
| Repository rulesets | **Non activés** | Disponibles sur repo public ; à activer si on préfère rulesets aux classic rules |
| CI sur PR vers `main` | **Actif** | [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) + [`security.yml`](../.github/workflows/security.yml) |
| CI sur PR vers `prod` | **En cours** | [AXE-316](https://linear.app/axel-project/issue/AXE-316) — [PR #168](https://github.com/presidentaxel/Axeljob/pull/168) (In Review). Sur `main` aujourd’hui, `pull_request` ne liste pas encore `prod` |
| CD auto sur `prod` | **Pas encore** | [AXE-317](https://linear.app/axel-project/issue/AXE-317) (`deploy-prod.yml`). **Fallback :** `git pull origin prod` + Docker — [`deploy.md`](deploy.md) |
| Garde-fous locaux | **Actifs** | Hooks Git + Cursor (voir §2) — `main` / `master` / **`prod`** |

**Conséquence :** GitHub n’empêche pas encore un admin de pousser direct sur `main` ou `prod`. La discipline équipe + les hooks locaux + la CI sur les PR vers `main` sont les garde-fous effectifs aujourd’hui. **À faire :** activer la branch protection §4 (repo public → pas besoin de Pro).

`origin/prod` **existe**. Elle peut être en retard sur `origin/main` tant que le premier promote n’est pas mergé.

---

## 2. Garde-fous locaux (déjà en place)

Ces contrôles bloquent le push **depuis une machine configurée** ; ils ne remplacent pas la branch protection GitHub.

| Mécanisme | Rôle |
|-----------|------|
| `scripts/guard-push-via-pr.sh` | Refuse un push dont la cible est `main` / `master` / **`prod`** |
| `.githooks/pre-push` | Appelle le guard + lance la CI locale (`scripts/pre-push.sh`) |
| `.cursor/hooks.json` | Bloque `git push` vers `main`/`master`/`prod` depuis Cursor |
| `.cursor/rules/pre-push-ci.mdc` | Règle agent : PR-first, jamais `git push origin main` ni `origin prod` |

Setup une fois par clone :

```bash
bash scripts/setup-dev.sh
# ou : bash scripts/install-git-hooks.sh
```

Contournement urgence uniquement : `SKIP_PREPUSH=1 git push` — à éviter sauf demande explicite.

---

## 3. Process équipe (obligatoire)

1. **Pas de push direct sur** `main` **ni** `prod` — toujours une branche + **Pull Request**. Formats autorisés : `feat/*`, `fix/*`, `hotfix/*`, `wip/innovation`, ou le **`gitBranchName` Linear exact** (ex. `louisvedovato/axe-XX-…`).
2. **Pas de force-push** sur `main` ni `prod`.
3. CI locale verte avant push / PR :  
   `bash scripts/pre-push.sh --skip-extras --skip-gitleaks`
4. Merge feature seulement si CI GitHub verte + review (ou validation explicite) — **base = `main`**.
5. Mise en production = PR **promote** `main` → `prod` ([runbook](ADR_MAIN_PROD.md)), pas un merge feature dans `prod`.
6. Chantier long éditeur Beta : rester sur `wip/innovation` + [PR Draft #33](https://github.com/presidentaxel/Axeljob/pull/33) ; ne pas merger tant que non prêt.

Hotfix prod cassée :

1. Brancher depuis **`prod`** : `git fetch origin && git checkout -b hotfix/<sujet> origin/prod`
2. Fix minimal + tests
3. PR vers **`prod`** → merge → deploy ([`deploy.md`](deploy.md) — CD ou fallback)
4. **Backport** vers `main` (cherry-pick / PR)
5. Documenter dans Linear ([`linear-github-workflow.md`](linear-github-workflow.md))

---

## 4. Checklist branch protection (à activer — AXE-318)

Settings → Branches → Add rule — ou Rulesets équivalent. **Deux règles** : `main` et `prod`.

### 4.1 `main` (intégration)

- [ ] Require a pull request before merging
- [ ] Require approvals : **1** (défaut)
- [ ] Dismiss stale pull request approvals when new commits are pushed
- [ ] Require status checks to pass before merging → cocher les jobs du workflow `CI` (et security si requis)
- [ ] Require conversation resolution before merging (recommandé)
- [ ] Do not allow force pushes
- [ ] Do not allow deletions
- [ ] Do not allow bypassing the above settings (recommandé : bloque aussi le bypass admin)
- [ ] Restrict who can push → pas de push humain direct (admins seulement si besoin d’urgence **et** si le bypass n’est pas bloqué)

### 4.2 `prod` (production)

Même liste que §4.1, plus :

- [ ] Require a pull request before merging — en pratique depuis `main` (promote) ou `hotfix/*`
- [ ] Restrict who can push / merger (périmètre plus étroit que `main` si possible)

Dès que c’est coché, un `git push origin main` ou `git push origin prod` est rejeté pour les acteurs couverts par la règle (même sans hooks locaux). Si le bypass admin reste autorisé, un admin peut encore pousser en urgence.

---

## 5. Différences vs CRM / WhatsApp Inbox

| | Axel Job (ce repo) | CRM / WhatsApp Inbox |
|--|--------------------|----------------------|
| `main` | **Intégration** (Option C) | Staging / intégration |
| Branche `prod` | **Présente** (`origin/prod`) | Prod dédiée |
| Staging DO | Absent | Présent (WhatsApp) |
| Visibilité repo | **Public** → branch protection possible sans Pro | Privé Free → Pro requis |
| CD | **Pas encore** (AXE-317) — fallback `git pull origin prod` | `deploy-prod.yml` |
| Garde-fous locaux | Hooks Git + Cursor (`main` + `prod`) | Discipline + env policies CD |

Le flux `main` → `prod` **est** le modèle AxeL Job. Merger dans `main` met à jour l’intégration ; le **déploiement serveur** suit le merge dans `prod` ([`deploy.md`](deploy.md)).

---

## 6. Références

| Doc | Rôle |
|-----|------|
| [`ADR_MAIN_PROD.md`](ADR_MAIN_PROD.md) | Décision Option C + runbook promote / hotfix |
| [`git-workflow.md`](git-workflow.md) | Branches, Draft #33, flux quotidien |
| [`contributing.md`](contributing.md) | Quality gates, checklist PR |
| [`linear-github-workflow.md`](linear-github-workflow.md) | Issues Linear ↔ PR |
| [`deploy.md`](deploy.md) | Déploiement serveur depuis `prod` |
| [`COMMANDS.md`](COMMANDS.md) | Aide-mémoire pre-push / hooks |
