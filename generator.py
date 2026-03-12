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


def generer_pdf(cv_adapte: dict, offre: dict, output_dir: str = ".") -> str:
    """
    Charge template.html, injecte cv_adapte, compile en PDF avec WeasyPrint.
    Même logique que generer_pdf_bytes : si la version compacte tient sur 1 page, on ajoute une 7e exp et un 2e projet.
    Retourne le chemin absolu du fichier PDF généré.
    """
    pdf_bytes, nom_pdf = generer_pdf_bytes(cv_adapte, offre, base_dir=Path(__file__).resolve().parent)
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
        experiences_for_display.append({**exp, "bullet_points": [{"text": b, "html": html_module.escape(b)} for b in bullets]})

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


def _render_pdf_bytes_from_ctx(cv_ctx: dict, template_dir: Path, css, css_vars_style: str = "") -> bytes:
    """Génère les bytes PDF à partir d’un contexte CV déjà prêt (photo, display, etc.)."""
    from weasyprint import HTML
    env = Environment(
        loader=FileSystemLoader(str(template_dir)),
        autoescape=select_autoescape(("html", "xml")),
    )
    template = env.get_template("template.html")
    html_str = template.render(**cv_ctx)
    if css_vars_style:
        html_str = html_str.replace("</head>", css_vars_style + "</head>", 1)
    html_doc = HTML(string=html_str, base_url=str(template_dir))
    buffer = __import__("io").BytesIO()
    html_doc.write_pdf(buffer, stylesheets=[css])
    return buffer.getvalue()


def _pdf_page_count(pdf_bytes: bytes) -> int:
    """Retourne le nombre de pages du PDF."""
    try:
        from pypdf import PdfReader
        return len(PdfReader(__import__("io").BytesIO(pdf_bytes)).pages)
    except Exception:
        return 1


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

    from backend.template_registry import get_template_dir, resolve_options, options_to_css_vars
    tmpl_dir = get_template_dir(template_id)
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
    cv_adapte["for_preview"] = False
    css_vars = options_to_css_vars(resolved_opts)
    css = CSS(filename=tmpl_dir / "template.css")

    # Version compacte : 6 exp, 1 projet
    display_compact = _build_cv_display(cv_adapte, html_module, n_experiences=6, n_projets=1)
    ctx_compact = {**cv_adapte, **display_compact}
    pdf_compact = _render_pdf_bytes_from_ctx(ctx_compact, tmpl_dir, css, css_vars)
    n_pages = _pdf_page_count(pdf_compact)

    # S’il reste de la place (1 page), tenter d’ajouter une 7e exp et un 2e projet
    if n_pages == 1:
        display_optional = _build_cv_display(cv_adapte, html_module, n_experiences=7, n_projets=2)
        ctx_optional = {**cv_adapte, **display_optional}
        pdf_optional = _render_pdf_bytes_from_ctx(ctx_optional, tmpl_dir, css, css_vars)
        if _pdf_page_count(pdf_optional) == 1:
            pdf_compact = pdf_optional

    nom_pdf = _nom_fichier_pdf(cv_adapte, offre)
    return pdf_compact, nom_pdf
