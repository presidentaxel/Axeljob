"""Tests unitaires layout_renderer (P3.8)."""

import json
import unittest
from pathlib import Path

from backend.services.layout_renderer import render_html


def _sample_cv() -> dict:
    repo = Path(__file__).resolve().parents[1]
    path = repo / "docs" / "examples" / "cv_base_vierge.json"
    payload = json.loads(path.read_text(encoding="utf-8"))
    payload["prenom"] = "Jean"
    payload["nom"] = "Dupont"
    payload["titre_professionnel"] = "Développeur"
    payload["resume"] = "Profil test layout renderer."
    return payload


def _starter_layout() -> dict:
    x, w = 10, 190
    y = 10
    blocks = [
        {
            "id": "b-identity",
            "type": "identity",
            "bind": ["prenom", "nom", "titre_professionnel"],
            "x": x,
            "y": y,
            "w": w,
            "h": 22,
            "z": 1,
        },
        {
            "id": "b-resume",
            "type": "resume",
            "bind": "resume",
            "x": x,
            "y": y + 26,
            "w": w,
            "h": 20,
            "z": 1,
        },
    ]
    return {
        "version": 3,
        "theme": {"color_accent": "#1e3a5f"},
        "pages": [{"id": "p1", "blocks": blocks}],
    }


class TestLayoutRenderer(unittest.TestCase):
    def test_render_contains_identity_and_resume(self):
        html = render_html(_sample_cv(), _starter_layout())
        self.assertIn("Jean", html)
        self.assertIn("Dupont", html)
        self.assertIn("Profil test layout renderer.", html)
        self.assertIn('class="cv-layout-page"', html)
        self.assertIn('class="cv-layout-block"', html)

    def test_escapes_xss_in_free_text(self):
        cv = _sample_cv()
        layout = {
            "version": 3,
            "pages": [
                {
                    "id": "p1",
                    "blocks": [
                        {
                            "id": "xss",
                            "type": "text",
                            "content": '<script>alert("x")</script>',
                            "x": 10,
                            "y": 10,
                            "w": 50,
                            "h": 10,
                            "z": 1,
                        }
                    ],
                }
            ],
        }
        html = render_html(cv, layout)
        self.assertNotIn("<script>", html.lower())
        self.assertIn("&lt;script&gt;", html)

    def test_renders_whitelisted_rich_text(self):
        cv = _sample_cv()
        layout = {
            "version": 3,
            "pages": [
                {
                    "id": "p1",
                    "blocks": [
                        {
                            "id": "rich",
                            "type": "text",
                            "content": "<strong>Bold</strong> <em>Ital</em>"
                            "<script>evil()</script>",
                            "x": 10,
                            "y": 10,
                            "w": 50,
                            "h": 10,
                            "z": 1,
                        }
                    ],
                }
            ],
        }
        html = render_html(cv, layout)
        self.assertIn("<strong>Bold</strong>", html)
        self.assertIn("<em>Ital</em>", html)
        self.assertNotIn("<script>", html.lower())

    def test_empty_layout_renders_page_shell(self):
        html = render_html(_sample_cv(), {"version": 3, "pages": []})
        self.assertIn("cv-layout-page", html)

    def test_block_font_family_is_exported(self):
        cv = _sample_cv()
        layout = {
            "version": 3,
            "theme": {"font_heading": "Inter, sans-serif"},
            "pages": [
                {
                    "id": "p1",
                    "blocks": [
                        {
                            "id": "title",
                            "type": "title",
                            "content": "Titre custom",
                            "x": 10,
                            "y": 10,
                            "w": 80,
                            "h": 12,
                            "z": 1,
                            "style": {
                                "font_family": "Playfair Display, serif",
                                "font_size": 16,
                            },
                        }
                    ],
                }
            ],
        }
        html = render_html(cv, layout)
        self.assertIn("font-family:Playfair Display, serif", html)
        self.assertIn("font-size:16.0pt", html)

    def test_image_block_is_exported(self):
        layout = {
            "version": 3,
            "pages": [
                {
                    "id": "p1",
                    "blocks": [
                        {
                            "id": "img",
                            "type": "image",
                            "image_src": "data:image/png;base64,AAA",
                            "x": 10,
                            "y": 10,
                            "w": 40,
                            "h": 30,
                            "z": 1,
                            "style": {
                                "shape": "rounded",
                                "image_zoom": 1.4,
                                "focal_x": 40,
                                "focal_y": 60,
                            },
                        }
                    ],
                }
            ],
        }
        html = render_html(_sample_cv(), layout)
        self.assertIn('class="cv-layout-image"', html)
        self.assertIn('src="data:image/png;base64,AAA"', html)
        self.assertIn("object-position:40.0% 60.0%", html)
        self.assertIn("transform:scale(1.4)", html)

    def test_icon_block_exports_svg_not_technical_name(self):
        layout = {
            "version": 3,
            "pages": [
                {
                    "id": "p1",
                    "blocks": [
                        {
                            "id": "icon",
                            "type": "icon",
                            "icon_name": "HiPhone",
                            "x": 10,
                            "y": 10,
                            "w": 8,
                            "h": 8,
                            "z": 1,
                            "style": {"color": "#2563eb"},
                        }
                    ],
                }
            ],
        }
        html = render_html(_sample_cv(), layout)
        self.assertIn('class="cv-layout-icon"', html)
        self.assertIn("<svg", html)
        self.assertIn("color:#2563eb", html)
        self.assertNotIn(">HiPhone<", html)


if __name__ == "__main__":
    unittest.main()
