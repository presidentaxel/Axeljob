# Coach ATS — corrections actionnables (AXE-333)

Le panneau coach (`EditorAtsScoreBadge`) propose **Corriger** uniquement quand
une règle a un `fixKind` qui **modifie vraiment** le layout.

## FixKinds

| fixKind | Effet |
|---------|--------|
| `contact-up` | Remonte le bloc contact |
| `reading-order` | Empile les blocs sémantiques (y) + calques |
| `add-missing-sections` | Insère les sections du profil absentes du canvas |
| `hide-photo` | `theme.show_photo=false` + retire blocs photo |
| `fix-font` | Polices → Arial |
| `fix-body-font-size` | Corps → 10 pt |
| `single-column` | Free : même `x` ; template : `sidebar_ratio=0` |
| `spill-overflow` | Déplace les blocs hors A4 vers la page suivante (`applyLayoutPagination`) |

Si `fixKind` est `null`, l’UI affiche **`notApplicableReason`**
(ex. « À remplir dans le contenu du profil »).

## Garde-fou

Avant preview / apply : si le layout après fix est identique, pas d’action
trompeuse (`didAtsCoachFixChangeLayout`).

## Tests

`frontend/tests/unit/atsCoachAdvice.test.js` — mapping + chaque fix critique.
