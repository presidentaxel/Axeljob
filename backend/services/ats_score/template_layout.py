"""Conversion d'un ``meta.json`` de template en ``layout`` scorable.

Les templates livres (``templates/<id>/meta.json``) decrivent leur structure
via des ``tags`` ("single-column", "sidebar", "sidebar-left", "photo") et leurs
``options`` avec valeurs par defaut. Pour scorer un template, on a besoin d'un
``layout`` au schema decrit dans ``docs/editor-vision.md`` annexe 16.2.

Cette fonction est pure (aucun I/O) et stable : un meme ``meta`` produit
toujours le meme ``layout``. Elle est testee unitairement et utilisee par le
test golden des 7 templates livres.
"""

from __future__ import annotations

from typing import Any

# Valeur conservatrice utilisee pour estimer la largeur de la sidebar quand
# le template indique en avoir une, sans preciser de ratio dans meta.json.
DEFAULT_SIDEBAR_RATIO: float = 0.33

# Sections "standards" qu'un template livre est presume afficher quand son
# meta.json ne les detaille pas. Aligne sur ``cvDefault.js`` cote frontend.
DEFAULT_STANDARD_SECTIONS: tuple[str, ...] = (
    "identity",
    "experiences",
    "formations",
    "skills",
    "languages",
)


def _option_default(meta: dict[str, Any], key: str, fallback: Any) -> Any:
    """Recupere la valeur ``default`` d'une option du meta.json par sa cle.

    Tolere meta.json minimaliste (sans options).
    """
    for option in meta.get("options", []) or []:
        if isinstance(option, dict) and option.get("key") == key:
            return option.get("default", fallback)
    return fallback


def _has_tag(meta: dict[str, Any], *needles: str) -> bool:
    """Vrai si **un** des tags fournis est present dans ``meta.tags``."""
    tags = meta.get("tags") or []
    if not isinstance(tags, list):
        return False
    tags_set = {t for t in tags if isinstance(t, str)}
    return any(needle in tags_set for needle in needles)


def template_meta_to_layout(meta: dict[str, Any]) -> dict[str, Any]:
    """Transforme un ``meta.json`` charge en ``layout`` minimal scorable.

    Heuristique stable et documentee :

    - ``single-column`` ou ``no-sidebar`` -> ``sidebar_ratio = 0``.
    - ``sidebar`` / ``sidebar-left`` -> ``sidebar_ratio = DEFAULT_SIDEBAR_RATIO``.
    - ``sidebar-left`` impose ``sidebar_position = "left"``.
    - ``show_photo`` reprend la valeur par defaut de l'option (sinon
      ``True`` si le tag ``"photo"`` est present, sinon ``False``).
    - ``font_heading`` reprend la valeur par defaut de l'option ``font``.
    - Sections standards toutes visibles, ``identity`` en header.
    """
    has_sidebar = _has_tag(meta, "sidebar", "sidebar-left")
    has_single_column = _has_tag(meta, "single-column", "no-sidebar")
    sidebar_ratio = 0.0
    if has_sidebar and not has_single_column:
        sidebar_ratio = DEFAULT_SIDEBAR_RATIO
    sidebar_position = "left" if _has_tag(meta, "sidebar-left") else "right"

    photo_default_from_options = _option_default(meta, "show_photo", None)
    if photo_default_from_options is None:
        show_photo = _has_tag(meta, "photo")
    else:
        show_photo = bool(photo_default_from_options)

    font_heading = _option_default(meta, "font", "Inter")

    sections_order = [
        {"id": section, "visible": True, "in": "header" if section == "identity" else "main"}
        for section in DEFAULT_STANDARD_SECTIONS
    ]

    return {
        "version": "2026.05",
        "template_id": meta.get("id", "unknown"),
        "format": "A4",
        "grid": "single-or-sidebar",
        "sidebar_position": sidebar_position,
        "sidebar_ratio": sidebar_ratio,
        "sections_order": sections_order,
        "theme": {
            "font_heading": font_heading,
            "font_body": font_heading,
            "show_photo": show_photo,
            "show_mots_cles_ats": bool(_option_default(meta, "show_mots_cles_ats", True)),
        },
        "metadata": {
            "source": "template_meta",
            "scoring_version": "2026.05",
        },
    }
