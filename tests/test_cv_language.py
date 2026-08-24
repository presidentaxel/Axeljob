"""AXE-357 : langue du CV à l'adaptation (détection + verrou prompt)."""

import unittest

from backend.services.adapter import SYSTEM_PROMPT, _build_user_prompt, _infer_profile_anchor
from backend.services.cv_language import (
    adaptation_language_payload,
    apply_deterministic_localization,
    detect_cv_language,
    detect_offer_language,
    detect_text_language,
    language_lock_instruction,
    langue_cv_xml,
    localize_date_phrase,
    merge_localized_fields,
    resolve_output_language,
    should_prompt_language_choice,
    template_copy_for_lang,
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
                "date_debut": "janv. 2022",
                "date_fin": "aujourd'hui",
                "lieu": "Télétravail",
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
                "date": "sept. 2020",
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
        self.assertIn("conserver", SYSTEM_PROMPT)
        self.assertIn("traduire", SYSTEM_PROMPT)

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
        self.assertTrue(payload["language_mismatch"])
        self.assertEqual(payload["output_language"], "cv")
        self.assertFalse(payload["translate_cv"])

    def test_offer_policy_same_language_does_not_translate(self):
        payload = adaptation_language_payload(_fr_cv(), _fr_offer(), "offer")
        self.assertFalse(payload["translate_cv"])
        self.assertEqual(payload["output_language"], "cv")
        self.assertEqual(payload["output_language_code"], "fr")


class TestOutputPolicy(unittest.TestCase):
    def test_should_prompt_on_mismatch(self):
        self.assertTrue(
            should_prompt_language_choice(
                detect_cv_language(_fr_cv()), detect_offer_language(_en_offer())
            )
        )
        self.assertFalse(
            should_prompt_language_choice(
                detect_cv_language(_fr_cv()), detect_offer_language(_fr_offer())
            )
        )

    def test_resolve_keep_vs_translate(self):
        cv = detect_cv_language(_fr_cv())
        offer = detect_offer_language(_en_offer())
        keep = resolve_output_language(cv, offer, "cv")
        self.assertFalse(keep["translate"])
        self.assertEqual(keep["code"], "fr")
        tr = resolve_output_language(cv, offer, "offer")
        self.assertTrue(tr["translate"])
        self.assertEqual(tr["code"], "en")

    def test_user_prompt_translate_mode(self):
        prompt = _build_user_prompt(_fr_cv(), _en_offer(), None, output_policy="offer")
        self.assertIn("<mode>traduire</mode>", prompt)
        self.assertIn("TRADUIS", prompt)
        xml = langue_cv_xml(_fr_cv(), _en_offer(), "offer")
        self.assertIn("<code>en</code>", xml)
        self.assertIn("<langue_source>fr</langue_source>", xml)


class TestMergeLocalizedFields(unittest.TestCase):
    def test_keeps_ids_and_replaces_text(self):
        cv = _fr_cv()
        delta = {
            "titre_professionnel": "Risk Analyst",
            "resume": "Risk analyst with three years of experience.",
            "experiences": [
                {
                    "id": "exp_1",
                    "poste": "Risk Analyst",
                    "bullet_points": [
                        "Led market limit monitoring for the trading team.",
                        "Set up a weekly report for the risk committee.",
                        "Contributed to stress-test analysis for the portfolio.",
                    ],
                }
            ],
            "formations": [{"intitule": "Master in Finance"}],
        }
        out = merge_localized_fields(cv, delta)
        self.assertEqual(out["experiences"][0]["id"], "exp_1")
        self.assertEqual(out["experiences"][0]["entreprise"], "Banque Demo")
        self.assertEqual(out["experiences"][0]["poste"], "Risk Analyst")
        self.assertEqual(out["formations"][0]["etablissement"], "Université Paris Dauphine")
        self.assertEqual(out["formations"][0]["intitule"], "Master in Finance")
        self.assertNotEqual(out["resume"], cv["resume"])

    def test_ignores_empty_overwrite(self):
        cv = _fr_cv()
        out = merge_localized_fields(cv, {"resume": "  ", "titre_professionnel": ""})
        self.assertEqual(out["resume"], cv["resume"])
        self.assertEqual(out["titre_professionnel"], cv["titre_professionnel"])

    def test_does_not_invent_experiences_or_bullets(self):
        cv = _fr_cv()
        delta = {
            "experiences": [
                {
                    "id": "exp_1",
                    "poste": "Risk Analyst",
                    "bullet_points": ["Only one invented extra", "two", "three", "four"],
                },
                {
                    "id": "exp_invented",
                    "poste": "CEO",
                    "bullet_points": ["Founded a company."],
                },
            ]
        }
        out = merge_localized_fields(cv, delta)
        self.assertEqual(len(out["experiences"]), 1)
        self.assertEqual(out["experiences"][0]["id"], "exp_1")
        self.assertEqual(
            out["experiences"][0]["bullet_points"],
            cv["experiences"][0]["bullet_points"],
        )
        self.assertIsNone(
            next((e for e in out["experiences"] if e.get("id") == "exp_invented"), None)
        )


class TestProfileAnchorLanguage(unittest.TestCase):
    def test_student_anchor_en(self):
        cv = {
            "titre_professionnel": "Étudiant",
            "resume": "Je suis étudiant en finance.",
            "formations": [{"etablissement": "HEC Paris"}],
        }
        self.assertIn("Étudiant", _infer_profile_anchor(cv, "fr"))
        self.assertIn("Student", _infer_profile_anchor(cv, "en"))


class TestDeterministicLocalization(unittest.TestCase):
    def test_dates_and_remote_to_english(self):
        self.assertEqual(localize_date_phrase("janv. 2022", "en"), "Jan 2022")
        self.assertEqual(localize_date_phrase("aujourd'hui", "en"), "Present")
        out = apply_deterministic_localization(_fr_cv(), "en")
        self.assertEqual(out["experiences"][0]["date_debut"], "Jan 2022")
        self.assertEqual(out["experiences"][0]["date_fin"], "Present")
        self.assertEqual(out["experiences"][0]["lieu"], "Remote")
        self.assertEqual(out["formations"][0]["date"], "Sept 2020")
        self.assertEqual(out["langue"], "en")
        self.assertEqual(out["experiences"][0]["entreprise"], "Banque Demo")

    def test_section_titles_en(self):
        copy = template_copy_for_lang("en")
        self.assertEqual(copy["experience"], "PROFESSIONAL EXPERIENCE")
        self.assertEqual(copy["education_title"], "Education")
        self.assertEqual(template_copy_for_lang("fr")["experience"], "EXPÉRIENCE PROFESSIONNELLE")


class TestTextLanguageSmoke(unittest.TestCase):
    def test_short_text_defaults_fr(self):
        lang = detect_text_language("Hello")
        self.assertEqual(lang["code"], "fr")
        self.assertEqual(lang["confidence"], 0.0)


if __name__ == "__main__":
    unittest.main()
