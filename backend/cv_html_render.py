"""
Rendu HTML du CV (Jinja2 + CSS template) pour l’aperçu navigateur et WeasyPrint.

Un seul point d’entrée : render_cv_html(). Toute la logique de contexte (expériences,
formations, options template, CSS inliné, preview_responsive vs PDF) vit ici pour que
l’export PDF et l’iframe utilisent exactement le même HTML lorsque for_preview/for_pdf
sont identiques.
"""
from __future__ import annotations

import html as html_module
import re
import sys
from pathlib import Path

# Racine du projet cv-bot (parent de backend/) — mêmes imports dynamiques que main.py
CV_BOT_ROOT = Path(__file__).resolve().parent.parent
if str(CV_BOT_ROOT) not in sys.path:
    sys.path.insert(0, str(CV_BOT_ROOT))

from backend.config import API_BASE_URL
from backend.template_registry import DEFAULT_TEMPLATE_ID

_ATS_STOPWORDS = frozenset({
    "de", "la", "le", "les", "des", "du", "et", "en", "un", "une", "aux", "au", "à", "a",
    "pour", "avec", "sans", "sur", "par", "dans", "est", "son", "sa", "ses", "ce", "cette", "ces",
    "qui", "que", "dont", "où", "plus", "pas", "ne", "nous", "vous", "ils", "elles", "elle",
    "the", "and", "for", "with", "from", "to", "of", "in", "on", "at", "or", "as", "by",
})


def _keywords_from_mots_cles_cache(cache: str) -> list[str]:
    """Tokens + bigrammes (+ trigrammes utiles) issus de mots_cles_cache, triés par longueur décroissante."""
    s = (cache or "").strip()
    if not s:
        return []
    tokens = [t.strip() for t in re.split(r"\s+", s) if t.strip()]
    seen: set[str] = set()
    phrases: list[str] = []

    def add_phrase(p: str) -> None:
        pl = p.lower().strip(".,;:")
        if len(pl) < 2:
            return
        if pl in seen:
            return
        seen.add(pl)
        phrases.append(p)

    for t in tokens:
        tl = t.lower().strip(".,;:")
        if len(tl) < 2 or tl in _ATS_STOPWORDS:
            continue
        add_phrase(t)

    for i in range(len(tokens) - 1):
        a, b = tokens[i], tokens[i + 1]
        pair = f"{a} {b}"
        pl = pair.lower().strip(".,;:")
        if len(pl.replace(" ", "")) < 4:
            continue
        add_phrase(pair)

    for i in range(len(tokens) - 2):
        b = tokens[i + 1].lower().strip(".,;:")
        if b in _ATS_STOPWORDS:
            continue
        tri = f"{tokens[i]} {tokens[i + 1]} {tokens[i + 2]}"
        tl = tri.lower().strip(".,;:")
        if len(tl.replace(" ", "")) < 5:
            continue
        add_phrase(tri)

    phrases.sort(key=len, reverse=True)
    return phrases


def _mots_cles_cache_for_pdf_export(raw: str, max_chars: int = 900) -> str:
    """Troncature export PDF : limite la hauteur du bloc ATS pour éviter un saut en page 2."""
    s = (raw or "").strip()
    if len(s) <= max_chars:
        return s
    return s[: max_chars - 1].rstrip() + "…"


def _ats_kw_boundary_ok(plain: str, start: int, end: int) -> bool:
    """Évite les sous-chaînes dans les mots (ex. « en » dans « Entreprise »)."""
    left = plain[start - 1] if start > 0 else ""
    right = plain[end] if end < len(plain) else ""

    def is_word_char(c: str) -> bool:
        return bool(c) and (c.isalnum() or c == "_")

    if is_word_char(left):
        return False
    if is_word_char(right):
        return False
    return True


def _ats_next_match(plain: str, i: int, kws: list[str]) -> tuple[int, int] | None:
    best_len = 0
    best: tuple[int, int] | None = None
    n = len(plain)
    for kw in kws:
        L = len(kw)
        if L == 0 or i + L > n:
            continue
        if plain[i : i + L].lower() != kw.lower():
            continue
        if not _ats_kw_boundary_ok(plain, i, i + L):
            continue
        if L > best_len:
            best_len = L
            best = (i, i + L)
    return best


def _ats_wrap_plain_text_segment(segment: str, kws: list[str]) -> str:
    """Segment HTML sans balise : entités décodées, mots-clés enveloppés, ré-échappé."""
    if not segment or not kws:
        return segment
    plain = html_module.unescape(segment)
    n = len(plain)
    out_parts: list[str] = []
    pos = 0
    while pos < n:
        m = _ats_next_match(plain, pos, kws)
        if m is None:
            out_parts.append(html_module.escape(plain[pos]))
            pos += 1
            continue
        s, e = m
        out_parts.append(html_module.escape(plain[pos:s]))
        out_parts.append(f'<span class="cv-ats-kw">{html_module.escape(plain[s:e])}</span>')
        pos = e
    return "".join(out_parts)


def _ats_highlight_preview_body(html: str, kws: list[str]) -> str:
    """Surligne les mots-clés ATS dans le body (aperçu seulement), hors <style> et <script>."""
    if not kws:
        return html
    low = html.lower()
    i = low.find("<body")
    if i < 0:
        return html
    m = re.search(r"<body[^>]*>", html[i : i + 300], re.I)
    if not m:
        return html
    start = i + m.end()
    j = low.rfind("</body>")
    if j < 0 or j <= start:
        return html
    before = html[:start]
    body = html[start:j]
    after = html[j:]

    protected: list[str] = []

    def _stash_block(match: re.Match) -> str:
        protected.append(match.group(0))
        return f"__AXEL_ATS_PROT_{len(protected) - 1}__"

    body = re.sub(r"<style[^>]*>[\s\S]*?</style>", _stash_block, body, flags=re.I)
    body = re.sub(r"<script[^>]*>[\s\S]*?</script>", _stash_block, body, flags=re.I)

    pieces = re.split(r"(<[^>]+>)", body)
    out: list[str] = []
    for p in pieces:
        if p.startswith("<"):
            out.append(p)
        else:
            out.append(_ats_wrap_plain_text_segment(p, kws))
    result = "".join(out)
    for idx, block in enumerate(protected):
        result = result.replace(f"__AXEL_ATS_PROT_{idx}__", block)
    return before + result + after


def _diff_highlight_html(base: str, current: str) -> str:
    """Compare base et current, entoure les changements en <span class="cv-changed">. Préserve les retours à la ligne."""
    from difflib import SequenceMatcher

    base = (base or "").strip()
    current = (current or "").strip()
    if base == current:
        return html_module.escape(current)
    base_lines = base.split("\n")
    current_lines = current.split("\n")
    out_lines = []
    for i, curr_line in enumerate(current_lines):
        base_line = base_lines[i] if i < len(base_lines) else ""
        if base_line == curr_line:
            out_lines.append(html_module.escape(curr_line))
            continue
        base_words = base_line.split()
        current_words = curr_line.split()
        if not current_words:
            out_lines.append("")
            continue
        matcher = SequenceMatcher(None, base_words, current_words)
        out = []
        for tag, i1, i2, j1, j2 in matcher.get_opcodes():
            segment = current_words[j1:j2]
            if not segment:
                continue
            text = " ".join(segment)
            escaped = html_module.escape(text)
            if tag == "equal":
                out.append(escaped)
            else:
                out.append(f'<span class="cv-changed">{escaped}</span>')
        out_lines.append(" ".join(out))
    return "\n".join(out_lines)


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
    from jinja2 import Environment, FileSystemLoader, select_autoescape
    from photo_assets import ensure_compressed_photo, get_photo_url_for_cv
    from adapter import _strip_h_f
    from backend.template_registry import get_template, get_template_dir, resolve_options, options_to_css_vars

    if selection_a4:
        try:
            from cv_select_a4 import apply_selection_to_cv

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
        ctx["titre_professionnel_display"] = _diff_highlight_html(titre_base, titre_cv)
        ctx["resume_display"] = _diff_highlight_html(
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
        if (exp.get("poste") or exp.get("entreprise") or any((exp.get("bullet_points") or [])))
    ]
    experiences_for_display = []
    for exp in experiences_with_content:
        base_exp = by_id.get(exp.get("id")) or {}
        do_hl = highlight_changes and base_cv

        def _hl(field: str) -> str:
            b_val = (base_exp.get(field) or "").strip()
            c_val = (exp.get(field) or "").strip()
            if do_hl:
                return _diff_highlight_html(b_val, c_val)
            return html_module.escape(c_val)

        bullets_raw = (exp.get("bullet_points") or [])[:max_bullets]
        base_bullets = base_exp.get("bullet_points") or []
        bullets_with_hl = []
        for j, b in enumerate(bullets_raw):
            base_b = base_bullets[j] if j < len(base_bullets) else ""
            bullets_with_hl.append(
                {
                    "text": b,
                    "html": _diff_highlight_html(base_b, b) if do_hl else html_module.escape(b),
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
        l
        for l in langues_all
        if (l.get("langue") if isinstance(l, dict) else None)
        or (l.get("niveau") if isinstance(l, dict) else None)
    ]

    ctx["show_mots_cles_ats"] = resolved_opts.get("show_mots_cles_ats", True)
    _raw_mots = (cv.get("mots_cles_cache") or "").strip()
    ctx["mots_cles_cache"] = _mots_cles_cache_for_pdf_export(_raw_mots) if for_pdf else _raw_mots

    actual_tid = tmpl_meta.get("id") or DEFAULT_TEMPLATE_ID
    if tmpl_meta.get("_custom"):
        env = Environment(autoescape=select_autoescape(("html", "xml")))
        html_str = env.from_string(tmpl_meta.get("_html_content") or "").render(**ctx)
        custom_css = (tmpl_meta.get("_css_content") or "").strip()
        if custom_css:
            import re as _re_css

            style_block = f"<style>{custom_css}</style>"
            html_str = _re_css.sub(
                r'<link\s[^>]*href\s*=\s*["\']?template\.css["\']?[^>]*>',
                style_block,
                html_str,
                count=0,
                flags=_re_css.IGNORECASE,
            )
            if style_block not in html_str:
                if "</head>" in html_str:
                    html_str = html_str.replace("</head>", style_block + "\n</head>", 1)
                elif "<body" in html_str:
                    import re as _re_body

                    html_str = _re_body.sub(r"(<body[^>]*>)", r"\1" + style_block, html_str, count=1)
                else:
                    html_str = style_block + html_str
        else:
            html_str = html_str.replace('href="template.css"', f'href="/api/templates/{actual_tid}/template.css"')
    else:
        env = Environment(
            loader=FileSystemLoader(str(tmpl_dir)),
            autoescape=select_autoescape(("html", "xml")),
        )
        template = env.get_template("template.html")
        html_str = template.render(**ctx)
        css_path = Path(tmpl_dir).resolve() / "template.css"
        if css_path.is_file():
            css_content = css_path.read_text(encoding="utf-8")
            style_block = f"<style>{css_content}</style>"
            import re as _re_link

            html_str = _re_link.sub(
                r'<link\s[^>]*href\s*=\s*["\']?template\.css["\']?[^>]*>',
                style_block,
                html_str,
                count=0,
                flags=_re_link.IGNORECASE,
            )
            if style_block not in html_str:
                html_str = html_str.replace('<link rel="stylesheet" href="template.css">', style_block, 1)
        else:
            html_str = html_str.replace('href="template.css"', f'href="/api/templates/{actual_tid}/template.css"')
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

    _has_typo_opts = template_options is not None and any(k in (template_options or {}) for k in TYPO_OPTION_DEFAULTS)
    if not _has_typo_opts:
        _ref = base_cv if base_cv else cv
        _exp_ref = [
            e
            for e in (_ref.get("experiences") or [])[:6]
            if (e.get("poste") or e.get("entreprise") or any((e.get("bullet_points") or [])))
        ]
        _bullet_ref = sum(len(e.get("bullet_points") or []) for e in _exp_ref)
        _form_ref = len(
            [
                f
                for f in (_ref.get("formations") or [])[:5]
                if (f.get("diplome") or f.get("etablissement") or f.get("date") or f.get("mention"))
            ]
        )
        _proj_ref = len([p for p in (_ref.get("projets") or [])[:5] if (p.get("nom") or p.get("description"))])
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
    if for_preview and not for_pdf:
        preview_ats_keywords = _keywords_from_mots_cles_cache((cv.get("mots_cles_cache") or "").strip())
        ats_kw_css = ""
        if preview_ats_keywords:
            ats_kw_css = (
                ".cv-preview span.cv-ats-kw{background-color:#86efac;padding:0 2px;border-radius:2px;box-decoration-break:clone;-webkit-box-decoration-break:clone}"
                ".cv-preview .cv-header span.cv-ats-kw,.cv-preview .cv-sidebar span.cv-ats-kw{background-color:#166534;color:#bbf7d1}"
                ".cv-preview span.cv-changed span.cv-ats-kw{background-color:transparent!important;color:inherit!important;padding:0!important;border-radius:0!important}"
                ".cv-preview .header-titre-inline span.cv-ats-kw,.cv-preview .header-titre span.cv-ats-kw,.cv-preview .sidebar-titre span.cv-ats-kw,.cv-preview .resume-text span.cv-ats-kw{white-space:normal!important;overflow-wrap:break-word!important;word-break:break-word}"
                "@media print{.cv-preview span.cv-ats-kw{background:transparent!important;color:inherit!important;padding:0}}"
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
        if preview_ats_keywords:
            html_str = _ats_highlight_preview_body(html_str, preview_ats_keywords)
    return html_str


# Alias historique (main.py et tests éventuels)
_render_cv_html = render_cv_html
