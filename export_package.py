#!/usr/bin/env python3
"""
Export du dossier candidature : dossier "Entreprise - Poste" contenant
CV.pdf, Lettre de motivation.pdf, Fiche de poste.pdf
"""

import re
from pathlib import Path

# Chemin de base pour les dossiers (configurable par .env)
def get_export_base_path() -> Path:
    import os
    base = os.environ.get("CV_BOT_EXPORT_BASE", r"D:\ESSEC\03. ALTERNANCE")
    return Path(base).resolve()


def _sanitize_folder_name(s: str, max_len: int = 60) -> str:
    """Retire les caractères interdits pour un nom de dossier Windows."""
    s = re.sub(r'[<>:"/\\|?*]', "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s[:max_len] if s else ""


def get_export_folder_name(entreprise: str, poste: str) -> str:
    """Retourne le nom du dossier : 'Entreprise - Poste' ou 'Poste' si pas d'entreprise."""
    ent = _sanitize_folder_name((entreprise or "").strip())
    pos = _sanitize_folder_name((poste or "").strip())
    if not pos:
        pos = "Sans intitulé"
    if not ent:
        return pos
    return f"{ent} - {pos}"


def export_dossier(
    cv: dict,
    poste: str,
    entreprise: str,
    description_fiche: str,
    output_base: str | None = None,
) -> dict:
    """
    Crée le dossier 'Entreprise - Poste' dans output_base (ou CV_BOT_EXPORT_BASE si non fourni), y place :
    - CV : {Prenom} {Nom} - {Poste}.pdf
    - Lettre de motivation, Fiche de poste (noms avec poste).
    Retourne { "folder": chemin_absolu, "files": [ noms des fichiers ] }
    """
    base = Path(output_base).resolve() if output_base and output_base.strip() else get_export_base_path()
    folder_name = get_export_folder_name(entreprise, poste)
    folder_path = base / folder_name
    folder_path.mkdir(parents=True, exist_ok=True)

    offre = {"titre": poste, "entreprise": entreprise}
    files_created = []

    # 1) CV
    from generator import generer_pdf
    cv_path = generer_pdf(cv, offre, output_dir=str(folder_path))
    files_created.append(Path(cv_path).name)

    # 2) Fiche de poste
    from jinja2 import Environment, FileSystemLoader, select_autoescape
    from weasyprint import HTML, CSS

    base_dir = Path(__file__).resolve().parent
    env = Environment(
        loader=FileSystemLoader(str(base_dir)),
        autoescape=select_autoescape(("html", "xml")),
    )
    fiche_html = env.get_template("fiche_poste_template.html").render(
        contenu=description_fiche or "",
        entreprise=entreprise or "",
        poste=poste or "",
    )
    poste_safe = _sanitize_folder_name(poste or "")
    nom_fiche = f"Fiche de poste - {poste_safe}.pdf" if poste_safe else "Fiche de poste.pdf"
    fiche_path = folder_path / nom_fiche
    HTML(string=fiche_html, base_url=str(base_dir)).write_pdf(
        fiche_path,
        stylesheets=[CSS(filename=base_dir / "fiche_poste_template.css")],
    )
    files_created.append(fiche_path.name)

    # 3) Lettre de motivation
    from letter_generator import generer_lettre_pdf
    prenom = (cv.get("prenom") or "").strip()
    nom = (cv.get("nom") or "").strip()
    nom_lettre = f"Motivation {prenom} {nom} - {poste_safe}.pdf" if poste_safe else f"Motivation {prenom} {nom}.pdf"
    lettre_path = folder_path / nom_lettre
    generer_lettre_pdf(cv, description_fiche or "", poste or "", entreprise or "", lettre_path)
    files_created.append(lettre_path.name)

    return {"folder": str(folder_path), "files": files_created}


def export_dossier_as_zip(
    cv: dict,
    poste: str,
    entreprise: str,
    description_fiche: str,
) -> tuple[bytes, str, list[str]]:
    """
    Génère les 3 PDFs en mémoire et les renvoie dans un ZIP.
    Retourne (zip_bytes, nom_dossier, liste_noms_fichiers).
    Utilisé pour l'export via "Parcourir" (File System Access) côté client.
    """
    import zipfile
    from io import BytesIO

    folder_name = get_export_folder_name(entreprise, poste)
    offre = {"titre": poste, "entreprise": entreprise}
    files_created = []

    # 1) CV
    from generator import generer_pdf_bytes
    cv_bytes, cv_filename = generer_pdf_bytes(cv, offre)
    files_created.append(cv_filename)

    # 2) Fiche de poste
    from jinja2 import Environment, FileSystemLoader, select_autoescape
    from weasyprint import HTML, CSS

    base_dir = Path(__file__).resolve().parent
    env = Environment(
        loader=FileSystemLoader(str(base_dir)),
        autoescape=select_autoescape(("html", "xml")),
    )
    fiche_html = env.get_template("fiche_poste_template.html").render(
        contenu=description_fiche or "",
        entreprise=entreprise or "",
        poste=poste or "",
    )
    poste_safe = _sanitize_folder_name(poste or "")
    nom_fiche = f"Fiche de poste - {poste_safe}.pdf" if poste_safe else "Fiche de poste.pdf"
    fiche_buffer = BytesIO()
    HTML(string=fiche_html, base_url=str(base_dir)).write_pdf(
        fiche_buffer,
        stylesheets=[CSS(filename=base_dir / "fiche_poste_template.css")],
    )
    fiche_bytes = fiche_buffer.getvalue()
    files_created.append(nom_fiche)

    # 3) Lettre de motivation
    from letter_generator import generer_lettre_pdf_bytes
    lettre_bytes, nom_lettre = generer_lettre_pdf_bytes(
        cv, description_fiche or "", poste or "", entreprise or ""
    )
    files_created.append(nom_lettre)

    # ZIP : sous-dossier "Entreprise - Poste" contenant les 3 fichiers
    zip_buffer = BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(f"{folder_name}/{cv_filename}", cv_bytes)
        zf.writestr(f"{folder_name}/{nom_fiche}", fiche_bytes)
        zf.writestr(f"{folder_name}/{nom_lettre}", lettre_bytes)

    return zip_buffer.getvalue(), folder_name, files_created
