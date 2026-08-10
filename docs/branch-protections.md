# Protections branches GitHub (Axel Job / cv-bot)

> Repo : [`presidentaxel/Axeljob`](https://github.com/presidentaxel/Axeljob) (**public**).  
> Modèle branches : **`main` = prod** (pas de branche `prod` séparée comme CRM / WhatsApp Inbox).  
> Workflow quotidien : [`git-workflow.md`](git-workflow.md) · Linear : [`linear-github-workflow.md`](linear-github-workflow.md).  
> Pattern inspiré de `axel-crm/docs/BRANCH_PROTECTIONS.md` et `whatsapp-inbox/docs/equipe/branch-protections.md`.

---

## 1. État actuel (août 2026)

| Contrôle | Statut | Notes |
|----------|--------|-------|
| Branch protection `main` | **Non activée** | Repo public → disponible sans GitHub Pro, mais **pas encore configurée** (API 404) |
| Repository rulesets | **Non activés** | Disponibles sur repo public ; à activer si on préfère rulesets aux classic rules |
| CI sur PR | **Actif** | [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) + [`security.yml`](../.github/workflows/security.yml) |
| CD auto | **Manuel** | Deploy serveur via `git pull origin main` + Docker — voir [`deploy.md`](deploy.md) |
| Garde-fous locaux | **Actifs** | Hooks Git + Cursor (voir §2) |

**Conséquence :** GitHub n’empêche pas encore un admin de pousser direct sur `main`. La discipline équipe + les hooks locaux + la CI sur les PR sont les garde-fous effectifs aujourd’hui. **À faire :** activer la branch protection §3 (repo public → pas besoin de Pro).

---

## 2. Garde-fous locaux (déjà en place)

Ces contrôles bloquent le push **depuis une machine configurée** ; ils ne remplacent pas la branch protection GitHub.

| Mécanisme | Rôle |
|-----------|------|
| `scripts/guard-push-via-pr.sh` | Refuse un push dont la cible est `main` / `master` |
| `.githooks/pre-push` | Appelle le guard + lance la CI locale (`scripts/pre-push.sh`) |
| `.cursor/hooks.json` | Bloque `git push` vers `main`/`master` depuis Cursor |
| `.cursor/rules/pre-push-ci.mdc` | Règle agent : PR-first, jamais `git push origin main` |

Setup une fois par clone :

```bash
bash scripts/setup-dev.sh
# ou : bash scripts/install-git-hooks.sh
```

Contournement urgence uniquement : `SKIP_PREPUSH=1 git push` — à éviter sauf demande explicite.

---

## 3. Process équipe (obligatoire)

1. **Pas de push direct sur** `main` — toujours une branche (`feat/*`, `fix/*`, ou `wip/innovation`) + **Pull Request**.
2. **Pas de force-push** sur `main`.
3. CI locale verte avant push / PR :  
   `bash scripts/pre-push.sh --skip-extras --skip-gitleaks`
4. Merge seulement si CI GitHub verte + review (ou validation explicite).
5. Chantier long éditeur Beta : rester sur `wip/innovation` + [PR Draft #33](https://github.com/presidentaxel/Axeljob/pull/33) ; ne pas merger tant que non prêt.

Hotfix prod cassée :

1. Brancher depuis `main` : `git fetch origin && git checkout -b hotfix/<sujet> origin/main`
2. Fix minimal + tests
3. PR vers `main` → merge → redeploy serveur ([`deploy.md`](deploy.md))
4. Documenter dans Linear ([`linear-github-workflow.md`](linear-github-workflow.md))

---

## 4. Checklist branch protection `main` (à activer)

Settings → Branches → Add rule (`main`) — ou Rulesets équivalent :

- [ ] Require a pull request before merging
- [ ] Require approvals : **1** (défaut)
- [ ] Dismiss stale pull request approvals when new commits are pushed
- [ ] Require status checks to pass before merging → cocher les jobs du workflow `CI` (et security si requis)
- [ ] Require conversation resolution before merging (recommandé)
- [ ] Do not allow force pushes
- [ ] Do not allow deletions
- [ ] Do not allow bypassing the above settings (si disponible)
- [ ] Restrict who can push → pas de push humain direct (admins seulement si besoin d’urgence)

Dès que c’est coché, un `git push origin main` est rejeté côté GitHub même sans hooks locaux.

---

## 5. Différences vs CRM / WhatsApp Inbox

| | Axel Job (ce repo) | CRM / WhatsApp Inbox |
|--|--------------------|----------------------|
| `main` | **Prod** | Staging / intégration |
| Branche `prod` | Absente | Prod dédiée |
| Staging DO | Absent | Présent (WhatsApp) |
| Visibilité repo | **Public** → branch protection possible sans Pro | Privé Free → Pro requis |
| Garde-fous locaux | Hooks Git + Cursor | Discipline + env policies CD |

Ne pas copier le flux `main` → `prod` ici : sur Axel Job, merger dans `main` **est** la mise en prod Git.

---

## 6. Références

| Doc | Rôle |
|-----|------|
| [`git-workflow.md`](git-workflow.md) | Branches, Draft #33, flux quotidien |
| [`contributing.md`](contributing.md) | Quality gates, checklist PR |
| [`linear-github-workflow.md`](linear-github-workflow.md) | Issues Linear ↔ PR |
| [`deploy.md`](deploy.md) | Déploiement serveur après merge `main` |
| [`COMMANDS.md`](COMMANDS.md) | Aide-mémoire pre-push / hooks |
