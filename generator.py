#!/usr/bin/env python3
"""
Génération du PDF CV.

Moteur au choix (env CV_BOT_PDF_ENGINE) :
  - weasyprint (défaut) : render_cv_html → bundle pdf_export → WeasyPrint (voir backend/cv_pdf_weasyprint.py)
  - chromium : render_cv_html → Chromium headless / Playwright (voir backend/cv_pdf_chromium.py)
"""

import os
import re
import sys
from pathlib import Path

_GENERATOR_ROOT = Path(__file__).resolve().parent
if str(_GENERATOR_ROOT) not in sys.path:
    sys.path.insert(0, str(_GENERATOR_ROOT))

# Windows : ajouter les dossiers des DLL (Pango/GTK) avant tout import WeasyPrint (direct ou transitif)
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

# Réexports pour tests (test_pdf_export_assets) et compatibilité
from backend.cv_pdf_weasyprint import (
    PDF_EXPORT_ALIGN_STYLE as _PDF_EXPORT_ALIGN_STYLE,
    PDF_EXPORT_CUSTOM_BASE_STYLE as _PDF_EXPORT_CUSTOM_TEMPLATE_STYLE,
    PDF_EXPORT_LAYOUT_STYLE as _PDF_EXPORT_LAYOUT_STYLE,
    PDF_FROM_HTML_FINAL_CSS as _PDF_FROM_HTML_FINAL_CSS,
    WEASYPRINT_CV_MEDIA,
)


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
    """Nom du PDF CV : « CV - NOM PRENOM - POSTE » ; chaque partie absente est omise (ex. « CV.pdf », « CV - Dupont - Poste »)."""
    nom = _sanitize_filename((cv.get("nom") or "").strip())
    prenom = _sanitize_filename((cv.get("prenom") or "").strip())
    poste = _sanitize_filename((offre.get("titre") or "").strip())

    parts: list[str] = ["CV"]
    identite = " ".join(x for x in (nom, prenom) if x)
    if identite:
        parts.append(identite)
    if poste:
        parts.append(poste)

    return " - ".join(parts) + ".pdf"


def generer_pdf_bytes_from_html(
    html_str: str,
    base_dir: Path,
    cv: dict,
    offre: dict,
    template_id: str | None = None,
) -> tuple[bytes, str]:
    """
    PDF à partir du HTML déjà rendu par render_cv_html().

    template_id : pour WeasyPrint, bundle custom_* ; ignoré par Chromium.
    """
    from backend.cv_pdf_dispatch import cv_pdf_engine, html_to_cv_pdf_bytes

    if cv_pdf_engine() == "weasyprint":
        try:
            import weasyprint  # noqa: F401
        except ImportError:
            raise ImportError(
                "WeasyPrint est requis pour CV_BOT_PDF_ENGINE=weasyprint.\n"
                "Installation : pip install weasyprint"
            ) from None

    base_resolved = Path(base_dir).resolve()
    pdf_bytes = html_to_cv_pdf_bytes(html_str, base_resolved, template_id=template_id)
    return pdf_bytes, _nom_fichier_pdf(cv, offre)


def generer_pdf_bytes(
    cv_adapte: dict,
    offre: dict,
    base_dir: str | Path | None = None,
    template_id: str | None = None,
    template_options: dict | None = None,
    selection_a4: dict | None = None,
) -> tuple[bytes, str]:
    """
    PDF en mémoire : render_cv_html + moteur choisi par CV_BOT_PDF_ENGINE.

    selection_a4 : filtre optionnel du CV (comme export dossier / adaptation A4).
    """
    from backend.cv_html_render import render_cv_html
    from backend.cv_pdf_dispatch import cv_pdf_engine, html_to_cv_pdf_bytes

    if cv_pdf_engine() == "weasyprint":
        try:
            import weasyprint  # noqa: F401
        except ImportError:
            raise ImportError(
                "WeasyPrint est requis pour CV_BOT_PDF_ENGINE=weasyprint.\n"
                "Installation : pip install weasyprint"
            ) from None

    base_resolved = Path(base_dir).resolve() if base_dir else Path(__file__).resolve().parent
    html = render_cv_html(
        dict(cv_adapte),
        for_preview=True,
        for_pdf=True,
        template_id=template_id,
        template_options=template_options,
        selection_a4=selection_a4,
    )
    pdf_bytes = html_to_cv_pdf_bytes(html, base_resolved, template_id=template_id)
    return pdf_bytes, _nom_fichier_pdf(cv_adapte, offre)


def generer_pdf(
    cv_adapte: dict,
    offre: dict,
    output_dir: str = ".",
    template_id: str | None = None,
    template_options: dict | None = None,
    selection_a4: dict | None = None,
) -> str:
    """Écrit le PDF sur disque (même logique que generer_pdf_bytes)."""
    pdf_bytes, nom_pdf = generer_pdf_bytes(
        cv_adapte,
        offre,
        base_dir=Path(__file__).resolve().parent,
        template_id=template_id,
        template_options=template_options,
        selection_a4=selection_a4,
    )
    out = Path(output_dir).resolve()
    out.mkdir(parents=True, exist_ok=True)
    path_pdf = out / nom_pdf
    path_pdf.write_bytes(pdf_bytes)
    return str(path_pdf)
