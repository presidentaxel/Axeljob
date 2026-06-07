"""
Import CV Canva — analyse visuelle PDF via Gemini Vision.

La vision ne génère PAS de coordonnées mm (trop imprécis) : elle classifie le design
(template, couleurs, structure) et le frontend applique nos presets canvas calibrés.
"""

from __future__ import annotations

import io
import logging
import os
import re
from typing import Any

from backend.config import GEMINI_MODELS_VISION

logger = logging.getLogger(__name__)

VALID_TEMPLATE_MATCHES = frozenset(
    {"modern", "creative", "executive", "bold", "classic", "minimal", "elegant"}
)

CV_DESIGN_VISION_PROMPT = """Tu es un expert en design de CV. L'image est la page 1 d'un CV imprimé (A4).

Analyse UNIQUEMENT l'apparence visuelle : structure, couleurs, disposition des zones.
Ne recopie pas le texte du CV.

Retourne UNIQUEMENT un JSON valide (pas de markdown) :
{
  "template_match": "modern",
  "layout_style": "sidebar-left",
  "confidence": 0.9,
  "dominant_colors": {
    "accent": "#3182ce",
    "sidebar": "#2d3748",
    "header": "#2d3748",
    "body_text": "#1a1a1a"
  },
  "sections_in_sidebar": ["photo", "contact", "skills", "languages"],
  "sections_in_main": ["resume", "experiences", "formations"],
  "sections_found": ["experiences", "formations", "skills", "contact"],
  "has_photo": true,
  "photo_shape": "circle",
  "has_colored_sidebar": true,
  "has_header_band": false
}

Champ template_match — choisis le modèle le PLUS proche parmi :
- modern : sidebar colorée ~25% à GAUCHE, photo ronde, nom dans sidebar, contenu à droite
- creative : sidebar indigo/violette à gauche, style créatif
- executive : bandeau header sombre en haut + sidebar DROITE claire
- bold : header coloré fort, typo bold, sidebar ou bandeau marqué
- classic : sidebar gauche neutre, titres soulignés accent, deux colonnes classiques
- minimal : UNE colonne, beaucoup de blanc, peu de couleurs, titres discrets
- elegant : mise en page centrée, photo cercle en haut, séparateurs fins

layout_style : sidebar-left | sidebar-right | single-column | header-band

dominant_colors : couleurs HEX réelles visibles (#RRGGBB, 6 caractères)

confidence : 0.0 à 1.0 (certitude sur template_match)

sections_* : types parmi photo, identity, contact, resume, experiences, formations, certifications, skills, languages, projets
"""


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def _is_valid_hex(color: str) -> bool:
    return bool(re.fullmatch(r"#[0-9a-fA-F]{6}", str(color or "").strip()))


def _rasterize_with_pymupdf(file_bytes: bytes, dpi: int, max_long_side: int) -> bytes | None:
    try:
        import fitz
        from PIL import Image
    except ImportError:
        return None
    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        try:
            if doc.page_count < 1:
                return None
            page = doc[0]
            zoom = dpi / 72.0
            pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
            img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
            w, h = img.size
            if max(w, h) > max_long_side:
                img = img.copy()
                img.thumbnail((max_long_side, max_long_side), Image.Resampling.LANCZOS)
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=92)
            return buf.getvalue()
        finally:
            doc.close()
    except Exception as exc:
        logger.warning("cv_import_layout_vision: pymupdf rasterize échoué: %s", exc)
        return None


def _rasterize_with_pdfplumber(file_bytes: bytes, dpi: int, max_long_side: int) -> bytes | None:
    try:
        import pdfplumber
        from PIL import Image
    except ImportError:
        return None
    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            if not pdf.pages:
                return None
            pil: Image.Image = pdf.pages[0].to_image(resolution=dpi).original
            w, h = pil.size
            if max(w, h) > max_long_side:
                pil = pil.copy()
                pil.thumbnail((max_long_side, max_long_side), Image.Resampling.LANCZOS)
            buf = io.BytesIO()
            pil.convert("RGB").save(buf, format="JPEG", quality=92)
            return buf.getvalue()
    except Exception as exc:
        logger.warning("cv_import_layout_vision: pdfplumber rasterize échoué: %s", exc)
        return None


def pdf_first_page_to_jpeg_bytes(
    file_bytes: bytes, dpi: int = 200, max_long_side: int = 2048
) -> bytes | None:
    """Rasterise la page 1 du PDF (PyMuPDF prioritaire, pdfplumber en secours)."""
    if not file_bytes:
        return None
    jpeg = _rasterize_with_pymupdf(file_bytes, dpi, max_long_side)
    if jpeg:
        return jpeg
    return _rasterize_with_pdfplumber(file_bytes, dpi, max_long_side)


def normalize_vision_detection(parsed: dict | None) -> dict:
    """Normalise la réponse vision → métadonnées design fiables."""
    if not isinstance(parsed, dict):
        return {}

    detection = parsed.get("detection") if isinstance(parsed.get("detection"), dict) else parsed

    out: dict[str, Any] = {}
    template = str(detection.get("template_match") or "").strip().lower()
    if template in VALID_TEMPLATE_MATCHES:
        out["template_match"] = template

    style = str(detection.get("layout_style") or "").strip()
    if style:
        out["layout_style"] = style

    try:
        confidence = float(detection.get("confidence", 0))
    except (TypeError, ValueError):
        confidence = 0.0
    out["confidence"] = _clamp(confidence, 0.0, 1.0)

    dom = (
        detection.get("dominant_colors")
        if isinstance(detection.get("dominant_colors"), dict)
        else {}
    )
    colors = {}
    for key in ("accent", "sidebar", "header", "body_text"):
        val = str(dom.get(key) or "").strip()
        if _is_valid_hex(val):
            colors[key] = val
    if colors:
        out["dominant_colors"] = colors

    for list_key in ("sections_in_sidebar", "sections_in_main", "sections_found"):
        raw = detection.get(list_key)
        if isinstance(raw, list):
            out[list_key] = [str(s).strip() for s in raw if s][:12]

    for bool_key in ("has_photo", "has_colored_sidebar", "has_header_band"):
        if bool_key in detection:
            out[bool_key] = bool(detection[bool_key])

    photo_shape = str(detection.get("photo_shape") or "").strip().lower()
    if photo_shape in ("circle", "square"):
        out["photo_shape"] = photo_shape

    if out.get("template_match"):
        out["confidence"] = max(out["confidence"], 0.35)
    elif out.get("layout_style") and out.get("dominant_colors"):
        out["confidence"] = max(out["confidence"], 0.25)

    if out:
        out["source"] = "gemini_vision"
    return out


def detection_to_layout_hints(detection: dict) -> dict:
    """Convertit detection vision → layout_hints compatibles frontend."""
    hints: dict[str, Any] = {}
    style = str(detection.get("layout_style") or "").strip()
    if style:
        hints["layout_style"] = style
    if detection.get("template_match"):
        hints["template_match"] = detection["template_match"]
    dom = (
        detection.get("dominant_colors")
        if isinstance(detection.get("dominant_colors"), dict)
        else {}
    )
    if _is_valid_hex(dom.get("accent")):
        hints["accent_color"] = dom["accent"]
    if _is_valid_hex(dom.get("sidebar")):
        hints["sidebar_color"] = dom["sidebar"]
    if _is_valid_hex(dom.get("header")):
        hints["header_color"] = dom["header"]
    sections = detection.get("sections_found") or detection.get("sections_in_main")
    if isinstance(sections, list) and sections:
        hints["sections_emphasis"] = [str(s) for s in sections if s][:8]
    return hints


def parse_cv_design_from_vision(image_jpeg: bytes, user_id: str | None = None) -> tuple[None, dict]:
    """
    Gemini Vision : classification design (pas de layout mm).
    Retourne (None, detection).
    """
    from backend.gemini_usage import ensure_budget, usage_from_response
    from backend.services.adapter import _extract_json

    ensure_budget(user_id)
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key or not image_jpeg:
        return None, {}

    try:
        from google import genai
        from google.genai import types
    except ImportError:
        logger.warning("cv_import_layout_vision: google-genai indisponible")
        return None, {}

    client = genai.Client(api_key=api_key)
    image_part = types.Part.from_bytes(data=image_jpeg, mime_type="image/jpeg")
    contents = [image_part, CV_DESIGN_VISION_PROMPT]

    response = None
    last_error = None
    for model_id in GEMINI_MODELS_VISION:
        try:
            response = client.models.generate_content(
                model=model_id,
                contents=contents,
                config=types.GenerateContentConfig(temperature=0.1),
            )
            break
        except Exception as exc:
            last_error = exc
            err = str(exc).upper()
            if "404" in err or "NOT_FOUND" in err:
                continue
            logger.warning("cv_import_layout_vision: Gemini %s: %s", model_id, exc)
            return None, {}

    if not response or not getattr(response, "text", None):
        if last_error:
            logger.warning("cv_import_layout_vision: aucune réponse vision: %s", last_error)
        return None, {}

    inp, out = usage_from_response(response)
    if inp or out:
        from backend.db import record_gemini_usage

        record_gemini_usage(user_id, "import_vision", inp, out)

    parsed = _extract_json(response.text)
    detection = normalize_vision_detection(parsed)
    return None, detection


# Alias rétrocompat (ne renvoie plus de layout brut)
def parse_cv_layout_from_vision(
    image_jpeg: bytes, user_id: str | None = None
) -> tuple[dict | None, dict]:
    return parse_cv_design_from_vision(image_jpeg, user_id)
