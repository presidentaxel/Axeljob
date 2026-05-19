"""Tests des regles ATS de ``backend.services.ats_score.rules.meta``."""

import unittest

from backend.services.ats_score.rules import meta as meta_rules


class TestPhotoPresent(unittest.TestCase):
    def test_no_photo_no_penalty(self):
        self.assertIsNone(meta_rules.rule_photo_present({}, {}))

    def test_photo_url_with_show_photo_default_true_triggers_penalty(self):
        rule = meta_rules.rule_photo_present(
            {"photo_url": "https://supabase.co/.../sign/...jpg"},
            {"theme": {}},
        )
        self.assertIsNotNone(rule)
        self.assertEqual(rule.delta, -3)

    def test_show_photo_false_disables_penalty(self):
        # L'utilisateur a explicitement masque la photo dans son layout :
        # meme s'il a une photo_url, on ne penalise pas.
        rule = meta_rules.rule_photo_present(
            {"photo_url": "https://supabase.co/.../sign/...jpg"},
            {"theme": {"show_photo": False}},
        )
        self.assertIsNone(rule)

    def test_empty_photo_url_no_penalty(self):
        # Regression : un photo_url vide / espaces ne doit pas declencher la regle.
        self.assertIsNone(meta_rules.rule_photo_present({"photo_url": "   "}, {}))


if __name__ == "__main__":
    unittest.main()
