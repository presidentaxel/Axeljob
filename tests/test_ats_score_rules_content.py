"""Tests des regles ATS de ``backend.services.ats_score.rules.content``."""

import unittest

from backend.services.ats_score.rules import content as content_rules


class TestStandardSectionTitles(unittest.TestCase):
    def test_no_data_no_bonus(self):
        self.assertIsNone(content_rules.rule_standard_section_titles({}, {}))

    def test_bonus_caps_at_three(self):
        layout = {
            "sections_order": [
                {"id": s, "visible": True}
                for s in (
                    "identity",
                    "experiences",
                    "formations",
                    "skills",
                    "languages",
                    "certifications",
                    "projets",
                )
            ],
        }
        rule = content_rules.rule_standard_section_titles({}, layout)
        self.assertIsNotNone(rule)
        self.assertEqual(rule.delta, 3)

    def test_fallback_to_cv_data_when_no_sections_order(self):
        cv = {
            "prenom": "Alice",
            "experiences": [{"poste": "X"}],
            "formations": [{"diplome": "Y"}],
            "competences": {"techniques": ["A"], "langues": [{"langue": "FR"}]},
        }
        rule = content_rules.rule_standard_section_titles(cv, {})
        self.assertIsNotNone(rule)
        self.assertEqual(rule.delta, 3)

    def test_invisible_sections_do_not_count(self):
        layout = {
            "sections_order": [
                {"id": "identity", "visible": False},
                {"id": "experiences", "visible": True},
            ]
        }
        rule = content_rules.rule_standard_section_titles({}, layout)
        self.assertIsNotNone(rule)
        self.assertEqual(rule.delta, 1)


class TestContactTopOfPage(unittest.TestCase):
    def test_no_contact_no_bonus(self):
        self.assertIsNone(content_rules.rule_contact_top_of_page({}, {}))

    def test_sections_order_identity_in_header_gives_bonus(self):
        cv = {"email": "a@b.fr"}
        layout = {"sections_order": [{"id": "identity", "visible": True, "in": "header"}]}
        rule = content_rules.rule_contact_top_of_page(cv, layout)
        self.assertIsNotNone(rule)
        self.assertEqual(rule.delta, 5)

    def test_free_canvas_block_in_top_30_percent_gives_bonus(self):
        cv = {"telephone": "+33"}
        layout = {
            "grid": "free",
            "pages": [{"blocks": [{"type": "contact", "x": 10, "y": 20, "w": 100, "h": 10}]}],
        }
        rule = content_rules.rule_contact_top_of_page(cv, layout)
        self.assertIsNotNone(rule)
        self.assertEqual(rule.delta, 5)

    def test_free_canvas_block_below_30_percent_no_bonus(self):
        cv = {"telephone": "+33"}
        layout = {
            "grid": "free",
            "pages": [{"blocks": [{"type": "contact", "x": 10, "y": 200, "w": 100, "h": 10}]}],
        }
        self.assertIsNone(content_rules.rule_contact_top_of_page(cv, layout))


class TestDatesFormat(unittest.TestCase):
    def test_consistent_year_only_gives_bonus(self):
        cv = {
            "experiences": [
                {"date_debut": "2022", "date_fin": "2024"},
                {"date_debut": "2018", "date_fin": "2021"},
            ]
        }
        rule = content_rules.rule_dates_format_consistent(cv, {})
        self.assertIsNotNone(rule)
        self.assertEqual(rule.delta, 3)

    def test_consistent_month_year_gives_bonus(self):
        cv = {"experiences": [{"date_debut": "06/2022", "date_fin": "12/2023"}]}
        rule = content_rules.rule_dates_format_consistent(cv, {})
        self.assertIsNotNone(rule)
        self.assertEqual(rule.delta, 3)

    def test_present_marker_does_not_break_consistency(self):
        # Regression : "Aujourd'hui" est un marqueur neutre, il ne doit pas
        # casser le bonus si tout le reste est coherent.
        cv = {
            "experiences": [
                {"date_debut": "06/2022", "date_fin": "Aujourd'hui"},
                {"date_debut": "01/2020", "date_fin": "05/2022"},
            ]
        }
        rule = content_rules.rule_dates_format_consistent(cv, {})
        self.assertIsNotNone(rule)

    def test_mixed_formats_no_bonus(self):
        cv = {
            "experiences": [
                {"date_debut": "2022", "date_fin": "12/2023"},
            ]
        }
        self.assertIsNone(content_rules.rule_dates_format_consistent(cv, {}))

    def test_exotic_dates_no_bonus(self):
        cv = {"experiences": [{"date_debut": "ete 2022", "date_fin": "fin 2023"}]}
        self.assertIsNone(content_rules.rule_dates_format_consistent(cv, {}))


class TestInconsistentDatesPenalty(unittest.TestCase):
    def test_no_dates_no_penalty(self):
        self.assertIsNone(content_rules.rule_inconsistent_dates({}, {}))

    def test_one_exotic_date_minus_one(self):
        cv = {"experiences": [{"date_debut": "ete 2022", "date_fin": "2023"}]}
        rule = content_rules.rule_inconsistent_dates(cv, {})
        self.assertIsNotNone(rule)
        self.assertEqual(rule.delta, -1)

    def test_penalty_caps_at_minus_five(self):
        cv = {
            "experiences": [
                {"date_debut": f"saison {i}", "date_fin": f"saison {i + 1}"} for i in range(10)
            ]
        }
        rule = content_rules.rule_inconsistent_dates(cv, {})
        self.assertIsNotNone(rule)
        self.assertEqual(rule.delta, -5)


if __name__ == "__main__":
    unittest.main()
