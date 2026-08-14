"""AXE-325 — scoring multi-variantes sur fixtures import_samples."""

from __future__ import annotations

import unittest
from pathlib import Path

from backend.api_ats import resolve_layout_for_scoring
from backend.services.import_variant_scoring import (
    attach_delta_vs_best,
    score_import_layout_variants,
)
from backend.services.pdf_structural_extract import extract_layout_from_pdf

SAMPLES = Path(__file__).resolve().parent / "fixtures" / "import_samples"

# CV minimal cohérent avec les samples anonymisés (email présent dans les PDF).
SAMPLE_CV = {
    "prenom": "Alex",
    "nom": "Martin",
    "email": "alex.martin@example.com",
    "titre_professionnel": "Product Manager",
    "resume": "Profil product avec 8 ans d experience.",
    "experiences": [
        {
            "poste": "Product Manager",
            "entreprise": "Example Corp",
            "bullet_points": ["Livraison roadmap", "Discovery utilisateurs"],
        }
    ],
    "formations": [{"diplome": "Master", "etablissement": "Univ", "date": "2015"}],
    "competences": {
        "techniques": ["Agile", "SQL"],
        "logiciels": [],
        "langues": [],
        "autres": [],
    },
}


class TestAttachDeltaVsBest(unittest.TestCase):
    def test_best_is_zero_others_negative(self) -> None:
        scored = [
            {"id": "ats-safe", "score_json": {"total": 100}},
            {"id": "design", "score_json": {"total": 80}},
            {"id": "mix", "score_json": {"total": 90}},
        ]
        out = attach_delta_vs_best(scored)
        by_id = {row["id"]: row["delta_vs_best"] for row in out}
        self.assertEqual(by_id["ats-safe"], 0)
        self.assertEqual(by_id["design"], -20)
        self.assertEqual(by_id["mix"], -10)


class TestScoreImportVariantsOnFixtures(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        pdf_path = SAMPLES / "01_single_column.pdf"
        if not pdf_path.is_file():
            raise unittest.SkipTest(f"Fixture manquante : {pdf_path}")
        cls.structural = extract_layout_from_pdf(pdf_path.read_bytes())
        if not cls.structural:
            raise unittest.SkipTest("extract_layout_from_pdf a échoué sur 01_single_column")

    def test_three_variants_have_score_json_and_delta(self) -> None:
        ats_safe = resolve_layout_for_scoring(None, "minimal")
        # « mix » proxy : même base structurelle (FE applique ATS + pagination).
        variants = [
            {"id": "ats-safe", "layout": ats_safe},
            {"id": "design", "layout": self.structural},
            {"id": "mix", "layout": self.structural},
        ]
        result = score_import_layout_variants(SAMPLE_CV, variants)
        self.assertEqual(len(result["variants"]), 3)
        self.assertIn("best_total", result)
        ids = [v["id"] for v in result["variants"]]
        self.assertEqual(ids, ["ats-safe", "design", "mix"])
        for row in result["variants"]:
            self.assertIn("score_json", row)
            self.assertIn("total", row["score_json"])
            self.assertIn("rules", row["score_json"])
            self.assertIn("delta_vs_best", row)
            self.assertLessEqual(row["score_json"]["total"], result["best_total"])
            self.assertEqual(
                row["delta_vs_best"],
                row["score_json"]["total"] - result["best_total"],
            )
        # Au moins une variante doit être le meilleur (delta 0).
        self.assertTrue(any(v["delta_vs_best"] == 0 for v in result["variants"]))

    def test_sidebar_fixture_design_differs_from_minimal(self) -> None:
        pdf_path = SAMPLES / "02_sidebar.pdf"
        self.assertTrue(pdf_path.is_file())
        structural = extract_layout_from_pdf(pdf_path.read_bytes())
        self.assertIsNotNone(structural)
        assert structural is not None
        result = score_import_layout_variants(
            SAMPLE_CV,
            [
                {"id": "ats-safe", "layout": resolve_layout_for_scoring(None, "minimal")},
                {"id": "design", "layout": structural},
            ],
        )
        by_id = {v["id"]: v for v in result["variants"]}
        # Sur un PDF sidebar, le structurel free-canvas est en général moins
        # bien noté que le template minimal ATS-safe.
        self.assertNotEqual(
            by_id["ats-safe"]["score_json"]["total"],
            by_id["design"]["score_json"]["total"],
        )


if __name__ == "__main__":
    unittest.main()
