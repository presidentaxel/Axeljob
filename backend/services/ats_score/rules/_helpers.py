"""Helpers internes aux regles ATS.

Module **prive** (prefixe underscore) : ne pas importer depuis l'API publique.
Centralise les acces defensifs aux structures ``cv`` / ``layout`` pour eviter
la duplication entre fichiers de regles, sans devenir un "god module".

Toutes les fonctions sont pures et toleres aux dictionnaires vides ou mal
formes (retournent une valeur de fallback documentee).
"""

from __future__ import annotations

from typing import Any

# Polices considerees comme universellement extractibles par les parsers ATS.
# Cette liste reste volontairement courte et conservatrice : preferer ajouter
# une regle de bonus explicite plutot que d'elargir cette liste sans test.
ATS_SAFE_FONTS: frozenset[str] = frozenset(
    {
        "Arial",
        "Calibri",
        "Helvetica",
        "Times",
        "Times New Roman",
        "Georgia",
        "Inter",
        "Plus Jakarta Sans",
        "Verdana",
        "Tahoma",
        "Roboto",
        "Open Sans",
        "Source Sans Pro",
    }
)


def get_grid(layout: dict[str, Any]) -> str:
    """Retourne la valeur ``grid`` du layout (``"single-or-sidebar"`` par defaut).

    Le defaut est volontairement le mode le plus restrictif, pour qu'un layout
    minimaliste (sans champ ``grid``) soit traite comme un template fige.
    """
    raw = layout.get("grid")
    if isinstance(raw, str) and raw.strip():
        return raw.strip()
    return "single-or-sidebar"


def get_sidebar_ratio(layout: dict[str, Any]) -> float:
    """Retourne la largeur sidebar normalisee dans ``[0.0, 1.0]``.

    Tolere les valeurs absentes, mal typees ou hors plage : clamp silencieux.
    """
    raw = layout.get("sidebar_ratio", 0.0)
    try:
        ratio = float(raw)
    except (TypeError, ValueError):
        return 0.0
    if ratio < 0.0:
        return 0.0
    if ratio > 1.0:
        return 1.0
    return ratio


def get_theme(layout: dict[str, Any]) -> dict[str, Any]:
    """Retourne le sous-dictionnaire ``theme`` du layout (vide si absent)."""
    theme = layout.get("theme")
    return theme if isinstance(theme, dict) else {}


def get_sections_order(layout: dict[str, Any]) -> list[dict[str, Any]]:
    """Retourne la liste ``sections_order`` (vide si absente ou mal typee).

    Filtre defensivement les entrees qui ne sont pas des dictionnaires.
    """
    raw = layout.get("sections_order")
    if not isinstance(raw, list):
        return []
    return [item for item in raw if isinstance(item, dict)]


def get_pages(layout: dict[str, Any]) -> list[dict[str, Any]]:
    """Retourne ``pages`` du layout (vide si absent ou mal type)."""
    raw = layout.get("pages")
    if not isinstance(raw, list):
        return []
    return [page for page in raw if isinstance(page, dict)]


def iter_blocks(layout: dict[str, Any]) -> list[dict[str, Any]]:
    """Itere a plat sur tous les blocs de toutes les pages."""
    blocks: list[dict[str, Any]] = []
    for page in get_pages(layout):
        page_blocks = page.get("blocks")
        if not isinstance(page_blocks, list):
            continue
        blocks.extend(block for block in page_blocks if isinstance(block, dict))
    return blocks


def free_canvas_block_types(layout: dict[str, Any]) -> set[str]:
    """Retourne les types de blocs affiches en mode canvas libre.

    Pour un layout non-free, retourne un set vide : les templates figes restent
    scores via leurs metadonnees historiques.
    """
    if get_grid(layout) != "free":
        return set()
    return {str(block.get("type")) for block in iter_blocks(layout) if block.get("type")}


def free_canvas_has_block_type(layout: dict[str, Any], *block_types: str) -> bool:
    """Vrai si au moins un des types demandes est affiche sur le canvas libre."""
    actual = free_canvas_block_types(layout)
    return any(block_type in actual for block_type in block_types)


def is_section_visible(layout: dict[str, Any], section_id: str) -> bool:
    """Vrai si la section ``section_id`` est marquee ``visible: True``.

    Si le layout n'a pas de ``sections_order``, on considere la section comme
    visible (compatibilite ascendante avec les templates qui ne livrent pas
    encore de schema layout).
    """
    sections = get_sections_order(layout)
    if not sections:
        return True
    for entry in sections:
        if entry.get("id") == section_id:
            return bool(entry.get("visible", True))
    return False


def count_columns(layout: dict[str, Any]) -> int:
    """Estime le nombre de colonnes du layout.

    Heuristique conservatrice :

    - ``grid != "free"`` : 1 colonne + 1 si ``sidebar_ratio > 0``.
    - ``grid == "free"``  : compte les clusters distincts de positions ``x``
      parmi les blocs textuels (un cluster = un groupe avec ``x`` espacees
      d'au moins 30 mm). Au minimum 1 colonne, au maximum 4.

    Le mode ``free`` peut sous-estimer le nombre de colonnes si l'utilisateur
    a pose des blocs imbriques de meme ``x`` : c'est un compromis assume,
    documente par les tests ``test_ats_score_rules_layout``.
    """
    grid = get_grid(layout)
    if grid != "free":
        return 1 + (1 if get_sidebar_ratio(layout) > 0 else 0)

    text_like_types = {
        "identity",
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
    }
    xs: list[float] = []
    for block in iter_blocks(layout):
        if block.get("type") not in text_like_types:
            continue
        try:
            x = float(block.get("x"))
        except (TypeError, ValueError):
            continue
        xs.append(x)
    if not xs:
        return 1

    xs.sort()
    clusters = 1
    for previous, current in zip(xs, xs[1:], strict=False):
        if current - previous >= 30.0:
            clusters += 1
    return min(clusters, 4)


def normalize_font_name(raw: Any) -> str:
    """Normalise un nom de police pour comparer avec ``ATS_SAFE_FONTS``."""
    if not isinstance(raw, str):
        return ""
    return raw.strip().strip("'\"")


def cv_nonempty_str(value: Any) -> str:
    """Retourne une chaine strippee si non vide, sinon ``\"\"``."""
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def cv_first_text(cv: dict[str, Any], *keys: str) -> str:
    """Premier champ texte non vide parmi ``keys`` (dual-key FR/EN)."""
    for key in keys:
        text = cv_nonempty_str(cv.get(key))
        if text:
            return text
    return ""


def cv_has_identity(cv: dict[str, Any]) -> bool:
    """Vrai si prenom/first_name ou nom/last_name est renseigne."""
    return bool(
        cv_first_text(cv, "prenom", "first_name") or cv_first_text(cv, "nom", "last_name")
    )


def cv_has_contact(cv: dict[str, Any]) -> bool:
    """Vrai si email ou telephone/phone est renseigne."""
    return bool(cv_first_text(cv, "email") or cv_first_text(cv, "telephone", "phone"))


def cv_has_experiences(cv: dict[str, Any]) -> bool:
    """Vrai si au moins une experience a un contenu utile (pas un shell vide)."""
    for exp in cv.get("experiences", []) or []:
        if not isinstance(exp, dict):
            continue
        if cv_first_text(exp, "poste", "title") or cv_first_text(exp, "entreprise", "company"):
            return True
        bullets = exp.get("bullet_points") or []
        if any(cv_nonempty_str(b) for b in bullets):
            return True
    return False


def cv_has_formations(cv: dict[str, Any]) -> bool:
    """Vrai si au moins une formation a un diplome / etablissement."""
    for form in cv.get("formations", []) or []:
        if not isinstance(form, dict):
            continue
        if cv_first_text(form, "diplome", "degree") or cv_first_text(
            form, "etablissement", "school"
        ):
            return True
    return False


def cv_has_skills(cv: dict[str, Any]) -> bool:
    """Vrai si competences techniques/logiciels/autres non vides."""
    competences = cv.get("competences") or {}
    if not isinstance(competences, dict):
        return False
    for list_key in ("techniques", "logiciels", "autres"):
        items = competences.get(list_key) or []
        if any(cv_nonempty_str(x) for x in items):
            return True
    return False


def cv_has_languages(cv: dict[str, Any]) -> bool:
    """Vrai si au moins une langue non vide est declaree."""
    competences = cv.get("competences") or {}
    if not isinstance(competences, dict):
        return False
    for item in competences.get("langues") or []:
        if isinstance(item, dict):
            if cv_nonempty_str(item.get("langue")):
                return True
        elif cv_nonempty_str(item):
            return True
    return False
