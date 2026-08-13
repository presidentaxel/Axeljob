"""Heuristiques offline d'extraction import CV (AXE-41 spike).

Complemente les extracteurs deja en prod (pdfplumber, PyMuPDF, python-docx)
sans appeler Gemini : utile pour demos CI et la note de faisabilite.
"""

from __future__ import annotations

import re
from io import BytesIO
from pathlib import Path
from typing import Any

# Titres de section frequents (FR/EN). Ancres souples : les extracteurs
# multi-colonnes collent parfois plusieurs titres sur la meme ligne.
SECTION_HEADING_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    (
        "experience",
        re.compile(
            r"(?:^|[\s|/·•\-–—])(exp[ée]riences?(?:\s+professionnelles?)?|experience|work\s+history|employment)\b",
            re.I,
        ),
    ),
    (
        "formation",
        re.compile(
            r"(?:^|[\s|/·•\-–—])(formations?|education|études|etudes|dipl[oô]mes?)\b",
            re.I,
        ),
    ),
    (
        "skills",
        re.compile(
            r"(?:^|[\s|/·•\-–—])(comp[ée]tences?|skills?|technologies?|outils?)\b",
            re.I,
        ),
    ),
    (
        "languages",
        re.compile(r"(?:^|[\s|/·•\-–—])(langues?|languages?)\b", re.I),
    ),
    (
        "certifications",
        re.compile(r"(?:^|[\s|/·•\-–—])(certifications?|accreditations?)\b", re.I),
    ),
    (
        "projets",
        re.compile(
            r"(?:^|[\s|/·•\-–—])(projets?|projects?|réalisations?|realisations?)\b",
            re.I,
        ),
    ),
    (
        "resume",
        re.compile(
            r"(?:^|[\s|/·•\-–—])(profil|r[ée]sum[ée]|summary|about|à propos|a propos)\b",
            re.I,
        ),
    ),
    (
        "contact",
        re.compile(r"(?:^|[\s|/·•\-–—])(contact|coordonn[ée]es)\b", re.I),
    ),
)


def extract_text_from_pdf_bytes(file_bytes: bytes) -> str:
    """Extraction texte PDF via pdfplumber (meme approche que main.py)."""
    import pdfplumber

    pages: list[str] = []
    with pdfplumber.open(BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                pages.append(text)
    return "\n\n".join(pages)


def extract_text_from_docx_bytes(file_bytes: bytes) -> str:
    """Extraction texte DOCX via python-docx (paragraphes)."""
    from docx import Document

    doc = Document(BytesIO(file_bytes))
    return "\n".join(p.text for p in doc.paragraphs if p.text and p.text.strip())


def detect_sections_offline(text: str) -> dict[str, Any]:
    """Detecte des titres de section dans un texte lineaire (heuristique).

    Retourne :
    - ``headings_found`` : ids de sections detectees (ordre d'apparition)
    - ``lines_scanned``
    - ``has_email`` / ``has_phone`` (signaux contact)
    """
    found: list[str] = []
    seen: set[str] = set()
    lines = [ln.strip() for ln in (text or "").splitlines() if ln.strip()]
    for line in lines:
        # Ignore les lignes trop longues (corps, pas titres).
        if len(line) > 120:
            continue
        # Prefixe un separateur pour que les ancres `(?:^|…)` matchent en debut.
        hay = f" {line}"
        for section_id, pattern in SECTION_HEADING_PATTERNS:
            if section_id in seen:
                continue
            if pattern.search(hay):
                found.append(section_id)
                seen.add(section_id)

    email = bool(re.search(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", text or "", re.I))
    phone = bool(re.search(r"(?:\+?\d[\d\s().-]{7,}\d)", text or ""))
    return {
        "headings_found": found,
        "lines_scanned": len(lines),
        "has_email": email,
        "has_phone": phone,
        "char_count": len(text or ""),
    }


def probe_pdf_import(file_bytes: bytes) -> dict[str, Any]:
    """Pipeline offline PDF : texte + sections + layout structurel (si possible)."""
    from backend.services.pdf_structural_extract import extract_layout_from_pdf

    text = extract_text_from_pdf_bytes(file_bytes)
    sections = detect_sections_offline(text)
    layout = None
    structural_ok = False
    block_count = 0
    try:
        layout = extract_layout_from_pdf(file_bytes)
        if isinstance(layout, dict):
            structural_ok = True
            pages = layout.get("pages") or []
            if pages and isinstance(pages[0], dict):
                block_count = len(pages[0].get("blocks") or [])
    except Exception as err:  # noqa: BLE001 — spike : on capture pour le rapport
        layout = {"error": str(err)}

    return {
        "kind": "pdf",
        "text_preview": (text or "")[:400],
        "sections": sections,
        "structural_ok": structural_ok,
        "structural_block_count": block_count,
        "structural_source": (layout or {}).get("source") if isinstance(layout, dict) else None,
    }


def probe_docx_import(file_bytes: bytes) -> dict[str, Any]:
    """Pipeline offline DOCX : texte + sections (pas de layout structurel)."""
    text = extract_text_from_docx_bytes(file_bytes)
    sections = detect_sections_offline(text)
    return {
        "kind": "docx",
        "text_preview": (text or "")[:400],
        "sections": sections,
        "structural_ok": False,
        "structural_block_count": 0,
        "structural_source": None,
        "note": "Word n'a pas de reconstruction layout mm dans le MVP ; contenu seulement.",
    }


def probe_import_file(path: Path) -> dict[str, Any]:
    """Dispatch selon l'extension du fichier sample."""
    data = path.read_bytes()
    suffix = path.suffix.lower()
    base = {
        "path": str(path),
        "name": path.name,
        "bytes": len(data),
    }
    if suffix == ".pdf":
        return {**base, **probe_pdf_import(data)}
    if suffix == ".docx":
        return {**base, **probe_docx_import(data)}
    raise ValueError(f"Extension non supportee pour le spike : {suffix}")
