"""Smoke integration: render_cv_html() via fichier template (minimal)."""

import json
import unittest
from pathlib import Path

from backend.cv_html_render import render_cv_html


def _sample_cv(path: Path) -> dict:
    payload = json.loads(path.read_text(encoding="utf-8"))
    payload["mots_cles_cache"] = "Python Kubernetes"
    return payload


class TestCvHtmlRenderSmoke(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        repo = Path(__file__).resolve().parents[1]
        cls.cv_path = repo / "docs" / "examples" / "cv_base_vierge.json"

    def test_render_minimal_preview_includes_markup(self):
        cv = _sample_cv(self.cv_path)
        html = render_cv_html(
            cv,
            for_preview=True,
            for_pdf=False,
            template_id="minimal",
        )
        low = html.lower()
        self.assertIn("<body", low)
        # Jinja rend au moins une structure CV / preview
        self.assertTrue("cv-preview" in low or "minimal" in low or "resume" in low or "cv" in low)

    def test_render_with_highlight_base(self):
        cv = _sample_cv(self.cv_path)
        base = {**cv, "resume": "Ancienne version"}
        cv["resume"] = "Nouvelle version avec plus de détail."
        html = render_cv_html(
            cv,
            base_cv=base,
            highlight_changes=True,
            for_preview=True,
            for_pdf=False,
            template_id="minimal",
        )
        self.assertIn("cv-changed", html)

    def test_english_output_uses_english_section_titles(self):
        cv = {
            "prenom": "Ada",
            "nom": "Lovelace",
            "langue": "en",
            "titre_professionnel": "Risk Analyst",
            "resume": "Risk analyst with three years of experience in portfolio management.",
            "experiences": [
                {
                    "id": "exp_1",
                    "poste": "Risk Analyst",
                    "entreprise": "Banque Demo",
                    "date_debut": "Jan 2022",
                    "date_fin": "Present",
                    "bullet_points": ["Managed market limit monitoring for the trading team."],
                }
            ],
        }
        html = render_cv_html(cv, for_preview=True, template_id="classic")
        self.assertIn("PROFESSIONAL EXPERIENCE", html)
        self.assertIn('lang="en"', html)
        self.assertNotIn("EXPÉRIENCE PROFESSIONNELLE", html)

    def test_language_stamp_does_not_change_font_css(self):
        opts = {
            "font": "Georgia",
            "font_size_name": 16,
            "font_size_title": 11,
            "font_size_section": 10,
            "font_size_body": 11,
            "font_size_bullet": 10,
        }
        cv_fr = {
            "prenom": "Ada",
            "nom": "Lovelace",
            "langue": "fr",
            "titre_professionnel": "Analyste risque",
            "resume": "Analyste risque avec trois ans d'expérience.",
            "experiences": [
                {
                    "id": "exp_1",
                    "poste": "Analyste risque",
                    "entreprise": "Banque Demo",
                    "bullet_points": ["Pilotage du suivi des limites."],
                }
            ],
        }
        cv_en = {
            **cv_fr,
            "langue": "en",
            "titre_professionnel": "Risk Analyst",
            "resume": "Risk analyst with three years of experience.",
            "experiences": [
                {
                    **cv_fr["experiences"][0],
                    "poste": "Risk Analyst",
                    "bullet_points": ["Led market limit monitoring."],
                }
            ],
        }
        html_fr = render_cv_html(
            cv_fr,
            for_preview=True,
            template_id="classic",
            template_options=opts,
        )
        html_en = render_cv_html(
            cv_en,
            for_preview=True,
            template_id="classic",
            template_options=opts,
        )

        def _override_root(html: str) -> str:
            marker = "<style>:root {\n"
            start = html.find(marker)
            self.assertGreaterEqual(start, 0)
            end = html.find("</style>", start)
            return html[start:end]

        self.assertEqual(_override_root(html_fr), _override_root(html_en))
        self.assertIn("--cv-font-heading: Georgia, 'Times New Roman', serif;", html_fr)
        self.assertIn("--cv-fs-body: 11.0pt;", html_fr)
        self.assertIn("--cv-fs-name: 16.0pt;", html_fr)

    def test_pdf_minimal_still_renders(self):
        cv = _sample_cv(self.cv_path)
        html = render_cv_html(
            cv,
            for_preview=True,
            for_pdf=True,
            template_id="minimal",
        )
        self.assertIn("<body", html.lower())


if __name__ == "__main__":
    unittest.main()
