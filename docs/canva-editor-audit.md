# Audit Editeur Canva / Profil Beta

Date : 2026-06-03

## Position Produit

L'objectif est juste : donner a l'utilisateur la liberte de creer un CV qui lui ressemble, tout en lui montrant clairement le prix de ses choix en lisibilite ATS. Le produit ne doit donc pas opposer "design" et "score", mais aider l'utilisateur a arbitrer.

La promesse cible devrait etre :

> Tu peux designer ton CV librement. A chaque choix, CV Bot te montre ce que cela change pour les ATS et te propose une alternative plus sure.

Aujourd'hui, le mode Beta va deja dans cette direction, mais il part trop vite sur une experience "canvas libre" sans assez de guidage. Le risque principal n'est pas technique uniquement : c'est que l'utilisateur se sente libre mais perdu, ou qu'il voie un rendu dans l'editeur qui ne correspond pas au PDF final.

## Synthese Executive

L'editeur Canva a de bonnes fondations :

- un modele `layout` v3 en millimetres, adapte au rendu A4 ;
- une sidebar inspiree Canva ;
- drag, resize, snap, grille, calques, undo/redo ;
- edition inline ;
- import d'images decoratives ;
- score ATS live ;
- export PDF via `layout_renderer`.

Mais il n'est pas encore "ultra utilisable". Les principaux problemes sont :

- le premier contact peut etre une page blanche confuse ;
- la sidebar donne des outils, mais peu de parcours guide ;
- l'impact ATS est visible, mais pas assez pedagogique ni actionnable ;
- le rendu frontend et le PDF backend divergent sur plusieurs blocs et styles ;
- l'autosave ne garantit pas encore assez la confiance ;
- les imports PDF/Word futurs demandent une vraie pipeline de reconstruction, pas seulement un parseur de texte.

Priorite absolue : transformer le canvas en experience fiable, explicite et reversible avant d'ajouter plus de capacites.

## Etat Actuel

### Entree Beta

`/app/profil` passe par `ProfileViewSwitcher`. Quand le toggle Beta est actif, il charge `CvEditorBetaView`.

Le mode Beta actuel est "canvas libre uniquement". Il n'y a plus vraiment de mode intermediaire guide dans cette vue : l'utilisateur arrive dans un environnement de composition.

### Architecture Frontend

Pieces principales :

- `CvEditorBetaView.jsx` : orchestration globale, chargement du CV, layout history, autosave, ATS, export PDF.
- `FreeCanvas.jsx` : rendu des pages A4, selection, drag, resize, placement, pagination visuelle.
- `FreeCanvasBlock.jsx` : rendu des blocs semantiques et decoratifs, edition inline, poignees, image/icon/text.
- `EditorCanvaSidebar.jsx` : rail type Canva, modeles, elements, texte, icones, import image, position, outils.
- `EditorCanvaPositionDrawer.jsx` : geometrie et calques.
- `EditorFloatingTextToolbar.jsx` : formatage texte/forme/icone.
- `EditorImageEditPopover.jsx` : recadrage simple, zoom, forme, position.
- `useAutoSave.js` / `autoSaveScheduler.js` : debounce, retry, etat de sauvegarde.
- `cvLayoutModelV3.js` : modele pur layout v3.

### Architecture Backend / PDF / ATS

Pieces principales :

- `GET /api/cv?profile=1` charge le CV et le `layout`.
- `PUT /api/cv` sauvegarde le CV et le layout si present.
- `save_cv_base` preserve `layout` si le payload ne l'envoie pas.
- `POST /api/pdf` utilise `layout_renderer.py` si un layout est fourni.
- `layout_renderer.py` produit un HTML A4 absolu en mm.
- `free_canvas.py` ajoute des regles ATS basees sur l'ordre spatial des blocs.

## Avis Produit Detaille

### Le Bon Compromis

Il faut garder la liberte totale, mais la structurer en niveaux :

1. **Mode recommande** : partir d'un modele propre, deja ATS-safe.
2. **Mode personnalisation controlee** : couleurs, typo, sections, ordre, quelques placements.
3. **Mode libre** : l'utilisateur peut tout faire, mais l'app affiche le cout ATS des choix.

L'utilisateur ne doit jamais avoir l'impression qu'on lui interdit. Il doit comprendre :

- ce qui est un choix de design ;
- ce qui est un risque ATS ;
- ce qui peut etre corrige automatiquement ;
- ce qui est un choix assume qu'il peut ignorer.

### Ce Que Le Score ATS Devrait Devenir

Le badge ATS actuel est trop discret pour porter la vision. Il doit devenir un coach.

Il faut passer de :

- "ATS : 82/100"

a :

- "Bon pour ATS, 2 risques mineurs"
- "Le contact est trop bas"
- "L'ordre de lecture machine ne suit pas le visuel"
- "Les images decoratives n'impactent pas le score, mais ce texte risque d'etre ignore"
- "Corriger automatiquement"
- "Voir sur le canvas"
- "Ignorer ce conseil"

Le scoring doit aussi montrer l'impact des actions :

- "Deplacement du bloc Contact : 86 -> 79"
- "Ajout d'une image : aucun impact ATS"
- "Experiences placees avant le resume : -5"

## Audit Canva Detaille

### Points Forts

Le socle est sain :

- les coordonnees en mm sont le bon choix pour aligner editeur et PDF ;
- les mutations layout sont pures et testees ;
- l'undo/redo existe ;
- la sidebar est deja proche d'un pattern Canva ;
- le snap et la grille donnent une base de precision ;
- les calques existent ;
- l'import image est deja compresse ;
- le PDF layout v3 existe ;
- le score ATS prend le layout en compte.

Ce sont de bonnes fondations. Il ne faut pas repartir de zero.

### Probleme 1 : Demarrage Trop Brut

Si un utilisateur a un CV mais pas de layout, le code hydrate `createBlankLayoutV3()`. Produit : il peut voir une page vide alors que son profil existe.

Effet utilisateur probable :

- "Mon CV a disparu"
- "Je dois tout reconstruire"
- "Je ne comprends pas comment commencer"

Ce qu'il faut faire :

- si le CV a du contenu et pas de layout, proposer un ecran de depart clair ;
- mettre en avant "Generer depuis mon profil" ;
- proposer "Choisir un modele ATS-safe" ;
- garder "Page blanche" comme choix avance, pas comme base implicite.

### Probleme 2 : Sidebar Canva Pas Encore Assez Guidante

La sidebar liste des outils : modeles, elements, texte, icones, importer, position, outils. C'est logique pour un utilisateur expert, mais faible pour un utilisateur qui cherche a faire un bon CV.

Problemes UX :

- "Elements" ne distingue pas blocs CV utiles et decorations ;
- "Importer" ne concerne que les images, alors que le mot laisse attendre PDF/Word ;
- "Enregistrer les modifs" dans Modeles est ambigu : cela sauvegarde une proposition locale, pas forcement le CV ;
- l'utilisateur ne voit pas clairement l'ordre recommande des etapes ;
- il n'y a pas assez de feedback quand on place un element.

Ce qu'il faut faire :

- renommer et clarifier les sections ;
- distinguer "Sections CV" et "Decoration" ;
- ajouter un onboarding court ;
- ajouter des empty states utiles ;
- ajouter des tooltips pedagogiques ;
- rendre les actions dangereuses/restructurantes explicites.

### Probleme 3 : Placement D'Elements Trop Indirect

Aujourd'hui, on clique/maintient un element puis on clique sur la page. Ce n'est pas mauvais, mais l'interaction n'est pas aussi intuitive qu'un vrai drag depuis la sidebar.

Ce qu'il faut faire :

- court terme : ameliorer les textes et le ghost de placement ;
- moyen terme : drag depuis la sidebar vers le canvas ;
- ajouter echap / annuler visible ;
- selectionner automatiquement le bloc place et ouvrir la toolbar adaptee ;
- afficher "Cliquez pour placer" directement pres du curseur.

### Probleme 4 : Edition Texte Puissante Mais Risquee

L'edition inline utilise `contentEditable` et peut stocker du HTML. C'est flexible, mais il faut la rendre plus sure et plus previsible.

Risques :

- HTML riche stocke puis reinjecte ;
- ecart entre ce que le frontend accepte et ce que le backend rend ;
- comportement de collage potentiellement sale ;
- risque de perte de selection/focus avec la toolbar.

Ce qu'il faut faire :

- sanitiser explicitement le HTML autorise ;
- definir une whitelist : `strong`, `em`, `u`, `s`, `span style limite` ;
- aligner le renderer backend sur ces styles ;
- ajouter un mode "coller proprement" par defaut ;
- ajouter des tests sur contenu riche -> sauvegarde -> PDF.

### Probleme 5 : WYSIWYG Pas Encore Garanti

C'est le point le plus important pour la confiance.

Le frontend rend plus de choses que le backend :

- images decoratives ;
- icones reelles ;
- QR code ;
- zoom/focal point des images ;
- formes arrondies ;
- plusieurs styles typographiques ;
- labels/couleurs/zones de templates ;
- certains champs d'experiences comme `clients`.

Le backend rend parfois des placeholders ou ignore des styles.

Ce qu'il faut faire :

- creer une matrice de fidelite bloc par bloc ;
- rendre le backend equivalent au frontend pour tous les blocs supportes ;
- ajouter des tests snapshot HTML/PDF ;
- masquer ou marquer comme "non exporte parfaitement" ce qui n'est pas encore supporte ;
- ne plus ajouter de nouveaux blocs avant d'avoir aligne ceux qui existent.

### Probleme 6 : "Optimiser ATS" Ne Corrige Pas Assez

Les regles ATS free canvas lisent l'ordre spatial `y/x`. L'optimisation frontend agit surtout sur l'ordre/z-index, et remonte parfois le contact.

Probleme : le bouton peut promettre plus qu'il ne fait.

Ce qu'il faut faire :

- soit renommer temporairement en "Ameliorer l'ordre des calques" si l'action reste z-index ;
- soit faire une vraie optimisation spatiale : repositionner identity/contact/resume/experiences selon un ordre lisible ;
- afficher une preview avant/apres ;
- permettre d'annuler en un clic ;
- expliquer les changements.

### Probleme 7 : Autosave Et Confiance

L'autosave est robuste sur le papier : debounce, retry, indicateur. Mais la confiance utilisateur exige plus.

Risques :

- modification recente perdue si navigation avant flush ;
- undo/redo qui modifie le layout local sans persister le nouvel etat serveur ;
- page blanche qui ne supprime pas forcement le layout sauvegarde car le frontend n'envoie pas `layout` vide et le backend preserve l'ancien layout absent ;
- message d'erreur export PDF seulement en console ;
- image en data URL dans le layout pouvant grossir le payload.

Ce qu'il faut faire :

- flush autosave a l'unmount ou avant changement de mode ;
- declencher l'autosave apres undo/redo, y compris via raccourcis clavier ;
- persister explicitement `layout: null` ou un layout vide quand l'utilisateur choisit Page blanche ;
- afficher une erreur visible en cas d'export PDF rate ;
- stocker les images decoratives hors JSON long terme.

### Probleme 8 : Calques Trop Techniques

Le panneau Position affiche `x/y/w/h/z`, ce qui est utile pour nous, mais peu parlant pour beaucoup d'utilisateurs.

Ce qu'il faut faire :

- garder les valeurs avancees, mais les cacher derriere "Avance" ;
- montrer d'abord des actions simples : aligner gauche, centrer, distribuer, premier plan, arriere-plan ;
- afficher des noms comprehensibles de blocs : "Contact", "Experiences", "Photo", "Texte libre" ;
- permettre de renommer un bloc decoratif ;
- ajouter verrouiller/dupliquer/supprimer dans le meme panneau.

### Probleme 9 : Accessibilite Et Responsive

Le canvas est principalement pointer-driven. C'est normal pour une experience Canva, mais il faut un minimum clavier.

Ce qu'il faut faire :

- deplacement au clavier avec fleches ;
- shift + fleches pour grands pas ;
- focus visible sur blocs ;
- suppression accessible ;
- labels ARIA plus complets sur rail/drawer ;
- version mobile/tablette degradee mais claire : "edition layout recommandee sur desktop".

### Probleme 10 : Trop De Puissance Sans Parcours

Le produit a deja beaucoup d'outils, mais pas assez de "chemins".

Ce qu'il faut faire :

- parcours "Je veux un CV efficace" ;
- parcours "Je veux personnaliser le design" ;
- parcours "Je veux partir de mon ancien CV" ;
- parcours "Je veux une version ATS-safe" ;
- parcours "Je veux une version creative".

La meme technologie peut servir plusieurs intentions. L'UI doit demander l'intention avant de montrer toute la complexite.

## Roadmap Recommandee

### P0 - Stabiliser La Confiance

Objectif : l'utilisateur comprend ce qu'il voit, ce qui est sauvegarde, et ce qu'il exporte.

Chantiers :

1. Demarrage guide si layout absent.
2. Correction Page blanche / reset layout.
3. Flush autosave a l'unmount.
4. Autosave apres undo/redo.
5. Erreurs visibles sur export PDF.
6. Alignement minimum frontend/PDF sur les blocs existants.

Critere de sortie :

- un utilisateur avec un CV existant n'arrive jamais sur une page blanche sans explication ;
- reset layout est persiste ;
- le PDF ne surprend pas sur les blocs principaux ;
- aucune modification recente n'est perdue lors d'un changement de vue.

### P1 - Rendre Le Canvas Facile

Objectif : l'utilisateur peut composer sans lire la doc.

Chantiers :

1. Repenser la sidebar en "Sections CV" / "Design" / "Importer" / "Position".
2. Onboarding 3 etapes au premier usage.
3. Empty states actionnables.
4. Drag depuis la sidebar ou placement guide plus clair.
5. Selection automatique + toolbar contextuelle apres insertion.
6. Panneau calques simplifie.

Critere de sortie :

- un utilisateur sait quoi faire en moins de 10 secondes ;
- les outils avances ne polluent pas le parcours simple ;
- les actions principales sont visibles et comprehensibles.

### P2 - Faire Du Score ATS Un Coach

Objectif : le score guide les decisions, pas seulement les juge.

Chantiers :

1. Panneau ATS permanent ou drawer dedie.
2. Explications lisibles des regles.
3. Highlight du bloc concerne sur le canvas.
4. Actions "corriger", "voir", "ignorer".
5. Impact avant/apres des modifications.
6. Mode "version ATS-safe" vs "version design".

Critere de sortie :

- l'utilisateur comprend pourquoi il perd des points ;
- il peut corriger sans deviner ;
- il peut assumer un choix design en connaissance de cause.

### P3 - WYSIWYG Reell

Objectif : l'editeur et le PDF parlent exactement le meme langage.

Chantiers :

1. Matrice de support des blocs.
2. Renderer backend equivalent pour images, icones, QR, styles texte, formes.
3. Endpoint `verify-pdf` / extraction texte du PDF genere pour comparer score JSON vs score reel.
4. Tests de non-regression sur HTML/PDF.
5. Validation/sanitisation du layout cote backend.
6. Stockage propre des assets importes.

Critere de sortie :

- chaque bloc supporte dans l'UI est supporte dans le PDF ;
- les styles visibles sont exportes ;
- les blocs non supportes ne sont pas exposes.

### P4 - Import PDF / Word

Objectif : importer un ancien CV et le convertir en CV Bot editable + score.

Pipeline cible :

1. Upload PDF/Word.
2. Extraction texte + structure.
3. Detection des sections.
4. Detection approximative du layout original.
5. Proposition de 3 sorties :
   - contenu dans un modele ATS-safe ;
   - reconstruction proche du design original ;
   - mix design conserve + corrections ATS.
6. Score ATS compare pour chaque sortie.
7. Choix utilisateur puis edition dans le canvas.

Point cle : ne pas promettre un pixel-perfect import au debut. Il vaut mieux promettre une reconstruction propre, editable et scoree.

## Premier Chantier A Lancer

Je recommande de commencer par le chantier **P0 - Stabiliser la confiance**, dans cet ordre :

1. Remplacer le demarrage page blanche par un choix guide quand `cv` existe mais `layout` est absent.
2. Corriger la persistance de "Page blanche" pour qu'elle reset vraiment le layout.
3. Flusher l'autosave au demontage.
4. Ajouter un message visible si l'export PDF echoue.
5. Documenter/aligner les divergences PDF les plus visibles.

C'est le meilleur premier chantier car il rend le canvas utilisable sans changer toute l'interface. Il corrige la perception "c'est casse / mon CV a disparu", qui est le risque le plus grave.

## Definition D'Une Experience Canva Reussie

L'editeur sera vraiment au niveau attendu quand :

- l'utilisateur comprend instantanement comment commencer ;
- il peut choisir entre modele, personnalisation et liberte totale ;
- chaque changement est sauvegarde ou clairement en erreur ;
- chaque element visible est exporte correctement ;
- le score ATS explique les risques avec des actions concretes ;
- l'utilisateur peut toujours revenir en arriere ;
- l'import d'un CV externe produit un document editable et scoreable, pas juste un texte parse.

La vision est forte. La priorite maintenant n'est pas d'ajouter plus d'outils, mais de rendre les outils existants fiables, lisibles et pedagogiques.
