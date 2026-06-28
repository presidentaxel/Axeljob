"""Tests de l'extraction structurelle PDF → layout v3 (sans IA)."""

import unittest

from backend.services.pdf_structural_extract import (
    _extract_shape_blocks,
    _float_rgb_to_hex,
    _frame_strips_from_rects,
    _int_color_to_hex,
    _is_near_white,
    extract_layout_from_pdf,
)

MM_PER_PT = 25.4 / 72.0


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
    page.insert_text((40, 100), "Fondateur - Entrepreneuriat / Creatif / Tech", fontsize=11)
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

    def test_decomposes_into_independent_blocks(self):
        # Nouvelle approche : la couche graphique est DÉCOMPOSÉE en blocs
        # déplaçables (fonds pleins → shape:rect, etc.) + texte éditable, et le
        # layout reste "freeform" (positions absolues, pas de reflow).
        layout = extract_layout_from_pdf(self.pdf)
        self.assertTrue(layout.get("freeform"))
        blocks = layout["pages"][0]["blocks"]
        types = {b["type"] for b in blocks}
        self.assertIn("text", types)
        # Le bandeau latéral plein est un rectangle indépendant (recolorable).
        self.assertIn("shape:rect", types)

    def test_complex_vector_becomes_shape_circle(self):
        # Une puce vectorielle (cercle plein) → forme circle native, pas une image.
        import fitz

        doc = fitz.open()
        page = doc.new_page(width=595, height=842)
        page.insert_text((40, 60), "Texte de section suffisant pour le seuil natif.", fontsize=11)
        page.insert_text(
            (40, 120), "Deuxieme ligne de contenu pour le minimum requis.", fontsize=11
        )
        page.draw_circle(fitz.Point(60, 200), 4, color=(0.2, 0.2, 0.2), fill=(0.2, 0.2, 0.2))
        data = doc.tobytes()
        doc.close()

        layout = extract_layout_from_pdf(data)
        self.assertIsNotNone(layout)
        blocks = layout["pages"][0]["blocks"]
        bullets = [b for b in blocks if b["type"] == "shape:circle"]
        self.assertGreaterEqual(len(bullets), 1)
        bullet = bullets[0]
        self.assertGreater(bullet["w"], 0)
        self.assertGreater(bullet["h"], 0)
        self.assertIn("color", bullet["style"])

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

    def test_font_size_stays_in_points(self):
        # Régression : la taille de police ne doit PAS être convertie en mm.
        # Un titre inséré à 20pt sur une page A4 doit rester ~20pt (>= 18).
        layout = extract_layout_from_pdf(self.pdf)
        text_blocks = [b for b in layout["pages"][0]["blocks"] if b["type"] == "text"]
        title = max(text_blocks, key=lambda b: b["style"].get("font_size", 0))
        self.assertGreaterEqual(title["style"]["font_size"], 18)
        self.assertLessEqual(title["style"]["font_size"], 24)

    def test_separator_line_is_thin_vector_fallback(self):
        # Régression du repli vectoriel (_extract_shape_blocks, utilisé si la
        # rasterisation du fond échoue) : un filet tracé → bloc fin, pas un gros
        # rectangle (fusion du rect englobant du chemin).
        import fitz

        doc = fitz.open()
        page = doc.new_page(width=595, height=842)
        page.draw_line(fitz.Point(40, 80), fitz.Point(540, 80), color=(0.5, 0.5, 0.5), width=0.8)
        page.draw_line(fitz.Point(40, 180), fitz.Point(540, 180), color=(0.5, 0.5, 0.5), width=0.8)
        try:
            blocks = _extract_shape_blocks(page, MM_PER_PT)
        finally:
            doc.close()

        lines = [b for b in blocks if b["type"] == "shape:line"]
        self.assertGreaterEqual(len(lines), 1)
        for line in lines:
            self.assertLessEqual(line["h"], 2.0)  # fin, pas un gros bloc
            self.assertGreater(line["w"], 100)  # s'étend sur la largeur
        big = [b for b in blocks if b["type"] == "shape:rect" and b["h"] > 50 and b["w"] > 100]
        self.assertEqual(big, [])

    def test_vertical_separator_line(self):
        import fitz

        doc = fitz.open()
        page = doc.new_page(width=595, height=842)
        page.draw_line(fitz.Point(80, 40), fitz.Point(80, 400), color=(0.4, 0.4, 0.4), width=0.8)
        try:
            blocks = _extract_shape_blocks(page, MM_PER_PT)
        finally:
            doc.close()

        vlines = [
            b for b in blocks
            if b["type"] == "shape:line" and b["style"].get("orientation") == "vertical"
        ]
        self.assertGreaterEqual(len(vlines), 1)
        line = vlines[0]
        self.assertLessEqual(line["w"], 2.0)
        self.assertGreater(line["h"], 50)

    def test_even_odd_nested_rects_become_thin_underline(self):
        # Régression : deux rectangles imbriqués (remplissage even-odd) =
        # un soulignement de section. Seule la fine différence doit être peinte,
        # PAS deux gros rectangles pleins de ~5mm.
        import fitz

        # Bord bas plus haut de 1.5pt → un seul filet fin en bas, pleine largeur.
        outer = fitz.Rect(10, 100, 160, 105.0)
        inner = fitz.Rect(10, 100, 160, 103.5)
        strips = _frame_strips_from_rects(outer, inner, MM_PER_PT, "#1e2a3a")
        self.assertEqual(len(strips), 1)
        strip = strips[0]
        self.assertEqual(strip["type"], "shape:line")
        self.assertLessEqual(strip["h"], 1.0)  # fin, pas un gros bloc
        self.assertGreater(strip["w"], 40)  # s'étend sur la largeur

    def test_empty_bytes_returns_none(self):
        self.assertIsNone(extract_layout_from_pdf(b""))

    def test_non_pdf_bytes_returns_none(self):
        self.assertIsNone(extract_layout_from_pdf(b"not a pdf at all"))


if __name__ == "__main__":
    unittest.main()
