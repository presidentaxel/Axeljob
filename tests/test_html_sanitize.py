"""Tests whitelist HTML canvas (AXE-40)."""

from __future__ import annotations

import unittest

from backend.html_sanitize import looks_like_rich_html, sanitize_rich_text_html


class TestHtmlSanitize(unittest.TestCase):
    def test_keeps_whitelist_tags(self) -> None:
        raw = '<strong>A</strong> <em>B</em> <u>C</u> <s>D</s> <span style="color:red">E</span>'
        out = sanitize_rich_text_html(raw)
        self.assertIn("<strong>A</strong>", out)
        self.assertIn("<em>B</em>", out)
        self.assertIn("<u>C</u>", out)
        self.assertIn("<s>D</s>", out)
        self.assertIn('style="color:red"', out)

    def test_aliases_b_i_strike(self) -> None:
        out = sanitize_rich_text_html("<b>x</b><i>y</i><strike>z</strike>")
        self.assertEqual(out, "<strong>x</strong><em>y</em><s>z</s>")

    def test_strips_script_and_attrs(self) -> None:
        out = sanitize_rich_text_html(
            '<strong onclick="alert(1)">ok</strong><script>evil()</script>'
            '<a href="https://x">link</a>'
        )
        self.assertEqual(out, "<strong>ok</strong>link")
        self.assertNotIn("script", out.lower())
        self.assertNotIn("onclick", out.lower())
        self.assertNotIn("<a", out.lower())

    def test_rejects_dangerous_span_style(self) -> None:
        out = sanitize_rich_text_html(
            '<span style="color:red; background:url(javascript:alert(1)); font-size:99px">'
            "x</span>"
        )
        self.assertIn("color:red", out)
        self.assertNotIn("background", out)
        self.assertNotIn("font-size", out)

    def test_looks_like_rich_html(self) -> None:
        self.assertTrue(looks_like_rich_html("<strong>x</strong>"))
        self.assertFalse(looks_like_rich_html("plain text"))
        self.assertFalse(looks_like_rich_html("<script>x</script>"))


if __name__ == "__main__":
    unittest.main()
