# Dossier photo du CV

Place ici ta photo pour le CV.

**Fichiers reconnus** (un seul utilisé, dans cet ordre) :
- `photo.jpg` / `photo.jpeg`
- `photo.png`
- `photo.webp`
- ou toute autre image (jpg, png, webp, gif) dans ce dossier

Tu peux aussi garder une URL dans `cv_base.json` (`photo_url`) ; si `photo_url` est vide, le script utilisera automatiquement l'image de ce dossier.

**Compression** : pour garder le preview et le PDF légers, l'image est automatiquement redimensionnée (max 200×200 px) et enregistrée en JPEG dans `photo_cv.jpg`. Ce fichier est généré à la volée ; tu peux l'ignorer ou le supprimer, il sera recréé si besoin. Nécessite **Pillow** (`pip install Pillow`).
