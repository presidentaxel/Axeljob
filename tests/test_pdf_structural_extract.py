"""Tests de l'extraction structurelle PDF → layout v3 (sans IA)."""

import unittest

from backend.services.pdf_structural_extract import (
    _float_rgb_to_hex,
    _int_color_to_hex,
    _is_near_white,
    extract_layout_from_pdf,
)


def _build_sample_pdf() -> bytes | None:
    """Construit un petit PDF natif (texte + rectangle de fond) via PyMuPDF."""
    try:
        import fitz
    except ImportError:
        return None
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)  # A4 en points
    # Bandeau de fond coloré (sidebar) à gauche.
    page.draw_rect(fitz.Rect(0, 0, 180, 842), color=None, fill=(0.1, 0.2, 0.4))
    # Quelques lignes de texte (assez de caractères pour passer le seuil natif).
    page.insert_text((40, 60), "Louis Vedovato", fontsize=20, color=(0, 0, 0))
    page.insert_text((40, 100), "Fondateur — Entrepreneuriat / Creatif / Tech", fontsize=11)
    page.insert_text(
        (40, 140),
        "Experience professionnelle riche en automatisation et gestion de projet.",
        fontsize=10,
    )
    page.insert_text((40, 180), "Python, IA, Developpement web full-stack, VBA Excel.", fontsize=10)
    data = doc.tobytes()
    doc.close()
    return data


class ColorHelpersTest(unittest.TestCase):
    def test_int_color_to_hex(self):
        self.assertEqual(_int_color_to_hex(0), "#000000")
        self.assertEqual(_int_color_to_hex(0xFF0000), "#ff0000")
        self.assertEqual(_int_color_to_hex(None), "#1a1a1a")

    def test_float_rgb_to_hex(self):
        self.assertEqual(_float_rgb_to_hex((1.0, 0.0, 0.0)), "#ff0000")
        self.assertEqual(_float_rgb_to_hex((0.0, 0.0, 0.0)), "#000000")
        self.assertEqual(_float_rgb_to_hex(0.5), "#808080")
        self.assertIsNone(_float_rgb_to_hex(None))

    def test_is_near_white(self):
        self.assertTrue(_is_near_white("#ffffff"))
        self.assertTrue(_is_near_white("#fefefe"))
        self.assertFalse(_is_near_white("#1e2a3a"))


class ExtractLayoutTest(unittest.TestCase):
    def setUp(self):
        self.pdf = _build_sample_pdf()
        if self.pdf is None:
            self.skipTest("PyMuPDF (fitz) indisponible")

    def test_returns_layout_with_blocks(self):
        layout = extract_layout_from_pdf(self.pdf)
        self.assertIsNotNone(layout)
        self.assertEqual(layout["version"], 3)
        self.assertEqual(layout["grid"], "free")
        self.assertEqual(layout["source"], "pdf_structural")
        self.assertGreaterEqual(len(layout["pages"]), 1)

    def test_contains_text_and_shape_blocks(self):
        layout = extract_layout_from_pdf(self.pdf)
        blocks = layout["pages"][0]["blocks"]
        types = {b["type"] for b in blocks}
        self.assertIn("text", types)
        self.assertIn("shape:rect", types)

    def test_text_block_has_content_and_position(self):
        layout = extract_layout_from_pdf(self.pdf)
        text_blocks = [b for b in layout["pages"][0]["blocks"] if b["type"] == "text"]
        self.assertTrue(text_blocks)
        joined = " ".join(b.get("content", "") for b in text_blocks)
        self.assertIn("Louis", joined)
        for b in text_blocks:
            self.assertIsInstance(b["x"], (int, float))
            self.assertIsInstance(b["y"], (int, float))
            self.assertLessEqual(b["x"], 210)
            self.assertLessEqual(b["y"], 297)
            self.assertIn("font_size", b["style"])

    def test_empty_bytes_returns_none(self):
        self.assertIsNone(extract_layout_from_pdf(b""))

    def test_non_pdf_bytes_returns_none(self):
        self.assertIsNone(extract_layout_from_pdf(b"not a pdf at all"))


if __name__ == "__main__":
    unittest.main()
