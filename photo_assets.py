#!/usr/bin/env python3
"""
Résolution et compression de la photo CV depuis le dossier assets/.
Produit une version légère (photo_cv.jpg) pour le preview et le PDF.
"""

from pathlib import Path

ASSETS_DIR = "assets"
PHOTO_CV_NAME = "photo_cv.jpg"
PHOTO_NAMES = ("photo.jpg", "photo.jpeg", "photo.png", "photo.webp")
MAX_SIZE = 200  # max width/height en px pour le CV (affichage ~80px, 200 suffit pour qualité)
JPEG_QUALITY = 85


def _find_source_photo(assets_dir: Path) -> Path | None:
    """Retourne le chemin vers la photo source dans assets/ ou None."""
    if not assets_dir.is_dir():
        return None
    for name in PHOTO_NAMES:
        p = assets_dir / name
        if p.is_file():
            return p
    for f in sorted(assets_dir.iterdir()):
        if f.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp", ".gif"):
            return f
    return None


def _compress_photo(source: Path, dest: Path) -> bool:
    """Redimensionne et compresse source vers dest (JPEG). Retourne True si ok."""
    try:
        from PIL import Image
    except ImportError:
        return False

    try:
        img = Image.open(source).convert("RGB")
    except Exception:
        return False

    w, h = img.size
    if w > MAX_SIZE or h > MAX_SIZE:
        ratio = min(MAX_SIZE / w, MAX_SIZE / h)
        new_size = (int(w * ratio), int(h * ratio))
        resample = getattr(Image, "Resampling", Image).LANCZOS
        img = img.resize(new_size, resample)

    dest.parent.mkdir(parents=True, exist_ok=True)
    img.save(dest, "JPEG", quality=JPEG_QUALITY, optimize=True)
    return True


def get_photo_url_for_cv(base_dir: Path, existing_photo_url: str | None) -> str | None:
    """
    Retourne l'URL/path de la photo à utiliser pour le CV.
    - Si existing_photo_url est une URL externe (http/https), on la retourne telle quelle.
    - Sinon on cherche dans assets/, on produit une version compressée (photo_cv.jpg)
      et on retourne le path vers celle-ci.
    Retourne None si aucune photo à utiliser.
    """
    if existing_photo_url and (
        existing_photo_url.startswith("http://")
        or existing_photo_url.startswith("https://")
    ):
        return existing_photo_url

    assets_dir = base_dir / ASSETS_DIR
    source: Path | None = None

    if existing_photo_url and not existing_photo_url.startswith("http"):
        # Path local déjà fourni (ex. assets/photo.jpg)
        candidate = base_dir / existing_photo_url
        if candidate.is_file():
            source = candidate

    if source is None:
        source = _find_source_photo(assets_dir)

    if source is None:
        return None

    dest = assets_dir / PHOTO_CV_NAME
    # Régénérer si la source est plus récente que la version compressée
    if dest.is_file() and dest.stat().st_mtime >= source.stat().st_mtime:
        return f"{ASSETS_DIR}/{PHOTO_CV_NAME}"

    if _compress_photo(source, dest):
        return f"{ASSETS_DIR}/{PHOTO_CV_NAME}"
    # Fallback : utiliser l'original si pas Pillow ou erreur
    return f"{ASSETS_DIR}/{source.name}"
