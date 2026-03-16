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


def resolve_options(template_id: str | None, user_options: dict | None) -> dict:
    """Merge user options with template defaults. Toujours inclure show_photo et show_mots_cles_ats pour tous les templates."""
    meta = get_template(template_id)
    defaults = {}
    for opt in meta.get("options") or []:
        defaults[opt["key"]] = opt.get("default")
    # Options globales (tous les templates, sans exception)
    defaults.setdefault("show_photo", True)
    defaults.setdefault("show_mots_cles_ats", True)
    final = {**defaults}
    if user_options:
        for k, v in user_options.items():
            if v is not None and (k in defaults or k in ("show_photo", "show_mots_cles_ats")):
                final[k] = v
    return final


import re as _re

_COLOR_RE = _re.compile(r'^#[0-9a-fA-F]{3,8}$')
_FONT_SAFE = {
    "Plus Jakarta Sans": "'Plus Jakarta Sans', Arial, sans-serif",
    "Inter": "'Inter', Arial, sans-serif",
    "Georgia": "Georgia, 'Times New Roman', serif",
}

def options_to_css_vars(options: dict) -> str:
    """Generates an inline <style> block that overrides :root CSS variables."""
    mapping = {
        "header_color": "--cv-header-color",
        "sidebar_color": "--cv-sidebar-color",
        "accent_color": "--cv-accent-color",
    }
    parts = []
    for key, css_var in mapping.items():
        val = options.get(key)
        if val and isinstance(val, str) and _COLOR_RE.match(val):
            parts.append(f"  {css_var}: {val};")
    font = options.get("font")
    if font and isinstance(font, str) and font in _FONT_SAFE:
        parts.append(f"  --cv-font-heading: {_FONT_SAFE[font]};")
    if not parts:
        return ""
    return "<style>:root {\n" + "\n".join(parts) + "\n}</style>"
