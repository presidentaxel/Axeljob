"""Non-regression extraction sur fixtures import_samples (AXE-41)."""

from __future__ import annotations

import unittest
from pathlib import Path

from backend.services.cv_import_probe import probe_import_file

SAMPLES = Path(__file__).resolve().parent / "fixtures" / "import_samples"

REQUIRED_PDFS = (
    "01_single_column.pdf",
    "02_sidebar.pdf",
    "03_dense_multisection.pdf",
)


class TestImportSamplesExtract(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        if not SAMPLES.is_dir():
            raise unittest.SkipTest(f"Dossier samples manquant : {SAMPLES}")

    def test_pdf_samples_have_text_sections_and_structural_layout(self):
        for name in REQUIRED_PDFS:
            path = SAMPLES / name
            self.assertTrue(path.is_file(), f"Fixture manquante : {name}")
            report = probe_import_file(path)
            sec = report["sections"]
            self.assertEqual(report["kind"], "pdf")
            self.assertGreater(sec["char_count"], 200, msg=name)
            self.assertTrue(sec["has_email"], msg=name)
            self.assertTrue(sec["has_phone"], msg=name)
            self.assertGreaterEqual(len(sec["headings_found"]), 3, msg=name)
            self.assertTrue(report["structural_ok"], msg=name)
            self.assertGreaterEqual(report["structural_block_count"], 5, msg=name)

    def test_docx_sample_has_text_but_no_structural_layout(self):
        path = SAMPLES / "04_single_column.docx"
        self.assertTrue(path.is_file())
        report = probe_import_file(path)
        sec = report["sections"]
        self.assertEqual(report["kind"], "docx")
        self.assertGreater(sec["char_count"], 100)
        self.assertTrue(sec["has_email"])
        self.assertIn("experience", sec["headings_found"])
        self.assertFalse(report["structural_ok"])

    def test_docx_table_sample_includes_cell_text(self):
        path = SAMPLES / "05_with_table.docx"
        self.assertTrue(path.is_file(), "Régénérer via generate_import_samples.py")
        report = probe_import_file(path)
        preview = report["text_preview"]
        self.assertEqual(report["kind"], "docx")
        self.assertIn("Analyste — BlueCo", preview)
        self.assertIn("2021 - Aujourd'hui", preview)
        self.assertGreater(report["sections"]["char_count"], 80)


if __name__ == "__main__":
    unittest.main()
