"""Test golden : score parsing des 7 templates livres.

Charge dynamiquement chaque ``templates/<id>/meta.json``, le convertit en
layout via ``template_meta_to_layout``, et asserte un score reproductible
contre un snapshot ``expected`` versionne par ``SCORING_VERSION``.

L'objectif est de garantir que :

1. les templates livres restent **scorables** (pas de crash sur un meta.json
   minimaliste) ;
2. les scores produits **discriminent reellement** les templates mono-colonne
   des templates a sidebar, sinon le scoring ne sert a rien ;
3. tout changement de ponderation casse intentionnellement ce test : on doit
   recalibrer + bumper ``SCORING_VERSION`` + commiter le nouveau snapshot.
"""

from __future__ import annotations

import json
import os
import unittest
from pathlib import Path

from backend.services.ats_score import SCORING_VERSION, score_parsing
from backend.services.ats_score.template_layout import template_meta_to_layout

REPO_ROOT = Path(__file__).resolve().parents[1]
TEMPLATES_DIR = REPO_ROOT / "templates"
FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures" / "ats_score"


def _load_json(path: Path) -> dict:
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def _load_cv() -> dict:
    return _load_json(FIXTURES_DIR / "cv_standard.json")


def _load_template_meta(template_id: str) -> dict:
    return _load_json(TEMPLATES_DIR / template_id / "meta.json")


# Snapshot des scores attendus pour SCORING_VERSION="2026.08".
# Recalibrer ces valeurs **uniquement** en bumpant SCORING_VERSION dans
# ``backend/services/ats_score/version.py`` et en commitant ensemble.
EXPECTED: dict[str, dict] = {
    "minimal": {
        # Mono-col, photo desactivee (option absente du meta.json), police Georgia (safe).
        "min_total": 100,
        "max_total": 100,
        "required_rule_ids": {
            "bonus_mono_column",
            "bonus_standard_section_titles",
            "bonus_contact_top_of_page",
            "bonus_dates_format_consistent",
        },
        "forbidden_rule_ids": {
            "malus_photo_present",
            "malus_two_columns",
            "malus_sidebar_present",
            "malus_exotic_font",
        },
    },
    "elegant": {
        # Mono-col, photo activable, police Georgia.
        "min_total": 95,
        "max_total": 100,
        "required_rule_ids": {"bonus_mono_column", "malus_photo_present"},
        "forbidden_rule_ids": {"malus_two_columns", "malus_sidebar_present"},
    },
    "classic": {
        # Sidebar + photo + police Plus Jakarta Sans (safe).
        "min_total": 85,
        "max_total": 99,
        "required_rule_ids": {"malus_two_columns", "malus_sidebar_present", "malus_photo_present"},
        "forbidden_rule_ids": {"bonus_mono_column"},
    },
    "modern": {
        "min_total": 85,
        "max_total": 99,
        "required_rule_ids": {"malus_two_columns", "malus_sidebar_present", "malus_photo_present"},
        "forbidden_rule_ids": {"bonus_mono_column"},
    },
    "bold": {
        "min_total": 85,
        "max_total": 99,
        "required_rule_ids": {"malus_two_columns", "malus_sidebar_present", "malus_photo_present"},
        "forbidden_rule_ids": {"bonus_mono_column"},
    },
    "creative": {
        "min_total": 85,
        "max_total": 99,
        "required_rule_ids": {"malus_two_columns", "malus_sidebar_present", "malus_photo_present"},
        "forbidden_rule_ids": {"bonus_mono_column"},
    },
    "executive": {
        "min_total": 85,
        "max_total": 99,
        "required_rule_ids": {"malus_two_columns", "malus_sidebar_present", "malus_photo_present"},
        "forbidden_rule_ids": {"bonus_mono_column"},
    },
}


class TestTemplatesGoldenScores(unittest.TestCase):
    def setUp(self) -> None:
        self.cv = _load_cv()

    def test_all_expected_templates_exist_on_disk(self):
        for template_id in EXPECTED:
            with self.subTest(template_id=template_id):
                meta_path = TEMPLATES_DIR / template_id / "meta.json"
                self.assertTrue(meta_path.exists(), f"Manque {meta_path}")

    def test_score_each_template_within_expected_band(self):
        for template_id, expected in EXPECTED.items():
            with self.subTest(template_id=template_id):
                meta = _load_template_meta(template_id)
                layout = template_meta_to_layout(meta)
                result = score_parsing(self.cv, layout)

                self.assertEqual(result.version, SCORING_VERSION)
                self.assertGreaterEqual(
                    result.total,
                    expected["min_total"],
                    f"{template_id} total={result.total} < min={expected['min_total']} "
                    f"(rules={[r.id for r in result.rules]})",
                )
                self.assertLessEqual(
                    result.total,
                    expected["max_total"],
                    f"{template_id} total={result.total} > max={expected['max_total']} "
                    f"(rules={[r.id for r in result.rules]})",
                )

                rule_ids = {rule.id for rule in result.rules}
                for required in expected["required_rule_ids"]:
                    self.assertIn(
                        required,
                        rule_ids,
                        f"{template_id}: regle attendue {required} absente, vu={rule_ids}",
                    )
                for forbidden in expected["forbidden_rule_ids"]:
                    self.assertNotIn(
                        forbidden,
                        rule_ids,
                        f"{template_id}: regle interdite {forbidden} presente, vu={rule_ids}",
                    )

    def test_mono_column_templates_beat_sidebar_templates(self):
        # Regression : l'un des objectifs produit du scoring est que les
        # templates mono-colonne (Minimal, Elegant) battent **strictement**
        # ceux a sidebar (Classic, Modern, Bold, Creative, Executive).
        scores: dict[str, int] = {}
        for template_id in EXPECTED:
            meta = _load_template_meta(template_id)
            layout = template_meta_to_layout(meta)
            scores[template_id] = score_parsing(self.cv, layout).total

        mono = min(scores[t] for t in ("minimal", "elegant"))
        sidebar = max(scores[t] for t in ("classic", "modern", "bold", "creative", "executive"))
        self.assertGreater(
            mono,
            sidebar,
            f"Mono-col ({mono}) doit > sidebar ({sidebar}). Scores={scores}",
        )

    def test_score_is_deterministic_across_runs(self):
        # Regression : un meme input doit produire exactement le meme score
        # sur deux appels successifs. Bug latent si on introduit un random
        # ou un set non ordonne dans une regle.
        for template_id in EXPECTED:
            meta = _load_template_meta(template_id)
            layout = template_meta_to_layout(meta)
            first = score_parsing(self.cv, layout)
            second = score_parsing(self.cv, layout)
            self.assertEqual(first.total, second.total, template_id)
            self.assertEqual(
                [r.id for r in first.rules],
                [r.id for r in second.rules],
                template_id,
            )


class TestAllTemplatesOnDiskAreCovered(unittest.TestCase):
    """Garde-fou : si un nouveau template apparait sur disque, le test golden
    doit etre etendu (sinon le scoring devient muet sur ce template)."""

    def test_no_uncovered_template_directory(self):
        if not TEMPLATES_DIR.is_dir():
            self.skipTest("templates/ absent dans cet environnement")
        on_disk = {
            entry
            for entry in os.listdir(TEMPLATES_DIR)
            if (TEMPLATES_DIR / entry / "meta.json").is_file()
        }
        covered = set(EXPECTED)
        missing = on_disk - covered
        self.assertFalse(
            missing,
            f"Templates non couverts par le golden : {missing}. "
            "Ajoute leur entree dans EXPECTED ou justifie l'omission.",
        )


if __name__ == "__main__":
    unittest.main()
