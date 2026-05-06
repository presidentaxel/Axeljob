"""Contrat unitaire pour backend.services.cv_render_helpers (ATS + diff + troncature)."""

import unittest

from backend.services import cv_render_helpers


class TestKeywordsFromCache(unittest.TestCase):
    def test_empty(self):
        self.assertEqual(cv_render_helpers.keywords_from_mots_cles_cache(""), [])
        self.assertEqual(cv_render_helpers.keywords_from_mots_cles_cache("   "), [])

    def test_tokens_ordered_by_length(self):
        # bigram/longer phrases first after sort(len desc)
        kws = cv_render_helpers.keywords_from_mots_cles_cache("foo bar baz")
        self.assertIn("foo", kws)
        self.assertIn("bar", kws)
        self.assertGreaterEqual(len(kws[0]), len(kws[-1]))

    def test_skips_pure_stopwords_single_token(self):
        self.assertEqual(cv_render_helpers.keywords_from_mots_cles_cache("le"), [])
        self.assertEqual(cv_render_helpers.keywords_from_mots_cles_cache("à"), [])


class TestMotsClestruncate(unittest.TestCase):
    def test_short_unchanged(self):
        self.assertEqual(cv_render_helpers.mots_cles_cache_for_pdf_export("abc"), "abc")

    def test_truncates_with_ellipsis(self):
        raw = "x" * 1000
        out = cv_render_helpers.mots_cles_cache_for_pdf_export(raw, max_chars=50)
        self.assertLessEqual(len(out), 50)
        self.assertTrue(out.endswith("…"))


class TestAtsHighlightPreviewBody(unittest.TestCase):
    def test_empty_keywords_noop(self):
        html_in = "<html><body>Bonjour Django</body></html>"
        self.assertEqual(
            cv_render_helpers.ats_highlight_preview_body(html_in, []),
            html_in,
        )

    def test_wraps_keyword_in_body(self):
        html_in = "<html><body>Bonjour django world</body></html>"
        out = cv_render_helpers.ats_highlight_preview_body(html_in, ["django"])
        self.assertIn("cv-ats-kw", out)
        self.assertIn("django", out.lower())

    def test_no_body_unchanged(self):
        html_in = "<html><head></head></html>"
        self.assertEqual(
            cv_render_helpers.ats_highlight_preview_body(html_in, ["x"]),
            html_in,
        )

    def test_does_not_touch_style_block(self):
        html_in = (
            "<html><body><style>django{color:red}</style>" "<p>hello django ok</p></body></html>"
        )
        out = cv_render_helpers.ats_highlight_preview_body(html_in, ["django"])
        self.assertRegex(out, r"<style>django\{color:red\}</style>")
        self.assertIn("cv-ats-kw", out)


class TestDiffHighlightHtml(unittest.TestCase):
    def test_equal_escaped_only(self):
        self.assertEqual(
            cv_render_helpers.diff_highlight_html("a", "a"),
            "a",
        )

    def test_highlights_changed_word(self):
        out = cv_render_helpers.diff_highlight_html("hello world", "hello there")
        self.assertIn("cv-changed", out)
        self.assertIn("there", out)

    def test_multiline_preserves_structure(self):
        out = cv_render_helpers.diff_highlight_html("line1\nsame", "line1\nsame").split("\n")
        self.assertGreaterEqual(len(out), 2)


if __name__ == "__main__":
    unittest.main()
