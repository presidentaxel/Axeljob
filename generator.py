#!/usr/bin/env python3
"""
Génération du PDF à partir du CV adapté et du template HTML/CSS.
Jinja2 pour l'injection, WeasyPrint pour le PDF.
"""

import os
import re
from pathlib import Path

# Windows : ajouter les dossiers des DLL (Pango/GTK) avant d'importer WeasyPrint
if os.name == "nt":
    dll_dirs = os.environ.get("WEASYPRINT_DLL_DIRECTORIES", "").strip()
    if dll_dirs:
        for dir_path in dll_dirs.replace(",", ";").split(";"):
            dir_path = os.path.abspath(dir_path.strip())
            if dir_path and os.path.isdir(dir_path):
                os.environ["PATH"] = dir_path + os.pathsep + os.environ.get("PATH", "")
                try:
                    os.add_dll_directory(dir_path)
                except OSError:
                    pass

from jinja2 import Environment, FileSystemLoader, select_autoescape

from photo_assets import ensure_compressed_photo, get_photo_url_for_cv


def _strip_h_f(text: str) -> str:
    """Retire (H/F) et (F/H) du titre (insensible à la casse)."""
    if not text or not isinstance(text, str):
        return text
    return re.sub(r"\s*\([HhFf]/[HhFf]\)", "", text).strip()


def _sanitize_filename(s: str, max_len: int = 80) -> str:
    """Retire les caractères interdits et normalise l'Unicode (évite latin-1 / zip)."""
    if not s:
        return ""
    s = str(s).replace("\u2013", "-").replace("\u2014", "-")
    s = s.replace("\u2018", "'").replace("\u2019", "'").replace("\u201c", '"').replace("\u201d", '"')
    s = "".join(c if ord(c) < 256 else "-" for c in s)
    s = re.sub(r'[<>:"/\\|?*]', "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s[:max_len] if s else ""


def _nom_fichier_pdf(cv: dict, offre: dict) -> str:
    """Nomme le fichier : 'Prenom Nom - Poste.pdf' si titre fourni, sinon Prenom_Nom_CV.pdf ou ancien format."""
    prenom = (cv.get("prenom") or "").strip()
    nom = (cv.get("nom") or "").strip()
    poste = (offre.get("titre") or "").strip()
    entreprise = (offre.get("entreprise") or "").strip()

    prenom_ok = prenom.title() if prenom else "CV"
    nom_ok = nom.title() if nom else "Sortie"

    # Format demandé : "Prenom Nom - Poste.pdf"
    if poste:
        poste_ok = _sanitize_filename(poste) or "CV"
        return f"{prenom_ok} {nom_ok} - {poste_ok}.pdf"

    # Export PDF seul (sans offre) → Prenom Nom - CV.pdf
    if not entreprise:
        return f"{prenom_ok} {nom_ok} - CV.pdf"

    # Ancien format avec entreprise si besoin
    def clean(s: str) -> str:
        s = re.sub(r"[^\w\s\-]", "", s)
        s = re.sub(r"\s+", "_", s).strip("_")
        return s.lower()

    poste_ok = clean(poste).title().replace("_", " ") or "Poste"
    poste_ok = re.sub(r"\s+", "_", poste_ok)
    entreprise_ok = clean(entreprise).title().replace("_", " ") or "Entreprise"
    entreprise_ok = re.sub(r"\s+", "_", entreprise_ok)
    return f"{prenom_ok}_{nom_ok}_{poste_ok}_{entreprise_ok}.pdf"


def generer_pdf(cv_adapte: dict, offre: dict, output_dir: str = ".", template_id: str | None = None, template_options: dict | None = None) -> str:
    """
    Charge template.html, injecte cv_adapte, compile en PDF avec WeasyPrint.
    Même logique que generer_pdf_bytes : si la version compacte tient sur 1 page, on ajoute une 7e exp et un 2e projet.
    Retourne le chemin absolu du fichier PDF généré.
    """
    pdf_bytes, nom_pdf = generer_pdf_bytes(
        cv_adapte, offre, base_dir=Path(__file__).resolve().parent,
        template_id=template_id, template_options=template_options,
    )
    out = Path(output_dir).resolve()
    out.mkdir(parents=True, exist_ok=True)
    path_pdf = out / nom_pdf
    path_pdf.write_bytes(pdf_bytes)
    return str(path_pdf)


def _build_cv_display(cv_adapte: dict, html_module, n_experiences: int = 6, n_projets: int = 1) -> dict:
    """Construit le contexte d’affichage : n_experiences (6 ou 7), n_projets (1 ou 2), 2 bullets par exp."""
    experiences_for_display = []
    for exp in (cv_adapte.get("experiences") or [])[:n_experiences]:
        if not (exp.get("poste") or exp.get("entreprise") or any((exp.get("bullet_points") or []))):
            continue
        bullets = (exp.get("bullet_points") or [])[:2]
        escape = html_module.escape
        exp_display = {
            **exp,
            "bullet_points": [{"text": b, "html": escape(b)} for b in bullets],
            "poste_display": escape((exp.get("poste") or "").strip()),
            "entreprise_display": escape((exp.get("entreprise") or "").strip()),
            "date_debut_display": escape((exp.get("date_debut") or "").strip()),
            "date_fin_display": escape((exp.get("date_fin") or "").strip()),
            "lieu_display": escape((exp.get("lieu") or "").strip()),
            "secteur_display": escape((exp.get("secteur") or "").strip()),
            "clients_display": escape((exp.get("clients") or "").strip()),
        }
        experiences_for_display.append(exp_display)

    formations_all = cv_adapte.get("formations") or []
    formations_for_display = [
        f for f in formations_all[:5]
        if (f.get("diplome") or f.get("etablissement") or f.get("date") or f.get("mention"))
    ]

    certs_all = cv_adapte.get("certifications") or []
    certifications_for_display = [
        c for c in certs_all
        if (c.get("nom") or c.get("organisme") or c.get("date"))
    ]

    projs_all = cv_adapte.get("projets") or []
    projets_for_display = [
        p for p in projs_all[:n_projets]
        if (p.get("nom") or p.get("description"))
    ]

    comp = cv_adapte.get("competences") or {}
    langues_all = comp.get("langues") or []
    langues_for_display = [
        l for l in langues_all
        if (l.get("langue") if isinstance(l, dict) else None) or (l.get("niveau") if isinstance(l, dict) else None)
    ]

    return {
        "experiences_for_display": experiences_for_display,
        "formations_for_display": formations_for_display,
        "certifications_for_display": certifications_for_display,
        "projets_for_display": projets_for_display,
        "langues_for_display": langues_for_display,
    }


def _content_scale_css(content_score: int) -> str:
    """Retourne du CSS pour adapter la taille de police à la quantité de contenu (aligné avec la preview)."""
    if content_score <= 6:
        return "<style>body{font-size:11pt;line-height:1.55}.resume-text{font-size:10.5pt;line-height:1.6}.bullet{font-size:10.5pt;line-height:1.5}.sidebar-item{font-size:9.5pt;line-height:1.4}.section-title{font-size:10.5pt}.exp-poste{font-size:11pt}</style>"
    if content_score <= 10:
        return "<style>body{font-size:10pt;line-height:1.5}.resume-text{font-size:10pt;line-height:1.55}.bullet{font-size:9.5pt;line-height:1.45}.sidebar-item{font-size:9pt;line-height:1.35}</style>"
    if content_score > 15:
        return "<style>body{font-size:9pt;line-height:1.45}.resume-text{font-size:9pt;line-height:1.5}.bullet{font-size:8.5pt;line-height:1.4}.sidebar-item{font-size:8pt;line-height:1.3}.section-title{font-size:9.5pt}.exp-poste{font-size:9.5pt}</style>"
    return ""

# Minimal : garder la min-height pour que la grid .cv ne collapse pas (1fr ait de l'espace), sans toucher overflow.
# Sidebar en position absolute : limiter à la hauteur d'une page pour éviter qu'elle descende sur les pages suivantes (Classic, Impact, Executive).
PDF_EXPORT_LAYOUT_CSS = (
    "<style>"
    ".cv-preview .cv{min-height:297mm!important;}"
    ".cv-preview .cv-body{min-height:0!important;}"
    ".cv-preview .cv-sidebar{max-height:250mm!important;}"
    "</style>"
)

# Templates personnalisés (Supabase) : supprimer marges (WeasyPrint 2cm par défaut + .cv) et fond gris.
PDF_EXPORT_CUSTOM_TEMPLATE_FIX = (
    "<style>"
    "@page{margin:0}"
    "body{background:#fff!important;margin:0!important;padding:0!important}"
    ".cv{margin:0!important}"
    "</style>"
)

# Export : uniquement @page + print-color-adjust pour WeasyPrint. Le template (couleurs, layout, options) reste maître.
# Ne pas forcer font-size:0 sur .mots-cles-ats-invisible : WeasyPrint omet souvent ce texte de la couche texte du PDF,
# donc les ATS et la copie depuis le PDF ne voient pas les mots-clés. Le template.css (@media print, ~5pt, couleur = sidebar) suffit.
PDF_EXPORT_PREVIEW_ALIGN_CSS = (
    "<style>"
    "@page{size:A4;margin:0}"
    "body.cv-preview,.cv-preview .cv-header,.cv-preview .cv-sidebar{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}"
    "@media print{"
    ".cv-preview .section-mots-cles-ats .mots-cles-ats-titre{display:none!important;}"
    "}"
    "</style>"
)


def _render_pdf_bytes_from_ctx(cv_ctx: dict, template_dir: Path, css, css_vars_style: str = "", scale_css: str = "") -> bytes:
    """Génère les bytes PDF à partir d’un contexte CV déjà prêt (photo, display, etc.)."""
    from weasyprint import HTML
    env = Environment(
        loader=FileSystemLoader(str(template_dir)),
        autoescape=select_autoescape(("html", "xml")),
    )
    template = env.get_template("template.html")
    html_str = template.render(**cv_ctx)
    inject = PDF_EXPORT_LAYOUT_CSS + PDF_EXPORT_PREVIEW_ALIGN_CSS + (css_vars_style or "") + (scale_css or "")
    if inject:
        html_str = html_str.replace("</head>", inject + "</head>", 1)
    html_doc = HTML(string=html_str, base_url=str(template_dir))
    buffer = __import__("io").BytesIO()
    html_doc.write_pdf(buffer, stylesheets=[css])
    return buffer.getvalue()


def _render_pdf_bytes_from_custom_ctx(
    cv_ctx: dict,
    tmpl_meta: dict,
    base_dir: Path,
    css_vars_style: str = "",
    scale_css: str = "",
) -> bytes:
    """Génère les bytes PDF pour un template personnalisé (HTML/CSS en base)."""
    from weasyprint import HTML
    html_content = tmpl_meta.get("_html_content") or ""
    custom_css = (tmpl_meta.get("_css_content") or "").strip()
    env = Environment(autoescape=select_autoescape(("html", "xml")))
    html_str = env.from_string(html_content).render(**cv_ctx)
    style_block = f"<style>{custom_css}</style>" if custom_css else ""
    if style_block:
        html_str = re.sub(
            r"<link\s[^>]*href\s*=\s*['\"]?template\.css['\"]?[^>]*>",
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
    inject = PDF_EXPORT_CUSTOM_TEMPLATE_FIX + PDF_EXPORT_LAYOUT_CSS + PDF_EXPORT_PREVIEW_ALIGN_CSS + (css_vars_style or "") + (scale_css or "")
    if inject:
        html_str = html_str.replace("</head>", inject + "</head>", 1)
    html_doc = HTML(string=html_str, base_url=str(base_dir))
    buffer = __import__("io").BytesIO()
    html_doc.write_pdf(buffer)
    return buffer.getvalue()


def _pdf_page_count(pdf_bytes: bytes) -> int:
    """Retourne le nombre de pages du PDF."""
    try:
        from pypdf import PdfReader
        return len(PdfReader(__import__("io").BytesIO(pdf_bytes)).pages)
    except Exception:
        return 1


def generer_pdf_bytes_from_html(html_str: str, base_dir: Path, cv: dict, offre: dict) -> tuple[bytes, str]:
    """
    Génère le PDF à partir du HTML déjà rendu (même HTML que la preview iframe).
    Garantit que l'export PDF est identique à l'aperçu.
    """
    import re
    from weasyprint import HTML
    # Ne jamais laisser WeasyPrint charger template.css depuis base_dir (racine) :
    # un template.css à la racine casserait le rendu (règle CSS invalide, layout différent).
    # Le CSS doit déjà être inliné dans le HTML par _render_cv_html.
    html_str = re.sub(
        r'<link\s[^>]*href\s*=\s*["\']?(?:[^"\'>\s]*/)?template\.css["\']?[^>]*>\s*',
        '',
        html_str,
        flags=re.IGNORECASE,
    )
    base_dir = Path(base_dir).resolve()
    html_doc = HTML(string=html_str, base_url=str(base_dir))
    buffer = __import__("io").BytesIO()
    html_doc.write_pdf(buffer)
    return buffer.getvalue(), _nom_fichier_pdf(cv, offre)


def generer_pdf_bytes(cv_adapte: dict, offre: dict, base_dir: str | Path | None = None, template_id: str | None = None, template_options: dict | None = None) -> tuple[bytes, str]:
    """
    Génère le PDF en mémoire. Retourne (bytes_du_pdf, nom_fichier).
    Si la version « compacte » (6 exp, 2 bullets, 1 projet) tient sur une page A4,
    on tente d’ajouter une 7e expérience et un 2e projet pour remplir la page.
    """
    try:
        from weasyprint import HTML, CSS
    except ImportError:
        raise ImportError(
            "WeasyPrint est requis pour générer le PDF.\n"
            "Installation : pip install weasyprint"
        )

    base_dir = Path(base_dir).resolve() if base_dir else Path(__file__).resolve().parent

    from backend.template_registry import get_template, get_template_dir, resolve_options, options_to_css_vars
    tmpl_meta = get_template(template_id)
    is_custom = tmpl_meta.get("_custom")
    tmpl_dir = None if is_custom else get_template_dir(template_id)
    resolved_opts = resolve_options(template_id, template_options)
    show_photo = resolved_opts.get("show_photo", True)

    cv_adapte = dict(cv_adapte)
    ensure_compressed_photo(base_dir, cv_adapte.get("photo_url"), cv_adapte.get("prenom"), cv_adapte.get("nom"))
    photo_url = get_photo_url_for_cv(base_dir, cv_adapte.get("photo_url"), cv_adapte.get("prenom"), cv_adapte.get("nom"))
    if photo_url:
        cv_adapte["photo_url"] = photo_url

    if not show_photo:
        cv_adapte["photo_url"] = None

    import html as html_module
    cv_adapte["titre_professionnel_display"] = html_module.escape(_strip_h_f(cv_adapte.get("titre_professionnel") or ""))
    cv_adapte["resume_display"] = html_module.escape(cv_adapte.get("resume") or "")
    # Export = même rendu que la preview (couleurs, tailles, mots-clés ATS visibles)
    cv_adapte["for_preview"] = True
    show_mots_cles_ats = resolved_opts.get("show_mots_cles_ats", True)
    css_vars = options_to_css_vars(resolved_opts)

    # Version compacte : 6 exp, 1 projet
    display_compact = _build_cv_display(cv_adapte, html_module, n_experiences=6, n_projets=1)
    ctx_compact = {**cv_adapte, **display_compact, "show_mots_cles_ats": show_mots_cles_ats}
    exp_count = len(display_compact["experiences_for_display"])
    bullet_count = sum(len(e.get("bullet_points") or []) for e in display_compact["experiences_for_display"])
    form_count = len(display_compact.get("formations_for_display") or [])
    proj_count = len(display_compact.get("projets_for_display") or [])
    content_score = exp_count * 3 + bullet_count + form_count + proj_count
    scale_css = _content_scale_css(content_score)

    if is_custom:
        pdf_compact = _render_pdf_bytes_from_custom_ctx(
            ctx_compact, tmpl_meta, base_dir,
            css_vars_style=css_vars, scale_css=scale_css,
        )
        n_pages = _pdf_page_count(pdf_compact)
    else:
        css = CSS(filename=tmpl_dir / "template.css")
        pdf_compact = _render_pdf_bytes_from_ctx(ctx_compact, tmpl_dir, css, css_vars, scale_css=scale_css)
        n_pages = _pdf_page_count(pdf_compact)

    # S’il reste de la place (1 page), tenter d’ajouter une 7e exp et un 2e projet
    if n_pages == 1:
        display_optional = _build_cv_display(cv_adapte, html_module, n_experiences=7, n_projets=2)
        ctx_optional = {**cv_adapte, **display_optional, "show_mots_cles_ats": show_mots_cles_ats}
        exp_count_o = len(display_optional["experiences_for_display"])
        bullet_count_o = sum(len(e.get("bullet_points") or []) for e in display_optional["experiences_for_display"])
        content_score_o = exp_count_o * 3 + bullet_count_o + len(display_optional.get("formations_for_display") or []) + len(display_optional.get("projets_for_display") or [])
        scale_css_o = _content_scale_css(content_score_o)
        if is_custom:
            pdf_optional = _render_pdf_bytes_from_custom_ctx(
                ctx_optional, tmpl_meta, base_dir,
                css_vars_style=css_vars, scale_css=scale_css_o,
            )
        else:
            pdf_optional = _render_pdf_bytes_from_ctx(ctx_optional, tmpl_dir, css, css_vars, scale_css=scale_css_o)
        if _pdf_page_count(pdf_optional) == 1:
            pdf_compact = pdf_optional

    nom_pdf = _nom_fichier_pdf(cv_adapte, offre)
    return pdf_compact, nom_pdf
