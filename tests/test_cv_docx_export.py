"""Tests export Word CV (AXE-330)."""

from io import BytesIO

import pytest

from backend.services.cv_docx_export import cv_to_docx_bytes
from backend.services.docx_text_extract import extract_text_from_docx_bytes


def _sample_cv() -> dict:
    return {
        "prenom": "Ada",
        "nom": "Lovelace",
        "titre_professionnel": "Analyste",
        "email": "ada@example.com",
        "resume": "Pionnière du calcul.",
        "experiences": [
            {
                "poste": "Analyste",
                "entreprise": "Babbage",
                "date_debut": "1840",
                "date_fin": "1850",
            }
        ],
        "competences": {"techniques": ["Maths", "Algo"]},
    }


def test_cv_to_docx_bytes_roundtrip_text():
    raw = cv_to_docx_bytes(_sample_cv())
    assert raw[:2] == b"PK"  # OOXML zip
    text = extract_text_from_docx_bytes(raw)
    assert "Ada Lovelace" in text
    assert "Analyste" in text
    assert "ada@example.com" in text
    assert "Profil" in text
    assert "Maths" in text


def test_cv_to_docx_bytes_empty_raises():
    with pytest.raises(ValueError, match="empty_cv"):
        cv_to_docx_bytes({})
    with pytest.raises(ValueError, match="empty_cv"):
        cv_to_docx_bytes(None)


def test_cv_to_docx_bytes_opens_with_python_docx():
    from docx import Document

    raw = cv_to_docx_bytes(_sample_cv())
    doc = Document(BytesIO(raw))
    headings = [p.text for p in doc.paragraphs if p.style and p.style.name.startswith("Heading")]
    assert any("Ada Lovelace" in h for h in headings)
