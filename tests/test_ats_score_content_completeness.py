"""AXE-338 — completude semantique : CV pauvre → score bas ; riche → haut."""

from __future__ import annotations

import json
import unittest
from pathlib import Path

from backend.services.ats_score import score_parsing
from backend.services.ats_score.rules import content as content_rules
from backend.services.ats_score.rules import free_canvas as fc_rules
from backend.services.ats_score.template_layout import template_meta_to_layout

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "ats_score"
TEMPLATES = Path(__file__).resolve().parents[1] / "templates"


def _load(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


class TestContentCompletenessRules(unittest.TestCase):
    def test_empty_cv_triggers_all_missing_rules(self):
        for fn in (
            content_rules.rule_missing_identity,
            content_rules.rule_missing_contact,
            content_rules.rule_missing_experiences,
            content_rules.rule_missing_formations,
            content_rules.rule_missing_skills,
        ):
            with self.subTest(rule=fn.__name__):
                rule = fn({}, {})
                self.assertIsNotNone(rule)
                self.assertLess(rule.delta, 0)

    def test_dual_key_en_identity_avoids_identity_malus(self):
        cv = {"first_name": "Jean", "last_name": "Dupont"}
        self.assertIsNone(content_rules.rule_missing_identity(cv, {}))

    def test_empty_experience_shell_still_missing(self):
        cv = {"experiences": [{"id": "exp_1", "poste": "", "bullet_points": ["", ""]}]}
        rule = content_rules.rule_missing_experiences(cv, {})
        self.assertIsNotNone(rule)

    def test_filled_experience_clears_malus(self):
        cv = {"experiences": [{"poste": "Dev", "entreprise": "Acme"}]}
        self.assertIsNone(content_rules.rule_missing_experiences(cv, {}))


class TestPoorVsRichScores(unittest.TestCase):
    def test_empty_cv_score_clearly_low(self):
        cv = _load("cv_empty.json")
        result = score_parsing(cv, {"grid": "single-or-sidebar", "sidebar_ratio": 0.0})
        self.assertLessEqual(result.total, 40)
        ids = {r.id for r in result.rules}
        self.assertIn("malus_missing_identity", ids)
        self.assertIn("malus_missing_experiences", ids)

    def test_minimal_name_only_score_clearly_low(self):
        cv = _load("cv_minimal_name_only.json")
        result = score_parsing(cv, {"grid": "single-or-sidebar", "sidebar_ratio": 0.0})
        self.assertLessEqual(result.total, 50)
        self.assertNotIn("malus_missing_identity", {r.id for r in result.rules})

    def test_free_empty_canvas_score_at_floor(self):
        cv = _load("cv_empty.json")
        layout = _load("layout_free_empty.json")
        result = score_parsing(cv, layout)
        self.assertEqual(result.total, 0)
        ids = {r.id for r in result.rules}
        self.assertIn("malus_free_canvas_no_semantic_blocks", ids)

    def test_rich_cv_ats_safe_template_stays_high(self):
        cv = _load("cv_standard.json")
        meta = json.loads((TEMPLATES / "minimal" / "meta.json").read_text(encoding="utf-8"))
        layout = template_meta_to_layout(meta)
        result = score_parsing(cv, layout)
        self.assertGreaterEqual(result.total, 95)
        ids = {r.id for r in result.rules}
        self.assertNotIn("malus_missing_identity", ids)
        self.assertNotIn("malus_missing_experiences", ids)


class TestFreeCanvasSparse(unittest.TestCase):
    def test_no_semantic_blocks_penalized(self):
        rule = fc_rules.rule_free_canvas_no_semantic_blocks({}, _load("layout_free_empty.json"))
        self.assertIsNotNone(rule)
        self.assertEqual(rule.id, "malus_free_canvas_no_semantic_blocks")

    def test_empty_shells_do_not_expect_displayed_sections(self):
        cv = {
            "experiences": [{"id": "exp_1", "poste": ""}],
            "formations": [{"id": "form_1", "diplome": ""}],
            "competences": {"techniques": [""], "langues": [{"langue": ""}]},
        }
        self.assertIsNone(
            fc_rules.rule_free_canvas_missing_profile_sections(cv, _load("layout_free_empty.json"))
        )


if __name__ == "__main__":
    unittest.main()
