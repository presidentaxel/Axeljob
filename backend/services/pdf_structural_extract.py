"""
Import CV Canva - reconstruction *déterministe* du layout v3 depuis un PDF natif.

Aucune IA : on lit directement les instructions du PDF via PyMuPDF (fitz) -
texte positionné, polices, couleurs, rectangles de fond, images - et on les
transpose 1:1 en blocs canvas v3 (coordonnées en millimètres, origine haut-gauche).

C'est un vrai "copier-coller" visuel du PDF, contrairement à l'approche vision
(Gemini devine un template) qui restait approximative.

Limites :
- PDF *scanné* (image sans couche texte) → pas de texte extractible → retourne None
  (le caller peut alors retomber sur la vision / preset).
- Polices non standard : on mappe sur une stack générique (Inter/serif/mono).
"""

from __future__ import annotations

import base64
import html
import logging
from typing import Any

from backend.services.pdf_font_embed import embedded_family_for, extract_embedded_fonts

logger = logging.getLogger(__name__)

PAGE_W_MM = 210.0
PAGE_H_MM = 297.0
MM_PER_PT = 25.4 / 72.0

# Garde-fous (évite de polluer le canvas avec des micro-artefacts vectoriels).
MIN_SHAPE_AREA_MM2 = 12.0
LINE_MAX_THICKNESS_MM = 1.6
# Surface mini d'un rectangle plein pour être considéré comme bandeau/fond
# structurel (sidebar, header). En dessous = petit encart/icône → ignoré
# (évite de polluer le canvas avec des micro-rectangles).
BACKGROUND_MIN_AREA_MM2 = 500.0
# Au-delà de cette fraction de la page, un rectangle est le fond de page → ignoré.
PAGE_BG_AREA_RATIO = 0.82
# Longueur mini (mm) d'un trait pour être gardé comme filet de séparation.
MIN_SEPARATOR_LEN_MM = 25.0
MIN_TEXT_CHARS_FOR_NATIVE = 40
MAX_PAGES = 3
MAX_IMAGES_PER_DOC = 8
MAX_IMAGE_BYTES = 350_000
# Fond graphique rasterisé (texte retiré) : résolution et poids max.
BG_RENDER_SCALE = 2.5
MAX_BG_BYTES = 520_000

# Flags de span PyMuPDF (cf. doc fitz).
_FLAG_ITALIC = 1 << 1
_FLAG_BOLD = 1 << 4


def _int_color_to_hex(color: int | None) -> str:
    if not isinstance(color, int):
        return "#1a1a1a"
    return f"#{(color & 0xFFFFFF):06x}"


def _float_rgb_to_hex(value: Any) -> str | None:
    """Convertit un fill PyMuPDF (tuple flottants 0..1, gris ou rgb) en hex."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        v = max(0, min(255, round(float(value) * 255)))
        return f"#{v:02x}{v:02x}{v:02x}"
    if isinstance(value, (tuple, list)):
        if len(value) == 1:
            v = max(0, min(255, round(float(value[0]) * 255)))
            return f"#{v:02x}{v:02x}{v:02x}"
        if len(value) >= 3:
            r, g, b = (max(0, min(255, round(float(c) * 255))) for c in value[:3])
            return f"#{r:02x}{g:02x}{b:02x}"
    return None


def _is_near_white(hex_color: str | None) -> bool:
    if not hex_color or len(hex_color) != 7:
        return False
    try:
        r = int(hex_color[1:3], 16)
        g = int(hex_color[3:5], 16)
        b = int(hex_color[5:7], 16)
    except ValueError:
        return False
    return r >= 248 and g >= 248 and b >= 248


def _font_family_from_name(font_name: str) -> str | None:
    name = (font_name or "").lower()
    if "mono" in name or "courier" in name or "consol" in name:
        return "'Courier New', monospace"
    if (
        "times" in name
        or "georgia" in name
        or "serif" in name
        or "garamond" in name
        or "minion" in name
        or "cambria" in name
    ):
        return "Georgia, 'Times New Roman', serif"
    return None  # défaut : stack sans-serif gérée côté thème


def _span_is_bold(span: dict) -> bool:
    flags = int(span.get("flags", 0) or 0)
    if flags & _FLAG_BOLD:
        return True
    name = str(span.get("font", "")).lower()
    return "bold" in name or "black" in name or "heavy" in name or "semibold" in name


def _span_is_italic(span: dict) -> bool:
    flags = int(span.get("flags", 0) or 0)
    if flags & _FLAG_ITALIC:
        return True
    name = str(span.get("font", "")).lower()
    return "italic" in name or "oblique" in name


def _fit_factor(page_width_pt: float, page_height_pt: float) -> float:
    """Facteur (≤1) pour faire tenir une page non-A4 dans l'A4 (210×297mm).

    Ne s'applique PAS à la conversion pt→mm : seulement à la réduction
    homothétique d'une page plus grande que l'A4.
    """
    w_mm = page_width_pt * MM_PER_PT
    h_mm = page_height_pt * MM_PER_PT
    if w_mm <= 0 or h_mm <= 0:
        return 1.0
    return min(PAGE_W_MM / w_mm, PAGE_H_MM / h_mm, 1.0)


def _extract_text_blocks(
    page, pos_scale: float, font_scale: float, embedded_roots: set[str] | None = None
) -> tuple[list[dict], int]:
    """Une ligne PDF = un bloc texte canvas. Retourne (blocs, nb_chars).

    - ``pos_scale`` (= MM_PER_PT × fit) : conversion des positions pt→mm.
    - ``font_scale`` (= fit) : la taille de police RESTE en points (CSS pt),
      on n'applique que la réduction homothétique éventuelle.
    - ``embedded_roots`` : familles de police embarquées (rendu fidèle).
    """
    roots = embedded_roots or set()
    blocks: list[dict] = []
    char_count = 0
    data = page.get_text("dict")
    for raw_block in data.get("blocks", []):
        if raw_block.get("type") != 0:  # 0 = texte
            continue
        for line in raw_block.get("lines", []):
            spans = [s for s in line.get("spans", []) if str(s.get("text", "")).strip()]
            if not spans:
                continue
            x0, y0, x1, y1 = line.get("bbox", (0, 0, 0, 0))
            text = "".join(s.get("text", "") for s in spans).strip()
            if not text:
                continue
            char_count += len(text)

            # Style dominant = span qui porte le plus de caractères (et non le
            # plus grand) : un simple tiret en 14pt ne doit pas imposer sa
            # taille à toute une ligne rédigée en 9.5pt.
            lead = max(
                spans,
                key=lambda s: (len(str(s.get("text", "")).strip()), float(s.get("size", 0) or 0)),
            )
            size_pt = float(lead.get("size", 10) or 10) * font_scale
            style: dict[str, Any] = {
                "font_size": round(size_pt, 1),
                "color": _int_color_to_hex(lead.get("color")),
                "align": "left",
                # Une ligne PDF = une ligne canvas. La police web (Inter) est un
                # peu plus large que celle du PDF : sans ça le texte reviendrait
                # à la ligne et chevaucherait le bloc suivant (positions figées).
                "nowrap": True,
            }
            lead_font = str(lead.get("font", ""))
            emb_family = embedded_family_for(lead_font, roots)
            if emb_family:
                style["font_family"] = emb_family
            else:
                fam = _font_family_from_name(lead_font)
                if fam:
                    style["font_family"] = fam
            # Gras/italique d'après le span DOMINANT (le plus de caractères) :
            # une simple étiquette grasse en tête de ligne ne doit pas rendre
            # tout le texte gras (sinon mauvaise graisse → glyphes manquants).
            if _span_is_bold(lead):
                style["bold"] = True
            if _span_is_italic(lead):
                style["italic"] = True

            # Largeur = largeur réelle du texte + marge (padding interne du bloc
            # 1.5mm/côté + jeu pour la police web légèrement plus large).
            w_mm = max(4.0, (x1 - x0) * pos_scale + 5.0)
            line_h_mm = max((y1 - y0) * pos_scale, size_pt * MM_PER_PT * 1.05)
            x_mm = max(0.0, x0 * pos_scale)
            y_mm = max(0.0, y0 * pos_scale)
            blocks.append(
                {
                    "type": "text",
                    "content": html.escape(text),
                    "x": round(x_mm, 2),
                    "y": round(y_mm, 2),
                    "w": round(min(w_mm, PAGE_W_MM), 2),
                    "h": round(max(3.0, line_h_mm), 2),
                    "z": 3,
                    "style": style,
                }
            )
    return blocks, char_count


def _shape_block_from_box(
    x0_pt: float,
    y0_pt: float,
    x1_pt: float,
    y1_pt: float,
    scale: float,
    color: str,
) -> dict | None:
    """Construit un bloc forme depuis une box en points (rect ou trait épais)."""
    x_lo, x_hi = sorted((x0_pt, x1_pt))
    y_lo, y_hi = sorted((y0_pt, y1_pt))
    w_mm = (x_hi - x_lo) * scale
    h_mm = (y_hi - y_lo) * scale
    if w_mm <= 0 or h_mm <= 0:
        return None

    area = w_mm * h_mm
    thin = min(w_mm, h_mm) <= LINE_MAX_THICKNESS_MM

    # Fond de page entier → on ne le reproduit pas (il masquerait tout).
    if area > (PAGE_W_MM * PAGE_H_MM * PAGE_BG_AREA_RATIO):
        return None
    # Micro-artefacts vectoriels.
    if area < MIN_SHAPE_AREA_MM2 and not thin:
        return None
    # Rectangle plein ni fin (filet) ni assez grand (bandeau) → encart parasite.
    if not thin and area < BACKGROUND_MIN_AREA_MM2:
        return None
    horizontal = w_mm >= h_mm
    x_mm = max(0.0, x_lo * scale)
    y_mm = max(0.0, y_lo * scale)

    # Trait fin horizontal → shape:line (barre fine), sinon rectangle.
    if thin and horizontal:
        return {
            "type": "shape:line",
            "x": round(x_mm, 2),
            "y": round(y_mm, 2),
            "w": round(min(w_mm, PAGE_W_MM), 2),
            "h": round(max(h_mm, 0.3), 2),
            "z": 1,
            "style": {"color": color, "stroke_width": round(max(h_mm, 0.3), 2)},
        }
    return {
        "type": "shape:rect",
        "x": round(x_mm, 2),
        "y": round(y_mm, 2),
        "w": round(max(min(w_mm, PAGE_W_MM), 0.3), 2),
        "h": round(max(min(h_mm, PAGE_H_MM), 0.3), 2),
        "z": 1 if thin else 0,
        "style": {"color": color},
    }


def _line_block_from_segment(
    p1, p2, stroke_width_pt: float, scale: float, color: str
) -> dict | None:
    """Trait (segment) tracé → bloc fin. Gère horizontal et vertical."""
    x0, y0 = float(p1.x), float(p1.y)
    x1, y1 = float(p2.x), float(p2.y)
    thickness_pt = max(stroke_width_pt, 0.5)
    if abs(y1 - y0) <= abs(x1 - x0):  # horizontal
        y0 -= thickness_pt / 2
        y1 = y0 + thickness_pt
    else:  # vertical
        x0 -= thickness_pt / 2
        x1 = x0 + thickness_pt
    return _shape_block_from_box(x0, y0, x1, y1, scale, color)


def _frame_strips_from_rects(r_a, r_b, scale: float, color: str) -> list[dict]:
    """Deux rectangles imbriqués remplis en *even-odd* = un cadre/filet.

    Seule la différence (outer − inner) est réellement peinte. On émet donc une
    fine bande par bord présentant un écart (souvent un seul → soulignement de
    section), au lieu de deux gros rectangles pleins.
    """
    a_a = (r_a.x1 - r_a.x0) * (r_a.y1 - r_a.y0)
    a_b = (r_b.x1 - r_b.x0) * (r_b.y1 - r_b.y0)
    outer, inner = (r_a, r_b) if a_a >= a_b else (r_b, r_a)

    # (x0, y0, x1, y1) en points pour chaque bord du cadre.
    edges = [
        (outer.x0, outer.y0, inner.x0, outer.y1),  # gauche
        (inner.x1, outer.y0, outer.x1, outer.y1),  # droite
        (outer.x0, outer.y0, outer.x1, inner.y0),  # haut
        (outer.x0, inner.y1, outer.x1, outer.y1),  # bas
    ]
    out: list[dict] = []
    for x0, y0, x1, y1 in edges:
        if (x1 - x0) <= 0.2 or (y1 - y0) <= 0.2:  # bord sans écart (en points)
            continue
        blk = _shape_block_from_box(x0, y0, x1, y1, scale, color)
        if blk:
            out.append(blk)
    return out


def _extract_shape_blocks(page, scale: float) -> list[dict]:
    """Rectangles pleins (sidebar, bandeau), filets/soulignements + séparateurs.

    Cas gérés par chemin (``get_drawings``) :
    - 1 rectangle plein → fond (header, sidebar) tel quel ;
    - 2 rectangles imbriqués (even-odd) → cadre/filet : seule la fine
      différence est peinte (cf. ``_frame_strips_from_rects``) ;
    - segments tracés → filets de séparation horizontaux.
    """
    blocks: list[dict] = []
    try:
        drawings = page.get_drawings()
    except Exception as exc:  # pragma: no cover - dépend du PDF
        logger.debug("pdf_structural_extract: get_drawings échoué: %s", exc)
        return blocks

    for d in drawings:
        fill_hex = _float_rgb_to_hex(d.get("fill")) if d.get("fill") is not None else None
        stroke_hex = _float_rgb_to_hex(d.get("color")) if d.get("color") is not None else None
        stroke_w_pt = float(d.get("width") or 0)

        items = [it for it in d.get("items", []) if it]
        re_items = [it[1] for it in items if it[0] == "re"]
        line_items = [it for it in items if it[0] == "l"]

        if fill_hex and not _is_near_white(fill_hex):
            if len(re_items) == 1:
                r = re_items[0]
                blk = _shape_block_from_box(r.x0, r.y0, r.x1, r.y1, scale, fill_hex)
                if blk:
                    blocks.append(blk)
            elif len(re_items) == 2:
                blocks.extend(_frame_strips_from_rects(re_items[0], re_items[1], scale, fill_hex))
            # ≥3 rectangles = art vectoriel complexe → ignoré (pollution).

        if stroke_hex and not _is_near_white(stroke_hex):
            # Un chemin avec rectangle(s) ou ≥3 segments = cadre → on ignore ses
            # traits (on ne sait pas rendre un contour proprement).
            is_frame = bool(re_items) or len(line_items) >= 3
            if not is_frame:
                for item in line_items:
                    p1, p2 = item[1], item[2]
                    # Filets de séparation horizontaux assez longs seulement.
                    dx = abs(float(p2.x) - float(p1.x))
                    dy = abs(float(p2.y) - float(p1.y))
                    if dy > dx or dx * scale < MIN_SEPARATOR_LEN_MM:
                        continue
                    blk = _line_block_from_segment(p1, p2, stroke_w_pt, scale, stroke_hex)
                    if blk:
                        blocks.append(blk)
    return blocks


def _pixmap_to_data_url(pix) -> str | None:
    import fitz

    try:
        if pix.n >= 5:  # CMYK / autres → RGB
            pix = fitz.Pixmap(fitz.csRGB, pix)
        if pix.alpha:
            pix = fitz.Pixmap(pix, 0)
        # On privilégie le PNG ; si trop lourd, repli JPEG, sinon on abandonne
        # l'image (le canvas reste fidèle pour le texte et les formes).
        data = pix.tobytes("png")
        if len(data) > MAX_IMAGE_BYTES:
            data = pix.tobytes("jpeg")
        if len(data) > MAX_IMAGE_BYTES:
            return None
        b64 = base64.b64encode(data).decode("ascii")
        mime = "image/png" if data[:4] == b"\x89PNG" else "image/jpeg"
        return f"data:{mime};base64,{b64}"
    except Exception as exc:  # pragma: no cover - dépend du PDF
        logger.debug("pdf_structural_extract: image encode échoué: %s", exc)
        return None


def _extract_image_blocks(page, doc, scale: float, budget: list[int]) -> list[dict]:
    """Images embarquées (photo, logos) → blocs image data-URL."""
    import fitz

    blocks: list[dict] = []
    try:
        images = page.get_images(full=True)
    except Exception:  # pragma: no cover
        return blocks

    for img in images:
        if budget[0] <= 0:
            break
        xref = img[0]
        try:
            rects = page.get_image_rects(xref)
        except Exception:
            rects = []
        if not rects:
            continue
        try:
            pix = fitz.Pixmap(doc, xref)
        except Exception:
            continue
        data_url = _pixmap_to_data_url(pix)
        if not data_url:
            continue
        rect = rects[0]
        w_mm = (rect.x1 - rect.x0) * scale
        h_mm = (rect.y1 - rect.y0) * scale
        if w_mm <= 2 or h_mm <= 2:
            continue
        ratio = w_mm / h_mm if h_mm else 1
        shape = "circle" if 0.85 <= ratio <= 1.18 else "rect"
        blocks.append(
            {
                "type": "image",
                "image_src": data_url,
                "x": round(max(0.0, rect.x0 * scale), 2),
                "y": round(max(0.0, rect.y0 * scale), 2),
                "w": round(min(w_mm, PAGE_W_MM), 2),
                "h": round(min(h_mm, PAGE_H_MM), 2),
                "z": 2,
                "style": {"shape": shape},
            }
        )
        budget[0] -= 1
    return blocks


def _render_decoration_background(page, scale: float) -> dict | None:
    """Rasterise la couche graphique de la page (texte retiré) en image de fond.

    On retire le texte par *redaction* (sans repeindre de fond, ``fill=False``)
    tout en conservant images et tracés vectoriels, puis on rend la page en PNG.
    Résultat : sidebar, photo, filets, icônes, puces, timelines… reproduits au
    pixel près, sur lesquels on superpose ensuite le texte éditable.

    ⚠️ Mute la page (texte supprimé) : appeler APRÈS l'extraction du texte.
    """
    import fitz

    try:
        for blk in page.get_text("dict").get("blocks", []):
            for line in blk.get("lines", []):
                for span in line.get("spans", []):
                    rect = fitz.Rect(span.get("bbox"))
                    if not rect.is_empty:
                        page.add_redact_annot(rect, fill=False)
        page.apply_redactions(
            images=fitz.PDF_REDACT_IMAGE_NONE,
            graphics=fitz.PDF_REDACT_LINE_ART_NONE,
            text=fitz.PDF_REDACT_TEXT_REMOVE,
        )
        pix = page.get_pixmap(matrix=fitz.Matrix(BG_RENDER_SCALE, BG_RENDER_SCALE), alpha=False)
    except Exception as exc:  # pragma: no cover - dépend du PDF
        logger.info("pdf_structural_extract: fond graphique non rendu: %s", exc)
        return None

    try:
        data = pix.tobytes("png")
        if len(data) > MAX_BG_BYTES:
            data = pix.tobytes("jpeg", jpg_quality=82)
    except Exception:  # pragma: no cover
        return None
    if not data or len(data) > MAX_BG_BYTES:
        return None

    b64 = base64.b64encode(data).decode("ascii")
    mime = "image/png" if data[:4] == b"\x89PNG" else "image/jpeg"
    w_mm = page.rect.width * scale
    h_mm = page.rect.height * scale
    return {
        "type": "image",
        "image_src": f"data:{mime};base64,{b64}",
        "x": 0.0,
        "y": 0.0,
        "w": round(min(w_mm, PAGE_W_MM), 2),
        "h": round(min(h_mm, PAGE_H_MM), 2),
        "z": 0,
        "style": {"shape": "rect", "decorative": True},
    }


def extract_layout_from_pdf(file_bytes: bytes, max_pages: int = MAX_PAGES) -> dict | None:
    """
    Reconstruit un layout v3 fidèle depuis un PDF natif (texte extractible).

    Retourne ``None`` si :
    - PyMuPDF indisponible,
    - PDF illisible,
    - trop peu de texte extractible (PDF scanné/rasterisé) → laisser un fallback agir.
    """
    if not file_bytes:
        return None
    try:
        import fitz
    except ImportError:
        logger.warning("pdf_structural_extract: PyMuPDF (fitz) indisponible")
        return None

    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
    except Exception as exc:
        logger.warning("pdf_structural_extract: ouverture PDF échouée: %s", exc)
        return None

    try:
        if doc.page_count < 1:
            return None
        pages_out: list[dict] = []
        total_chars = 0
        image_budget = [MAX_IMAGES_PER_DOC]
        n_pages = min(doc.page_count, max_pages)

        # Polices embarquées → rendu fidèle (mêmes largeurs que le PDF).
        try:
            font_faces, embedded_roots = extract_embedded_fonts(doc, max_pages=n_pages)
        except Exception as exc:  # pragma: no cover - dépend du PDF
            logger.info("pdf_structural_extract: extraction polices échouée: %s", exc)
            font_faces, embedded_roots = [], set()

        for page_index in range(n_pages):
            page = doc[page_index]
            fit = _fit_factor(page.rect.width, page.rect.height)
            pos_scale = MM_PER_PT * fit
            # Le texte D'ABORD (la rasterisation du fond retire ensuite le texte).
            text_blocks, chars = _extract_text_blocks(page, pos_scale, fit, embedded_roots)
            total_chars += chars
            # Couche graphique complète (sidebar, photo, filets, icônes, puces)
            # rasterisée en un fond fidèle ; repli vectoriel si échec.
            bg_block = _render_decoration_background(page, pos_scale)
            if bg_block:
                blocks = [bg_block, *text_blocks]
            else:
                shape_blocks = _extract_shape_blocks(page, pos_scale)
                image_blocks = _extract_image_blocks(page, doc, pos_scale, image_budget)
                blocks = [*shape_blocks, *image_blocks, *text_blocks]
            if not blocks:
                continue
            pages_out.append({"id": f"page_{page_index + 1}", "blocks": blocks})

        if not pages_out or total_chars < MIN_TEXT_CHARS_FOR_NATIVE:
            logger.info("pdf_structural_extract: PDF non natif (chars=%s) - fallback", total_chars)
            return None

        return {
            "version": 3,
            "format": "A4",
            "grid": "free",
            "unit": "mm",
            # Copie fidèle : positions absolues à préserver (pas de reflow colonne).
            "freeform": True,
            # Polices du PDF (data-URL) à injecter en @font-face côté frontend.
            "fonts": font_faces,
            "pages": pages_out,
            "theme": {
                "template_id": "imported",
                "font_heading": "Inter, sans-serif",
                "font_body": "Inter, sans-serif",
                "color_body": "#1a1a1a",
            },
            "source": "pdf_structural",
        }
    finally:
        doc.close()
