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


def test_split_profil_heading_goes_to_resume_not_identity():
    text = """Ada Lovelace
ada@example.com

Profil
Ingénieure passionnée par les algorithmes.

Expériences
Software Engineer — Engines
"""
    sections = split_cv_text_into_sections(text)
    assert "resume" in sections
    assert "algorithmes" in sections["resume"].lower()
    assert "profil" not in (sections.get("identity") or "").lower()


def test_headingless_cv_triggers_fallback_full():
    text = """Ada Lovelace
ada@example.com
Software Engineer at Analytical Engines 2020-2024
Built early algorithms
Mathematics Cambridge 2016
Python Algorithms
"""
    fallback_calls: list[str] = []

    def fake_generate(prompt: str, _uid: str | None) -> dict:
        if "mise en page" in prompt.lower() or "layout_hints" in prompt.lower():
            return {"layout_hints": {"layout_style": "single-column", "sections_emphasis": []}}
        return {
            "prenom": "Ada",
            "nom": "Lovelace",
            "email": "ada@example.com",
        }

    def fake_full(full_text: str, _uid: str | None) -> dict:
        fallback_calls.append(full_text[:20])
        return {
            "cv": {
                "prenom": "Ada",
                "nom": "Lovelace",
                "first_name": "Ada",
                "last_name": "Lovelace",
                "email": "ada@example.com",
                "experiences": [
                    {
                        "id": "exp_1",
                        "poste": "Software Engineer",
                        "entreprise": "Analytical Engines",
                    }
                ],
            },
            "layout_hints": {"layout_style": "single-column"},
        }

    cv, hints, meta = parse_cv_by_sections(text, "user-1", fake_generate, fallback_full=fake_full)
    assert fallback_calls, "heading-less CV must call fallback_full"
    assert "fallback_full" in meta["section_passes"]
    assert len(cv.get("experiences") or []) >= 1
    assert hints.get("layout_style") == "single-column"


def test_languages_pass_runs_even_after_skills():
    text = """Ada Lovelace
ada@example.com

Compétences
Python, Algorithms

Langues
Anglais — courant
"""

    def fake_generate(prompt: str, _uid: str | None) -> dict:
        low = prompt.lower()
        if "mise en page" in low:
            return {"layout_hints": {"layout_style": "single-column"}}
        if "identité" in low or "contact" in low:
            return {"prenom": "Ada", "nom": "Lovelace", "email": "ada@example.com"}
        if "compétences" in low or "competences" in low:
            if "anglais" in low:
                return {"competences": {"langues": [{"langue": "Anglais", "niveau": "courant"}]}}
            return {"competences": {"techniques": ["Python", "Algorithms"]}}
        return {}

    cv, _hints, meta = parse_cv_by_sections(text, "user-1", fake_generate)
    assert "skills" in meta["section_passes"]
    assert "languages" in meta["section_passes"]
    langues = (cv.get("competences") or {}).get("langues") or []
    assert any((x.get("langue") or "").lower().startswith("anglais") for x in langues)


def test_quota_exceeded_is_not_swallowed():
    import pytest

    from backend.gemini_usage import GeminiQuotaExceeded

    def boom(_prompt: str, _uid: str | None) -> dict:
        raise GeminiQuotaExceeded()

    with pytest.raises(GeminiQuotaExceeded):
        parse_cv_by_sections(SAMPLE_TEXT, "user-1", boom)


def test_layout_hints_pass_when_sections_succeed():
    def fake_generate(prompt: str, _uid: str | None) -> dict:
        low = prompt.lower()
        if "mise en page" in low:
            return {
                "layout_hints": {
                    "layout_style": "sidebar-left",
                    "accent_color": "#1863dc",
                    "sections_emphasis": ["experiences"],
                }
            }
        if "identité" in low or "contact" in low:
            return {
                "prenom": "Ada",
                "nom": "Lovelace",
                "email": "ada@example.com",
            }
        if "expériences" in low or "experiences" in low:
            return {
                "experiences": [
                    {"id": "exp_1", "poste": "Software Engineer", "entreprise": "Engines"}
                ]
            }
        if "formations" in low:
            return {"formations": [{"id": "form_1", "diplome": "Mathematics"}]}
        if "compétences" in low or "competences" in low:
            return {"competences": {"techniques": ["Python"]}}
        return {}

    _cv, hints, meta = parse_cv_by_sections(SAMPLE_TEXT, "user-1", fake_generate)
    assert "layout_hints" in meta["section_passes"]
    assert hints.get("layout_style") == "sidebar-left"
    assert hints.get("accent_color") == "#1863dc"
