"""Tests des regles ATS canvas libre (P3.9)."""

import unittest

from backend.services.ats_score.rules import free_canvas as fc_rules


def _free_layout(blocks):
    return {"version": 3, "grid": "free", "pages": [{"id": "p1", "blocks": blocks}]}


class TestMissingProfileSections(unittest.TestCase):
    def test_blank_canvas_penalizes_missing_displayed_content(self):
        cv = {
            "prenom": "Alice",
            "nom": "Martin",
            "email": "alice@example.com",
            "experiences": [{"poste": "Dev"}],
            "formations": [{"diplome": "Master"}],
            "competences": {"techniques": ["Python"]},
        }
        rule = fc_rules.rule_free_canvas_missing_profile_sections(cv, _free_layout([]))
        self.assertIsNotNone(rule)
        self.assertEqual(rule.id, "malus_free_canvas_missing_profile_sections")
        self.assertIn("experiences", rule.label)
        self.assertLessEqual(rule.delta, -12)

    def test_displayed_profile_sections_have_no_penalty(self):
        cv = {
            "prenom": "Alice",
            "email": "alice@example.com",
            "experiences": [{"poste": "Dev"}],
        }
        layout = _free_layout(
            [
                {"type": "identity"},
                {"type": "contact"},
                {"type": "experiences"},
            ]
        )
        self.assertIsNone(fc_rules.rule_free_canvas_missing_profile_sections(cv, layout))

    def test_non_free_layout_is_ignored(self):
        cv = {"prenom": "Alice", "experiences": [{"poste": "Dev"}]}
        layout = {"grid": "single-or-sidebar", "pages": [{"blocks": []}]}
        self.assertIsNone(fc_rules.rule_free_canvas_missing_profile_sections(cv, layout))


class TestFreeCanvasReadingOrder(unittest.TestCase):
    def test_skips_non_free_grid(self):
        layout = {"grid": "single-or-sidebar", "pages": [{"blocks": []}]}
        self.assertIsNone(fc_rules.rule_free_canvas_reading_order({}, layout))

    def test_no_penalty_when_order_is_canonical(self):
        layout = _free_layout(
            [
                {"type": "identity", "x": 10, "y": 10, "w": 40, "h": 20},
                {"type": "resume", "x": 10, "y": 35, "w": 40, "h": 20},
                {"type": "experiences", "x": 10, "y": 60, "w": 40, "h": 40},
            ]
        )
        self.assertIsNone(fc_rules.rule_free_canvas_reading_order({}, layout))

    def test_inversions_trigger_penalty(self):
        layout = _free_layout(
            [
                {"type": "experiences", "x": 10, "y": 10, "w": 40, "h": 40},
                {"type": "identity", "x": 10, "y": 55, "w": 40, "h": 20},
            ]
        )
        rule = fc_rules.rule_free_canvas_reading_order({}, layout)
        self.assertIsNotNone(rule)
        self.assertEqual(rule.id, "malus_free_canvas_reading_order")
        self.assertLessEqual(rule.delta, -3)


class TestIdentityNotFirst(unittest.TestCase):
    def test_identity_first_returns_none(self):
        layout = _free_layout(
            [
                {"type": "identity", "x": 10, "y": 10, "w": 40, "h": 20},
                {"type": "resume", "x": 10, "y": 40, "w": 40, "h": 20},
            ]
        )
        self.assertIsNone(fc_rules.rule_identity_not_first_in_reading({}, layout))

    def test_experiences_above_identity_penalized(self):
        layout = _free_layout(
            [
                {"type": "experiences", "x": 10, "y": 5, "w": 40, "h": 30},
                {"type": "identity", "x": 10, "y": 40, "w": 40, "h": 20},
            ]
        )
        rule = fc_rules.rule_identity_not_first_in_reading({}, layout)
        self.assertIsNotNone(rule)
        self.assertEqual(rule.id, "malus_identity_not_first")


class TestExperiencesBeforeResume(unittest.TestCase):
    def test_experiences_above_resume_penalized(self):
        layout = _free_layout(
            [
                {"type": "experiences", "x": 10, "y": 10, "w": 40, "h": 30},
                {"type": "resume", "x": 10, "y": 50, "w": 40, "h": 20},
            ]
        )
        rule = fc_rules.rule_experiences_before_resume({}, layout)
        self.assertIsNotNone(rule)
        self.assertEqual(rule.delta, -5)


class TestContactFarFromTop(unittest.TestCase):
    def test_contact_low_penalized(self):
        cv = {"email": "a@b.com"}
        layout = _free_layout([{"type": "contact", "x": 10, "y": 120, "w": 40, "h": 10}])
        rule = fc_rules.rule_contact_far_from_top(cv, layout)
        self.assertIsNotNone(rule)
        self.assertEqual(rule.id, "malus_contact_low_on_page")

    def test_contact_high_no_penalty(self):
        cv = {"email": "a@b.com"}
        layout = _free_layout([{"type": "contact", "x": 10, "y": 20, "w": 40, "h": 10}])
        self.assertIsNone(fc_rules.rule_contact_far_from_top(cv, layout))


if __name__ == "__main__":
    unittest.main()
