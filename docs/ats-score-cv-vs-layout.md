# Score ATS — `cv` vs `layout`

Le **Score Parsing** (`score_parsing`) part de **100**, applique des règles
déterministes, puis clampe à ``[0, 100]``. Version : `SCORING_VERSION`
(`backend/services/ats_score/version.py`).

## Deux sources, deux jobs

| Source | Rôle |
|--------|------|
| **`cv`** (JSON sémantique) | Contenu : identité (dual-key FR/EN), contact, expériences, formations, compétences, dates… |
| **`layout`** | Présentation : colonnes, sidebar, canvas libre, positions, typo, sections affichées |

Un CV **pauvre** (peu de champs remplis dans `cv`) doit scorer **bas**, même
si le layout est ATS-safe (mono-colonne). Un canvas libre **vide** ne doit pas
rester ~100 parce qu’aucune règle layout n’a matché.

## Règles contenu (JSON)

Dans `backend/services/ats_score/rules/content.py` :

- Malus si identité / contact / expériences / formations / skills **manquants**
  (shells vides du profil par défaut = manquants).
- Dual-key : `prenom`↔`first_name`, `nom`↔`last_name` (et `phone` toléré).
- Bonus sections / contact haut de page / dates cohérentes.

## Règles layout / free canvas

- Templates figés : colonnes, sidebar, photo, typo…
- Canvas `grid == "free"` : **pas** de malus pour le seul fait d'utiliser des
  positions absolues (AXE-336). On score plutôt :
  - aucun bloc sémantique / profil non affiché
  - ordre de lecture ambigu, identité pas en tête, contact trop bas
  - contenu coupé hors A4 (`y + h > 297 mm`, AXE-350) — un bloc présent
    mais hors zone imprimable ne doit pas laisser le score à 100
  - multicolonnes détectées via clusters `x`
- Verify-pdf reste le filet pour un export réellement illisible.

Le JSON peut être riche **et** le canvas incomplet → malus « profil non
affiché ». L’inverse (canvas + JSON vide) → malus contenu + « aucun bloc
sémantique ».

## Verify PDF

Le check ground-truth PDF (`ats_parsing_check`) ajuste ensuite le score quand
le PDF réel ne contient pas de texte extractible, etc. Le score JSON reste la
base « structure + contenu » ; le PDF valide ce qui est réellement exporté.
