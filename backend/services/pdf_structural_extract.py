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
import re
from typing import Any

from backend.services.pdf_font_embed import embedded_family_for, extract_embedded_fonts

logger = logging.getLogger(__name__)

PAGE_W_MM = 210.0
PAGE_H_MM = 297.0
MM_PER_PT = 25.4 / 72.0

# Garde-fous (évite de polluer le canvas avec des micro-artefacts vectoriels).
MIN_SHAPE_AREA_MM2 = 12.0
LINE_MAX_THICKNESS_MM = 1.6
MAX_BULLET_MM = 6.5
MAX_ICON_MM = 16.0
MIN_ICON_MM = 3.0
# Au-delà, un pictogramme carré n'est plus une icône contact mais un masque photo.
MAX_CONTACT_ICON_MM = 10.0
# Surface mini d'un rectangle plein pour être considéré comme bandeau/fond
# structurel (sidebar, header). En dessous = petit encart/icône → ignoré
# (évite de polluer le canvas avec des micro-rectangles).
BACKGROUND_MIN_AREA_MM2 = 500.0
# Au-delà de cette fraction de la page, un rectangle est le fond de page → ignoré.
PAGE_BG_AREA_RATIO = 0.82
# Longueur mini (mm) d'un trait pour être gardé comme filet de séparation.
MIN_SEPARATOR_LEN_MM = 8.0
MIN_TEXT_CHARS_FOR_NATIVE = 40
MAX_PAGES = 3
# Doit matcher `padding-top` des blocs texte (FreeCanvas.css / layout_renderer).
CSS_TEXT_PAD_TOP_MM = 1.0
# Puce à gauche du texte : écart max (mm) et tolérance verticale pour l'alignement.
MAX_GUTTER_GAP_MM = 14.0
MAX_BULLET_ALIGN_DY_MM = 8.0
_BULLET_GLYPH_RE = re.compile(r"^[•●○◦▪■‣▸∙·\-–—*]$")
MAX_IMAGES_PER_DOC = 8
MAX_IMAGE_BYTES = 350_000
# Fond graphique rasterisé (texte retiré) : résolution et poids max.
BG_RENDER_SCALE = 2.5
MAX_BG_BYTES = 520_000
# Décomposition de la couche graphique en blocs déplaçables indépendamment.
CUTOUT_RENDER_SCALE = 3.0
CLUSTER_GAP_PT = 7.0
MAX_CUTOUTS = 90
MAX_CUTOUT_TOTAL_BYTES = 480_000
# Taille typique d'une photo de profil importée (mm).
MIN_PHOTO_MM = 12.0
MAX_PHOTO_MM = 90.0

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
    if isinstance(value, int | float):
        v = max(0, min(255, round(float(value) * 255)))
        return f"#{v:02x}{v:02x}{v:02x}"
    if isinstance(value, tuple | list):
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


def _is_near_body_black(hex_color: str | None) -> bool:
    """Noir pur ou gris très sombre (texte corps) : pas une couleur d'accent."""
    if not hex_color or len(hex_color) != 7:
        return True
    try:
        r = int(hex_color[1:3], 16)
        g = int(hex_color[3:5], 16)
        b = int(hex_color[5:7], 16)
    except ValueError:
        return True
    return r < 50 and g < 50 and b < 50


def _extract_theme_colors(page, scale: float) -> dict:
    """Lit les couleurs de design (accent, sidebar, header) directement dans les
    instructions vectorielles du PDF, AVANT toute rasterisation ou mutation de page.

    Fonctionne quel que soit le chemin de rendu (graphic_blocks / bg_block / shape_blocks).
    """
    try:
        drawings = page.get_drawings()
    except Exception:
        return {}

    page_area = PAGE_W_MM * PAGE_H_MM
    sidebar_color: str | None = None
    header_color: str | None = None
    # (couleur, poids) - poids = largeur ou longueur de la forme
    accent_candidates: list[tuple[str, float]] = []

    for d in drawings:
        rect = d.get("rect")
        if rect is None:
            continue
        w_mm = (rect.x1 - rect.x0) * scale
        h_mm = (rect.y1 - rect.y0) * scale

        items_raw = d.get("items", [])
        is_pure_segment = any(it[0] == "l" for it in items_raw if it) and not any(
            it[0] == "re" for it in items_raw if it
        )
        if (w_mm <= 0 or h_mm <= 0) and not is_pure_segment:
            continue
        if w_mm > 0 and h_mm > 0 and w_mm * h_mm > page_area * PAGE_BG_AREA_RATIO:
            continue  # fond de page entier → ignoré

        fill_hex = _float_rgb_to_hex(d.get("fill")) if d.get("fill") is not None else None
        stroke_hex = _float_rgb_to_hex(d.get("color")) if d.get("color") is not None else None

        color: str | None = None
        if fill_hex and not _is_near_white(fill_hex):
            color = fill_hex
        elif stroke_hex and not _is_near_white(stroke_hex):
            color = stroke_hex
        if not color:
            continue

        y_mm = rect.y0 * scale
        thin = min(w_mm, h_mm) <= LINE_MAX_THICKNESS_MM

        # Sidebar : grand rectangle vertical (gauche ou droite)
        if h_mm > PAGE_H_MM * 0.45 and w_mm < PAGE_W_MM * 0.4:
            if not sidebar_color:
                sidebar_color = color
        # Bandeau header : rectangle large et bas, en haut de page
        elif y_mm < 14 and h_mm < 80 and w_mm > PAGE_W_MM * 0.55:
            if not header_color:
                header_color = color
        # Filet de séparation explicite (type:line, mince et long)
        elif thin and max(w_mm, h_mm) >= MIN_SEPARATOR_LEN_MM:
            if not _is_near_body_black(color):
                accent_candidates.append((color, max(w_mm, h_mm)))
        # Barre horizontale épaisse (ratio w/h > 5 et ≥ 20mm)
        elif w_mm > h_mm * 5 and w_mm >= 20:
            if not _is_near_body_black(color):
                accent_candidates.append((color, w_mm))

    result: dict = {}
    if sidebar_color:
        result["color_sidebar"] = sidebar_color
    if header_color:
        result["color_header"] = header_color

    if accent_candidates:
        weights: dict[str, float] = {}
        for c, w in accent_candidates:
            weights[c] = weights.get(c, 0.0) + w
        best = max(weights, key=lambda c: weights[c])
        result["color_accent"] = best
        result["color_section_title"] = best
    elif header_color:
        result["color_accent"] = header_color
        result["color_section_title"] = header_color
    elif sidebar_color:
        result["color_accent"] = sidebar_color
        result["color_section_title"] = sidebar_color

    return result


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
            # Le CSS applique `padding: 1mm 1.5mm` sur les blocs texte (FreeCanvas.css).
            # Sans compensation, le texte s'affiche 1 mm PLUS BAS que sa position PDF,
            # ce qui fait paraître les shape:line 1 mm trop hauts par rapport au texte.
            # On décale le bloc vers le haut de 1 mm : après le padding CSS, le rendu
            # s'aligne exactement sur les coordonnées du PDF.
            y_mm = max(0.0, y0 * pos_scale - CSS_TEXT_PAD_TOP_MM)
            line_h_mm += CSS_TEXT_PAD_TOP_MM  # restaure l'espace en bas du bloc
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

    # Trait fin horizontal → shape:line (barre fine), vertical → shape:line orienté.
    # On stocke l'épaisseur réelle du PDF (min 0.05mm pour éviter zéro) ;
    # le rendu CSS applique un min-height/min-width de 1px pour la visibilité écran.
    if thin and horizontal:
        return {
            "type": "shape:line",
            "x": round(x_mm, 2),
            "y": round(y_mm, 2),
            "w": round(min(w_mm, PAGE_W_MM), 2),
            "h": round(max(h_mm, 0.05), 2),
            "z": 1,
            "style": {"color": color, "stroke_width": round(max(h_mm, 0.05), 2)},
        }
    if thin and not horizontal:
        return {
            "type": "shape:line",
            "x": round(x_mm, 2),
            "y": round(y_mm, 2),
            "w": round(max(w_mm, 0.05), 2),
            "h": round(min(h_mm, PAGE_H_MM), 2),
            "z": 1,
            "style": {
                "color": color,
                "stroke_width": round(max(w_mm, 0.05), 2),
                "orientation": "vertical",
            },
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


def _separator_block_from_line_items(
    line_items, scale: float, color: str, stroke_w_pt: float = 0.8
) -> dict | None:
    """Segments tracés (1 à N) → filet si la bbox est un trait fin assez long.

    Les filets de section Word/Canva sont souvent des chemins à 4 segments
    (rectangle fin) : l'ancienne logique ``len(line_items) >= 3`` les ignorait.
    """
    xs: list[float] = []
    ys: list[float] = []
    for it in line_items:
        if it[0] != "l":
            continue
        p1, p2 = it[1], it[2]
        xs.extend([float(p1.x), float(p2.x)])
        ys.extend([float(p1.y), float(p2.y)])
    if not xs:
        return None
    thickness_pt = max(stroke_w_pt, 0.5)
    x0, x1 = min(xs), max(xs)
    y0, y1 = min(ys), max(ys)
    if (y1 - y0) < thickness_pt * 0.5:
        mid_y = (y0 + y1) / 2
        y0 = mid_y - thickness_pt / 2
        y1 = mid_y + thickness_pt / 2
    elif (x1 - x0) < thickness_pt * 0.5:
        mid_x = (x0 + x1) / 2
        x0 = mid_x - thickness_pt / 2
        x1 = mid_x + thickness_pt / 2
    blk = _shape_block_from_box(x0, y0, x1, y1, scale, color)
    if not blk:
        return None
    long_side = max(blk["w"], blk["h"])
    if long_side < MIN_SEPARATOR_LEN_MM:
        return None
    return blk


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

        if stroke_hex and not _is_near_white(stroke_hex) and line_items and not re_items:
            blk = _separator_block_from_line_items(line_items, scale, stroke_hex, stroke_w_pt)
            if blk:
                blocks.append(blk)
                continue
        if stroke_hex and not _is_near_white(stroke_hex):
            is_frame = bool(re_items)
            if not is_frame:
                for item in line_items:
                    p1, p2 = item[1], item[2]
                    dx = abs(float(p2.x) - float(p1.x))
                    dy = abs(float(p2.y) - float(p1.y))
                    if dx * scale < MIN_SEPARATOR_LEN_MM and dy * scale < MIN_SEPARATOR_LEN_MM:
                        continue
                    blk = _line_block_from_segment(p1, p2, stroke_w_pt, scale, stroke_hex)
                    if blk:
                        blocks.append(blk)
    return blocks


def _pix_rgb_at(pix, x: int, y: int) -> tuple[int, int, int] | None:
    """Échantillon RGB (ou niveau de gris) à un pixel du pixmap."""
    if pix is None or pix.width <= 0 or pix.height <= 0:
        return None
    x = max(0, min(int(pix.width) - 1, int(x)))
    y = max(0, min(int(pix.height) - 1, int(y)))
    n = int(pix.n or 0)
    if n < 1:
        return None
    idx = (y * int(pix.width) + x) * n
    samples = pix.samples
    if idx + n > len(samples):
        return None
    if n >= 3:
        return int(samples[idx]), int(samples[idx + 1]), int(samples[idx + 2])
    g = int(samples[idx])
    return g, g, g


def _pix_alpha_at(pix, x: int, y: int) -> int | None:
    if pix is None or not getattr(pix, "alpha", False):
        return None
    x = max(0, min(int(pix.width) - 1, int(x)))
    y = max(0, min(int(pix.height) - 1, int(y)))
    n = int(pix.n or 0)
    if n < 4:
        return None
    idx = (y * int(pix.width) + x) * n
    samples = pix.samples
    if idx + 3 >= len(samples):
        return None
    return int(samples[idx + 3])


def _color_dist(c1: tuple[int, int, int], c2: tuple[int, int, int]) -> float:
    return ((c1[0] - c2[0]) ** 2 + (c1[1] - c2[1]) ** 2 + (c1[2] - c2[2]) ** 2) ** 0.5


def _pix_looks_round(pix) -> bool:
    """Heuristique : photo affichée en cercle (coins vides / alpha faible / fond uniforme)."""
    if pix is None:
        return False
    try:
        w, h = int(pix.width), int(pix.height)
    except Exception:
        return False
    if w < 12 or h < 12:
        return False
    ratio = w / h if h else 1.0
    if not (0.85 <= ratio <= 1.18):
        return False

    inset_x = max(2, int(w * 0.08))
    inset_y = max(2, int(h * 0.08))
    cx, cy = w // 2, h // 2
    corners = [
        (inset_x, inset_y),
        (w - 1 - inset_x, inset_y),
        (w - 1 - inset_x, h - 1 - inset_y),
        (inset_x, h - 1 - inset_y),
    ]
    center = _pix_rgb_at(pix, cx, cy)
    if center is None:
        return False

    if getattr(pix, "alpha", False):
        alphas = [_pix_alpha_at(pix, x, y) for x, y in corners]
        if all(a is not None for a in alphas):
            return sum(a < 40 for a in alphas) >= 3

    corner_colors = [_pix_rgb_at(pix, x, y) for x, y in corners]
    if any(c is None for c in corner_colors):
        return False
    corner_spread = max(
        _color_dist(corner_colors[i], corner_colors[j]) for i in range(4) for j in range(i + 1, 4)
    )
    corner_avg = (
        sum(c[0] for c in corner_colors) // 4,
        sum(c[1] for c in corner_colors) // 4,
        sum(c[2] for c in corner_colors) // 4,
    )
    center_corner_dist = _color_dist(center, corner_avg)
    return corner_spread < 36.0 and center_corner_dist > 22.0


def _is_photo_sized(w_mm: float, h_mm: float) -> bool:
    side = max(w_mm, h_mm)
    short = min(w_mm, h_mm)
    return MIN_PHOTO_MM <= side <= MAX_PHOTO_MM and short >= MIN_PHOTO_MM * 0.75


def _infer_image_shape(w_mm: float, h_mm: float, pix=None) -> str:
    """Déduit ``circle`` ou ``rect`` pour un bloc image importé."""
    ratio = w_mm / h_mm if h_mm else 1.0
    squareish = 0.85 <= ratio <= 1.18
    if not squareish:
        return "rect"
    if pix is not None and _pix_looks_round(pix):
        return "circle"
    if _is_photo_sized(w_mm, h_mm) and squareish:
        return "circle"
    return "rect"


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
        rect = rects[0]
        w_mm = (rect.x1 - rect.x0) * scale
        h_mm = (rect.y1 - rect.y0) * scale
        if w_mm <= 2 or h_mm <= 2:
            continue
        shape = _infer_image_shape(w_mm, h_mm, pix)
        data_url = _pixmap_to_data_url(pix)
        if not data_url:
            continue
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


def _cluster_drawings(drawings: list, gap_pt: float) -> list[list]:
    """Regroupe les dessins dont les bboxes se touchent (à ``gap_pt`` près).

    Permet de traiter un pictogramme composé de plusieurs tracés comme UNE seule
    vignette déplaçable (au lieu d'éclater chaque trait).
    """
    n = len(drawings)
    parent = list(range(n))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    rects = [d.get("rect") for d in drawings]
    for i in range(n):
        ri = rects[i]
        if ri is None:
            continue
        infl = (ri.x0 - gap_pt, ri.y0 - gap_pt, ri.x1 + gap_pt, ri.y1 + gap_pt)
        for j in range(i + 1, n):
            rj = rects[j]
            if rj is None:
                continue
            # Intersection des bboxes (gonflées) → même groupe.
            if not (infl[2] < rj.x0 or infl[0] > rj.x1 or infl[3] < rj.y0 or infl[1] > rj.y1):
                parent[find(i)] = find(j)

    groups: dict[int, list] = {}
    for idx, d in enumerate(drawings):
        groups.setdefault(find(idx), []).append(d)
    return list(groups.values())


def _cluster_union_rect(cluster: list):
    import fitz

    clip = fitz.Rect(cluster[0]["rect"])
    for d in cluster[1:]:
        r = d.get("rect")
        if r is not None:
            clip |= fitz.Rect(r)
    return clip


def _dominant_cluster_color(cluster: list) -> str:
    for d in cluster:
        fill_hex = _float_rgb_to_hex(d.get("fill")) if d.get("fill") is not None else None
        if fill_hex and not _is_near_white(fill_hex):
            return fill_hex
        stroke_hex = _float_rgb_to_hex(d.get("color")) if d.get("color") is not None else None
        if stroke_hex and not _is_near_white(stroke_hex):
            return stroke_hex
    return "#333333"


def _guess_icon_name(w_mm: float, h_mm: float, cluster: list) -> str:
    """Heuristique géométrique → nom d'icône canvas (react-icons/hi2)."""
    aspect = w_mm / h_mm if h_mm > 0 else 1.0
    n_items = sum(len(d.get("items") or []) for d in cluster)
    long_side = max(w_mm, h_mm)
    # Masque circulaire photo (plusieurs segments) ≠ icône lieu.
    if 0.85 <= aspect <= 1.35 and n_items >= 4 and long_side <= 8:
        return "HiMapPin"
    if h_mm > w_mm * 1.12 and h_mm <= 12:
        return "HiPhone"
    if w_mm > h_mm * 1.15:
        return "HiEnvelope"
    if max(w_mm, h_mm) <= 8:
        return "HiLink"
    return "HiSparkles"


def _blocks_overlap_ratio(a: dict, b: dict, min_ratio: float = 0.25) -> bool:
    """True si l'intersection couvre au moins ``min_ratio`` du plus petit bloc."""
    ax, ay, aw, ah = (
        float(a.get("x", 0)),
        float(a.get("y", 0)),
        float(a.get("w", 0)),
        float(a.get("h", 0)),
    )
    bx, by, bw, bh = (
        float(b.get("x", 0)),
        float(b.get("y", 0)),
        float(b.get("w", 0)),
        float(b.get("h", 0)),
    )
    if aw <= 0 or ah <= 0 or bw <= 0 or bh <= 0:
        return False
    x0, y0 = max(ax, bx), max(ay, by)
    x1, y1 = min(ax + aw, bx + bw), min(ay + ah, by + bh)
    if x1 <= x0 or y1 <= y0:
        return False
    inter = (x1 - x0) * (y1 - y0)
    smaller = min(aw * ah, bw * bh)
    return smaller > 0 and (inter / smaller) >= min_ratio


def _cleanup_image_overlay_blocks(blocks: list[dict]) -> list[dict]:
    """Retire icônes / anneaux vectoriels parasites au-dessus des photos importées."""
    images = [b for b in blocks if b.get("type") == "image"]
    if not images:
        return blocks
    photo_images = [
        b for b in images if _is_photo_sized(float(b.get("w", 0)), float(b.get("h", 0)))
    ]
    targets = photo_images if photo_images else images

    for img in images:
        for other in blocks:
            if other.get("type") not in ("icon", "shape:circle"):
                continue
            side = max(float(other.get("w", 0)), float(other.get("h", 0)))
            if other["type"] == "shape:circle" and side < MIN_PHOTO_MM:
                continue
            if _blocks_overlap_ratio(other, img, 0.2):
                style = img.setdefault("style", {})
                if style.get("shape") != "circle":
                    style["shape"] = "circle"

    kept: list[dict] = []
    for block in blocks:
        if block.get("type") == "icon" and any(
            _blocks_overlap_ratio(block, img, 0.22) for img in targets
        ):
            continue
        if block.get("type") == "shape:circle":
            side = max(float(block.get("w", 0)), float(block.get("h", 0)))
            if side >= MIN_PHOTO_MM and any(
                _blocks_overlap_ratio(block, img, 0.18) for img in targets
            ):
                continue
        kept.append(block)
    return kept


def _plain_text_content(block: dict) -> str:
    return html.unescape(str(block.get("content") or "")).replace("\xa0", " ").strip()


def _is_gutter_marker(block: dict) -> bool:
    """Puce visuelle isolée (cercle vectoriel, glyphe, micro-vignette)."""
    w = float(block.get("w") or 0)
    h = float(block.get("h") or 0)
    if max(w, h) > MAX_BULLET_MM:
        return False
    btype = block.get("type")
    if btype == "shape:circle":
        return True
    if btype == "image" and w <= MAX_BULLET_MM and h <= MAX_BULLET_MM:
        return True
    if btype in ("text", "title"):
        return bool(_BULLET_GLYPH_RE.fullmatch(_plain_text_content(block)))
    return False


def _text_cap_center_mm(block: dict) -> float:
    """Centre optique d'une ligne (padding CSS + mi-chasse de la police)."""
    y = float(block.get("y") or 0)
    size_pt = 10.0
    style = block.get("style") if isinstance(block.get("style"), dict) else {}
    try:
        size_pt = float(style.get("font_size") or 10)
    except (TypeError, ValueError):
        size_pt = 10.0
    return y + CSS_TEXT_PAD_TOP_MM + (size_pt * MM_PER_PT * 0.38)


def align_gutter_bullets(blocks: list[dict]) -> list[dict]:
    """Aligne les puces (cercles / glyphes) sur la ligne de texte à leur droite.

    PyMuPDF pose le cercle à son bbox dessin (souvent près de la baseline) alors
    que le texte canvas est compensé pour le padding CSS : sans ce calage, chaque
    puce tombe visuellement sur la ligne suivante (+ puce fantôme sous la liste).
    """
    if not blocks:
        return blocks
    targets = [
        b
        for b in blocks
        if b.get("type") in ("text", "title")
        and not _is_gutter_marker(b)
        and len(_plain_text_content(b)) >= 2
    ]
    if not targets:
        return blocks

    for marker in blocks:
        if not _is_gutter_marker(marker):
            continue
        mx = float(marker.get("x") or 0)
        mw = float(marker.get("w") or 0)
        mh = float(marker.get("h") or 0)
        marker_right = mx + mw
        mcy = float(marker.get("y") or 0) + mh / 2.0
        best = None
        best_score = float("inf")
        for text in targets:
            tx = float(text.get("x") or 0)
            if tx < marker_right - 1.0:
                continue
            gap = tx - marker_right
            if gap > MAX_GUTTER_GAP_MM:
                continue
            tcy = _text_cap_center_mm(text)
            dy = abs(tcy - mcy)
            if dy > MAX_BULLET_ALIGN_DY_MM:
                continue
            ty = float(text.get("y") or 0)
            # La ligne suivante (y plus bas que le centre de la puce) est pénalisée
            # pour éviter le décalage d'une ligne observé à l'import.
            score = dy + (3.0 if ty > mcy else 0.0)
            if score < best_score:
                best_score = score
                best = text
        if best is None:
            continue
        new_y = _text_cap_center_mm(best) - mh / 2.0
        marker["y"] = round(max(0.0, new_y), 2)

    return blocks


def _classify_graphic_cluster(cluster: list, scale: float) -> dict | None:
    """Convertit un cluster vectoriel en bloc forme/icône natif quand c'est possible."""
    if not cluster:
        return None
    clip = _cluster_union_rect(cluster)
    w_mm = (clip.x1 - clip.x0) * scale
    h_mm = (clip.y1 - clip.y0) * scale
    if w_mm <= 0.15 or h_mm <= 0.15:
        return None

    color = _dominant_cluster_color(cluster)
    long_side = max(w_mm, h_mm)
    short_side = min(w_mm, h_mm)
    aspect = w_mm / h_mm if h_mm > 0 else 1.0
    x_mm = max(0.0, clip.x0 * scale)
    y_mm = max(0.0, clip.y0 * scale)

    # Masque / cadre de photo (cercle vectoriel) → ne pas créer d'icône parasite.
    if _is_photo_sized(w_mm, h_mm) and 0.82 <= aspect <= 1.22:
        return None

    # Filet horizontal ou vertical
    if long_side >= MIN_SEPARATOR_LEN_MM and short_side <= LINE_MAX_THICKNESS_MM:
        stroke = round(max(short_side, 0.05), 2)
        if w_mm >= h_mm:
            return {
                "type": "shape:line",
                "x": round(x_mm, 2),
                "y": round(y_mm, 2),
                "w": round(w_mm, 2),
                "h": round(stroke, 2),
                "z": 1,
                "style": {"color": color, "stroke_width": stroke},
            }
        return {
            "type": "shape:line",
            "x": round(x_mm, 2),
            "y": round(y_mm, 2),
            "w": round(stroke, 2),
            "h": round(h_mm, 2),
            "z": 1,
            "style": {"color": color, "stroke_width": stroke, "orientation": "vertical"},
        }

    # Puce / bullet rond
    if long_side <= MAX_BULLET_MM and 0.55 <= aspect <= 1.85:
        d = round(max(long_side, 1.0), 2)
        return {
            "type": "shape:circle",
            "x": round(x_mm, 2),
            "y": round(y_mm, 2),
            "w": d,
            "h": d,
            "z": 2,
            "style": {"color": color, "stroke_color": color, "stroke_width": 0},
        }

    # Pictogramme contact (téléphone, email, …) — taille modeste uniquement.
    if (
        MIN_ICON_MM <= long_side <= MAX_CONTACT_ICON_MM
        and short_side >= MIN_ICON_MM
        and not _is_photo_sized(w_mm, h_mm)
    ):
        return {
            "type": "icon",
            "icon_name": _guess_icon_name(w_mm, h_mm, cluster),
            "x": round(x_mm, 2),
            "y": round(y_mm, 2),
            "w": round(w_mm, 2),
            "h": round(h_mm, 2),
            "z": 2,
            "style": {"color": color},
        }

    return None


def _cutout_block(page, clip, scale: float) -> tuple[dict | None, int]:
    """Rasterise une région de la page (texte déjà retiré) en vignette image.

    Retourne ``(bloc, octets)``. La vignette reste fidèle au PDF (icônes/puces)
    et devient un bloc déplaçable indépendamment.
    """
    import fitz

    try:
        pix = page.get_pixmap(
            matrix=fitz.Matrix(CUTOUT_RENDER_SCALE, CUTOUT_RENDER_SCALE), clip=clip, alpha=False
        )
    except Exception:  # pragma: no cover - dépend du PDF
        return None, 0
    w_mm = (clip.x1 - clip.x0) * scale
    h_mm = (clip.y1 - clip.y0) * scale
    if w_mm <= 0.4 or h_mm <= 0.4:
        return None, 0
    shape = _infer_image_shape(w_mm, h_mm, pix)
    data_url = _pixmap_to_data_url(pix)
    if not data_url:
        return None, 0
    block = {
        "type": "image",
        "image_src": data_url,
        "x": round(max(0.0, clip.x0 * scale), 2),
        "y": round(max(0.0, clip.y0 * scale), 2),
        "w": round(min(w_mm, PAGE_W_MM), 2),
        "h": round(min(h_mm, PAGE_H_MM), 2),
        "z": 2,
        "style": {"shape": shape, "decorative": shape != "circle"},
    }
    return block, len(data_url)


def _extract_graphic_blocks(page, doc, scale: float, image_budget: list) -> list[dict] | None:
    """Décompose la couche graphique en blocs INDÉPENDANTS (déplaçables).

    - fonds pleins (sidebar/header) → ``shape:rect`` recolorable ;
    - filets / timelines → blocs fins ``shape:line``/``shape:rect`` ;
    - photos → blocs image ;
    - pictogrammes / puces / marqueurs (vecteurs complexes) → vignettes image
      rasterisées (fidèles) regroupées par proximité.

    Retourne ``None`` si la couche est trop fragmentée (→ repli sur fond plat).
    ⚠️ Mute la page (retire le texte) : appeler APRÈS l'extraction du texte.
    """
    import fitz

    try:
        drawings = page.get_drawings()
    except Exception as exc:  # pragma: no cover
        logger.debug("pdf_structural_extract: get_drawings échoué: %s", exc)
        drawings = []

    blocks: list[dict] = []
    seen_keys: set[tuple] = set()
    misc: list = []
    page_area = PAGE_W_MM * PAGE_H_MM

    def _push(blk: dict | None) -> None:
        if not blk:
            return
        key = (
            blk["type"],
            round(blk["x"], 1),
            round(blk["y"], 1),
            round(blk["w"], 1),
            round(blk["h"], 1),
        )
        if key in seen_keys:  # évite les traits dupliqués (fill + stroke)
            return
        seen_keys.add(key)
        blocks.append(blk)

    for d in drawings:
        rect = d.get("rect")
        if rect is None:
            continue
        w_mm = (rect.x1 - rect.x0) * scale
        h_mm = (rect.y1 - rect.y0) * scale

        items = [it for it in d.get("items", []) if it]
        re_items = [it[1] for it in items if it[0] == "re"]
        line_items = [it for it in items if it[0] == "l"]
        is_pure_segment = bool(line_items) and not re_items

        # Segments horizontaux/verticaux : bounding rect de hauteur ou largeur 0 →
        # on conserve si c'est un segment pur (items=['l']). Tout autre dessin
        # dégénéré est ignoré.
        if (w_mm <= 0 or h_mm <= 0) and not is_pure_segment:
            continue
        if w_mm > 0 and h_mm > 0 and w_mm * h_mm > page_area * PAGE_BG_AREA_RATIO:
            continue  # fond de page entier

        fill_hex = _float_rgb_to_hex(d.get("fill")) if d.get("fill") is not None else None
        stroke_hex = _float_rgb_to_hex(d.get("color")) if d.get("color") is not None else None
        thin = min(w_mm, h_mm) <= LINE_MAX_THICKNESS_MM
        longish = max(w_mm, h_mm) >= MIN_SEPARATOR_LEN_MM
        area = w_mm * h_mm
        handled = False

        # Rectangle plein recolorable : soit un fond structurel (sidebar/bandeau),
        # soit un filet/timeline plein et fin (rectangle long).
        if fill_hex and not _is_near_white(fill_hex) and len(re_items) == 2:
            for strip in _frame_strips_from_rects(re_items[0], re_items[1], scale, fill_hex):
                _push(strip)
            handled = True
        elif (
            fill_hex
            and not _is_near_white(fill_hex)
            and len(re_items) == 1
            and ((not thin and area >= BACKGROUND_MIN_AREA_MM2) or (thin and longish))
        ):
            r0 = re_items[0]
            _push(_shape_block_from_box(r0.x0, r0.y0, r0.x1, r0.y1, scale, fill_hex))
            handled = True
        # Filet tracé (segments, y compris cadres fins à 4 traits) → bloc fin.
        elif stroke_hex and not _is_near_white(stroke_hex) and line_items and not re_items:
            blk = _separator_block_from_line_items(
                line_items, scale, stroke_hex, float(d.get("width") or 0)
            )
            if blk:
                _push(blk)
                handled = True

        if not handled:
            misc.append(d)

    # Filets isolés dans le reste vectoriel (évite de les fusionner en vignettes).
    remaining_misc: list = []
    for d in misc:
        rect = d.get("rect")
        if rect is None:
            remaining_misc.append(d)
            continue
        w_mm = (rect.x1 - rect.x0) * scale
        h_mm = (rect.y1 - rect.y0) * scale
        thin = min(w_mm, h_mm) <= LINE_MAX_THICKNESS_MM
        long_side = max(w_mm, h_mm)
        if thin and long_side >= MIN_SEPARATOR_LEN_MM:
            color = _dominant_cluster_color([d])
            blk = _shape_block_from_box(rect.x0, rect.y0, rect.x1, rect.y1, scale, color)
            if blk and blk.get("type") == "shape:line":
                _push(blk)
                continue
        remaining_misc.append(d)
    misc = remaining_misc

    # Rectangles blancs purs (fond structurel de page, masques CSS) : inutile
    # de les rasteriser — ils ne portent aucun dessin propre et, si on les
    # inclut dans un cluster, l'image produite duplique les shapes déjà
    # extraits (sidebar, filets) en les re-dessinant en pixels, puis les
    # masque (z=2 > shape:line z=1).
    misc = [
        d
        for d in misc
        if not (
            _is_near_white(_float_rgb_to_hex(d.get("fill")) if d.get("fill") is not None else None)
            and not d.get("color")  # pas de stroke
            and all(it[0] == "re" for it in d.get("items", []) if it)  # que des rects
        )
    ]

    clusters = _cluster_drawings(misc, CLUSTER_GAP_PT) if misc else []
    if len(clusters) > MAX_CUTOUTS:  # trop fragmenté → repli sur fond plat
        return None

    # Photos (avant la redaction qui retire le texte).
    blocks.extend(_extract_image_blocks(page, doc, scale, image_budget))

    if clusters:
        try:
            for blk in page.get_text("dict").get("blocks", []):
                for line in blk.get("lines", []):
                    for span in line.get("spans", []):
                        rr = fitz.Rect(span.get("bbox"))
                        if not rr.is_empty:
                            page.add_redact_annot(rr, fill=False)
            page.apply_redactions(
                images=fitz.PDF_REDACT_IMAGE_NONE,
                graphics=fitz.PDF_REDACT_LINE_ART_NONE,
                text=fitz.PDF_REDACT_TEXT_REMOVE,
            )
        except Exception as exc:  # pragma: no cover
            logger.info("pdf_structural_extract: redaction cutouts échouée: %s", exc)
            return None

        total = 0
        for cluster in clusters:
            classified = _classify_graphic_cluster(cluster, scale)
            if classified:
                blocks.append(classified)
                continue
            clip = fitz.Rect(cluster[0]["rect"])
            for d in cluster[1:]:
                clip |= fitz.Rect(d["rect"])
            block, nbytes = _cutout_block(page, clip, scale)
            if block:
                blocks.append(block)
                total += nbytes
                if total > MAX_CUTOUT_TOTAL_BYTES:
                    break

    return _cleanup_image_overlay_blocks(blocks)


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
        from backend.sentry_business import capture_business_event

        capture_business_event(
            "import",
            "PyMuPDF import en échec",
            kind="pymupdf_fail",
            size_bytes=len(file_bytes),
            provider_code=type(exc).__name__,
        )
        return None

    try:
        if doc.page_count < 1:
            return None
        pages_out: list[dict] = []
        total_chars = 0
        image_budget = [MAX_IMAGES_PER_DOC]
        n_pages = min(doc.page_count, max_pages)
        # Couleurs de design extraites avant toute rasterisation/mutation de page.
        # La première page prime (en-tête avec les couleurs dominantes du design).
        merged_theme_colors: dict = {}

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
            # Couleurs thème : lu AVANT que _extract_graphic_blocks mute la page.
            page_theme = _extract_theme_colors(page, pos_scale)
            for k, v in page_theme.items():
                if k not in merged_theme_colors:
                    merged_theme_colors[k] = v
            # Le texte D'ABORD (la décomposition/rasterisation retire le texte).
            text_blocks, chars = _extract_text_blocks(page, pos_scale, fit, embedded_roots)
            total_chars += chars
            # Couche graphique décomposée en blocs déplaçables (sidebar, filets,
            # photo, icônes/puces). Repli : fond plat rasterisé, puis vectoriel.
            graphic_blocks = _extract_graphic_blocks(page, doc, pos_scale, image_budget)
            if graphic_blocks is not None:
                blocks = [*graphic_blocks, *text_blocks]
            else:
                bg_block = _render_decoration_background(page, pos_scale)
                if bg_block:
                    blocks = [bg_block, *text_blocks]
                else:
                    shape_blocks = _extract_shape_blocks(page, pos_scale)
                    image_blocks = _extract_image_blocks(page, doc, pos_scale, image_budget)
                    blocks = [*shape_blocks, *image_blocks, *text_blocks]
            if not blocks:
                continue
            blocks = _cleanup_image_overlay_blocks(blocks)
            blocks = align_gutter_bullets(blocks)
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
                **merged_theme_colors,
            },
            "source": "pdf_structural",
        }
    finally:
        doc.close()
