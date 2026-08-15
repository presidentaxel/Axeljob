"""Tests des regles ATS de ``backend.services.ats_score.rules.layout``."""

import unittest

from backend.services.ats_score.rules import layout as layout_rules


class TestMultiColumn(unittest.TestCase):
    def test_mono_column_returns_none(self):
        layout = {"grid": "single-or-sidebar", "sidebar_ratio": 0.0}
        self.assertIsNone(layout_rules.rule_multi_column({}, layout))

    def test_two_columns_via_sidebar_ratio(self):
        layout = {"grid": "single-or-sidebar", "sidebar_ratio": 0.33}
        rule = layout_rules.rule_multi_column({}, layout)
        self.assertIsNotNone(rule)
        self.assertEqual(rule.id, "malus_two_columns")
        self.assertEqual(rule.delta, -8)

    def test_free_canvas_with_clustered_x_positions_counts_columns(self):
        layout = {
            "grid": "free",
            "pages": [
                {
                    "blocks": [
                        {"type": "identity", "x": 10, "y": 10, "w": 60, "h": 20},
                        {"type": "skills", "x": 80, "y": 10, "w": 60, "h": 20},
                        {"type": "experiences", "x": 150, "y": 10, "w": 60, "h": 20},
                    ]
                }
            ],
        }
        rule = layout_rules.rule_multi_column({}, layout)
        self.assertIsNotNone(rule)
        self.assertEqual(rule.id, "malus_three_or_more_columns")
        self.assertEqual(rule.delta, -15)

    def test_invalid_layout_is_tolerated(self):
        # Regression : un layout casse ne doit pas faire crasher la regle.
        for bad in [{"grid": 123}, {"sidebar_ratio": "wat"}, {"pages": "nope"}]:
            self.assertIsNone(layout_rules.rule_multi_column({}, bad))


class TestSidebarPresent(unittest.TestCase):
    def test_no_sidebar_returns_none(self):
        self.assertIsNone(layout_rules.rule_sidebar_present({}, {"sidebar_ratio": 0}))

    def test_sidebar_returns_minus_five(self):
        rule = layout_rules.rule_sidebar_present({}, {"sidebar_ratio": 0.25})
        self.assertIsNotNone(rule)
        self.assertEqual(rule.delta, -5)


class TestFreeCanvasTextPositions(unittest.TestCase):
    """AXE-336 : plus de pénalité systematique sur les positions libres."""

    def test_disabled_even_with_many_text_blocks(self):
        layout = {
            "grid": "free",
            "pages": [{"blocks": [{"type": "text", "x": i, "y": 10} for i in range(20)]}],
        }
        self.assertIsNone(layout_rules.rule_free_canvas_text_positions({}, layout))

    def test_still_noop_outside_free_mode(self):
        layout = {
            "grid": "single-or-sidebar",
            "pages": [{"blocks": [{"type": "text", "x": 10, "y": 10}]}],
        }
        self.assertIsNone(layout_rules.rule_free_canvas_text_positions({}, layout))

    def test_score_parsing_does_not_emit_text_blocks_malus(self):
        from backend.services.ats_score import score_parsing

        cv = {
            "prenom": "Alice",
            "nom": "Martin",
            "email": "a@b.fr",
            "experiences": [{"poste": "Dev", "entreprise": "Acme"}],
            "formations": [{"diplome": "Master"}],
            "competences": {"techniques": ["Python"]},
        }
        layout = {
            "grid": "free",
            "pages": [
                {
                    "blocks": [
                        {"type": "identity", "x": 10, "y": 10, "w": 80, "h": 20},
                        {"type": "contact", "x": 10, "y": 35, "w": 80, "h": 15},
                        {"type": "experiences", "x": 10, "y": 55, "w": 80, "h": 40},
                        {"type": "formations", "x": 10, "y": 100, "w": 80, "h": 20},
                        {"type": "skills", "x": 10, "y": 125, "w": 80, "h": 20},
                    ]
                }
            ],
        }
        result = score_parsing(cv, layout)
        ids = {r.id for r in result.rules}
        self.assertNotIn("malus_free_canvas_text_blocks", ids)


class TestTableLayout(unittest.TestCase):
    def test_uses_table_layout_flag_triggers_penalty(self):
        rule = layout_rules.rule_table_layout({}, {"uses_table_layout": True})
        self.assertIsNotNone(rule)
        self.assertEqual(rule.delta, -10)

    def test_default_is_no_penalty(self):
        self.assertIsNone(layout_rules.rule_table_layout({}, {}))


if __name__ == "__main__":
    unittest.main()
