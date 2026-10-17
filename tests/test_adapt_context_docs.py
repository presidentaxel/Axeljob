"""Pièces jointes du flux d'adaptation à l'offre."""

from pathlib import Path

from backend.services.adapt_context_docs import (
    AdaptContextDocError,
    apply_documents_context,
    extract_adapt_context_document,
    join_documents_context,
)
from backend.services.adapter import _build_user_prompt, documents_contexte_block

SAMPLES = Path(__file__).resolve().parent / "fixtures" / "import_samples"


def test_docx_sample_becomes_context():
    raw = (SAMPLES / "04_single_column.docx").read_bytes()
    doc = extract_adapt_context_document("lettre.docx", "", raw)
    assert doc["chars"] >= 8
    context = join_documents_context([doc])
    assert context.startswith("### lettre.docx")
    offre = apply_documents_context({"description_brute": "offre"}, context)
    assert offre["context_documents"][0]["filename"] == "lettre.docx"
    assert "<documents_candidat>" in documents_contexte_block(offre)


def test_pdf_sample_becomes_context():
    raw = (SAMPLES / "01_single_column.pdf").read_bytes()
    doc = extract_adapt_context_document("annexe.pdf", "application/pdf", raw)
    assert "### annexe.pdf" in join_documents_context([doc])


def test_legacy_doc_and_empty_are_refused():
    try:
        extract_adapt_context_document("cv.doc", "application/msword", b"not a doc")
    except AdaptContextDocError as exc:
        assert ".docx" in str(exc)
    else:
        raise AssertionError("expected AdaptContextDocError")
    try:
        extract_adapt_context_document("vide.pdf", "application/pdf", b"%PDF-1.4")
    except AdaptContextDocError as exc:
        assert "texte" in str(exc).lower() or "lire" in str(exc).lower()
    else:
        raise AssertionError("expected AdaptContextDocError")


def test_prompt_stays_unchanged_without_documents():
    assert documents_contexte_block({"description_brute": "offre"}) == ""


def test_user_prompt_includes_attached_documents():
    offre = apply_documents_context(
        {
            "titre": "Analyste",
            "entreprise": "Nord",
            "description_brute": "Analyse de données",
            "mots_cles_extraits": ["excel"],
            "competences_requises": [],
        },
        "### lettre.pdf\nExpérience en reporting Excel déjà décrite dans le CV.",
    )
    prompt = _build_user_prompt(
        {"resume": "Analyste", "experiences": [], "langue": "fr"},
        offre,
        None,
    )
    assert "<documents_candidat>" in prompt
    assert "lettre.pdf" in prompt
    assert "Ne rien inventer" in prompt
