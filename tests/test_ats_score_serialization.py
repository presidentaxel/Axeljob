"""Contrat de serialisation JSON du scoring ATS."""

import unittest

from backend.services.ats_score import Rule, RuleSeverity, ScoreResult
from backend.services.ats_score.serialization import rule_to_dict, score_result_to_dict


class TestRuleSerialization(unittest.TestCase):
    def test_rule_to_dict_has_expected_keys(self):
        rule = Rule(id="r1", label="L", delta=-3, severity=RuleSeverity.WARNING)
        payload = rule_to_dict(rule)
        self.assertEqual(payload, {"id": "r1", "label": "L", "delta": -3, "severity": "warning"})

    def test_severity_is_serialized_as_lowercase_string(self):
        # Regression : si on serialise l'enum brute, le client front recoit
        # un format inconnu. On verifie qu'on a bien la chaine valeur.
        for sev in RuleSeverity:
            rule = Rule(id="x", label="x", delta=0, severity=sev)
            self.assertEqual(rule_to_dict(rule)["severity"], sev.value)


class TestScoreResultSerialization(unittest.TestCase):
    def test_empty_result(self):
        result = ScoreResult(kind="parsing", total=100, version="2026.05")
        payload = score_result_to_dict(result)
        self.assertEqual(payload["kind"], "parsing")
        self.assertEqual(payload["total"], 100)
        self.assertEqual(payload["version"], "2026.05")
        self.assertEqual(payload["rules"], [])

    def test_preserves_rule_order(self):
        rules = (
            Rule(id="a", label="A", delta=1, severity=RuleSeverity.INFO),
            Rule(id="b", label="B", delta=-2, severity=RuleSeverity.WARNING),
            Rule(id="c", label="C", delta=3, severity=RuleSeverity.INFO),
        )
        result = ScoreResult(kind="parsing", total=42, version="2026.05", rules=rules)
        payload = score_result_to_dict(result)
        self.assertEqual([r["id"] for r in payload["rules"]], ["a", "b", "c"])


if __name__ == "__main__":
    unittest.main()
