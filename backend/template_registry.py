"""
Registre des templates CV.
Charge les meta.json depuis templates/*, expose list + resolve.
"""
import json
from pathlib import Path

TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates"
DEFAULT_TEMPLATE_ID = "classic"

_cache: dict[str, dict] | None = None


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


def list_templates(user_id: str | None = None) -> list[dict]:
    """Retourne la liste des templates (fichiers + personnalisés Supabase si user_id fourni). Sans _dir / _custom internals."""
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
    return out


def get_template(template_id: str | None = None) -> dict:
    """Retourne le meta + _dir (ou _html_content/_css_content pour custom) du template. Fallback sur classic."""
    tid = (template_id or "").strip() or DEFAULT_TEMPLATE_ID
    try:
        from backend.db import get_custom_template_by_id, CUSTOM_TEMPLATE_ID_PREFIX
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
        allowed_extra = {"show_photo", "show_mots_cles_ats", "photo_size"} | set(TYPO_OPTION_DEFAULTS)
        for k, v in user_options.items():
            if v is not None and (k in defaults or k in allowed_extra):
                final[k] = v
    return final


import re as _re

_COLOR_RE = _re.compile(r'^#[0-9a-fA-F]{3,8}$')
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
                pt = float(val) if isinstance(val, (int, float)) else float(str(val).strip().replace(",", "."))
                if 6 <= pt <= 24:
                    parts.append(f"  {css_var}: {pt}pt;")
            except (TypeError, ValueError):
                pass
        elif key.startswith("color_") and val and isinstance(val, str) and _COLOR_RE.match(val):
            parts.append(f"  {css_var}: {val};")
    val = options.get("photo_size")
    if val is not None:
        try:
            px = float(val) if isinstance(val, (int, float)) else float(str(val).strip().replace(",", "."))
            if 40 <= px <= 160:
                parts.append(f"  --cv-photo-size: {int(round(px))}px;")
        except (TypeError, ValueError):
            pass
    if not parts:
        return ""
    return "<style>:root {\n" + "\n".join(parts) + "\n}</style>"
