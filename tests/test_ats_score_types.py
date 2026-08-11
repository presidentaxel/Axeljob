"""Contrat des dataclasses publiques du scoring ATS."""

import unittest

from backend.services.ats_score import Rule, RuleSeverity, ScoreResult


class TestRuleDataclass(unittest.TestCase):
    def test_rule_is_immutable(self):
        from dataclasses import FrozenInstanceError

        rule = Rule(id="r1", label="L", delta=-3, severity=RuleSeverity.WARNING)
        with self.assertRaises(FrozenInstanceError):
            rule.delta = 99  # type: ignore[misc]

    def test_rule_severity_is_enum_value_serializable(self):
        rule = Rule(id="r1", label="L", delta=1, severity=RuleSeverity.INFO)
        self.assertEqual(rule.severity.value, "info")
        self.assertEqual(RuleSeverity("info"), RuleSeverity.INFO)


class TestScoreResultDataclass(unittest.TestCase):
    def test_score_result_defaults_to_empty_rules(self):
        result = ScoreResult(kind="parsing", total=100, version="2026.05")
        self.assertEqual(result.rules, ())

    def test_with_rule_returns_new_instance_and_does_not_mutate(self):
        base = ScoreResult(kind="parsing", total=100, version="2026.05")
        rule = Rule(id="r1", label="L", delta=5, severity=RuleSeverity.INFO)
        enriched = base.with_rule(rule)
        self.assertEqual(base.rules, ())
        self.assertEqual(enriched.rules, (rule,))
        self.assertIsNot(base, enriched)

    def test_with_rule_preserves_total_until_finalize(self):
        # Regression : with_rule ne doit jamais recalculer total tout seul.
        # Seul l'engine est responsable de l'agregation finale.
        base = ScoreResult(kind="parsing", total=42, version="2026.05")
        rule = Rule(id="r1", label="L", delta=99, severity=RuleSeverity.ERROR)
        enriched = base.with_rule(rule)
        self.assertEqual(enriched.total, 42)


if __name__ == "__main__":
    unittest.main()
