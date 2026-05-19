#!/usr/bin/env python3
"""Photo resolution and compression utilities for CV rendering."""

from pathlib import Path

ASSETS_DIR = "assets"
PHOTO_CV_NAME = "photo_cv.jpg"
PHOTO_NAMES = ("photo.jpg", "photo.jpeg", "photo.png", "photo.webp")
MAX_SIZE = 400
JPEG_QUALITY = 85

IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp", ".gif")
PROFIL_PICTURE_TEMPLATE = "ProfilPicture - {{prenom}} {{nom}}"


def _find_source_photo(
    assets_dir: Path, prenom: str | None = None, nom: str | None = None
) -> Path | None:
    if not assets_dir.is_dir():
        return None
    for name in PHOTO_NAMES:
        p = assets_dir / name
        if p.is_file():
            return p
    candidates = []
    if prenom or nom:
        candidates.append(f"ProfilPicture - {(prenom or '').strip()} {(nom or '').strip()}")
    candidates.append(PROFIL_PICTURE_TEMPLATE)
    for base_name in candidates:
        if not base_name:
            continue
        for ext in ("",) + tuple(IMAGE_EXTENSIONS):
            p = assets_dir / (base_name + ext) if ext else assets_dir / base_name
            if p.is_file():
                return p
    for f in sorted(assets_dir.iterdir()):
        if f.suffix.lower() in IMAGE_EXTENSIONS:
            return f
    return None


def _compress_photo(source: Path, dest: Path) -> bool:
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


def ensure_compressed_photo(
    base_dir: Path,
    existing_photo_url: str | None = None,
    prenom: str | None = None,
    nom: str | None = None,
    *,
    allow_assets_fallback: bool = True,
) -> str | None:
    return get_photo_url_for_cv(
        base_dir,
        existing_photo_url,
        prenom=prenom,
        nom=nom,
        allow_assets_fallback=allow_assets_fallback,
    )


def get_photo_url_for_cv(
    base_dir: Path,
    existing_photo_url: str | None,
    prenom: str | None = None,
    nom: str | None = None,
    *,
    allow_assets_fallback: bool = True,
) -> str | None:
    if existing_photo_url and (
        existing_photo_url.startswith("http://") or existing_photo_url.startswith("https://")
    ):
        return existing_photo_url
    assets_dir = base_dir / ASSETS_DIR
    source: Path | None = None
    if existing_photo_url and not existing_photo_url.startswith("http"):
        candidate = base_dir / existing_photo_url
        if candidate.is_file():
            return existing_photo_url
    if source is None and allow_assets_fallback:
        source = _find_source_photo(assets_dir, prenom=prenom, nom=nom)
    if source is None:
        return None
    dest = assets_dir / PHOTO_CV_NAME
    if dest.is_file() and dest.stat().st_mtime >= source.stat().st_mtime:
        return f"{ASSETS_DIR}/{PHOTO_CV_NAME}"
    if _compress_photo(source, dest):
        return f"{ASSETS_DIR}/{PHOTO_CV_NAME}"
    return f"{ASSETS_DIR}/{source.name}"
