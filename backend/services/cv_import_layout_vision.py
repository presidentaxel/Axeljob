"""
Import CV Canva — reconstruction de layout v3 via Gemini Vision (page PDF rasterisée).

Complète l'import texte : positions, couleurs, blocs décoratifs et sections sémantiques.
"""

from __future__ import annotations

import io
import logging
import os
import re
from typing import Any

from backend.config import GEMINI_MODELS_VISION

logger = logging.getLogger(__name__)

PAGE_W_MM = 210.0
PAGE_H_MM = 297.0

VALID_BLOCK_TYPES = frozenset(
    {
        "identity",
        "photo",
        "contact",
        "resume",
        "experiences",
        "formations",
        "certifications",
        "projets",
        "skills",
        "languages",
        "text",
        "title",
        "image",
        "shape:line",
        "shape:rect",
        "icon",
        "qrcode",
    }
)

SEMANTIC_BIND_DEFAULTS: dict[str, str | list[str]] = {
    "identity": ["prenom", "nom", "titre_professionnel"],
    "photo": "photo_url",
    "contact": ["email", "telephone", "linkedin"],
    "resume": "resume",
    "experiences": "experiences",
    "formations": "formations",
    "certifications": "certifications",
    "projets": "projets",
    "languages": "competences.langues",
}

CV_LAYOUT_VISION_PROMPT = """Tu es un expert en analyse visuelle de CV imprimés (format A4, 210 mm × 297 mm).
L'image jointe est la première page d'un CV.

Ta mission : reproduire la MISE EN PAGE visible (géométrie, couleurs, structure) sous forme de layout canvas v3.
Tu ne dois PAS recopier le texte du CV dans les blocs — uniquement des blocs liés au profil via `bind`.

Retourne UNIQUEMENT un JSON valide (pas de markdown) avec cette structure :
{
  "layout": {
    "version": 3,
    "format": "A4",
    "grid": "free",
    "unit": "mm",
    "theme": {
      "font_heading": "Inter, sans-serif",
      "font_body": "Inter, sans-serif",
      "color_accent": "#RRGGBB",
      "color_header": "#RRGGBB",
      "color_sidebar": "#RRGGBB",
      "color_section_title": "#RRGGBB",
      "color_body": "#1a1a1a",
      "template_id": "imported"
    },
    "pages": [{
      "id": "page_import_1",
      "blocks": [
        {
          "id": "blk_sidebar_bg",
          "type": "shape:rect",
          "x": 0, "y": 0, "w": 53, "h": 297, "z": 0,
          "style": { "color": "#2d3748" }
        },
        {
          "id": "blk_identity",
          "type": "identity",
          "bind": ["prenom", "nom", "titre_professionnel"],
          "x": 8, "y": 38, "w": 37, "h": 22, "z": 2,
          "style": { "zone": "sidebar", "align": "center", "font_size": 13, "color": "#ffffff", "section_label": "" }
        }
      ]
    }]
  },
  "detection": {
    "layout_style": "sidebar-left|sidebar-right|single-column|header-band",
    "confidence": 0.85,
    "dominant_colors": {
      "accent": "#RRGGBB",
      "sidebar": "#RRGGBB",
      "header": "#RRGGBB",
      "body_text": "#1a1a1a"
    },
    "sections_found": ["identity", "contact", "experiences", "formations", "skills"]
  }
}

Règles OBLIGATOIRES :
1. Coordonnées en millimètres, origine coin haut-gauche, page 210×297 max.
2. Types autorisés : identity, photo, contact, resume, experiences, formations, certifications, projets, skills, languages, text, title, shape:rect, shape:line, icon.
3. Blocs sémantiques : TOUJOURS `bind` (jamais de texte en dur). skills → bind "competences.techniques" ou "competences.logiciels" selon la section visible.
4. shape:rect z=0 pour fonds sidebar/header pleine page ou bandeau ; shape:line z=1 pour séparateurs.
5. photo : style.shape "circle" si photo ronde ; zone "sidebar" ou "header" selon position.
6. style utiles : zone (sidebar|main|header|sidebar-light), section_label (titre visible EN MAJUSCULES), title_style (underline-accent|creative-main|executive-main|minimal-section|elegant-section), align, font_size (8-20), color (hex), list_format (list|chips), format (chips pour tags).
7. Détecte TOUTES les zones visibles : sidebar colorée, bandeau header, colonnes, lignes d'accent.
8. 10 à 22 blocs sur la page 1. Chaque section visible du CV = 1 bloc sémantique dimensionné à sa zone.
9. theme : extraire les vraies couleurs dominantes du PDF (sidebar, accent, titres).
10. detection.confidence entre 0 et 1 selon ta certitude sur la structure.
11. Ne pas inventer de sections absentes de l'image.

Archétypes courants :
- sidebar-left (modern/classic) : barre ~50mm à gauche, contenu principal à droite.
- sidebar-right (executive) : bandeau header + sidebar droite ~50mm.
- single-column (minimal/elegant) : une colonne centrée, titres soulignés.
- header-band : bandeau coloré en haut ~45-55mm, corps en dessous.
"""


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def pdf_first_page_to_jpeg_bytes(
    file_bytes: bytes, dpi: int = 144, max_long_side: int = 1400
) -> bytes | None:
    """Rasterise la page 1 du PDF en JPEG (pdfplumber + Pillow, pas de PyMuPDF requis)."""
    try:
        import pdfplumber
        from PIL import Image
    except ImportError:
        logger.warning("cv_import_layout_vision: pdfplumber/Pillow indisponible")
        return None

    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            if not pdf.pages:
                return None
            page = pdf.pages[0]
            page_image = page.to_image(resolution=dpi)
            pil: Image.Image = page_image.original
            w, h = pil.size
            if max(w, h) > max_long_side:
                pil = pil.copy()
                pil.thumbnail((max_long_side, max_long_side), Image.Resampling.LANCZOS)
            buf = io.BytesIO()
            pil.convert("RGB").save(buf, format="JPEG", quality=90)
            return buf.getvalue()
    except Exception as exc:
        logger.warning("cv_import_layout_vision: rasterize PDF échoué: %s", exc)
        return None


def _is_valid_hex(color: str) -> bool:
    return bool(re.fullmatch(r"#[0-9a-fA-F]{6}", str(color or "").strip()))


def _normalize_block(raw: dict, index: int) -> dict | None:
    if not isinstance(raw, dict):
        return None
    btype = str(raw.get("type") or "").strip()
    if btype not in VALID_BLOCK_TYPES:
        return None

    w = _clamp(float(raw.get("w") or 20), 3.0, PAGE_W_MM)
    h = _clamp(float(raw.get("h") or 10), 3.0, PAGE_H_MM)
    x = _clamp(float(raw.get("x") or 0), 0.0, PAGE_W_MM - w)
    y = _clamp(float(raw.get("y") or 0), 0.0, PAGE_H_MM - h)
    z = max(0, int(float(raw.get("z") or 1)))

    block: dict[str, Any] = {
        "id": str(raw.get("id") or f"blk_import_{index}"),
        "type": btype,
        "x": round(x, 2),
        "y": round(y, 2),
        "w": round(w, 2),
        "h": round(h, 2),
        "z": z,
        "style": raw.get("style") if isinstance(raw.get("style"), dict) else {},
    }

    if btype in SEMANTIC_BIND_DEFAULTS and not raw.get("bind"):
        block["bind"] = SEMANTIC_BIND_DEFAULTS[btype]
    elif raw.get("bind") is not None:
        block["bind"] = raw["bind"]

    if btype == "skills" and not block.get("bind"):
        block["bind"] = "competences.techniques"

    if isinstance(raw.get("content"), str):
        block["content"] = raw["content"]

    return block


def normalize_vision_layout_payload(parsed: dict | None) -> tuple[dict | None, dict]:
    """Valide et normalise la réponse vision → (layout v3, meta)."""
    if not isinstance(parsed, dict):
        return None, {}

    detection = parsed.get("detection") if isinstance(parsed.get("detection"), dict) else {}
    layout_raw = parsed.get("layout") if isinstance(parsed.get("layout"), dict) else parsed

    pages_in = layout_raw.get("pages") if isinstance(layout_raw.get("pages"), list) else []
    if not pages_in:
        return None, detection

    pages_out = []
    for pi, page in enumerate(pages_in):
        if not isinstance(page, dict):
            continue
        blocks_in = page.get("blocks") if isinstance(page.get("blocks"), list) else []
        blocks_out = []
        for bi, blk in enumerate(blocks_in):
            normalized = _normalize_block(blk, pi * 100 + bi)
            if normalized:
                blocks_out.append(normalized)
        if not blocks_out:
            continue
        pages_out.append(
            {
                "id": str(page.get("id") or f"page_import_{pi + 1}"),
                "blocks": blocks_out,
            }
        )

    if not pages_out:
        return None, detection

    theme_in = layout_raw.get("theme") if isinstance(layout_raw.get("theme"), dict) else {}
    theme_out: dict[str, str] = {
        "font_heading": str(theme_in.get("font_heading") or "Inter, sans-serif"),
        "font_body": str(theme_in.get("font_body") or "Inter, sans-serif"),
        "color_accent": theme_in.get("color_accent") or "#1e2a3a",
        "color_header": theme_in.get("color_header") or theme_in.get("color_accent") or "#1e2a3a",
        "color_sidebar": theme_in.get("color_sidebar") or "#f4f4f2",
        "color_section_title": theme_in.get("color_section_title")
        or theme_in.get("color_accent")
        or "#1e2a3a",
        "color_body": theme_in.get("color_body") or "#1a1a1a",
        "template_id": "imported",
    }
    for key in (
        "color_accent",
        "color_header",
        "color_sidebar",
        "color_section_title",
        "color_body",
    ):
        val = str(theme_out.get(key) or "")
        if val and not _is_valid_hex(val):
            if key == "color_body":
                theme_out[key] = "#1a1a1a"
            elif key == "color_sidebar":
                theme_out[key] = "#f4f4f2"
            else:
                theme_out[key] = "#1e2a3a"

    dom = (
        detection.get("dominant_colors")
        if isinstance(detection.get("dominant_colors"), dict)
        else {}
    )
    if _is_valid_hex(dom.get("accent")):
        theme_out["color_accent"] = dom["accent"]
        theme_out["color_section_title"] = dom["accent"]
    if _is_valid_hex(dom.get("sidebar")):
        theme_out["color_sidebar"] = dom["sidebar"]
    if _is_valid_hex(dom.get("header")):
        theme_out["color_header"] = dom["header"]
    if _is_valid_hex(dom.get("body_text")):
        theme_out["color_body"] = dom["body_text"]

    layout = {
        "version": 3,
        "format": "A4",
        "grid": "free",
        "unit": "mm",
        "theme": theme_out,
        "pages": pages_out,
    }

    try:
        confidence = float(detection.get("confidence", 0))
    except (TypeError, ValueError):
        confidence = 0.0
    detection["confidence"] = _clamp(confidence, 0.0, 1.0)

    semantic_count = sum(
        1 for p in pages_out for b in p["blocks"] if b["type"] in SEMANTIC_BIND_DEFAULTS
    )
    if semantic_count == 0:
        detection["confidence"] = min(detection["confidence"], 0.15)
    elif semantic_count < 2:
        detection["confidence"] = min(detection["confidence"], 0.45)

    return layout, detection


def detection_to_layout_hints(detection: dict) -> dict:
    """Convertit detection vision → layout_hints compatibles frontend."""
    hints: dict[str, Any] = {}
    style = str(detection.get("layout_style") or "").strip()
    if style:
        hints["layout_style"] = style
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
    sections = detection.get("sections_found")
    if isinstance(sections, list) and sections:
        hints["sections_emphasis"] = [str(s) for s in sections if s][:8]
    return hints


def parse_cv_layout_from_vision(
    image_jpeg: bytes, user_id: str | None = None
) -> tuple[dict | None, dict]:
    """
    Appelle Gemini Vision sur l'image JPEG de la page 1.
    Retourne (layout v3 normalisé ou None, meta detection).
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
    contents = [image_part, CV_LAYOUT_VISION_PROMPT]

    response = None
    for model_id in GEMINI_MODELS_VISION:
        try:
            response = client.models.generate_content(
                model=model_id,
                contents=contents,
                config=types.GenerateContentConfig(temperature=0.15),
            )
            break
        except Exception as exc:
            err = str(exc).upper()
            if "404" in err or "NOT_FOUND" in err:
                continue
            logger.warning("cv_import_layout_vision: Gemini %s: %s", model_id, exc)
            return None, {}

    if not response or not getattr(response, "text", None):
        return None, {}

    inp, out = usage_from_response(response)
    if inp or out:
        from backend.db import record_gemini_usage

        record_gemini_usage(user_id, "import_vision", inp, out)

    parsed = _extract_json(response.text)
    layout, detection = normalize_vision_layout_payload(parsed)
    if layout:
        detection["source"] = "gemini_vision"
    return layout, detection
