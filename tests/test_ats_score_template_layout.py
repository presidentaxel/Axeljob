"""Tests de ``template_meta_to_layout`` : mapping meta.json -> layout scorable."""

import unittest

from backend.services.ats_score.template_layout import (
    DEFAULT_SIDEBAR_RATIO,
    template_meta_to_layout,
)


class TestTemplateMetaToLayout(unittest.TestCase):
    def test_single_column_template_has_no_sidebar(self):
        meta = {"id": "minimal", "tags": ["single-column", "no-sidebar"]}
        layout = template_meta_to_layout(meta)
        self.assertEqual(layout["sidebar_ratio"], 0.0)
        self.assertEqual(layout["template_id"], "minimal")

    def test_sidebar_template_has_default_ratio(self):
        meta = {"id": "classic", "tags": ["sidebar", "photo"]}
        layout = template_meta_to_layout(meta)
        self.assertEqual(layout["sidebar_ratio"], DEFAULT_SIDEBAR_RATIO)

    def test_sidebar_left_position(self):
        meta = {"id": "modern", "tags": ["sidebar-left"]}
        layout = template_meta_to_layout(meta)
        self.assertEqual(layout["sidebar_position"], "left")

    def test_show_photo_inherits_option_default(self):
        meta = {
            "id": "modern",
            "tags": ["sidebar-left", "photo"],
            "options": [{"key": "show_photo", "type": "boolean", "default": False}],
        }
        layout = template_meta_to_layout(meta)
        self.assertFalse(layout["theme"]["show_photo"])

    def test_show_photo_defaults_to_photo_tag(self):
        # Minimal n'a pas l'option show_photo et pas de tag "photo" : la photo
        # doit etre desactivee par defaut.
        meta = {"id": "minimal", "tags": ["single-column", "no-sidebar"]}
        layout = template_meta_to_layout(meta)
        self.assertFalse(layout["theme"]["show_photo"])

    def test_font_heading_inherits_option_default(self):
        meta = {
            "id": "executive",
            "tags": ["sidebar"],
            "options": [
                {
                    "key": "font",
                    "type": "select",
                    "choices": ["Georgia", "Inter"],
                    "default": "Georgia",
                },
            ],
        }
        layout = template_meta_to_layout(meta)
        self.assertEqual(layout["theme"]["font_heading"], "Georgia")

    def test_missing_options_uses_safe_fallbacks(self):
        # Regression : un meta.json sans options ni tags ne doit pas crasher.
        layout = template_meta_to_layout({"id": "broken"})
        self.assertEqual(layout["template_id"], "broken")
        self.assertEqual(layout["sidebar_ratio"], 0.0)
        self.assertFalse(layout["theme"]["show_photo"])

    def test_standard_sections_are_visible_with_identity_in_header(self):
        layout = template_meta_to_layout({"id": "minimal"})
        identities = [s for s in layout["sections_order"] if s["id"] == "identity"]
        self.assertEqual(len(identities), 1)
        self.assertEqual(identities[0]["in"], "header")
        self.assertTrue(identities[0]["visible"])


if __name__ == "__main__":
    unittest.main()
