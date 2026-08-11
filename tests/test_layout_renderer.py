"""Tests unitaires layout_renderer (P3.8 / AXE-30)."""

import json
import re
import unittest
from pathlib import Path

from backend.services.layout_renderer import render_html

SNAPSHOTS_DIR = Path(__file__).resolve().parent / "snapshots"


def _sample_cv() -> dict:
    repo = Path(__file__).resolve().parents[1]
    path = repo / "docs" / "examples" / "cv_base_vierge.json"
    payload = json.loads(path.read_text(encoding="utf-8"))
    payload["prenom"] = "Jean"
    payload["nom"] = "Dupont"
    payload["titre_professionnel"] = "Développeur"
    payload["resume"] = "Profil test layout renderer."
    payload["telephone"] = "0601020304"
    payload["email"] = "jean.dupont@example.com"
    payload["linkedin"] = "linkedin.com/in/jeandupont"
    payload["experiences"] = [
        {
            "entreprise": "Acme",
            "poste": "Dev",
            "date_debut": "2020",
            "date_fin": "2024",
            "lieu": "Paris",
            "clients": "Banque X",
            "bullet_points": ["Livré le module PDF"],
        }
    ]
    payload["competences"] = {"techniques": ["Python", "React", "SQL"]}
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


def _main_blocks_layout() -> dict:
    """Layout des 5 blocs principaux (AXE-30 snapshot)."""
    return {
        "version": 3,
        "theme": {"color_accent": "#1e3a5f", "font_heading": "Inter", "font_body": "Inter"},
        "pages": [
            {
                "id": "p1",
                "blocks": [
                    {
                        "id": "b-identity",
                        "type": "identity",
                        "x": 10,
                        "y": 10,
                        "w": 190,
                        "h": 18,
                        "z": 1,
                        "style": {"header_layout": "inline-title", "align": "left"},
                    },
                    {
                        "id": "b-contact",
                        "type": "contact",
                        "x": 10,
                        "y": 30,
                        "w": 190,
                        "h": 10,
                        "z": 1,
                        "style": {"contact_layout": "header-bar"},
                    },
                    {
                        "id": "b-resume",
                        "type": "resume",
                        "bind": "resume",
                        "x": 10,
                        "y": 44,
                        "w": 190,
                        "h": 18,
                        "z": 1,
                        "style": {"section_label": "Profil"},
                    },
                    {
                        "id": "b-exp",
                        "type": "experiences",
                        "x": 10,
                        "y": 66,
                        "w": 190,
                        "h": 60,
                        "z": 1,
                        "style": {"section_label": "Expériences"},
                    },
                    {
                        "id": "b-skills",
                        "type": "skills",
                        "bind": "competences.techniques",
                        "x": 10,
                        "y": 130,
                        "w": 90,
                        "h": 40,
                        "z": 1,
                        "style": {
                            "format": "list",
                            "list_format": "list",
                            "section_label": "Stack",
                        },
                    },
                ],
            }
        ],
    }


def _normalize_html(html: str) -> str:
    """Normalise pour snapshot stable (whitespace uniquement)."""
    text = html.strip()
    text = re.sub(r">\s+<", "><", text)
    text = re.sub(r"\s+", " ", text)
    return text


def _assert_snapshot(name: str, html: str) -> None:
    SNAPSHOTS_DIR.mkdir(parents=True, exist_ok=True)
    path = SNAPSHOTS_DIR / name
    normalized = _normalize_html(html)
    if not path.exists():
        path.write_text(normalized + "\n", encoding="utf-8")
    expected = path.read_text(encoding="utf-8").strip()
    if normalized != expected:
        path.with_suffix(path.suffix + ".got").write_text(normalized + "\n", encoding="utf-8")
    assert normalized == expected, f"Snapshot mismatch: {path}"


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
        self.assertIn("border-radius:12px", html)

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

    def test_main_blocks_parity_fragments(self):
        """AXE-30 : champs / layouts critiques des 5 blocs principaux."""
        html = render_html(_sample_cv(), _main_blocks_layout())
        self.assertIn("cv-layout-identity--inline-title", html)
        self.assertIn("Jean Dupont", html)
        self.assertIn("Développeur", html)
        self.assertIn("cv-layout-contact--header-bar", html)
        self.assertIn("cv-layout-contact-icon", html)
        self.assertNotIn("Tél.", html)
        self.assertIn("0601020304", html)
        self.assertIn(">Profil<", html)
        self.assertIn("Profil test layout renderer.", html)
        self.assertIn(">Expériences<", html)
        self.assertIn("Paris", html)
        self.assertIn("cv-layout-exp-clients", html)
        self.assertIn("Banque X", html)
        self.assertIn(">Stack<", html)
        self.assertIn('class="cv-layout-sidebar-item"', html)
        self.assertIn("Python", html)
        self.assertIn("React", html)

    def test_main_blocks_html_snapshot(self):
        html = render_html(_sample_cv(), _main_blocks_layout())
        _assert_snapshot("layout_main_blocks.html", html)


if __name__ == "__main__":
    unittest.main()
