"""Tests des regles ATS de ``backend.services.ats_score.rules.typography``."""

import unittest

from backend.services.ats_score.rules import typography as typo_rules


class TestExoticFont(unittest.TestCase):
    def test_safe_font_returns_none(self):
        layout = {"theme": {"font_heading": "Inter", "font_body": "Inter"}}
        self.assertIsNone(typo_rules.rule_exotic_font({}, layout))

    def test_exotic_heading_triggers_penalty(self):
        layout = {"theme": {"font_heading": "Comic Sans MS"}}
        rule = typo_rules.rule_exotic_font({}, layout)
        self.assertIsNotNone(rule)
        self.assertEqual(rule.delta, -5)

    def test_safe_font_with_quotes_is_normalized(self):
        layout = {"theme": {"font_heading": "'Inter'"}}
        self.assertIsNone(typo_rules.rule_exotic_font({}, layout))

    def test_exotic_body_and_heading_does_not_double_penalize(self):
        # Regression : la regle annonce "au moins une exotique", elle ne
        # doit jamais cumuler -10 ; on garde -5 fixe.
        layout = {"theme": {"font_heading": "Pacifico", "font_body": "Lobster"}}
        rule = typo_rules.rule_exotic_font({}, layout)
        self.assertIsNotNone(rule)
        self.assertEqual(rule.delta, -5)


class TestBodyFontSize(unittest.TestCase):
    def test_in_range_returns_none(self):
        self.assertIsNone(
            typo_rules.rule_body_font_size_out_of_range({}, {"theme": {"font_size_body": 9}})
        )
        self.assertIsNone(
            typo_rules.rule_body_font_size_out_of_range({}, {"theme": {"font_size_body": 12}})
        )

    def test_below_min_triggers_penalty(self):
        rule = typo_rules.rule_body_font_size_out_of_range({}, {"theme": {"font_size_body": 7}})
        self.assertIsNotNone(rule)
        self.assertEqual(rule.delta, -3)

    def test_above_max_triggers_penalty(self):
        rule = typo_rules.rule_body_font_size_out_of_range({}, {"theme": {"font_size_body": 14}})
        self.assertIsNotNone(rule)
        self.assertEqual(rule.delta, -3)

    def test_missing_font_size_is_tolerated(self):
        self.assertIsNone(typo_rules.rule_body_font_size_out_of_range({}, {"theme": {}}))

    def test_invalid_value_is_tolerated(self):
        # Regression : une valeur non numerique ne doit pas faire crasher.
        layout = {"theme": {"font_size_body": "huge"}}
        self.assertIsNone(typo_rules.rule_body_font_size_out_of_range({}, layout))


class TestMonoColumnBonus(unittest.TestCase):
    def test_mono_column_gives_bonus(self):
        layout = {"grid": "single-or-sidebar", "sidebar_ratio": 0}
        rule = typo_rules.rule_mono_column_bonus({}, layout)
        self.assertIsNotNone(rule)
        self.assertEqual(rule.delta, 10)

    def test_two_columns_no_bonus(self):
        layout = {"grid": "single-or-sidebar", "sidebar_ratio": 0.4}
        self.assertIsNone(typo_rules.rule_mono_column_bonus({}, layout))

    def test_free_canvas_no_bonus_even_if_one_column(self):
        # Free canvas : pas de bonus mono-colonne (grille libre ≠ template 1-col).
        # AXE-336 : on ne pénalise plus les positions libres seules, mais le
        # bonus mono reste reservé aux templates figes.
        layout = {
            "grid": "free",
            "pages": [{"blocks": [{"type": "identity", "x": 10, "y": 10}]}],
        }
        self.assertIsNone(typo_rules.rule_mono_column_bonus({}, layout))


if __name__ == "__main__":
    unittest.main()
