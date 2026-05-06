"""Vérifie la présence et le contenu minimal des CSS WeasyPrint (pdf_export/)."""

import unittest
from pathlib import Path


class TestPdfExportAssets(unittest.TestCase):
    def setUp(self) -> None:
        self.root = Path(__file__).resolve().parent.parent
        self.pdf_export = self.root / "pdf_export"

    def test_css_files_exist(self) -> None:
        for name in (
            "weasyprint_cv_layout.css",
            "weasyprint_cv_export.css",
            "weasyprint_custom_template.css",
        ):
            path = self.pdf_export / name
            self.assertTrue(path.is_file(), f"manquant: {path}")

    def test_export_css_has_dedup_marker(self) -> None:
        text = (self.pdf_export / "weasyprint_cv_export.css").read_text(encoding="utf-8")
        self.assertIn("/*cv-bot-pdf-export*/", text)

    def test_weasyprint_module_loads_bundle(self) -> None:
        import backend.cv_pdf_weasyprint as wp

        self.assertIn('id="cv-bot-pdf-export-layout"', wp.PDF_EXPORT_LAYOUT_STYLE)
        self.assertIn('id="cv-bot-pdf-export-align"', wp.PDF_EXPORT_ALIGN_STYLE)
        self.assertIn("@page", wp.PDF_EXPORT_ALIGN_STYLE)
        self.assertIn("@page", wp.PDF_EXPORT_CUSTOM_BASE_STYLE)


if __name__ == "__main__":
    unittest.main()
