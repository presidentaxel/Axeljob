"""Contrat de l'engine ``score_parsing`` : clamp, robustesse, agregation."""

import unittest

from backend.services.ats_score import SCORING_VERSION, Rule, RuleSeverity, score_parsing


def _rule_neg(_cv, _layout):
    return Rule(id="r_neg", label="negatif", delta=-30, severity=RuleSeverity.WARNING)


def _rule_pos(_cv, _layout):
    return Rule(id="r_pos", label="positif", delta=5, severity=RuleSeverity.INFO)


def _rule_zero(_cv, _layout):
    return None  # regle non appliquee


def _rule_raises(_cv, _layout):
    raise RuntimeError("regle defaillante - ne doit pas casser l'engine")


class TestEngineClampingAndBaseline(unittest.TestCase):
    def test_empty_inputs_return_base_score_100(self):
        result = score_parsing(None, None, rules=())
        self.assertEqual(result.total, 100)
        self.assertEqual(result.kind, "parsing")
        self.assertEqual(result.version, SCORING_VERSION)
        self.assertEqual(result.rules, ())

    def test_clamps_below_zero(self):
        rules = [_rule_neg] * 10  # -300 cumule, doit clamp a 0
        result = score_parsing({}, {}, rules=rules)
        self.assertEqual(result.total, 0)
        self.assertEqual(len(result.rules), 10)

    def test_clamps_above_hundred(self):
        rules = [_rule_pos] * 10  # +50 ramene au plafond 100
        result = score_parsing({}, {}, rules=rules)
        self.assertEqual(result.total, 100)
        self.assertEqual(len(result.rules), 10)

    def test_zero_rules_do_not_appear_in_result(self):
        result = score_parsing({}, {}, rules=[_rule_zero, _rule_pos])
        self.assertEqual(result.total, 100)  # 100 + 5 = 105 clamp 100
        self.assertEqual(len(result.rules), 1)
        self.assertEqual(result.rules[0].id, "r_pos")


class TestEngineRobustness(unittest.TestCase):
    def test_rule_exception_is_caught_and_skipped(self):
        # Regression : une regle qui leve ne doit jamais casser le scoring.
        # Bug latent possible si on retire le try/except dans _apply_rules.
        result = score_parsing({}, {}, rules=[_rule_raises, _rule_pos])
        self.assertEqual(result.total, 100)
        self.assertEqual(len(result.rules), 1)
        self.assertEqual(result.rules[0].id, "r_pos")


class TestEngineDeterminism(unittest.TestCase):
    def test_same_input_gives_same_output(self):
        cv = {"prenom": "Alice"}
        layout = {"grid": "single-or-sidebar", "sidebar_ratio": 0.0}
        a = score_parsing(cv, layout)
        b = score_parsing(cv, layout)
        self.assertEqual(a.total, b.total)
        self.assertEqual([r.id for r in a.rules], [r.id for r in b.rules])

    def test_default_rule_set_is_not_empty(self):
        # Garantit que ``parsing_rules`` (le set par defaut) est bien branche.
        result = score_parsing(
            {"prenom": "Alice", "email": "a@b.fr"},
            {"grid": "single-or-sidebar", "sidebar_ratio": 0.0},
        )
        self.assertGreater(len(result.rules), 0)


if __name__ == "__main__":
    unittest.main()
