"""Snapshots HTML/PDF de non-regression (AXE-39).

- HTML : le layout free-canvas contient les chunks attendus du CV.
- PDF  : WeasyPrint + pdfplumber retrouvent les memes chunks.
- Score : |score_pdf - score_json| reste sous le seuil produit.
"""

from __future__ import annotations

import json
import unittest
from pathlib import Path

from backend.api_ats import VERIFY_PDF_SCORE_DELTA_THRESHOLD, VerifyPdfBody, handle_verify_pdf
from backend.services.ats_parsing_check import (
    assert_chunks_in_text,
    extract_text_pdfplumber,
)
from backend.services.ats_score import score_parsing
from backend.services.ats_score.template_layout import template_meta_to_layout
from backend.services.layout_renderer import render_html

REPO_ROOT = Path(__file__).resolve().parents[1]
FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures" / "ats_score"
TEMPLATES_DIR = REPO_ROOT / "templates"
TEMPLATE_IDS = ("minimal", "classic", "modern", "bold", "creative", "elegant", "executive")


def _load_cv() -> dict:
    cv = json.loads((FIXTURES_DIR / "cv_standard.json").read_text(encoding="utf-8"))
    cv["photo_url"] = ""
    return cv


def _snapshot_chunks(cv: dict) -> list[str]:
    """Chunks presentes dans le layout free-canvas de ce fichier (pas la ville seule)."""
    return [
        f"{cv['prenom']} {cv['nom']}",
        cv["titre_professionnel"],
        cv["email"],
        cv["telephone"],
        cv["resume"],
        cv["experiences"][0]["entreprise"],
        cv["experiences"][0]["poste"],
    ]


def _free_canvas_layout() -> dict:
    """Layout mono-colonne libre couvrant identite / contact / resume / xp."""
    return {
        "version": 3,
        "theme": {
            "color_accent": "#1e3a5f",
            "font_heading": "Inter",
            "font_body": "Inter",
            "show_photo": False,
        },
        "pages": [
            {
                "id": "p1",
                "blocks": [
                    {
                        "id": "b-identity",
                        "type": "identity",
                        "bind": ["prenom", "nom", "titre_professionnel"],
                        "x": 10,
                        "y": 10,
                        "w": 190,
                        "h": 22,
                        "z": 1,
                    },
                    {
                        "id": "b-contact",
                        "type": "contact",
                        "x": 10,
                        "y": 34,
                        "w": 190,
                        "h": 12,
                        "z": 1,
                    },
                    {
                        "id": "b-resume",
                        "type": "resume",
                        "bind": "resume",
                        "x": 10,
                        "y": 50,
                        "w": 190,
                        "h": 22,
                        "z": 1,
                    },
                    {
                        "id": "b-xp",
                        "type": "experiences",
                        "x": 10,
                        "y": 76,
                        "w": 190,
                        "h": 80,
                        "z": 1,
                    },
                ],
            }
        ],
    }


def _weasyprint_available() -> bool:
    try:
        import weasyprint  # noqa: F401

        from backend.services.generator import generer_pdf_bytes_from_html

        html = "<html><body><p>ping</p></body></html>"
        generer_pdf_bytes_from_html(html, REPO_ROOT, {}, {})
        return True
    except Exception:
        return False


class TestHtmlLayoutSnapshot(unittest.TestCase):
    def test_free_canvas_html_contains_expected_chunks(self):
        cv = _load_cv()
        layout = _free_canvas_layout()
        html = render_html(cv, layout, for_preview=False)
        missing = assert_chunks_in_text(html, _snapshot_chunks(cv))
        self.assertEqual(missing, [], msg=f"Chunks absents du HTML : {missing}")


class TestPdfLayoutSnapshot(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.weasy = _weasyprint_available()

    def test_free_canvas_pdf_contains_expected_chunks(self):
        if not self.weasy:
            self.skipTest("WeasyPrint PDF indisponible dans cet environnement")
        from backend.services.generator import generer_pdf_bytes_from_html

        cv = _load_cv()
        layout = _free_canvas_layout()
        html = render_html(cv, layout, for_preview=False)
        pdf_bytes, _ = generer_pdf_bytes_from_html(html, REPO_ROOT, cv, {})
        extracted = extract_text_pdfplumber(pdf_bytes)
        missing = assert_chunks_in_text(extracted, _snapshot_chunks(cv))
        self.assertEqual(missing, [], msg=f"Chunks absents du PDF : {missing}")

    def test_verify_pdf_delta_within_threshold_for_free_canvas(self):
        if not self.weasy:
            self.skipTest("WeasyPrint PDF indisponible dans cet environnement")
        payload = handle_verify_pdf(VerifyPdfBody(cv=_load_cv(), layout=_free_canvas_layout()))
        self.assertLessEqual(
            abs(payload["delta_total"]),
            VERIFY_PDF_SCORE_DELTA_THRESHOLD,
            msg=f"delta_total={payload['delta_total']} gt={payload['ground_truth']}",
        )
        self.assertTrue(payload["within_threshold"])


class TestTemplateScoreJsonStable(unittest.TestCase):
    """Les templates livres restent scorables ; verify-pdf template demande un rendu HTML.

    On ne force pas WeasyPrint sur les 7 templates ici (cout CI + deps systeme) :
    on garde le contrat score JSON + un smoke verify-pdf sur free-canvas.
    """

    def test_template_meta_layouts_still_score(self):
        cv = _load_cv()
        for template_id in TEMPLATE_IDS:
            meta = json.loads(
                (TEMPLATES_DIR / template_id / "meta.json").read_text(encoding="utf-8")
            )
            layout = template_meta_to_layout(meta)
            result = score_parsing(cv, layout)
            self.assertGreaterEqual(result.total, 0)
            self.assertLessEqual(result.total, 100)


if __name__ == "__main__":
    unittest.main()
