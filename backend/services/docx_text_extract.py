"""Extraction texte DOCX robuste (tables, runs) + detection .doc legacy (AXE-327)."""

from __future__ import annotations

from io import BytesIO

# Message UX : refuse explicite du Word 97-2003 (.doc / OLE).
DOC_LEGACY_REFUSAL_DETAIL = (
    "Le format Word .doc (ancien) n'est pas supporté. "
    "Ouvre le fichier dans Word ou LibreOffice, enregistre-le en .docx, puis réessaie."
)

# Compound File Binary Format (OLE) — signature des .doc legacy.
_OLE_MAGIC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"

_DOCX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
_MSWORD_CONTENT_TYPE = "application/msword"


def is_legacy_doc(
    *,
    filename: str | None = None,
    content_type: str | None = None,
    file_bytes: bytes | None = None,
) -> bool:
    """True si l'upload ressemble a un Word .doc legacy (a refuser)."""
    name = (filename or "").strip().lower()
    ctype = (content_type or "").strip().lower()
    if name.endswith(".doc") and not name.endswith(".docx"):
        return True
    if ctype == _MSWORD_CONTENT_TYPE:
        return True
    if file_bytes and len(file_bytes) >= 8 and file_bytes[:8] == _OLE_MAGIC:
        return True
    return False


def is_docx_upload(*, filename: str | None = None, content_type: str | None = None) -> bool:
    """True si l'upload est un .docx (extension ou content-type OOXML)."""
    name = (filename or "").strip().lower()
    ctype = (content_type or "").strip().lower()
    if name.endswith(".docx"):
        return True
    return ctype == _DOCX_CONTENT_TYPE


def _paragraph_plain_text(paragraph) -> str:
    """Texte d'un paragraphe via runs (tabs / soft breaks → texte lineaire)."""
    from docx.oxml.ns import qn

    chunks: list[str] = []
    for run in paragraph.runs:
        for child in run._element:
            tag = child.tag
            if tag == qn("w:t"):
                chunks.append(child.text or "")
            elif tag == qn("w:tab"):
                chunks.append("\t")
            elif tag in (qn("w:br"), qn("w:cr")):
                chunks.append("\n")
    text = "".join(chunks)
    if not text.strip():
        # Hyperliens / champs : repli sur l'API python-docx.
        text = paragraph.text or ""
    return text.strip()


def _table_to_text(table) -> str:
    """Aplatit un tableau en lignes « cellule | cellule » (ordre des lignes)."""
    lines: list[str] = []
    for row in table.rows:
        seen_tc: set[int] = set()
        cells_out: list[str] = []
        for cell in row.cells:
            tc_id = id(cell._tc)
            if tc_id in seen_tc:
                continue
            seen_tc.add(tc_id)
            parts: list[str] = []
            for p in cell.paragraphs:
                t = _paragraph_plain_text(p)
                if t:
                    parts.append(t)
            for nested in cell.tables:
                nested_txt = _table_to_text(nested)
                if nested_txt:
                    parts.append(nested_txt)
            cell_txt = " ".join(parts).strip()
            if cell_txt:
                cells_out.append(cell_txt)
        if cells_out:
            lines.append(" | ".join(cells_out))
    return "\n".join(lines)


def extract_text_from_docx_bytes(file_bytes: bytes) -> str:
    """Extrait le texte d'un .docx en preservant l'ordre corps (paragraphes + tables)."""
    from docx import Document
    from docx.table import Table
    from docx.text.paragraph import Paragraph

    doc = Document(BytesIO(file_bytes))
    blocks: list[str] = []
    for item in doc.iter_inner_content():
        if isinstance(item, Paragraph):
            text = _paragraph_plain_text(item)
            if text:
                blocks.append(text)
        elif isinstance(item, Table):
            text = _table_to_text(item)
            if text:
                blocks.append(text)
    return "\n".join(blocks).strip()
