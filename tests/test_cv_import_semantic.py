"""Tests AXE-332 — découpe sections + annotations blocs (sans Gemini)."""

from backend.services.cv_import_semantic import (
    annotate_structural_blocks,
    parse_cv_by_sections,
    split_cv_text_into_sections,
)


SAMPLE_TEXT = """
Ada Lovelace
ada@example.com
+33 6 00 00 00 00

Expériences
Software Engineer — Analytical Engines
2020 — 2024
- Built early algorithms

Formations
Mathematics — Cambridge
2016

Compétences
Python, Algorithms
"""


def test_split_cv_text_into_sections_finds_blocks():
    sections = split_cv_text_into_sections(SAMPLE_TEXT)
    assert "identity" in sections
    assert "ada@example.com" in sections["identity"].lower() or "Ada" in sections["identity"]
    assert "experiences" in sections
    assert "Software Engineer" in sections["experiences"]
    assert "formations" in sections
    assert "skills" in sections


def test_parse_cv_by_sections_merges_mocked_passes():
    calls: list[str] = []

    def fake_generate(prompt: str, _uid: str | None) -> dict:
        calls.append(prompt[:40])
        if "identité" in prompt.lower() or "IDENTITY" in prompt or "contact" in prompt.lower():
            return {
                "prenom": "Ada",
                "nom": "Lovelace",
                "first_name": "Ada",
                "last_name": "Lovelace",
                "email": "ada@example.com",
            }
        if "expériences" in prompt.lower() or "experiences" in prompt.lower():
            return {
                "experiences": [
                    {
                        "id": "exp_1",
                        "poste": "Software Engineer",
                        "entreprise": "Analytical Engines",
                        "bullet_points": ["Built early algorithms"],
                    }
                ]
            }
        if "formations" in prompt.lower():
            return {
                "formations": [
                    {"id": "form_1", "diplome": "Mathematics", "etablissement": "Cambridge"}
                ]
            }
        if "compétences" in prompt.lower() or "competences" in prompt.lower():
            return {"competences": {"techniques": ["Python", "Algorithms"]}}
        return {}

    cv, _hints, meta = parse_cv_by_sections(SAMPLE_TEXT, "user-1", fake_generate)
    assert cv["prenom"] == "Ada"
    assert cv["first_name"] == "Ada"
    assert cv["email"] == "ada@example.com"
    assert len(cv.get("experiences") or []) >= 1
    assert meta["source"] == "import_sectioned"
    assert len(meta["section_passes"]) >= 1
    assert calls  # au moins une passe


def test_annotate_structural_blocks_identity_and_heading():
    layout = {
        "version": 3,
        "pages": [
            {
                "height_mm": 297,
                "blocks": [
                    {
                        "id": "b1",
                        "type": "text",
                        "x": 20,
                        "y": 15,
                        "w": 80,
                        "h": 10,
                        "content": "Ada Lovelace",
                        "style": {"font_size": 18, "bold": True},
                    },
                    {
                        "id": "b2",
                        "type": "text",
                        "x": 20,
                        "y": 40,
                        "w": 60,
                        "h": 8,
                        "content": "Expériences professionnelles",
                        "style": {"font_size": 12, "bold": True},
                    },
                    {
                        "id": "b3",
                        "type": "text",
                        "x": 20,
                        "y": 55,
                        "w": 90,
                        "h": 8,
                        "content": "ada@example.com",
                    },
                ],
            }
        ],
    }
    cv = {"prenom": "Ada", "nom": "Lovelace", "first_name": "Ada", "last_name": "Lovelace"}
    anns = annotate_structural_blocks(layout, cv)
    by_id = {a["block_id"]: a for a in anns}
    assert by_id["b1"]["type"] == "identity"
    assert by_id["b2"]["kind"] == "heading"
    assert by_id["b2"]["type"] == "experiences"
    assert by_id["b3"]["type"] == "contact"
