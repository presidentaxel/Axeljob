"""Tests des helpers d'embarquement de polices PDF (sans dépendance fitz)."""

import unittest

from backend.services.pdf_font_embed import (
    _font_root_and_style,
    _merge_subsets,
    _strip_subset_prefix,
    embedded_family_for,
)


class FontEmbedHelpersTest(unittest.TestCase):
    def test_strip_subset_prefix(self):
        self.assertEqual(_strip_subset_prefix("BAAAAA+Garet-Regular"), "Garet-Regular")
        self.assertEqual(_strip_subset_prefix("Garet-Bold"), "Garet-Bold")
        # Un faux préfixe (pas 6 majuscules) n'est pas retiré.
        self.assertEqual(_strip_subset_prefix("AB+Foo"), "AB+Foo")

    def test_font_root_and_style(self):
        self.assertEqual(_font_root_and_style("BAAAAA+Garet-Regular"), ("Garet", False, False))
        self.assertEqual(_font_root_and_style("AAAAAA+Garet-Bold"), ("Garet", True, False))
        self.assertEqual(_font_root_and_style("XXXXXX+Lato-BoldItalic"), ("Lato", True, True))
        root, bold, italic = _font_root_and_style("Helvetica-Oblique")
        self.assertEqual((root, bold, italic), ("Helvetica", False, True))

    def test_embedded_family_for(self):
        roots = {"Garet"}
        self.assertEqual(
            embedded_family_for("BAAAAA+Garet-Regular", roots),
            "'PDFEmbed-Garet', sans-serif",
        )
        self.assertIsNone(embedded_family_for("BAAAAA+Inter-Regular", roots))
        self.assertIsNone(embedded_family_for("Garet-Bold", set()))

    def test_merge_subsets_single_buffer_passthrough(self):
        # Un seul sous-ensemble : renvoyé tel quel (pas de fusion).
        buf = b"\x00\x01fake-ttf"
        self.assertEqual(_merge_subsets([buf]), buf)
        self.assertIsNone(_merge_subsets([]))


if __name__ == "__main__":
    unittest.main()
