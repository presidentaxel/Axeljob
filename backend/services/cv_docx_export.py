"""Export Word (.docx) d'un CV sémantique (AXE-330).

Document simple mono-colonne pour ATS / édition — ne reproduit pas le layout canvas.
"""

from __future__ import annotations

from io import BytesIO
from typing import Any

from backend.services.cv_text_export import (
    _as_str,
    _join_nonempty,
    _list_skills,
)


def _has_content(cv: dict) -> bool:
    if _as_str(cv.get("prenom")) or _as_str(cv.get("nom")):
        return True
    if _as_str(cv.get("titre_professionnel")) or _as_str(cv.get("resume")):
        return True
    if _as_str(cv.get("email")) or _as_str(cv.get("telephone")):
        return True
    for key in ("experiences", "formations", "certifications", "projets"):
        rows = cv.get(key)
        if isinstance(rows, list) and any(isinstance(r, dict) and r for r in rows):
            return True
    competences = cv.get("competences")
    if isinstance(competences, dict) and competences:
        return True
    return False


def _add_heading(doc: Any, text: str, level: int = 2) -> None:
    doc.add_heading(text, level=level)


def _add_para(doc: Any, text: str, *, bold: bool = False) -> None:
    p = doc.add_paragraph()
    run = p.add_run(text)
    run.bold = bold


def cv_to_docx_bytes(cv: dict | None) -> bytes:
    """
    Sérialise le JSON sémantique `cv` en .docx utilisable (ATS / Word).
    Lève ValueError si le CV est vide.
    """
    from docx import Document

    data = cv if isinstance(cv, dict) else {}
    if not _has_content(data):
        raise ValueError("empty_cv")

    doc = Document()

    identity = _join_nonempty(
        [_as_str(data.get("prenom")), _as_str(data.get("nom"))],
        sep=" ",
    )
    if identity:
        _add_heading(doc, identity, level=1)

    titre = _as_str(data.get("titre_professionnel"))
    if titre:
        _add_para(doc, titre, bold=True)

    contact = _join_nonempty(
        [
            _as_str(data.get("email")),
            _as_str(data.get("telephone")),
            _as_str(data.get("linkedin")),
            _as_str(data.get("ville") or data.get("localisation")),
        ]
    )
    if contact:
        _add_para(doc, contact)

    resume = _as_str(data.get("resume"))
    if resume:
        _add_heading(doc, "Profil")
        _add_para(doc, resume)

    experiences = data.get("experiences") or []
    exp_rows = [row for row in experiences if isinstance(row, dict)]
    if exp_rows:
        _add_heading(doc, "Expériences")
        for row in exp_rows:
            head = _join_nonempty([_as_str(row.get("poste")), _as_str(row.get("entreprise"))])
            dates = _join_nonempty(
                [_as_str(row.get("date_debut")), _as_str(row.get("date_fin"))],
                sep=" – ",
            )
            lieu = _as_str(row.get("lieu"))
            desc = _as_str(row.get("description") or row.get("missions"))
            if head:
                line = head if not dates else f"{head} ({dates})"
                _add_para(doc, line, bold=True)
            elif dates:
                _add_para(doc, dates, bold=True)
            if lieu:
                _add_para(doc, lieu)
            if desc:
                _add_para(doc, desc)

    formations = data.get("formations") or []
    form_rows = [row for row in formations if isinstance(row, dict)]
    if form_rows:
        _add_heading(doc, "Formations")
        for row in form_rows:
            head = _join_nonempty([_as_str(row.get("diplome")), _as_str(row.get("etablissement"))])
            date = _as_str(row.get("date"))
            if head:
                line = head if not date else f"{head} ({date})"
                _add_para(doc, line, bold=True)
            elif date:
                _add_para(doc, date)

    competences = data.get("competences") if isinstance(data.get("competences"), dict) else {}
    tech = _list_skills(competences.get("techniques"))
    soft = _list_skills(competences.get("logiciels") or competences.get("outils"))
    autres = _list_skills(competences.get("autres"))
    if tech or soft or autres:
        _add_heading(doc, "Compétences")
        if tech:
            _add_para(doc, "Techniques : " + ", ".join(tech))
        if soft:
            _add_para(doc, "Outils : " + ", ".join(soft))
        if autres:
            _add_para(doc, "Autres : " + ", ".join(autres))

    lang_lines: list[str] = []
    for row in competences.get("langues") or []:
        if isinstance(row, str):
            s = row.strip()
            if s:
                lang_lines.append(s)
            continue
        if isinstance(row, dict):
            s = _join_nonempty([_as_str(row.get("langue")), _as_str(row.get("niveau"))])
            if s:
                lang_lines.append(s)
    if lang_lines:
        _add_heading(doc, "Langues")
        for line in lang_lines:
            _add_para(doc, line)

    cert_lines: list[str] = []
    for row in data.get("certifications") or []:
        if not isinstance(row, dict):
            continue
        s = _join_nonempty(
            [
                _as_str(row.get("nom")),
                _as_str(row.get("organisme")),
                _as_str(row.get("date")),
            ]
        )
        if s:
            cert_lines.append(s)
    if cert_lines:
        _add_heading(doc, "Certifications")
        for line in cert_lines:
            _add_para(doc, line)

    projets = data.get("projets") or []
    projet_rows = [row for row in projets if isinstance(row, dict)]
    if projet_rows:
        _add_heading(doc, "Projets")
        for row in projet_rows:
            head = _as_str(row.get("nom"))
            desc = _as_str(row.get("description"))
            if head:
                _add_para(doc, head, bold=True)
            if desc:
                _add_para(doc, desc)

    buf = BytesIO()
    doc.save(buf)
    return buf.getvalue()
