#!/usr/bin/env python3
"""CV PDF generation service."""

import os
import re
from pathlib import Path

if os.name == "nt":
    dll_dirs = os.environ.get("WEASYPRINT_DLL_DIRECTORIES", "").strip()
    if dll_dirs:
        for dir_path in dll_dirs.replace(",", ";").split(";"):
            dir_path = os.path.abspath(dir_path.strip())
            if dir_path and os.path.isdir(dir_path):
                os.environ["PATH"] = dir_path + os.pathsep + os.environ.get("PATH", "")
                try:
                    # API Windows uniquement : absent des stubs Linux (CI GitHub).
                    add_dll = getattr(os, "add_dll_directory", None)
                    if add_dll is not None:
                        add_dll(dir_path)
                except OSError:
                    pass


def _strip_h_f(text: str) -> str:
    if not text or not isinstance(text, str):
        return text
    s = text.strip()
    for suffix in ("(H/F)", "(F/H)", "(h/f)", "(f/h)"):
        if s.endswith(suffix):
            s = s[: -len(suffix)].strip()
    return s


def _sanitize_filename(s: str, max_len: int = 80) -> str:
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


def _nom_fichier_pdf(cv: dict, offre: dict) -> str:
    nom = _sanitize_filename((cv.get("nom") or "").strip())
    prenom = _sanitize_filename((cv.get("prenom") or "").strip())
    poste = _sanitize_filename((offre.get("titre") or "").strip())
    parts: list[str] = ["CV"]
    identite = " ".join(x for x in (prenom, nom) if x)
    if identite:
        parts.append(identite)
    if poste:
        parts.append(poste)
    return " - ".join(parts) + ".pdf"


def generer_pdf_bytes_from_html(
    html_str: str, base_dir: Path, cv: dict, offre: dict, template_id: str | None = None
) -> tuple[bytes, str]:
    from backend.cv_pdf_dispatch import cv_pdf_engine, html_to_cv_pdf_bytes

    if cv_pdf_engine() == "weasyprint":
        try:
            import weasyprint  # noqa: F401
        except ImportError:
            raise ImportError(
                "WeasyPrint est requis pour CV_BOT_PDF_ENGINE=weasyprint.\nInstallation : pip install weasyprint"
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
    from backend.cv_html_render import render_cv_html
    from backend.cv_pdf_dispatch import cv_pdf_engine, html_to_cv_pdf_bytes

    if cv_pdf_engine() == "weasyprint":
        try:
            import weasyprint  # noqa: F401
        except ImportError:
            raise ImportError(
                "WeasyPrint est requis pour CV_BOT_PDF_ENGINE=weasyprint.\nInstallation : pip install weasyprint"
            ) from None

    base_resolved = Path(base_dir).resolve() if base_dir else Path(__file__).resolve().parents[2]
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
    pdf_bytes, nom_pdf = generer_pdf_bytes(
        cv_adapte,
        offre,
        base_dir=Path(__file__).resolve().parents[2],
        template_id=template_id,
        template_options=template_options,
        selection_a4=selection_a4,
    )
    from backend.path_safety import resolve_under_base, safe_basename

    out = Path(output_dir).resolve()
    out.mkdir(parents=True, exist_ok=True)
    path_pdf = resolve_under_base(out, safe_basename(nom_pdf, default="CV.pdf"))
    path_pdf.write_bytes(pdf_bytes)
    return str(path_pdf)
