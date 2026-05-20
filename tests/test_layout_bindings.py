"""Tests layout_bindings (parite chemins CV)."""

import unittest

from backend.services import layout_bindings as lb


class TestLayoutBindings(unittest.TestCase):
    def test_resolve_bound_text_multi_path(self):
        cv = {"prenom": "Ada", "nom": "Lovelace"}
        self.assertEqual(lb.resolve_bound_text(cv, ["prenom", "nom"]), "Ada Lovelace")

    def test_resolve_experiences_limit(self):
        cv = {
            "experiences": [
                {"poste": "Dev", "entreprise": "ACME", "bullet_points": ["a"]},
                {"poste": "Lead", "entreprise": "Beta", "bullet_points": ["b"]},
            ]
        }
        out = lb.resolve_experiences(cv, 1)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["entreprise"], "ACME")


if __name__ == "__main__":
    unittest.main()
