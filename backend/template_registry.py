"""
Registre des templates CV.
Charge les meta.json depuis templates/*, expose list + resolve.
"""

import json
from pathlib import Path

TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates"
DEFAULT_TEMPLATE_ID = "minimal"

_cache: dict[str, dict] | None = None

# Cache TTL des résultats list_templates(user_id) : la liste des templates perso change
# rarement (création/suppression manuelle), mais l'endpoint /api/templates est appelé à
# chaque ouverture du picker / changement d'écran (souvent 2-3× par session). 5 min
# d'âge max + invalidation explicite à la mutation = aucun risque de stale.
from backend.perf_cache import TTLCache as _TTLCache

_TEMPLATES_LIST_CACHE = _TTLCache(max_size=2000, ttl_sec=300.0)


def _load_all() -> dict[str, dict]:
    global _cache
    if _cache is not None:
        return _cache
    _cache = {}
    if not TEMPLATES_DIR.is_dir():
        return _cache
    for meta_path in sorted(TEMPLATES_DIR.glob("*/meta.json")):
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            tid = meta.get("id") or meta_path.parent.name
            meta["_dir"] = str(meta_path.parent)
            _cache[tid] = meta
        except Exception:
            continue
    return _cache


def reload():
    global _cache
    _cache = None
    _load_all()
    _TEMPLATES_LIST_CACHE.clear()


def invalidate_templates_cache_for_user(user_id: str | None) -> None:
    """À appeler après création/édition/suppression d'un template perso."""
    if user_id:
        _TEMPLATES_LIST_CACHE.invalidate(user_id)
    # Clé anonyme aussi (utilisateur non loggé)
    _TEMPLATES_LIST_CACHE.invalidate("__anon__")


def list_templates(user_id: str | None = None) -> list[dict]:
    """Retourne la liste des templates (fichiers + personnalisés Supabase si user_id fourni). Sans _dir / _custom internals."""
    cache_key = user_id or "__anon__"
    cached = _TEMPLATES_LIST_CACHE.get(cache_key)
    if cached is not None:
        return cached
    all_t = _load_all()
    out = []
    for tid, meta in all_t.items():
        out.append({k: v for k, v in meta.items() if not k.startswith("_")})
    if user_id:
        try:
            from backend.db import list_custom_templates_for_user

            custom = list_custom_templates_for_user(user_id)
            for c in custom:
                out.append({k: v for k, v in c.items() if not k.startswith("_")})
        except Exception:
            pass
    _TEMPLATES_LIST_CACHE.set(cache_key, out)
    return out


def get_template(template_id: str | None = None) -> dict:
    """Retourne le meta + _dir (ou _html_content/_css_content pour custom) du template. Fallback sur DEFAULT_TEMPLATE_ID."""
    tid = (template_id or "").strip() or DEFAULT_TEMPLATE_ID
    try:
        from backend.db import CUSTOM_TEMPLATE_ID_PREFIX, get_custom_template_by_id

        if tid.startswith(CUSTOM_TEMPLATE_ID_PREFIX):
            custom = get_custom_template_by_id(tid)
            if custom:
                return custom
    except Exception:
        pass
    all_t = _load_all()
    return all_t.get(tid) or all_t.get(DEFAULT_TEMPLATE_ID) or next(iter(all_t.values()), {})


def get_template_dir(template_id: str | None = None) -> Path:
    meta = get_template(template_id)
    return Path(meta.get("_dir") or TEMPLATES_DIR / DEFAULT_TEMPLATE_ID)


# Options typo globales (tailles en pt, couleurs en hex, photo en px). Disponibles pour tous les templates (fichiers + Supabase).
TYPO_OPTION_DEFAULTS = {
    "font_size_name": 15,
    "font_size_title": 10,
    "font_size_section": 9.5,
    "font_size_body": 9,
    "font_size_bullet": 9,
    "font_size_sidebar_title": 8,
    "font_size_sidebar_item": 8,
    "color_body": "#1a1a1a",
    "color_section_title": "#1e2a3a",
    "photo_size": 72,
}

# Clés réglables dans l’UI (TemplatePicker) : doivent toujours fusionner même si meta.options est vide (ex. template Supabase).
_MERGE_OPTION_KEYS = {
    "show_photo",
    "show_mots_cles_ats",
    "photo_size",
    "header_color",
    "sidebar_color",
    "accent_color",
    "font",
} | set(TYPO_OPTION_DEFAULTS.keys())


def get_default_layout_options_for_custom() -> list:
    """Même liste d’options que le template classique - utilisée si cv_templates.options est vide ou absent."""
    classic = TEMPLATES_DIR / "classic" / "meta.json"
    try:
        meta = json.loads(classic.read_text(encoding="utf-8"))
        opts = meta.get("options")
        if isinstance(opts, list) and opts:
            return json.loads(json.dumps(opts))
    except Exception:
        pass
    return [
        {"key": "header_color", "type": "color", "default": "#1e2a3a", "label": "Couleur en-tête"},
        {"key": "sidebar_color", "type": "color", "default": "#f4f4f2", "label": "Couleur sidebar"},
        {"key": "accent_color", "type": "color", "default": "#1e2a3a", "label": "Couleur accent"},
        {
            "key": "font",
            "type": "select",
            "choices": ["Plus Jakarta Sans", "Inter", "Georgia"],
            "default": "Plus Jakarta Sans",
            "label": "Police titres",
        },
        {"key": "show_photo", "type": "boolean", "default": True, "label": "Afficher la photo"},
        {"key": "show_mots_cles_ats", "type": "boolean", "default": True, "label": "Mots-clés ATS"},
    ]


def resolve_options(template_id: str | None, user_options: dict | None) -> dict:
    """Merge user options with template defaults. Inclut show_photo, show_mots_cles_ats et options typo pour tous les templates."""
    meta = get_template(template_id)
    defaults = {**TYPO_OPTION_DEFAULTS}
    for opt in meta.get("options") or []:
        defaults[opt["key"]] = opt.get("default")
    defaults.setdefault("show_photo", True)
    defaults.setdefault("show_mots_cles_ats", True)
    final = {**defaults}
    if user_options:
        for k, v in user_options.items():
            if v is not None and (k in defaults or k in _MERGE_OPTION_KEYS):
                final[k] = v
    # Minimal : pas de zone photo (template ni export).
    if (template_id or "").strip() == "minimal":
        final["show_photo"] = False
    return final


import re as _re

_COLOR_RE = _re.compile(r"^#[0-9a-fA-F]{3,8}$")


def _is_near_white_hex(val: str) -> bool:
    """Couleur texte quasi blanche sur fond blanc = illisible ; on ignore l'override."""
    h = (val or "").strip().lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    if len(h) not in (6, 8):
        return False
    try:
        r = int(h[0:2], 16)
        g = int(h[2:4], 16)
        b = int(h[4:6], 16)
    except ValueError:
        return False
    return (r + g + b) / (3 * 255) > 0.92


_FONT_SAFE = {
    "Plus Jakarta Sans": "'Plus Jakarta Sans', Arial, sans-serif",
    "Inter": "'Inter', Arial, sans-serif",
    "Georgia": "Georgia, 'Times New Roman', serif",
}

# Clés typo → variable CSS (tailles en pt, couleurs en hex)
_TYPO_CSS_VAR_MAP = {
    "font_size_name": "--cv-fs-name",
    "font_size_title": "--cv-fs-title",
    "font_size_section": "--cv-fs-section",
    "font_size_body": "--cv-fs-body",
    "font_size_bullet": "--cv-fs-bullet",
    "font_size_sidebar_title": "--cv-fs-sidebar-title",
    "font_size_sidebar_item": "--cv-fs-sidebar-item",
    "color_body": "--cv-color-body",
    "color_section_title": "--cv-color-section-title",
}


def options_to_css_vars(options: dict) -> str:
    """Génère un bloc <style> :root qui override les variables du template (couleurs, police, tailles). Injecté après le CSS du template pour que les réglages utilisateur priment."""
    parts = []
    for key, css_var in (
        ("header_color", "--cv-header-color"),
        ("sidebar_color", "--cv-sidebar-color"),
        ("accent_color", "--cv-accent-color"),
    ):
        val = options.get(key)
        if val and isinstance(val, str) and _COLOR_RE.match(val):
            parts.append(f"  {css_var}: {val};")
    font = options.get("font")
    if font and isinstance(font, str) and font in _FONT_SAFE:
        parts.append(f"  --cv-font-heading: {_FONT_SAFE[font]};")
    for key, css_var in _TYPO_CSS_VAR_MAP.items():
        val = options.get(key)
        if key.startswith("font_size_") and val is not None:
            try:
                pt = (
                    float(val)
                    if isinstance(val, (int, float))
                    else float(str(val).strip().replace(",", "."))
                )
                if 6 <= pt <= 24:
                    parts.append(f"  {css_var}: {pt}pt;")
            except (TypeError, ValueError):
                pass
        elif key.startswith("color_") and val and isinstance(val, str) and _COLOR_RE.match(val):
            if key in ("color_body", "color_section_title") and _is_near_white_hex(val):
                continue
            parts.append(f"  {css_var}: {val};")
    val = options.get("photo_size")
    if val is not None:
        try:
            px = (
                float(val)
                if isinstance(val, (int, float))
                else float(str(val).strip().replace(",", "."))
            )
            if 40 <= px <= 160:
                parts.append(f"  --cv-photo-size: {int(round(px))}px;")
        except (TypeError, ValueError):
            pass
    if not parts:
        return ""
    return "<style>:root {\n" + "\n".join(parts) + "\n}</style>"
