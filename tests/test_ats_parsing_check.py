"""Tests ground truth ``ats_parsing_check`` (AXE-39)."""

from __future__ import annotations

import unittest

from backend.services.ats_parsing_check import (
    DELTA_RASTER,
    adjust_score_with_ground_truth,
    assert_chunks_in_text,
    expected_text_chunks,
    extract_text_pdfplumber,
    linearize_cv,
    rules_diff,
    verify_parsing_quality,
)
from backend.services.ats_score.types import Rule, RuleSeverity, ScoreResult
from backend.services.ats_score.version import SCORING_VERSION


def _make_text_pdf(text: str) -> bytes:
    import fitz

    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    page.insert_text((40, 72), text, fontsize=11)
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


def _make_blank_pdf() -> bytes:
    import fitz

    doc = fitz.open()
    doc.new_page(width=595, height=842)
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


def _sample_cv() -> dict:
    return {
        "prenom": "Alice",
        "nom": "Martin",
        "email": "alice.martin@example.fr",
        "telephone": "+33 6 12 34 56 78",
        "titre_professionnel": "Data Analyst",
        "resume": "Analyste business confirmee.",
        "experiences": [
            {
                "poste": "Data Analyst",
                "entreprise": "Acme",
                "date_debut": "01/2022",
                "date_fin": "Aujourd'hui",
                "bullet_points": ["Migration Tableau."],
            }
        ],
    }


class TestLinearizeAndChunks(unittest.TestCase):
    def test_linearize_includes_identity_and_bullets(self):
        linear = linearize_cv(_sample_cv())
        self.assertIn("Alice Martin", linear)
        self.assertIn("alice.martin@example.fr", linear)
        self.assertIn("Migration Tableau.", linear)

    def test_expected_chunks_subset(self):
        chunks = expected_text_chunks(_sample_cv(), limit=5)
        self.assertGreaterEqual(len(chunks), 3)
        self.assertTrue(any("Alice" in c for c in chunks))


class TestVerifyParsingQuality(unittest.TestCase):
    def test_good_pdf_has_critical_fields_and_coverage(self):
        cv = _sample_cv()
        text = "\n".join(
            [
                "Alice Martin",
                "Data Analyst",
                "alice.martin@example.fr",
                "+33 6 12 34 56 78",
                "Analyste business confirmee.",
                "Data Analyst",
                "Acme",
                "01/2022",
                "Aujourd'hui",
                "• Migration Tableau.",
            ]
        )
        pdf = _make_text_pdf(text)
        layout = {
            "pages": [
                {
                    "id": "p1",
                    "blocks": [
                        {"id": "b-identity", "type": "identity"},
                        {"id": "b-contact", "type": "contact"},
                    ],
                }
            ]
        }
        gt = verify_parsing_quality(pdf, cv, layout=layout)
        self.assertTrue(gt["all_critical_fields_present"])
        self.assertGreaterEqual(gt["no_text_loss_coverage"], 0.7)
        self.assertFalse(gt["likely_raster_pdf"])
        self.assertEqual(gt["block_ids_divergent"], [])

    def test_raster_pdf_has_zero_coverage(self):
        cv = _sample_cv()
        gt = verify_parsing_quality(_make_blank_pdf(), cv)
        self.assertTrue(gt["likely_raster_pdf"])
        self.assertEqual(gt["no_text_loss_coverage"], 0.0)
        self.assertFalse(gt["all_critical_fields_present"])
        self.assertIn("name", gt["missing_critical_fields"])

    def test_missing_email_maps_contact_block(self):
        cv = _sample_cv()
        pdf = _make_text_pdf("Alice Martin\nData Analyst\n+33 6 12 34 56 78")
        layout = {
            "pages": [
                {
                    "id": "p1",
                    "blocks": [
                        {"id": "b-identity", "type": "identity"},
                        {"id": "b-contact", "type": "contact"},
                    ],
                }
            ]
        }
        gt = verify_parsing_quality(pdf, cv, layout=layout)
        self.assertIn("email", gt["missing_critical_fields"])
        self.assertIn("b-contact", gt["block_ids_divergent"])


class TestAdjustScore(unittest.TestCase):
    def _base_score(self) -> ScoreResult:
        return ScoreResult(
            kind="parsing",
            total=90,
            version=SCORING_VERSION,
            rules=(
                Rule(
                    id="bonus_mono_column",
                    label="Mono-colonne",
                    delta=10,
                    severity=RuleSeverity.INFO,
                ),
            ),
        )

    def test_raster_applies_penalty(self):
        gt = verify_parsing_quality(_make_blank_pdf(), _sample_cv())
        adjusted = adjust_score_with_ground_truth(self._base_score(), gt)
        self.assertTrue(any(r.id == "gt_raster_pdf" for r in adjusted.rules))
        self.assertLess(adjusted.total, 90)
        # Au minimum la penalite raster ; d'autres gt_* peuvent s'empiler.
        self.assertLessEqual(adjusted.total, max(0, 90 + DELTA_RASTER))

    def test_good_pdf_keeps_score(self):
        cv = _sample_cv()
        text = linearize_cv(cv) + "\n• Migration Tableau."
        gt = verify_parsing_quality(_make_text_pdf(text), cv)
        adjusted = adjust_score_with_ground_truth(self._base_score(), gt)
        self.assertEqual(adjusted.total, 90)
        self.assertFalse(any(r.id.startswith("gt_") for r in adjusted.rules))

    def test_rules_diff_lists_only_pdf(self):
        base = self._base_score()
        gt = {"likely_raster_pdf": True, "parser_disagreement": 0.0, "no_text_loss_coverage": 1.0}
        pdf_score = adjust_score_with_ground_truth(base, gt)
        diff = rules_diff(base, pdf_score)
        self.assertIn("gt_raster_pdf", diff["only_pdf"])
        self.assertEqual(diff["only_json"], [])


class TestExtractHelpers(unittest.TestCase):
    def test_pdfplumber_roundtrip(self):
        pdf = _make_text_pdf("Hello ATS world")
        text = extract_text_pdfplumber(pdf)
        self.assertIn("Hello ATS world", text)

    def test_assert_chunks_in_text(self):
        missing = assert_chunks_in_text("Alice Martin Data Analyst", ["Alice Martin", "Ghost"])
        self.assertEqual(missing, ["Ghost"])


if __name__ == "__main__":
    unittest.main()
