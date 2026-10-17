"""Pièces jointes du parcours « Adapter un CV » (PDF / DOCX).

Le texte extrait alimente le plan et l'adaptation. Pas d'OCR : un PDF
image sans texte sélectionnable est refusé.
"""

from __future__ import annotations

import re
from io import BytesIO
from pathlib import Path

MAX_DOCUMENTS = 3
MAX_DOCUMENT_BYTES = 8 * 1024 * 1024
MAX_CHARS_PER_DOCUMENT = 6000
MAX_CONTEXT_CHARS = 12000
_MIN_TEXT_CHARS = 8


class AdaptContextDocError(ValueError):
    """Document refusé (format, poids ou texte illisible)."""


def _safe_filename(name: str) -> str:
    base = Path(name or "document").name
    cleaned = "".join(c for c in base if c.isprintable() and c not in '<>:"/\\|?*')
    cleaned = cleaned.strip().strip(".") or "document"
    return cleaned[:120]


def _pdf_text(file_bytes: bytes) -> str:
    import pdfplumber

    pdf = pdfplumber.open(BytesIO(file_bytes))
    try:
        pages = []
        for page in pdf.pages:
            text = page.extract_text() or ""
            if text.strip():
                pages.append(text)
        return "\n\n".join(pages)
    finally:
        pdf.close()


def extract_adapt_context_document(
    filename: str,
    content_type: str,
    file_bytes: bytes,
) -> dict:
    """Retourne filename, chars et le texte plafonné."""
    raw = file_bytes or b""
    if not raw:
        raise AdaptContextDocError("Le fichier est vide.")
    if len(raw) > MAX_DOCUMENT_BYTES:
        raise AdaptContextDocError("8 Mo maximum par document.")
    name = _safe_filename(filename)
    lower = name.lower()
    from backend.services.docx_text_extract import (
        extract_text_from_docx_bytes,
        is_docx_upload,
        is_legacy_doc,
    )

    if is_legacy_doc(filename=name, content_type=content_type or "", file_bytes=raw):
        raise AdaptContextDocError(
            "Enregistre le fichier en .docx : le format .doc n'est pas accepté."
        )
    if lower.endswith(".pdf") or raw[:5] == b"%PDF-":
        if not lower.endswith(".pdf"):
            name = f"{Path(name).stem[:110]}.pdf"
        try:
            text = _pdf_text(raw)
        except Exception as exc:
            raise AdaptContextDocError("Impossible de lire ce PDF.") from exc
    elif is_docx_upload(filename=name, content_type=content_type or "", file_bytes=raw):
        try:
            text = extract_text_from_docx_bytes(raw)
        except Exception as exc:
            raise AdaptContextDocError("Impossible de lire ce fichier Word.") from exc
    else:
        raise AdaptContextDocError("Formats acceptés : PDF ou DOCX.")
    text = " ".join((text or "").split())
    if len(text) < _MIN_TEXT_CHARS:
        raise AdaptContextDocError("Ce document ne contient pas assez de texte sélectionnable.")
    text = text[:MAX_CHARS_PER_DOCUMENT]
    return {"filename": name, "chars": len(text), "text": text}


def join_documents_context(documents: list[dict]) -> str:
    chunks: list[str] = []
    total = 0
    for doc in documents:
        name = (doc.get("filename") or "document").strip() or "document"
        body = (doc.get("text") or "").strip()
        piece = f"### {name}\n{body}"
        room = MAX_CONTEXT_CHARS - total
        if room < 40:
            break
        if len(piece) > room:
            piece = piece[:room].rstrip()
        chunks.append(piece)
        total += len(piece) + 2
    return "\n\n".join(chunks)


def context_document_records(documents_context: str) -> list[dict]:
    text = (documents_context or "").strip()
    if not text:
        return []
    records = []
    for part in re.split(r"\n(?=### )", text):
        header, _, body = part.partition("\n")
        if not header.startswith("### "):
            continue
        name = header[4:].strip()[:120] or "document"
        records.append({"filename": name, "chars": len(body.strip())})
    return records


def apply_documents_context(offre: dict, documents_context: str) -> dict:
    text = (documents_context or "").strip()[:MAX_CONTEXT_CHARS]
    if not text:
        return offre
    out = dict(offre)
    out["documents_contexte"] = text
    out["context_documents"] = context_document_records(text)
    return out
