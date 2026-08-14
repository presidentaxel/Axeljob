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
- Canvas `grid == "free"` : blocs sémantiques absents, profil non affiché,
  ordre de lecture, contact trop bas, positions texte libres…

Le JSON peut être riche **et** le canvas incomplet → malus « profil non
affiché ». L’inverse (canvas + JSON vide) → malus contenu + « aucun bloc
sémantique ».

## Verify PDF

Le check ground-truth PDF (`ats_parsing_check`) ajuste ensuite le score quand
le PDF réel ne contient pas de texte extractible, etc. Le score JSON reste la
base « structure + contenu » ; le PDF valide ce qui est réellement exporté.
