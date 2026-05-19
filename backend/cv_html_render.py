"""
Rendu HTML du CV (Jinja2 + CSS template) pour l’aperçu navigateur et WeasyPrint.

Un seul point d’entrée : render_cv_html(). Toute la logique de contexte (expériences,
formations, options template, CSS inliné, preview_responsive vs PDF) vit ici pour que
l’export PDF et l’iframe soient alignés : avec CV_BOT_PDF_ENGINE=chromium, le bloc
preview_responsive (même largeur .cv, césures, overflow) est aussi injecté pour le PDF ;
WeasyPrint conserve l’ancien comportement (sans ce bloc) pour ne pas casser l’export.
"""

from __future__ import annotations

import html as html_module
import re
import sys
import threading
from pathlib import Path
from typing import Any

# Racine du projet cv-bot (parent de backend/) — mêmes imports dynamiques que main.py
CV_BOT_ROOT = Path(__file__).resolve().parent.parent
if str(CV_BOT_ROOT) not in sys.path:
    sys.path.insert(0, str(CV_BOT_ROOT))

from backend.config import API_BASE_URL
from backend.css_sanitize import sanitize_css_for_style_tag
from backend.cv_pdf_dispatch import pdf_engine_is_chromium
from backend.services import cv_render_helpers
from backend.template_registry import DEFAULT_TEMPLATE_ID

# Caches Jinja & CSS partagés entre tous les renders.
# Avant : chaque appel render_cv_html() créait un nouvel Environment + lisait template.html
# + lisait template.css depuis le disque. Sur un endpoint qui re-render à chaque key-up
# (preview), ça représente des dizaines d'I/O / sec inutiles + de la pression GC.
# Maintenant : Environment et Template sont parsés une fois par template_dir, le CSS
# est gardé en mémoire (quelques Ko par template). Invalidé via _invalidate_render_caches().
_RENDER_LOCK = threading.Lock()
_FILE_ENV_CACHE: dict[str, Any] = {}  # key = str(template_dir) → (env, template, css_str)
_CUSTOM_TEMPLATE_CACHE: dict[str, Any] = {}  # key = template_id → parsed jinja Template
_CUSTOM_ENV: Any = None  # Environment partagé pour from_string


def _invalidate_render_caches(template_id: str | None = None) -> None:
    """À appeler si un template perso est édité (le HTML peut avoir changé)."""
    with _RENDER_LOCK:
        if template_id:
            _CUSTOM_TEMPLATE_CACHE.pop(template_id, None)
        else:
            _CUSTOM_TEMPLATE_CACHE.clear()
            _FILE_ENV_CACHE.clear()


def _get_file_env_and_template(template_dir: Path) -> tuple[Any, Any, str]:
    """Retourne (Environment, Template, css_str) pour un template fichier. Cache par dir."""
    from jinja2 import Environment, FileSystemLoader, select_autoescape

    key = str(template_dir)
    cached = _FILE_ENV_CACHE.get(key)
    if cached is not None:
        return cached
    with _RENDER_LOCK:
        cached = _FILE_ENV_CACHE.get(key)
        if cached is not None:
            return cached
        env = Environment(
            loader=FileSystemLoader(str(template_dir)),
            autoescape=select_autoescape(("html", "xml")),
            cache_size=50,
        )
        template = env.get_template("template.html")
        css_path = Path(template_dir).resolve() / "template.css"
        css_str = ""
        if css_path.is_file():
            try:
                css_str = css_path.read_text(encoding="utf-8")
            except OSError:
                css_str = ""
        cached = (env, template, css_str)
        _FILE_ENV_CACHE[key] = cached
        return cached


def _get_custom_template(template_id: str, html_content: str) -> Any:
    """Retourne la Template Jinja parsée pour un template perso. Cache par template_id."""
    from jinja2 import select_autoescape
    from jinja2.sandbox import SandboxedEnvironment

    global _CUSTOM_ENV
    cached = _CUSTOM_TEMPLATE_CACHE.get(template_id)
    if cached is not None:
        return cached
    with _RENDER_LOCK:
        cached = _CUSTOM_TEMPLATE_CACHE.get(template_id)
        if cached is not None:
            return cached
        if _CUSTOM_ENV is None:
            _CUSTOM_ENV = SandboxedEnvironment(
                autoescape=select_autoescape(("html", "xml")),
                cache_size=200,
            )
        tmpl = _CUSTOM_ENV.from_string(html_content or "")
        _CUSTOM_TEMPLATE_CACHE[template_id] = tmpl
        return tmpl


def render_cv_html(
    cv: dict,
    base_cv: dict | None = None,
    highlight_changes: bool = False,
    for_preview: bool = False,
    for_pdf: bool = False,
    template_id: str | None = None,
    template_options: dict | None = None,
    selection_a4: dict | None = None,
) -> str:
    """
    Rend le HTML complet du CV (template + CSS inliné + variables :root + options preview/PDF).

    Règles importantes :
    - for_preview et for_pdf sont indépendants ; pour un PDF aligné sur l’aperçu : for_preview=True, for_pdf=True.
    - for_pdf=True désactive preview_responsive (overflow/hauteurs qui cassent WeasyPrint).
    - Les chemins photo et assets utilisent CV_BOT_ROOT comme dans l’API.
    """
    from backend.services.adapter import _strip_h_f
    from backend.services.photo_assets import ensure_compressed_photo, get_photo_url_for_cv
    from backend.template_registry import (
        get_template,
        get_template_dir,
        options_to_css_vars,
        resolve_options,
    )

    if selection_a4:
        try:
            from backend.services.cv_select_a4 import apply_selection_to_cv

            cv = apply_selection_to_cv(cv, selection_a4)
        except Exception:
            pass

    tmpl_meta = get_template(template_id)
    tmpl_dir = get_template_dir(template_id) if not tmpl_meta.get("_custom") else None
    resolved_opts = resolve_options(template_id, template_options)
    show_photo = resolved_opts.get("show_photo", True)

    if not cv.get("__example__"):
        ensure_compressed_photo(
            CV_BOT_ROOT,
            cv.get("photo_url"),
            cv.get("prenom"),
            cv.get("nom"),
            allow_assets_fallback=False,
        )
        photo_url = get_photo_url_for_cv(
            CV_BOT_ROOT,
            cv.get("photo_url"),
            cv.get("prenom"),
            cv.get("nom"),
            allow_assets_fallback=False,
        )
        if photo_url:
            cv = {**cv, "photo_url": photo_url}
        else:
            cv = {**cv, "photo_url": None}

    if not show_photo:
        cv = {**cv, "photo_url": None}

    ctx = dict(cv)
    ctx["for_preview"] = for_preview
    ctx["for_pdf"] = bool(for_pdf)
    base_doc = base_cv or {}
    titre_cv = _strip_h_f((cv.get("titre_professionnel") or "").strip())
    titre_base = _strip_h_f((base_doc.get("titre_professionnel") or "").strip())
    if highlight_changes and base_cv:
        ctx["titre_professionnel_display"] = cv_render_helpers.diff_highlight_html(
            titre_base, titre_cv
        )
        ctx["resume_display"] = cv_render_helpers.diff_highlight_html(
            (base_doc.get("resume") or "").strip(),
            (cv.get("resume") or "").strip(),
        )
    else:
        ctx["titre_professionnel_display"] = html_module.escape(titre_cv)
        ctx["resume_display"] = html_module.escape((cv.get("resume") or "").strip())

    use_selection = bool(selection_a4)
    max_exp = 20 if use_selection else 15
    max_bullets = 3 if use_selection else 3
    max_form = 10 if use_selection else 8
    max_proj = 10 if use_selection else 5

    by_id = {e.get("id"): e for e in (base_doc.get("experiences") or []) if e.get("id")}
    experiences_raw = (cv.get("experiences") or [])[:max_exp]
    experiences_with_content = [
        exp
        for exp in experiences_raw
        if (exp.get("poste") or exp.get("entreprise") or any(exp.get("bullet_points") or []))
    ]
    experiences_for_display = []
    for exp in experiences_with_content:
        base_exp = by_id.get(exp.get("id")) or {}
        do_hl = highlight_changes and base_cv

        def _hl(field: str) -> str:
            b_val = (base_exp.get(field) or "").strip()
            c_val = (exp.get(field) or "").strip()
            if do_hl:
                return cv_render_helpers.diff_highlight_html(b_val, c_val)
            return html_module.escape(c_val)

        bullets_raw = (exp.get("bullet_points") or [])[:max_bullets]
        base_bullets = base_exp.get("bullet_points") or []
        bullets_with_hl = []
        for j, b in enumerate(bullets_raw):
            base_b = base_bullets[j] if j < len(base_bullets) else ""
            bullets_with_hl.append(
                {
                    "text": b,
                    "html": (
                        cv_render_helpers.diff_highlight_html(base_b, b)
                        if do_hl
                        else html_module.escape(b)
                    ),
                }
            )
        exp_display = {
            **exp,
            "bullet_points": bullets_with_hl,
            "entreprise_display": _hl("entreprise"),
            "poste_display": _hl("poste"),
            "date_debut_display": _hl("date_debut"),
            "date_fin_display": _hl("date_fin"),
            "lieu_display": _hl("lieu"),
            "secteur_display": _hl("secteur"),
            "clients_display": _hl("clients"),
        }
        experiences_for_display.append(exp_display)
    ctx["experiences_for_display"] = experiences_for_display

    formations_all = cv.get("formations") or []
    ctx["formations_for_display"] = [
        f
        for f in formations_all[:max_form]
        if (f.get("diplome") or f.get("etablissement") or f.get("date") or f.get("mention"))
    ]

    certs_all = cv.get("certifications") or []
    ctx["certifications_for_display"] = [
        c for c in certs_all if (c.get("nom") or c.get("organisme") or c.get("date"))
    ]

    projs_all = cv.get("projets") or []
    ctx["projets_for_display"] = [
        p for p in projs_all[:max_proj] if (p.get("nom") or p.get("description"))
    ]

    comp = cv.get("competences") or {}
    langues_all = comp.get("langues") or []
    ctx["langues_for_display"] = [
        lg
        for lg in langues_all
        if (lg.get("langue") if isinstance(lg, dict) else None)
        or (lg.get("niveau") if isinstance(lg, dict) else None)
    ]

    ctx["show_mots_cles_ats"] = resolved_opts.get("show_mots_cles_ats", True)
    _raw_mots = (cv.get("mots_cles_cache") or "").strip()
    ctx["mots_cles_cache"] = (
        cv_render_helpers.mots_cles_cache_for_pdf_export(_raw_mots) if for_pdf else _raw_mots
    )

    actual_tid = tmpl_meta.get("id") or DEFAULT_TEMPLATE_ID
    if tmpl_meta.get("_custom"):
        # Template perso (HTML/CSS stockés en DB) — Template Jinja parsée 1× et cachée.
        tmpl_obj = _get_custom_template(actual_tid, tmpl_meta.get("_html_content") or "")
        html_str = tmpl_obj.render(**ctx)
        custom_css = sanitize_css_for_style_tag((tmpl_meta.get("_css_content") or "").strip())
        # Toujours inliner le CSS perso : un <link href="…/template.css"> ne porterait pas le Bearer,
        # alors que GET /api/templates/.../template.css exige une session autorisée.
        style_block = f"<style>{custom_css}</style>"
        html_str = re.sub(
            r'<link\s[^>]*href\s*=\s*["\']?template\.css["\']?[^>]*>',
            style_block,
            html_str,
            count=0,
            flags=re.IGNORECASE,
        )
        if style_block not in html_str:
            if "</head>" in html_str:
                html_str = html_str.replace("</head>", style_block + "\n</head>", 1)
            elif "<body" in html_str:
                html_str = re.sub(r"(<body[^>]*>)", r"\1" + style_block, html_str, count=1)
            else:
                html_str = style_block + html_str
    else:
        # Template fichier — env Jinja + Template + CSS lus 1× et cachés en mémoire.
        assert tmpl_dir is not None
        _env, template, css_content = _get_file_env_and_template(Path(tmpl_dir))
        html_str = template.render(**ctx)
        if css_content:
            style_block = f"<style>{css_content}</style>"
            html_str = re.sub(
                r'<link\s[^>]*href\s*=\s*["\']?template\.css["\']?[^>]*>',
                style_block,
                html_str,
                count=0,
                flags=re.IGNORECASE,
            )
            if style_block not in html_str:
                html_str = html_str.replace(
                    '<link rel="stylesheet" href="template.css">', style_block, 1
                )
        else:
            html_str = html_str.replace(
                'href="template.css"', f'href="/api/templates/{actual_tid}/template.css"'
            )
    if 'src="assets/' in html_str:
        html_str = html_str.replace('src="assets/', 'src="/api/assets/')

    api_base = (API_BASE_URL or "").strip().rstrip("/")
    if api_base:
        html_str = html_str.replace("<head>", f'<head><base href="{api_base}/">', 1)

    css_vars_style = options_to_css_vars(resolved_opts)
    if css_vars_style:
        html_str = html_str.replace("</head>", css_vars_style + "</head>", 1)

    from backend.template_registry import TYPO_OPTION_DEFAULTS

    if tmpl_meta.get("_custom") and css_vars_style:
        typo_override = (
            "<style>"
            ".cv .header-nom,.cv .sidebar-nom,.cv .main-header h1{font-size:var(--cv-fs-name, 15pt) !important;color:var(--cv-header-color, #000) !important}"
            ".cv .header-titre-inline,.cv .header-titre,.cv .sidebar-titre,.cv .main-header p{font-size:var(--cv-fs-title, 10pt) !important;color:var(--cv-color-body, #555) !important}"
            ".cv .section-title,.cv .main-section-title,.cv .sidebar-section-title,.cv .sidebar-category,.cv h2,.cv .left-column h2,.cv .right-column h2{font-size:var(--cv-fs-section, 9.5pt) !important;color:var(--cv-color-section-title, var(--cv-accent-color, #1e2a3a)) !important}"
            ".cv .resume-text,.cv .header-contact,.cv .cv-main,.cv .exp-poste,.cv .formation-diplome,.cv .right-column,.cv .profil p,.cv .timeline-content h3,.cv .timeline-content .company,.cv .timeline-content .date{font-size:var(--cv-fs-body, 9pt) !important;color:var(--cv-color-body, #1a1a1a) !important}"
            ".cv .experience-item .bullet,.cv .bullet,.cv .timeline-content .bullets li{font-size:var(--cv-fs-bullet, 9pt) !important;color:var(--cv-color-body, #1a1a1a) !important}"
            ".cv .sidebar-item,.cv .left-column ul li,.cv .contact ul li{font-size:var(--cv-fs-sidebar-item, 8pt) !important;color:var(--cv-color-body, #333) !important}"
            ".cv .exp-entreprise,.cv .formation-diplome{color:var(--cv-color-body, #1a1a1a) !important}"
            ".cv .left-column{background-color:var(--cv-sidebar-color, #f7f7f7) !important}"
            "body,.cv{color:var(--cv-color-body, #1a1a1a) !important}"
            ".cv .header-photo,.cv .header-photo img,.cv .sidebar-photo,.cv .sidebar-photo img{width:var(--cv-photo-size,72px) !important;height:var(--cv-photo-size,72px) !important}"
            "</style>"
        )
        html_str = html_str.replace("</head>", typo_override + "</head>", 1)

    _has_typo_opts = template_options is not None and any(
        k in (template_options or {}) for k in TYPO_OPTION_DEFAULTS
    )
    if not _has_typo_opts:
        _ref = base_cv if base_cv else cv
        _exp_ref = [
            e
            for e in (_ref.get("experiences") or [])[:6]
            if (e.get("poste") or e.get("entreprise") or any(e.get("bullet_points") or []))
        ]
        _bullet_ref = sum(len(e.get("bullet_points") or []) for e in _exp_ref)
        _form_ref = len(
            [
                f
                for f in (_ref.get("formations") or [])[:5]
                if (f.get("diplome") or f.get("etablissement") or f.get("date") or f.get("mention"))
            ]
        )
        _proj_ref = len(
            [p for p in (_ref.get("projets") or [])[:5] if (p.get("nom") or p.get("description"))]
        )
        content_score = len(_exp_ref) * 3 + _bullet_ref + _form_ref + _proj_ref
        if content_score <= 6:
            scale_css = "<style>body{font-size:11pt;line-height:1.55}.resume-text{font-size:10.5pt;line-height:1.6}.sidebar-item{font-size:9.5pt;line-height:1.4}.section-title{font-size:10.5pt}.exp-poste{font-size:11pt}</style>"
            html_str = html_str.replace("</head>", scale_css + "</head>", 1)
        elif content_score <= 10:
            scale_css = "<style>body{font-size:10pt;line-height:1.5}.resume-text{font-size:10pt;line-height:1.55}.sidebar-item{font-size:9pt;line-height:1.35}</style>"
            html_str = html_str.replace("</head>", scale_css + "</head>", 1)
        elif content_score > 15:
            scale_css = "<style>body{font-size:9pt;line-height:1.45}.resume-text{font-size:9pt;line-height:1.5}.sidebar-item{font-size:8pt;line-height:1.3}.section-title{font-size:9.5pt}.exp-poste{font-size:9.5pt}</style>"
            html_str = html_str.replace("</head>", scale_css + "</head>", 1)

    if highlight_changes and base_cv:
        highlight_styles = (
            "<style>"
            ".cv-changed{background-color:#c5e3cd;padding:0 1px;border-radius:1px}"
            ".cv-header .cv-changed,.cv-sidebar .cv-changed{background-color:#9dc6ae;color:#0f2418}"
            "html.cv-preview .cv-changed,html.cv-preview .cv-header .cv-changed,html.cv-preview .cv-sidebar .cv-changed,html.cv-preview .cv-main .cv-changed{"
            "background-color:#c5e3cd!important;color:#0f2418!important;padding:0 2px;border-radius:2px;box-decoration-break:clone;-webkit-box-decoration-break:clone"
            "}"
            "span.cv-changed span.cv-ats-kw{background-color:transparent!important;color:inherit!important;padding:0!important;border-radius:0!important;box-shadow:none!important}"
            "@media print{"
            ".cv-changed{background-color:transparent;padding:0}"
            ".cv-header .cv-changed{color:#ffffff!important}"
            ".cv-main .cv-changed{color:var(--cv-color-body,#1e293b)!important}"
            ".cv-sidebar .cv-changed{background-color:transparent;color:inherit}"
            "}"
            "</style>"
        )
        html_str = html_str.replace("</head>", highlight_styles + "</head>", 1)
    inject_preview_responsive = for_preview and (not for_pdf or pdf_engine_is_chromium())
    if inject_preview_responsive:
        preview_ats_keywords = (
            cv_render_helpers.keywords_from_mots_cles_cache(
                (cv.get("mots_cles_cache") or "").strip()
            )
            if not for_pdf
            else []
        )
        ats_kw_css = ""
        if preview_ats_keywords:
            ats_kw_css = (
                "html.cv-preview span.cv-ats-kw{background-color:#c5e3cd!important;color:#0f2418!important;padding:0 2px;border-radius:2px;box-decoration-break:clone;-webkit-box-decoration-break:clone}"
                "html.cv-preview .cv-header span.cv-ats-kw,html.cv-preview .cv-sidebar span.cv-ats-kw{background-color:#c5e3cd!important;color:#0f2418!important}"
                "html.cv-preview span.cv-changed span.cv-ats-kw{background-color:transparent!important;color:inherit!important;padding:0!important;border-radius:0!important}"
                "html.cv-preview .header-titre-inline span.cv-ats-kw,html.cv-preview .header-titre span.cv-ats-kw,html.cv-preview .sidebar-titre span.cv-ats-kw,html.cv-preview .resume-text span.cv-ats-kw{white-space:normal!important;overflow-wrap:break-word!important;word-break:break-word}"
                "@media print{html.cv-preview span.cv-ats-kw{background:transparent!important;color:inherit!important;padding:0}}"
            )
        scrollbar_style = (
            "html,body{scrollbar-width:thin;scrollbar-color:rgba(107,70,193,0.45) transparent}"
            "html::-webkit-scrollbar,body::-webkit-scrollbar{width:2px;height:2px}"
            "html::-webkit-scrollbar-track,body::-webkit-scrollbar-track{background:transparent}"
            "html::-webkit-scrollbar-thumb,body::-webkit-scrollbar-thumb{background:rgba(107,70,193,0.45);border-radius:1px}"
            "html::-webkit-scrollbar-thumb:hover,body::-webkit-scrollbar-thumb:hover{background:rgba(107,70,193,0.7)}"
        )
        preview_responsive = (
            "<style>"
            + ats_kw_css
            + ".cv-preview .cv.cv-print-split .cv-sidebar .section-mots-cles-ats{max-height:52mm!important;overflow:hidden!important;flex-shrink:0!important;min-height:0!important;break-inside:avoid!important;page-break-inside:avoid!important;}"
            + ".cv-preview .cv:not(.cv-print-split) .cv-sidebar .section-mots-cles-ats{max-height:52mm!important;overflow:hidden!important;flex-shrink:0!important;margin-top:8px!important;break-inside:avoid!important;page-break-inside:avoid!important;}"
            + ".cv-preview .cv:not(.cv-print-split):not(.cv-pdf-dual-column) .section-mots-cles-ats{max-height:14mm!important;overflow:hidden!important;break-inside:avoid!important;page-break-inside:avoid!important;}"
            + "html,body{margin:0!important;padding:0!important;}html{overflow-x:hidden!important;}body.cv-preview{overflow-x:hidden!important;}"
            + "html.cv-preview,body.cv-preview{min-width:210mm!important;}"
            ".cv-preview .cv{width:210mm!important;max-width:100%!important;min-height:297mm!important;height:auto!important;max-height:none!important;overflow-x:hidden!important;overflow-y:visible!important}"
            ".cv-preview .cv:not(.cv-print-split):not(.cv-pdf-dual-column){max-height:none!important}"
            ".cv-preview .cv:not(.cv-print-split):not(.cv-pdf-dual-column) .cv-body{overflow:visible!important;flex:1 1 auto!important}"
            ".cv-preview .cv-body{min-height:0!important;overflow-x:hidden!important;overflow-y:visible!important}"
            ".cv-preview body{overflow-x:hidden}"
            ".cv-preview .resume-text{white-space:pre-line}"
            ".cv-preview .cv>.cv-header,.cv-preview .cv>.cv-body{min-width:0}"
            ".cv-preview .cv-main{min-width:0;overflow-wrap:break-word}"
            ".cv-preview .cv.cv-print-split .cv-sidebar{min-width:0;max-width:200px;box-sizing:border-box;top:0!important;bottom:0!important;max-height:none!important;overflow:hidden!important}"
            ".cv-preview .header-top-row{min-width:0}"
            ".cv-preview .header-nom{display:block!important;min-width:0!important;flex-shrink:1!important}"
            ".cv-preview .header-nom-part{display:inline!important;white-space:nowrap!important}"
            ".cv-preview .header-titre-inline{overflow-wrap:break-word;white-space:normal!important}"
            ".cv-preview .header-titre-inline .cv-changed,.cv-preview .cv-header .cv-changed,.cv-preview .header-titre .cv-changed,.cv-preview .sidebar-titre .cv-changed{white-space:normal!important;overflow-wrap:break-word!important;word-break:break-word}"
            ".cv-preview .cv-header .resume-text .cv-changed{white-space:normal!important;overflow-wrap:break-word!important}"
            ".cv-preview .exp-header{min-width:0}"
            ".cv-preview .exp-entreprise,.cv-preview .exp-dates{min-width:0;overflow-wrap:break-word}"
            ".cv-preview .exp-dates{white-space:normal}"
            ".cv-preview .experience-item{min-width:0}"
            ".cv-preview .bullet,.cv-preview .exp-poste{overflow-wrap:break-word}"
            ".cv-preview .exp-poste{white-space:normal!important;min-width:0}"
            ".cv-preview .exp-poste span,.cv-preview .exp-poste .ats-label{white-space:normal!important}"
            ".cv-preview .exp-poste-inline{white-space:normal!important;overflow-wrap:break-word}"
            ".cv-preview .cv p,.cv-preview .cv h1,.cv-preview .cv h2,.cv-preview .cv h3,.cv-preview .cv li,.cv-preview .cv td{overflow-wrap:break-word!important;word-break:break-word;white-space:normal!important}"
            ".cv-preview .cv .resume-text{white-space:pre-line!important}"
            ".cv-preview .cv .section-title,.cv-preview .cv .sidebar-section-title,.cv-preview .cv .main-section-title,.cv-preview .cv .sidebar-category,.cv-preview .cv .formation-diplome,.cv-preview .cv .formation-date,.cv-preview .cv .projet-nom,.cv-preview .cv .projet-description,.cv-preview .cv .sidebar-item,.cv-preview .cv .skill-tag,.cv-preview .cv .cert-item,.cv-preview .cv .lang-item,.cv-preview .cv .skills-line,.cv-preview .cv .exp-left,.cv-preview .cv .header-titre,.cv-preview .cv .sidebar-titre,.cv-preview .cv .header-text{overflow-wrap:break-word!important;word-break:break-word;white-space:normal!important}"
            + scrollbar_style
            + "</style>"
        )
        html_str = html_str.replace("</head>", preview_responsive + "</head>", 1)
        if preview_ats_keywords and not for_pdf:
            html_str = cv_render_helpers.ats_highlight_preview_body(html_str, preview_ats_keywords)
    return html_str


# Alias historique (main.py et tests éventuels)
_render_cv_html = render_cv_html
