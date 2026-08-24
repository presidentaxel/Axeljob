"""AXE-357 : langue du CV à l'adaptation (détection + verrou prompt)."""

import unittest

from backend.services.adapter import SYSTEM_PROMPT, _build_user_prompt
from backend.services.cv_language import (
    adaptation_language_payload,
    detect_cv_language,
    detect_offer_language,
    detect_text_language,
    language_lock_instruction,
    langue_cv_xml,
)


def _fr_cv() -> dict:
    return {
        "titre_professionnel": "Analyste risque",
        "resume": (
            "Analyste risque avec trois ans d'expérience en gestion de portefeuille. "
            "J'ai développé des tableaux de suivi pour le comité des risques et "
            "j'assure le reporting mensuel auprès de la direction."
        ),
        "experiences": [
            {
                "id": "exp_1",
                "poste": "Analyste risque",
                "entreprise": "Banque Demo",
                "bullet_points": [
                    "Pilotage du suivi des limites de marché pour l'équipe trading.",
                    "Mise en place d'un reporting hebdomadaire pour le comité des risques.",
                    "Contribution à l'analyse des scénarios de stress pour le portefeuille.",
                ],
            }
        ],
        "formations": [
            {
                "intitule": "Master finance",
                "etablissement": "Université Paris Dauphine",
            }
        ],
    }


def _en_cv() -> dict:
    return {
        "titre_professionnel": "Risk Analyst",
        "resume": (
            "Risk analyst with three years of experience in portfolio management. "
            "I developed monitoring dashboards for the risk committee and I currently "
            "support monthly reporting for senior leadership."
        ),
        "experiences": [
            {
                "id": "exp_1",
                "poste": "Risk Analyst",
                "entreprise": "Demo Bank",
                "bullet_points": [
                    "Managed market limit monitoring for the trading team.",
                    "Built a weekly reporting pack for the risk committee.",
                    "Supported stress-testing analysis across the portfolio.",
                ],
            }
        ],
        "formations": [
            {
                "intitule": "Master of Finance",
                "etablissement": "London School of Economics",
            }
        ],
    }


def _mixed_cv() -> dict:
    """Résumé FR + bullets EN, volumes comparables."""
    return {
        "titre_professionnel": "Analyste / Risk Analyst",
        "resume": (
            "Analyste risque avec trois ans d'expérience en gestion. "
            "J'ai développé des tableaux de suivi pour le comité et "
            "j'assure le reporting mensuel auprès de la direction."
        ),
        "experiences": [
            {
                "id": "exp_1",
                "poste": "Risk Analyst",
                "entreprise": "Demo Bank",
                "bullet_points": [
                    "Managed market limit monitoring for the trading team every week.",
                    "Built a weekly reporting pack for the risk committee and leadership.",
                    "Supported stress-testing analysis across the investment portfolio.",
                ],
            }
        ],
    }


def _en_offer() -> dict:
    return {
        "titre": "Risk Manager",
        "entreprise": "Acme Corp",
        "description_brute": (
            "We are looking for a Risk Manager to join our team in London. "
            "You will be responsible for market risk, stress testing and reporting "
            "to the executive committee. Strong experience with Python and Excel is required."
        ),
        "mots_cles_extraits": ["Risk Manager", "Python", "Excel"],
    }


def _fr_offer() -> dict:
    return {
        "titre": "Chargé de risques de marché",
        "entreprise": "Banque Demo",
        "description_brute": (
            "Nous recherchons un chargé de risques pour rejoindre l'équipe à Paris. "
            "Vous serez responsable du suivi des limites, des stress tests et du "
            "reporting auprès du comité de direction. Une expérience en Python et Excel est requise."
        ),
        "mots_cles_extraits": ["risques", "Python", "Excel"],
    }


class TestDetectCvLanguage(unittest.TestCase):
    def test_french_cv(self):
        lang = detect_cv_language(_fr_cv())
        self.assertEqual(lang["code"], "fr")
        self.assertFalse(lang["mixed"])
        self.assertGreater(lang["confidence"], 0.55)

    def test_english_cv(self):
        lang = detect_cv_language(_en_cv())
        self.assertEqual(lang["code"], "en")
        self.assertFalse(lang["mixed"])
        self.assertGreater(lang["confidence"], 0.55)

    def test_mixed_cv_flags_mixed_and_picks_dominant(self):
        lang = detect_cv_language(_mixed_cv())
        self.assertIn(lang["code"], ("fr", "en"))
        self.assertTrue(lang["mixed"], msg=lang)

    def test_empty_defaults_fr_low_confidence(self):
        lang = detect_cv_language({})
        self.assertEqual(lang["code"], "fr")
        self.assertFalse(lang["mixed"])
        self.assertEqual(lang["confidence"], 0.0)

    def test_french_cv_with_english_job_title_stays_fr(self):
        cv = _fr_cv()
        cv["titre_professionnel"] = "Risk Manager"
        lang = detect_cv_language(cv)
        self.assertEqual(lang["code"], "fr")
        self.assertFalse(lang["mixed"])


class TestDetectOfferLanguage(unittest.TestCase):
    def test_english_offer(self):
        lang = detect_offer_language(_en_offer())
        self.assertEqual(lang["code"], "en")
        self.assertFalse(lang["mixed"])

    def test_french_offer(self):
        lang = detect_offer_language(_fr_offer())
        self.assertEqual(lang["code"], "fr")
        self.assertFalse(lang["mixed"])


class TestLanguageLockPrompt(unittest.TestCase):
    def test_fr_cv_en_offer_forbids_translation(self):
        text = language_lock_instruction(
            detect_cv_language(_fr_cv()), detect_offer_language(_en_offer())
        )
        self.assertIn("français", text)
        self.assertIn("NE traduis PAS", text)
        self.assertIn("anglais", text)

    def test_en_cv_fr_offer_forbids_translation(self):
        text = language_lock_instruction(
            detect_cv_language(_en_cv()), detect_offer_language(_fr_offer())
        )
        self.assertIn("anglais", text)
        self.assertIn("NE traduis PAS", text)

    def test_same_language_no_offer_mismatch_sentence(self):
        text = language_lock_instruction(
            detect_cv_language(_fr_cv()), detect_offer_language(_fr_offer())
        )
        self.assertIn("français", text)
        self.assertNotIn("L'offre est rédigée", text)

    def test_mixed_mentions_dominant(self):
        cv_lang = detect_cv_language(_mixed_cv())
        text = language_lock_instruction(cv_lang, detect_offer_language(_en_offer()))
        self.assertIn("mélange", text)
        self.assertIn("langue dominante", text)


class TestAdapterPromptLock(unittest.TestCase):
    def test_system_prompt_mentions_language(self):
        self.assertIn("LANGUE", SYSTEM_PROMPT)
        self.assertIn("<langue_cv>", SYSTEM_PROMPT)
        self.assertIn("NE TRADUIS PAS", SYSTEM_PROMPT)

    def test_user_prompt_embeds_fr_lock_against_en_offer(self):
        prompt = _build_user_prompt(_fr_cv(), _en_offer(), None)
        self.assertIn("<langue_cv>", prompt)
        self.assertIn("<code>fr</code>", prompt)
        self.assertIn("uniquement en français", prompt)
        self.assertIn("Risk Manager", prompt)

    def test_user_prompt_embeds_en_lock_against_fr_offer(self):
        prompt = _build_user_prompt(_en_cv(), _fr_offer(), None)
        self.assertIn("<code>en</code>", prompt)
        self.assertIn("uniquement en anglais", prompt)

    def test_xml_helper_matches_detection(self):
        xml = langue_cv_xml(_fr_cv(), _en_offer())
        self.assertIn("<code>fr</code>", xml)
        self.assertIn("<langue_offre>en</langue_offre>", xml)


class TestAdaptationLanguagePayload(unittest.TestCase):
    def test_payload_keys(self):
        payload = adaptation_language_payload(_fr_cv(), _en_offer())
        self.assertEqual(payload["cv_language"]["code"], "fr")
        self.assertEqual(payload["offer_language"]["code"], "en")
        self.assertFalse(payload["cv_language"]["mixed"])


class TestTextLanguageSmoke(unittest.TestCase):
    def test_short_text_defaults_fr(self):
        lang = detect_text_language("Hello")
        self.assertEqual(lang["code"], "fr")
        self.assertEqual(lang["confidence"], 0.0)


if __name__ == "__main__":
    unittest.main()
