#!/usr/bin/env python3
"""Export helpers for application package (CV, letter, fiche)."""

import logging
import re
from pathlib import Path

_log = logging.getLogger("cv_bot.export")


def get_export_base_path() -> Path:
    import os

    base = os.environ.get("CV_BOT_EXPORT_BASE", r"D:\ESSEC\03. ALTERNANCE")
    return Path(base).resolve()


def _sanitize_folder_name(s: str, max_len: int = 60) -> str:
    if not s:
        return ""
    s = str(s).replace("\u2013", "-").replace("\u2014", "-")
    s = (
        s.replace("\u2018", "'")
        .replace("\u2019", "'")
        .replace("\u201c", '"')
        .replace("\u201d", '"')
    )
    s = "".join(c if ord(c) < 256 else "-" for c in s)
    s = re.sub(r'[<>:"/\\|?*]', "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s[:max_len] if s else ""


def get_export_folder_name(entreprise: str, poste: str) -> str:
    ent = _sanitize_folder_name((entreprise or "").strip())
    pos = _sanitize_folder_name((poste or "").strip()) or "Sans intitulé"
    return f"{ent} - {pos}" if ent else pos


def _fiche_base_dir(base_dir: "str | Path | None") -> Path:
    if base_dir:
        return Path(base_dir).resolve()
    return Path(__file__).resolve().parents[1] / "templates" / "documents"


def _render_fiche_html(
    description_fiche: str, poste: str, entreprise: str, base_dir: Path
) -> tuple[str, str]:
    from jinja2 import Environment, FileSystemLoader, select_autoescape

    env = Environment(
        loader=FileSystemLoader(str(base_dir)), autoescape=select_autoescape(("html", "xml"))
    )
    fiche_html = env.get_template("fiche_poste_template.html").render(
        contenu=description_fiche or "", entreprise=entreprise or "", poste=poste or ""
    )
    poste_safe = _sanitize_folder_name(poste or "")
    nom_fiche = f"Fiche de poste - {poste_safe}.pdf" if poste_safe else "Fiche de poste.pdf"
    return fiche_html, nom_fiche


def _fiche_html_embed_stylesheet(fiche_html: str, base_dir: Path) -> str:
    css_path = base_dir / "fiche_poste_template.css"
    if not css_path.is_file():
        return fiche_html
    css_text = css_path.read_text(encoding="utf-8")
    return fiche_html.replace(
        '<link rel="stylesheet" href="fiche_poste_template.css">',
        f"<style>\n{css_text}\n</style>",
        1,
    )


def generer_fiche_pdf_bytes(
    description_fiche: str,
    poste: str = "",
    entreprise: str = "",
    base_dir: "str | Path | None" = None,
) -> tuple[bytes, str]:
    from io import BytesIO

    root = _fiche_base_dir(base_dir)
    fiche_html, nom_fiche = _render_fiche_html(description_fiche, poste, entreprise, root)
    try:
        from weasyprint import CSS, HTML

        buffer = BytesIO()
        HTML(string=fiche_html, base_url=str(root)).write_pdf(
            buffer, stylesheets=[CSS(filename=str(root / "fiche_poste_template.css"))]
        )
        return buffer.getvalue(), nom_fiche
    except Exception as wp_exc:
        _log.warning("Fiche PDF fallback Chromium: %s", wp_exc)
        from backend.cv_pdf_chromium import html_to_simple_pdf_bytes_chromium

        html_ch = _fiche_html_embed_stylesheet(fiche_html, root)
        pdf_bytes = html_to_simple_pdf_bytes_chromium(html_ch, root)
        return pdf_bytes, nom_fiche


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
    from backend.path_safety import (
        resolve_export_output_base,
        resolve_under_base,
        safe_basename,
        write_bytes_in_dir,
    )

    default_base = get_export_base_path()
    base = resolve_export_output_base(output_base, default=default_base)
    folder_name = get_export_folder_name(entreprise, poste)
    try:
        folder_path = resolve_under_base(base, folder_name)
    except ValueError:
        folder_path = resolve_under_base(base, "export")
    folder_path.mkdir(parents=True, exist_ok=True)

    offre = {"titre": poste, "entreprise": entreprise}
    files_created = []
    try:
        from backend.services.cv_select_a4 import apply_selection_to_cv

        cv_pdf = apply_selection_to_cv(cv, selection_a4)
    except Exception:
        cv_pdf = cv
    from backend.services.generator import generer_pdf

    cv_path = generer_pdf(
        cv_pdf,
        offre,
        output_dir=str(folder_path),
        template_id=template_id,
        template_options=template_options,
    )
    files_created.append(Path(cv_path).name)

    fiche_bytes, nom_fiche = generer_fiche_pdf_bytes(description_fiche, poste, entreprise)
    fiche_path = write_bytes_in_dir(
        folder_path, nom_fiche, fiche_bytes, default_name="Fiche de poste.pdf"
    )
    files_created.append(fiche_path.name)

    from backend.services.letter_generator import generer_lettre_pdf

    prenom = (cv.get("prenom") or "").strip()
    nom = (cv.get("nom") or "").strip()
    poste_safe = _sanitize_folder_name(poste or "")
    nom_lettre = (
        f"Motivation {prenom} {nom} - {poste_safe}.pdf"
        if poste_safe
        else f"Motivation {prenom} {nom}.pdf"
    )
    lettre_name = safe_basename(nom_lettre, default="Motivation.pdf")
    generer_lettre_pdf(
        cv, description_fiche or "", poste or "", entreprise or "", folder_path, lettre_name
    )
    files_created.append(lettre_name)
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
    import zipfile
    from io import BytesIO

    folder_name = get_export_folder_name(entreprise, poste)
    offre = {"titre": poste, "entreprise": entreprise}
    files_created = []

    if cv_html and base_dir is not None:
        from backend.services.generator import generer_pdf_bytes_from_html

        cv_bytes, cv_filename = generer_pdf_bytes_from_html(
            cv_html, Path(base_dir).resolve(), cv, offre, template_id=template_id
        )
    else:
        from backend.services.generator import generer_pdf_bytes

        cv_bytes, cv_filename = generer_pdf_bytes(
            cv,
            offre,
            template_id=template_id,
            template_options=template_options,
            selection_a4=selection_a4,
        )
    files_created.append(cv_filename)

    fiche_bytes, nom_fiche = generer_fiche_pdf_bytes(description_fiche, poste, entreprise)
    files_created.append(nom_fiche)

    from backend.services.letter_generator import (
        generer_corps_lettre,
        generer_lettre_pdf_bytes_from_corps,
    )

    if not lettre_corps:
        lettre_corps = generer_corps_lettre(
            cv, description_fiche or "", poste or "", entreprise or ""
        )
    lettre_bytes, nom_lettre = generer_lettre_pdf_bytes_from_corps(
        cv, lettre_corps, poste or "", entreprise or "", base_dir=base_dir
    )
    files_created.append(nom_lettre)

    zip_buffer = BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(f"{folder_name}/{cv_filename}", cv_bytes)
        zf.writestr(f"{folder_name}/{nom_fiche}", fiche_bytes)
        zf.writestr(f"{folder_name}/{nom_lettre}", lettre_bytes)
    return zip_buffer.getvalue(), folder_name, files_created, lettre_corps
