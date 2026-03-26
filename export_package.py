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
    """Retire les caractères interdits pour un nom de dossier Windows et normalise les caractères hors latin-1 (évite erreur zip/export)."""
    if not s:
        return ""
    s = str(s)
    s = s.replace("\u2013", "-").replace("\u2014", "-")  # tirets long/court → tiret ASCII
    s = s.replace("\u2018", "'").replace("\u2019", "'").replace("\u201c", '"').replace("\u201d", '"')
    s = "".join(c if ord(c) < 256 else "-" for c in s)  # reste compatible latin-1 (garde é, è, à…)
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


def generer_fiche_pdf_bytes(
    description_fiche: str,
    poste: str = "",
    entreprise: str = "",
    base_dir: "str | Path | None" = None,
) -> tuple[bytes, str]:
    """Génère le PDF de la fiche de poste en mémoire. base_dir : dossier des templates (défaut = dossier du module)."""
    from io import BytesIO
    from jinja2 import Environment, FileSystemLoader, select_autoescape
    from weasyprint import HTML, CSS

    base_dir = Path(base_dir).resolve() if base_dir else Path(__file__).resolve().parent
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
    buffer = BytesIO()
    HTML(string=fiche_html, base_url=str(base_dir)).write_pdf(
        buffer,
        stylesheets=[CSS(filename=base_dir / "fiche_poste_template.css")],
    )
    return buffer.getvalue(), nom_fiche


def export_dossier(
    cv: dict,
    poste: str,
    entreprise: str,
    description_fiche: str,
    output_base: str | None = None,
    template_id: str | None = None,
    template_options: dict | None = None,
    selection_a4: dict | None = None,
) -> dict:
    """
    Crée le dossier 'Entreprise - Poste' dans output_base (ou CV_BOT_EXPORT_BASE si non fourni), y place :
    - CV : CV - {Nom} {Prenom} - {Poste}.pdf (parties omises si vides)
    - Lettre de motivation, Fiche de poste (noms avec poste).
    Retourne { "folder": chemin_absolu, "files": [ noms des fichiers ] }
    """
    base = Path(output_base).resolve() if output_base and output_base.strip() else get_export_base_path()
    folder_name = get_export_folder_name(entreprise, poste)
    folder_path = base / folder_name
    folder_path.mkdir(parents=True, exist_ok=True)

    offre = {"titre": poste, "entreprise": entreprise}
    files_created = []

    # 1) CV (même filtre A4 que l’aperçu / PDF seul si selection_a4 fourni)
    try:
        from cv_select_a4 import apply_selection_to_cv
        cv_pdf = apply_selection_to_cv(cv, selection_a4)
    except Exception:
        cv_pdf = cv
    from generator import generer_pdf
    cv_path = generer_pdf(cv_pdf, offre, output_dir=str(folder_path), template_id=template_id, template_options=template_options)
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
    lettre_corps: str | None = None,
    template_id: str | None = None,
    template_options: dict | None = None,
    cv_html: str | None = None,
    base_dir: "str | Path | None" = None,
    selection_a4: dict | None = None,
) -> tuple[bytes, str, list[str], str]:
    """
    Génère les 3 PDFs en mémoire et les renvoie dans un ZIP.
    Retourne (zip_bytes, nom_dossier, liste_noms_fichiers, lettre_corps_utilisé).
    Si lettre_corps est fourni, il est utilisé pour la lettre ; sinon on le génère.
    Si cv_html est fourni (même HTML que l'aperçu profil), le CV PDF est généré à partir de celui-ci pour un rendu identique.
    """
    import zipfile
    from io import BytesIO

    folder_name = get_export_folder_name(entreprise, poste)
    offre = {"titre": poste, "entreprise": entreprise}
    files_created = []

    # 1) CV : même HTML que le profil si fourni, sinon ancienne génération
    if cv_html and base_dir is not None:
        from generator import generer_pdf_bytes_from_html

        cv_bytes, cv_filename = generer_pdf_bytes_from_html(
            cv_html, Path(base_dir).resolve(), cv, offre, template_id=template_id
        )
    else:
        from generator import generer_pdf_bytes

        cv_bytes, cv_filename = generer_pdf_bytes(
            cv,
            offre,
            template_id=template_id,
            template_options=template_options,
            selection_a4=selection_a4,
        )
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

    # 3) Lettre de motivation (réutiliser lettre_corps si fourni, sinon générer)
    from letter_generator import generer_corps_lettre, generer_lettre_pdf_bytes_from_corps
    if not lettre_corps:
        lettre_corps = generer_corps_lettre(cv, description_fiche or "", poste or "", entreprise or "")
    lettre_bytes, nom_lettre = generer_lettre_pdf_bytes_from_corps(
        cv, lettre_corps, poste or "", entreprise or "", base_dir=base_dir
    )
    files_created.append(nom_lettre)

    # ZIP : sous-dossier "Entreprise - Poste" contenant les 3 fichiers
    zip_buffer = BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(f"{folder_name}/{cv_filename}", cv_bytes)
        zf.writestr(f"{folder_name}/{nom_fiche}", fiche_bytes)
        zf.writestr(f"{folder_name}/{nom_lettre}", lettre_bytes)

    return zip_buffer.getvalue(), folder_name, files_created, lettre_corps
