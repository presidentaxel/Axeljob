# Documentation Hub - cv-bot

Point d'entree de la documentation technique, securite et operations.

> [!TIP]
> Commencer par `docs/guide-bonnes-pratiques.md` si vous rejoignez le projet.

## Navigation rapide

| Besoin | Document |
| --- | --- |
| Coder selon les standards du repo | `docs/guide-bonnes-pratiques.md` |
| Contribuer (branches, PR, quality gates) | [docs/contributing.md](contributing.md) |
| Workflow Git (main, wip/innovation, PR Draft) | [docs/git-workflow.md](git-workflow.md) |
| Protections branches / passage push → PR | [docs/branch-protections.md](branch-protections.md) |
| Workflow Linear ↔ GitHub (tickets AXE, liens, PR) | [docs/linear-github-workflow.md](linear-github-workflow.md) |
| Intégration `wip/innovation` → `main` (AXE-27) | [docs/axe-27-integration-strategy.md](axe-27-integration-strategy.md) |
| Verifier la Definition of Done engineering | `docs/engineering-standards.md` |
| Appliquer la baseline securite | `docs/security.md` |
| Deployer en production | `docs/deploy.md` |
| Utiliser les commandes ops courantes | `docs/ops-commands.md` |
| Acceder a la version courte des commandes | `docs/COMMANDS.md` |
| Comprendre la vision editeur L1->L3 et le scoring ATS | `docs/editor-vision.md` |
| Matrice fidélité blocs canvas ↔ PDF (AXE-38) | [docs/pdf-block-fidelity.md](pdf-block-fidelity.md) |

## Regle de maintenance documentaire

- Toute PR qui modifie comportement, variable d'environnement, commande ops ou posture securite doit mettre a jour la doc.
- En cas de conflit entre documents, `docs/guide-bonnes-pratiques.md` fait foi.
- Favoriser des sections courtes, checklistes et commandes testables.
