"""Tests offline du probe import CV (AXE-41)."""

from __future__ import annotations

import unittest

from backend.services.cv_import_probe import detect_sections_offline


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


if __name__ == "__main__":
    unittest.main()
