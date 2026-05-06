# Dossier photo du CV

Ce dossier contient la photo locale utilisee pour le CV quand `photo_url` n'est pas renseigne.

## Sommaire

1. Ordre de selection
2. Comportement avec `cv_base.json`
3. Optimisation image

## 1) Ordre de selection des fichiers

Un seul fichier est utilise, selon l'ordre :

1. `photo.jpg` ou `photo.jpeg`
2. `photo.png`
3. `photo.webp`
4. sinon, la premiere image supportee du dossier (`jpg`, `png`, `webp`, `gif`)

## 2) Comportement avec `cv_base.json`

- Si `photo_url` est defini, cette URL est prioritaire.
- Si `photo_url` est vide, l'application utilise l'image locale detectee dans ce dossier.

## 3) Optimisation image

Pour alleger preview et PDF, l'image peut etre redimensionnee (max 200x200) puis enregistree en JPEG dans `photo_cv.jpg`.
Ce fichier est genere a la volee et peut etre supprime (il sera recree au besoin).

Dependance : `Pillow` (`pip install Pillow`).

> [!TIP]
> Preferer un portrait carre ou proche du carre pour un rendu PDF plus stable.
