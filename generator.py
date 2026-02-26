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
            dir_path = dir_path.strip()
            if dir_path and os.path.isdir(dir_path):
                try:
                    os.add_dll_directory(dir_path)
                except OSError:
                    pass

from jinja2 import Environment, FileSystemLoader, select_autoescape

from photo_assets import ensure_compressed_photo, get_photo_url_for_cv


def _sanitize_filename(s: str, max_len: int = 80) -> str:
    """Retire les caractères interdits dans un nom de fichier."""
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
    output_dir : dossier de sortie (créé si besoin).
    Retourne le chemin absolu du fichier PDF généré.
    """
    try:
        from weasyprint import HTML, CSS
    except ImportError:
        raise ImportError(
            "WeasyPrint est requis pour générer le PDF.\n"
            "Installation : pip install weasyprint\n"
            "Windows : installer GTK3 si besoin — voir https://doc.courtbouillon.org/weasyprint/stable/first_steps.html\n"
            "macOS : brew install pango gdk-pixbuf libffi\n"
            "Linux : sudo apt-get install libpango-1.0-0 libgdk-pixbuf2.0-0"
        )

    base_dir = Path(__file__).resolve().parent
    out = Path(output_dir).resolve()
    out.mkdir(parents=True, exist_ok=True)

    cv_adapte = dict(cv_adapte)
    ensure_compressed_photo(base_dir, cv_adapte.get("photo_url"), cv_adapte.get("prenom"), cv_adapte.get("nom"))
    photo_url = get_photo_url_for_cv(base_dir, cv_adapte.get("photo_url"), cv_adapte.get("prenom"), cv_adapte.get("nom"))
    if photo_url:
        cv_adapte["photo_url"] = photo_url

    import html as html_module
    cv_adapte["titre_professionnel_display"] = html_module.escape(cv_adapte.get("titre_professionnel") or "")
    cv_adapte["resume_display"] = html_module.escape(cv_adapte.get("resume") or "")
    cv_adapte["for_preview"] = False
    experiences_for_display = []
    for exp in (cv_adapte.get("experiences") or [])[:6]:
        bullets = (exp.get("bullet_points") or [])[:2]
        experiences_for_display.append({**exp, "bullet_points": [{"text": b, "html": html_module.escape(b)} for b in bullets]})
    cv_adapte["experiences_for_display"] = experiences_for_display

    env = Environment(
        loader=FileSystemLoader(str(base_dir)),
        autoescape=select_autoescape(("html", "xml")),
    )
    template = env.get_template("template.html")
    html_str = template.render(**cv_adapte)

    # Fichier HTML temporaire pour WeasyPrint (pour résoudre template.css)
    html_path = base_dir / "template.html"
    # WeasyPrint peut prendre une string HTML ; il faut alors une base_url pour les CSS
    html_doc = HTML(string=html_str, base_url=str(base_dir))
    css = CSS(filename=base_dir / "template.css")

    nom_pdf = _nom_fichier_pdf(cv_adapte, offre)
    path_pdf = out / nom_pdf
    html_doc.write_pdf(path_pdf, stylesheets=[css])

    return str(path_pdf)


def generer_pdf_bytes(cv_adapte: dict, offre: dict) -> tuple[bytes, str]:
    """
    Génère le PDF en mémoire. Retourne (bytes_du_pdf, nom_fichier).
    Utile pour renvoyer le PDF dans une réponse HTTP sans écrire sur disque.
    """
    try:
        from weasyprint import HTML, CSS
    except ImportError:
        raise ImportError(
            "WeasyPrint est requis pour générer le PDF.\n"
            "Installation : pip install weasyprint"
        )

    base_dir = Path(__file__).resolve().parent
    cv_adapte = dict(cv_adapte)
    ensure_compressed_photo(base_dir, cv_adapte.get("photo_url"), cv_adapte.get("prenom"), cv_adapte.get("nom"))
    photo_url = get_photo_url_for_cv(base_dir, cv_adapte.get("photo_url"), cv_adapte.get("prenom"), cv_adapte.get("nom"))
    if photo_url:
        cv_adapte["photo_url"] = photo_url

    import html as html_module
    cv_adapte["titre_professionnel_display"] = html_module.escape(cv_adapte.get("titre_professionnel") or "")
    cv_adapte["resume_display"] = html_module.escape(cv_adapte.get("resume") or "")
    cv_adapte["for_preview"] = False
    experiences_for_display = []
    for exp in (cv_adapte.get("experiences") or [])[:6]:
        bullets = (exp.get("bullet_points") or [])[:2]
        experiences_for_display.append({**exp, "bullet_points": [{"text": b, "html": html_module.escape(b)} for b in bullets]})
    cv_adapte["experiences_for_display"] = experiences_for_display

    env = Environment(
        loader=FileSystemLoader(str(base_dir)),
        autoescape=select_autoescape(("html", "xml")),
    )
    template = env.get_template("template.html")
    html_str = template.render(**cv_adapte)
    html_doc = HTML(string=html_str, base_url=str(base_dir))
    css = CSS(filename=base_dir / "template.css")

    nom_pdf = _nom_fichier_pdf(cv_adapte, offre)
    from io import BytesIO
    buffer = BytesIO()
    html_doc.write_pdf(buffer, stylesheets=[css])
    return buffer.getvalue(), nom_pdf
