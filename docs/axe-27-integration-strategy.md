# AXE-27 — Stratégie d'intégration `wip/innovation` → `main`

> Spike Linear : [AXE-27](https://linear.app/axel-project/issue/AXE-27) · PR de suivi : [#33](https://github.com/presidentaxel/Axeljob/pull/33)  
> Date : 2026-08-11 · Branche démo : `louisvedovato/axe-27-spike-strategie-dintegration-wipinnovation-main-historique`

---

## Contexte (mis à jour)

L’hypothèse initiale « *no merge base* » est **obsolète**. Un ancêtre commun existe à nouveau :

| | |
|--|--|
| Merge-base | `67fa381` (`fix(security): fermer les 15 alertes CodeQL restantes`) |
| Écart typique | ~15 commits sur `main` non dans wip · ~130+ commits Beta sur wip |

Un **merge classique** est donc possible. La Draft #33 était `CONFLICTING` faute d’avoir absorbé les merges récents de `main` (docs #47, deps #48), pas faute d’historique irréconciliable.

---

## Inventaire (ordre de grandeur)

| Catégorie | Exemples | Action |
|-----------|----------|--------|
| **Ajouts Beta** (~190 fichiers) | `frontend/src/components/editor/*`, `backend/services/ats_score/*`, `layout_renderer.py`, `api_ats.py`, tests unitaires | Garder côté wip |
| **Docs / process** | `docs/git-workflow.md`, `branch-protections.md`, `linear-github-workflow.md` | Prendre `main` (déjà mergé) |
| **Deps sécurité** | `requirements*.txt`, `frontend/package.json` (+ lock) | Prendre `main`, **re-ajouter** `pymupdf` + `fonttools` au runtime (import PDF Beta) |
| **Fichiers communs sensibles** | `backend/main.py`, `frontend/src/api.js`, `README.md` | Base **wip** + port des correctifs `main` (ex. webhook Stripe `_stripe_attr`) |

### Conflits constatés au merge `origin/main` → wip (août 2026)

Seulement **8 chemins** :

1. `backend/main.py` — fichier entier divergé → **ours (wip)** + webhook Stripe de `main`
2. `backend/requirements.txt` / `requirements-dev.txt` → **main** + extras Beta
3. `docs/README.md`, `contributing.md`, `git-workflow.md`, `guide-bonnes-pratiques.md` → **main**
4. `frontend/package-lock.json` → régénéré après merge de `package.json`

---

## Décision

### Stratégie retenue : **(a) une PR d’intégration** (#33), après merge de `main` dans wip

| Option | Verdict |
|--------|---------|
| **(a) PR unique** (Draft #33 → Ready) | **Retenue.** L’éditeur Beta est un seul produit derrière `BetaModeToggle` ; découper artificiellement casserait le flag et la revue « expérience stable inchangée ». |
| **(b) rebase / replay** des ~130 commits sur `main` | Rejetée pour l’instant : coût élevé, peu de gain une fois le merge-base rétabli. |
| **(c) PR thématiques par milestone** | **Reportée après** le premier merge vert : utile pour les tickets AXE-28…41 *suivants*, pas pour débloquer l’historique. |

### Mode opératoire

1. Branche d’intégration = wip + `git merge origin/main` (cette branche spike).
2. Résoudre les conflits selon le tableau ci-dessus.
3. CI locale / GitHub verte (`pytest`, unit frontend, lint/build).
4. Mettre à jour `wip/innovation` (et donc #33) avec ce merge pour passer de `CONFLICTING` → mergeable.
5. Avant Ready for review : traiter les alertes CodeQL restantes (path-injection / ReDoS) — hors scope strict du spike, prérequis merge.

### Feature-flag

L’expérience stable reste derrière :

- `frontend/src/lib/betaMode.js` · `isBetaModeEnabled()`
- `frontend/src/components/BetaModeToggle.jsx` (Settings + AppTopbar)
- Vues éditeur (`CvEditorBeta*`) montées seulement si Beta ON

Critère AXE-27 : **aucun impact sur le parcours non-Beta** tant que le toggle est off (défaut).

---

## Branche de démonstration

```text
louisvedovato/axe-27-spike-strategie-dintegration-wipinnovation-main-historique
```

Contient le merge `main` résolu + cette note. Une fois les tests verts, aligner `wip/innovation` dessus pour débloquer #33.

---

## Suite recommandée (hors spike)

| Priorité | Ticket / action |
|----------|-----------------|
| P0 | Aligner `wip/innovation` sur cette intégration → #33 plus CONFLICTING |
| P0 | CodeQL high sur la merge-ref (#33) |
| P1 | Tickets produit High : AXE-40, 29, 28, 30, 38 |
| P2 | Initiative `main` → `prod` (AXE-315…) en parallèle, hors Beta |
