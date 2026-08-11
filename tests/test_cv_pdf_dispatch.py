"""Sélection du moteur PDF (env CV_BOT_PDF_ENGINE)."""

import os
import unittest


class TestCvPdfDispatch(unittest.TestCase):
    def tearDown(self) -> None:
        os.environ.pop("CV_BOT_PDF_ENGINE", None)

    def test_default_weasyprint(self) -> None:
        os.environ.pop("CV_BOT_PDF_ENGINE", None)
        from backend.cv_pdf_dispatch import cv_pdf_engine

        self.assertEqual(cv_pdf_engine(), "weasyprint")

    def test_chromium_aliases(self) -> None:
        from backend.cv_pdf_dispatch import cv_pdf_engine

        for v in ("chromium", "CHROMIUM", "playwright", "chrome"):
            with self.subTest(v=v):
                os.environ["CV_BOT_PDF_ENGINE"] = v
                self.assertEqual(cv_pdf_engine(), "chromium")


if __name__ == "__main__":
    unittest.main()
