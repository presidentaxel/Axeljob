# Workflow Linear ↔ GitHub (AxeL Job)

> **Objectif :** à chaque chantier / retour, créer le même maillage : **projet Linear → issues Linear → issues GitHub → branches → draft PRs**, avec **liens cliquables dans Linear**.  
> **Workspace :** [axel-project](https://linear.app/axel-project) · Team **Axel Project** (`AXE`) · Repo [presidentaxel/Axeljob](https://github.com/presidentaxel/Axeljob)  
> **Projet de référence :** [Axel Job — Éditeur CV Beta (Canva + ATS)](https://linear.app/axel-project/project/axel-job-editeur-cv-beta-canva-ats-5e659a36bbec)

Agents IA : lire ce fichier quand la demande concerne Linear, un chantier AxeL Job, ou « ouvrir un chantier / PR liée ».

Compléments Git locaux : [`git-workflow.md`](git-workflow.md) · [`branch-protections.md`](branch-protections.md) · ADR Option C : [`ADR_MAIN_PROD.md`](ADR_MAIN_PROD.md) (`main` = intégration, `prod` = production).

> **Note famille produit.** Le workspace `Axel Project` héberge plusieurs familles dans **une seule team** (`AXE`). On les distingue par **label de projet + couleur**, pas par team. Les tickets restent donc `AXE-XX` pour tout le monde.
>
> | Famille | Label projet | Couleur | Label issue |
> |---------|--------------|---------|-------------|
> | Gestion (CRM) | `Axel Gestion` | rouge `#EB5757` | `CRM` |
> | Marketing | `Axel Marketing` | jaune `#F2C94C` | — |
> | Compta | `Axel Compta` | rose `#F7C8C1` | — |
> | **AxeL Job** | **`Axel Job`** | **cyan `#26B5CE`** | **`AxelJob`** |
>
> Principe : **une couleur par famille, portée à l'identique par le label, la vue et les projets.**

---

## 1. Modèle d'organisation

| Niveau | Rôle | Exemple |
|--------|------|---------|
| **Project** (Linear) | Chantier borné + dates | `Axel Job — Éditeur CV Beta (Canva + ATS)` |
| **Issue** (Linear) | 1 problème / 1 livraison | `AXE-29` autosave |
| **Issue** (GitHub) | Miroir pour le repo / CI | `#N` |
| **Branche + PR** (GitHub) | Code + revue | `louisvedovato/axe-29-…` → PR `#N` |

Règle d'or : **1 issue Linear = 1 branche = 1 PR**.

### Exception chantier long `wip/innovation`

Le gros chantier éditeur Beta peut vivre sur **`wip/innovation`** avec la [PR Draft #33](https://github.com/presidentaxel/Axeljob/pull/33) comme suivi global. Dans ce cas :

- Les tickets Linear (AXE-27…AXE-41) restent la **source de vérité** du backlog.
- Une **petite livraison isolée** vers `main` : partir de **`origin/main`**, puis n’y appliquer **que** les commits du ticket (cherry-pick / extrait). Ne pas ouvrir une PR `wip/innovation` → `main` pour un seul ticket : elle emporterait tout le WIP.
- Si le code n’existe que sur `wip/innovation` et qu’on ne peut pas l’isoler : PR **empilée** ciblant explicitement `wip/innovation` (pas `main`), avec le **`gitBranchName` Linear**, puis rattacher la PR à l’issue.

Détail Git local : [`git-workflow.md`](git-workflow.md).

### Labels

| Type | Label | Usage |
|------|-------|--------|
| **Projet** | `Axel Job` | **Obligatoire** sur tout projet AxeL Job (famille produit) |
| **Issue** | `AxelJob` | Plateforme (views Linear filtrées par produit) |
| **Issue** | `Bug` / `Feature` / `Improvement` | Nature du ticket |
| **GitHub** | `bug` / `enhancement` | Aligné sur la nature Linear |

Views Linear : filtrer sur le label issue `AxelJob` pour voir « ce qui concerne AxeL Job ».

---

## 2. Icônes & couleurs des projets AxeL Job

**Couleur de base AxeL Job :** cyan `#26B5CE` (réservée à la famille — rouge `#EB5757` = Gestion, jaune `#F2C94C` = Marketing, rose `#F7C8C1` = Compta).  
Variantes cyan OK si plusieurs projets AxeL Job ouverts : `#1FA8C4`, `#4FC3D9`, `#0E7C90`.  
Ne pas passer en rouge/jaune/rose pour un projet AxeL Job (couleurs des autres familles).

**Icône : différente à chaque nouveau projet AxeL Job** (c'est l'icône qui distingue, pas la couleur). Prendre le **prochain** nom de la liste qui n'est pas déjà utilisé par un projet AxeL Job **ouvert** (In Progress / Planned / Backlog actif).

Format API Linear : **PascalCase uniquement** parmi les noms **vérifiés** ci-dessous (tous confirmés en usage sur ce workspace).  
Interdit : emoji Unicode brut (`🚀`). Shortcodes `:rocket:` : possibles mais préférer la table.

| # | Icon (API, vérifié) | Quand l'utiliser |
|---|---------------------|------------------|
| 1 | `Rocket` | Feature majeure / lancement (ex. éditeur Beta) |
| 2 | `Users` | Comptes / profils / candidatures |
| 3 | `Calendar` | Suivi candidatures / relances / échéances |
| 4 | `Database` | CV de base / imports / données Supabase |
| 5 | `Chart` | Analytics / scoring ATS / metrics |
| 6 | `Shield` | Auth / permissions / RGPD / sanitize |
| 7 | `Home` | Dashboard / accueil produit |
| 8 | `Computer` | Tech / perf / build / infra |
| 9 | `Network` | Intégrations / IA (Gemini) / API externes |
| 10 | `Project` | Chantier transverse AxeL Job |
| 11 | `Bug` | Support / vague de correctifs |

Si un nom est rejeté par l'API (`icon is not a valid icon`) : passer au suivant de la table. Ne pas inventer de noms hors liste sans test.

**Exemple déjà posé :** *Axel Job — Éditeur CV Beta (Canva + ATS)* → icon `Rocket`, color `#26B5CE`, label projet `Axel Job`.

---

## 3. Checklist obligatoire (à chaque chantier)

### A. Projet Linear

1. Créer le projet (team `Axel Project`) avec `startDate` / `targetDate` / `priority` / `lead`.
2. **Label projet :** `Axel Job`.
3. **Icon + color** selon §2 (icon unique parmi les projets AxeL Job ouverts, couleur cyan `#26B5CE`).
4. Description : contexte, objectif, lien repo, rappel du workflow (et docs éditeur si besoin : `docs/editor-vision.md`, `docs/canva-editor-audit.md`).

### B. Issues Linear (une par sujet)

Pour chaque ticket :

1. Titre clair (`Fix: …` / `Feat: …` / `Improve: …` / `Spike: …`).
2. Labels issue : `AxelJob` + `Bug` | `Feature` | `Improvement`.
3. Assignee, priorité, état `Todo` (ou `In Progress` dès qu'une PR existe).
4. Description : problème, repro / état actuel du code, critères d'acceptation **vérifiables**, zones code probables.
5. Noter le `gitBranchName` fourni par Linear (à réutiliser tel quel).

### C. Issues GitHub (miroir)

```bash
# Un seul label par commande (le shell interprète autrement bug|enhancement).
gh issue create --repo presidentaxel/Axeljob \
  --title "<même titre que Linear>" \
  --label bug \
  --body "$(cat <<'EOF'
## Linear
https://linear.app/axel-project/issue/AXE-XX/...

## Problème
…

## Critères d'acceptation
- [ ] …
EOF
)"
# Variante feature : --label enhancement
```

### D. Liens cliquables dans Linear (obligatoire)

Dès que l'issue GitHub et/ou la PR existent, **ajouter des attachments liens** sur l'issue Linear :

1. **MCP Linear Cursor** : `save_issue` avec `id: "AXE-XX"` et `links: [{ url, title }, …]` (paramètre natif, **append-only**).
2. **UI Linear** : issue → Attachments → Add link (si pas d’accès MCP).

| Lien | Titre suggéré |
|------|----------------|
| Issue GitHub | `GitHub #N` |
| PR GitHub | `Draft PR #N` puis `PR #N` quand prête |

Sans cette étape, Linear n'affiche pas forcément un clic utile même si le body de la PR contient `Fixes AXE-XX`.

Exemple MCP `save_issue` :

```json
{
  "id": "AXE-XX",
  "links": [
    { "url": "https://github.com/presidentaxel/Axeljob/issues/N", "title": "GitHub #N" },
    { "url": "https://github.com/presidentaxel/Axeljob/pull/N", "title": "Draft PR #N" }
  ]
}
```

`links` est **append-only** : on peut ajouter la PR après l'issue sans retirer le lien précédent. Ne pas inventer d’autre champ JSON hors schéma MCP.

### E. Mises à jour Linear pendant le travail (obligatoire)

À **chaque changement significatif** (début d'investigation, hypothèse, commit, push, PR prête, blocage, merge), **mettre à jour Linear** — ne pas laisser le ticket muet jusqu'à la fin.

| Où | Quand | Comment |
|----|--------|---------|
| **Commentaires** sur l'**issue** | Avancées techniques, hypothèses, liens commit/PR, questions | UI Linear → fil de l'issue, ou MCP `save_comment` avec `issueId: "AXE-XX"` |
| **Statut** de l'issue | Todo → In Progress → In Review → Done | Dès que le travail démarre / PR en revue / merge |
| **Project updates** | Jalons projet, risque, résumé équipe | Section **Updates** du projet, ou MCP `save_status_update` (`type: "project"`, `health`: `onTrack` \| `atRisk` \| `offTrack`) |

Règles :

1. Commenter **au début** (ce qu'on attaque) et **à chaque étape** utile (cause trouvée, fix poussé, tests OK, besoin de revue).
2. Inclure les URLs GitHub (commit, PR) dans le commentaire.
3. Si le chantier est **at risk** / bloqué : project update `atRisk` ou `offTrack` + commentaire sur l'issue.
4. Agents IA : même obligation — pas de gros diff sans commentaire Linear sur l'issue concernée.

Exemple MCP commentaire issue :

```json
{
  "issueId": "AXE-XX",
  "body": "## Investigation\nHypothèse : … .\nBranche : `louisvedovato/axe-XX-…`\nPR : https://github.com/presidentaxel/Axeljob/pull/N"
}
```

### F. Branche + draft PR

1. Partir de `origin/main` pour une livraison isolée vers **`main` (intégration)** (ne pas emporter le WIP de `wip/innovation`).  
   Un merge dans `main` **n’est pas** un déploiement. La production = PR promote `main` → `prod` ([`ADR_MAIN_PROD.md`](ADR_MAIN_PROD.md)).  
   Si le code n’existe que sur `wip/innovation` : soit cherry-pick / extrait vers une branche basée sur `main`, soit PR empilée **vers `wip/innovation`** (pas vers `main`) — le noter dans le body PR / commentaire Linear.
2. Branche = **exactement** le `gitBranchName` Linear.
3. Commit scaffold vide OK au démarrage (`git commit --allow-empty`), puis vrais commits.
4. **CI locale avant push** (règle repo) :

```bash
bash scripts/pre-push.sh --skip-extras --skip-gitleaks
```

5. Ouvrir une **draft PR** :

```bash
gh pr create --draft --repo presidentaxel/Axeljob \
  --title "fix(AXE-XX): …" \
  --body "$(cat <<'EOF'
## Summary
- …

## Linear
Fixes AXE-XX

## GitHub issue
Closes #N

## Test plan
- [ ] Repro confirmée / critères d’acceptation
- [ ] Fix validé
- [ ] `bash scripts/pre-push.sh --skip-extras --skip-gitleaks` OK
- [ ] Tests auto si logique métier / ATS / canvas
EOF
)"
```

6. **Revenir sur Linear** et ajouter le lien `Draft PR #N` (§D).
7. Passer l'issue Linear en `In Progress` quand le travail démarre vraiment.

### G. Merge

1. PR prête → retirer le draft, CI verte, revue.
2. Titre / body conservent `Fixes AXE-XX` et `Closes #N`.
3. Après merge **dans `main`** : vérifier que Linear est passé en `Done` (intégration GitHub) ; sinon le faire à la main. Ça n’arrive **pas** en production tant qu’un promote `main` → `prod` n’est pas mergé ([`deploy.md`](deploy.md)).
4. Mettre à jour le titre du lien Linear `Draft PR #N` → `PR #N` si besoin (nouveau link OK).
5. Commentaire de clôture sur l'issue Linear (§E) + project update si fin de vague.

---

## 4. Conventions de nommage

| Artefact | Format |
|----------|--------|
| Projet Linear | `Axel Job — <chantier>` (ex. `Axel Job — Éditeur CV Beta (Canva + ATS)`) |
| Issue Linear | `Fix: …` / `Feat: …` / `Improve: …` (+ `Chore:` / `Spike:` pour ops & investigations) |
| Branche | Celle de Linear : `louisvedovato/axe-XX-…` |
| Titre PR | `fix(AXE-XX): …` ou `feat(AXE-XX): …` |
| Body PR | `Fixes AXE-XX` + `Closes #N` |

Regrouper dans **une** issue Linear deux symptômes **seulement** s'ils partagent la même cause probable.

---

## 5. Intégration GitHub dans Linear (réglage workspace)

Pour que Linear rattache aussi automatiquement branches/PR :

1. Linear → **Settings → Integrations → GitHub**
2. Connecter l'org / le repo `presidentaxel/Axeljob`
3. Activer le linking par mention `AXE-XX` / `Fixes AXE-XX`

Même avec l'intégration active : **toujours** poser les liens §D pour un clic immédiat depuis la fiche Linear.

---

## 6. Exemple de référence (éditeur CV Beta)

Projet : [Axel Job — Éditeur CV Beta (Canva + ATS)](https://linear.app/axel-project/project/axel-job-editeur-cv-beta-canva-ats-5e659a36bbec)

| Linear | Sujet (raccourci) | Statut typique |
|--------|-------------------|----------------|
| [AXE-27](https://linear.app/axel-project/issue/AXE-27) | Spike intégration `wip/innovation` → `main` | Todo |
| [AXE-28](https://linear.app/axel-project/issue/AXE-28) | Démarrage guidé / reset page blanche | Todo |
| [AXE-29](https://linear.app/axel-project/issue/AXE-29) | Fiabiliser autosave | Todo |
| [AXE-30](https://linear.app/axel-project/issue/AXE-30) | Alignement minimum front ↔ PDF | Todo |
| [AXE-31](https://linear.app/axel-project/issue/AXE-31) … [AXE-41](https://linear.app/axel-project/issue/AXE-41) | P1–P4 (sidebar, ATS coach, import…) | Backlog |

Suivi Git global du chantier : [PR Draft #33](https://github.com/presidentaxel/Axeljob/pull/33) sur `wip/innovation`.

Quand une issue passe en livraison isolée : créer issue GitHub + branche `gitBranchName` + draft PR, puis remplir les liens Linear (§D).

---

## 7. Anti-patterns

- Projet AxeL Job **sans** label `Axel Job`
- Couleur rouge/jaune/rose sur un projet AxeL Job (rester en cyan `#26B5CE` ; rouge = Gestion, jaune = Marketing, rose = Compta)
- Même icône sur deux projets AxeL Job ouverts
- PR ouverte **sans** lien attaché sur l'issue Linear
- Issue GitHub créée **sans** URL Linear dans le body **et** sans link Linear → GitHub
- Code / commits **sans** commentaire ou update Linear (§E)
- Plusieurs sujets unrelated dans une seule issue
- Branche inventée au lieu du `gitBranchName` Linear
- Critères d'acceptation non vérifiables (« ça marche mieux ») au lieu d'un test observable
- Push direct sur `main` **ou** `prod` (interdit — voir [`git-workflow.md`](git-workflow.md), [`ADR_MAIN_PROD.md`](ADR_MAIN_PROD.md) et [`branch-protections.md`](branch-protections.md))
- Traiter un merge dans `main` comme une mise en prod (faux : `main` = intégration)
