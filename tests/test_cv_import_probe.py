"""Tests offline du probe import CV (AXE-41)."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from backend.services.cv_import_probe import (
    detect_sections_offline,
    probe_import_file,
    probe_pdf_import,
)


class TestDetectSectionsOffline(unittest.TestCase):
    def test_finds_common_french_headings(self):
        text = "\n".join(
            [
                "Camille Durand",
                "camille@example.fr",
                "+33 6 12 34 56 78",
                "Profil",
                "PM confirmee.",
                "Experience professionnelle",
                "NovaSoft",
                "Formation",
                "Master",
                "Competences",
                "SQL",
                "Langues",
                "Anglais",
            ]
        )
        result = detect_sections_offline(text)
        self.assertTrue(result["has_email"])
        self.assertTrue(result["has_phone"])
        for expected in ("resume", "experience", "formation", "skills", "languages"):
            self.assertIn(expected, result["headings_found"])

    def test_empty_text(self):
        result = detect_sections_offline("")
        self.assertEqual(result["headings_found"], [])
        self.assertFalse(result["has_email"])
        self.assertEqual(result["char_count"], 0)


class TestProbeEdgeCases(unittest.TestCase):
    def test_unsupported_extension_raises(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "cv.txt"
            path.write_text("hello", encoding="utf-8")
            with self.assertRaises(ValueError) as ctx:
                probe_import_file(path)
            self.assertIn("Extension non supportee", str(ctx.exception))

    def test_blank_pdf_reports_structural_reason(self):
        try:
            import pymupdf as fitz
        except ImportError:
            try:
                import fitz
            except ImportError:
                self.skipTest("PyMuPDF indisponible")
        doc = fitz.open()
        doc.new_page(width=595, height=842)
        blank = doc.tobytes()
        doc.close()
        report = probe_pdf_import(blank)
        self.assertFalse(report["structural_ok"])
        self.assertEqual(report["structural_reason"], "texte_non_extractible")


if __name__ == "__main__":
    unittest.main()
