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
                        "style": {"contact_layout": "header-bar", "contact_icons": True},
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

    def test_contact_icons_respect_style_flag(self):
        """AXE-339 : contact_icons=false → pas d'icônes dans le fragment contact (PDF)."""
        layout = _main_blocks_layout()
        for page in layout["pages"]:
            for block in page.get("blocks") or []:
                if block.get("type") == "contact":
                    block["style"] = {"contact_layout": "header-bar", "contact_icons": False}
        html = render_html(_sample_cv(), layout)
        # Le CSS peut encore mentionner la classe ; le markup contact ne doit pas
        # embarquer de spans icônes.
        self.assertNotIn('class="cv-layout-contact-icon"', html)
        self.assertIn("0601020304", html)

        layout_on = _main_blocks_layout()
        html_on = render_html(_sample_cv(), layout_on)
        self.assertIn('class="cv-layout-contact-icon"', html_on)

    def test_vector_shapes_export_svg(self):
        layout = {
            "version": 3,
            "pages": [
                {
                    "id": "p1",
                    "blocks": [
                        {
                            "id": "c",
                            "type": "shape:circle",
                            "x": 10,
                            "y": 10,
                            "w": 20,
                            "h": 20,
                            "z": 1,
                            "style": {"color": "#ff7759"},
                        },
                        {
                            "id": "t",
                            "type": "shape:triangle",
                            "x": 40,
                            "y": 10,
                            "w": 20,
                            "h": 20,
                            "z": 2,
                            "style": {"color": "#003c33"},
                        },
                        {
                            "id": "line",
                            "type": "shape:line",
                            "x": 10,
                            "y": 40,
                            "w": 80,
                            "h": 2,
                            "z": 3,
                            "style": {"color": "#17171c", "stroke_width": 0.8},
                        },
                    ],
                }
            ],
        }
        html = render_html(_sample_cv(), layout)
        self.assertIn('data-type="shape:circle"', html)
        self.assertIn("cv-layout-shape-svg", html)
        self.assertIn("M50,5 L95,95 L5,95 Z", html)
        self.assertIn("cv-layout-shape-line", html)
        self.assertIn("height:0.8mm", html)

    def test_identity_divider_and_photo_border(self):
        layout = {
            "version": 3,
            "pages": [
                {
                    "id": "p1",
                    "blocks": [
                        {
                            "id": "id",
                            "type": "identity",
                            "x": 10,
                            "y": 10,
                            "w": 100,
                            "h": 20,
                            "z": 1,
                            "style": {"identity_divider": True},
                        },
                        {
                            "id": "ph",
                            "type": "photo",
                            "x": 120,
                            "y": 10,
                            "w": 30,
                            "h": 30,
                            "z": 2,
                            "style": {
                                "photo_border": 0.5,
                                "image_border_color": "#111111",
                            },
                        },
                    ],
                }
            ],
        }
        cv = _sample_cv()
        cv["photo_url"] = "https://example.com/p.jpg"
        html = render_html(cv, layout)
        self.assertIn("cv-layout-identity--with-divider", html)
        self.assertIn("border:0.5mm solid #111111", html)

    def test_title_accent_is_not_a_divider(self):
        layout = {
            "version": 3,
            "theme": {
                "template_id": "bold",
                "color_accent": "#dc2626",
                "font_heading": "'Plus Jakarta Sans', Arial, sans-serif",
            },
            "pages": [
                {
                    "id": "p1",
                    "blocks": [
                        {
                            "id": "id",
                            "type": "identity",
                            "x": 10,
                            "y": 10,
                            "w": 120,
                            "h": 18,
                            "z": 1,
                            "style": {
                                "zone": "header",
                                "header_layout": "inline-title",
                                "title_accent": True,
                            },
                        }
                    ],
                }
            ],
        }
        html = render_html(_sample_cv(), layout)
        body = html.split("<body", 1)[-1]
        self.assertNotIn("identity--with-divider", body)
        self.assertIn("cv-layout-identity-title--accent", body)
        self.assertIn("@font-face", html)
        self.assertIn("PlusJakartaSans", html)
        self.assertIn("--layout-muted", html)
        style_block = html.split("<style>")[1].split("</style>")[0]
        self.assertIn("Plus Jakarta Sans", style_block)
        self.assertNotIn("&#x27;", style_block)

    def test_qrcode_remains_placeholder(self):
        layout = {
            "version": 3,
            "pages": [
                {
                    "id": "p1",
                    "blocks": [
                        {
                            "id": "qr",
                            "type": "qrcode",
                            "target_url": "https://axeljob.example/cv",
                            "x": 10,
                            "y": 10,
                            "w": 25,
                            "h": 25,
                            "z": 1,
                            "style": {},
                        }
                    ],
                }
            ],
        }
        html = render_html(_sample_cv(), layout)
        self.assertIn("cv-layout-qr", html)
        self.assertIn("QR", html)
        self.assertNotIn("<svg", html.split('data-type="qrcode"')[1][:400])

    def test_section_title_style_classes(self):
        layout = {
            "version": 3,
            "pages": [
                {
                    "id": "p1",
                    "blocks": [
                        {
                            "id": "exp",
                            "type": "experiences",
                            "x": 10,
                            "y": 10,
                            "w": 180,
                            "h": 40,
                            "z": 1,
                            "style": {
                                "section_label": "Parcours",
                                "title_style": "pill",
                            },
                        }
                    ],
                }
            ],
        }
        html = render_html(_sample_cv(), layout)
        self.assertIn("cv-layout-section-title--pill", html)
        self.assertIn(">Parcours<", html)

    def test_twin_title_and_exp_styles(self):
        """AXE-38 tranche 2 : mapping title_style / exp_style catalogue."""
        layout = {
            "version": 3,
            "theme": {
                "template_id": "creative",
                "color_accent": "#f59e0b",
                "color_section_title": "#6366f1",
                "color_sidebar": "#6366f1",
                "color_header": "#6366f1",
            },
            "pages": [
                {
                    "id": "p1",
                    "blocks": [
                        {
                            "id": "exp",
                            "type": "experiences",
                            "x": 10,
                            "y": 10,
                            "w": 180,
                            "h": 60,
                            "z": 1,
                            "style": {
                                "section_label": "EXPÉRIENCE",
                                "title_style": "creative-main",
                                "exp_style": "creative",
                            },
                        },
                        {
                            "id": "skills",
                            "type": "skills",
                            "x": 10,
                            "y": 80,
                            "w": 60,
                            "h": 40,
                            "z": 2,
                            "style": {
                                "zone": "sidebar",
                                "color": "#ffffff",
                                "section_label": "COMPÉTENCES",
                                "title_style": "creative-sidebar",
                            },
                        },
                        {
                            "id": "photo",
                            "type": "photo",
                            "x": 10,
                            "y": 10,
                            "w": 30,
                            "h": 30,
                            "z": 3,
                            "style": {
                                "zone": "sidebar",
                                "shape": "circle",
                                "photo_border": "accent",
                            },
                        },
                        {
                            "id": "bold",
                            "type": "experiences",
                            "x": 10,
                            "y": 130,
                            "w": 180,
                            "h": 40,
                            "z": 4,
                            "limit": 1,
                            "style": {
                                "section_label": "PARCOURS",
                                "title_style": "bold-main",
                                "exp_style": "bold",
                            },
                        },
                    ],
                }
            ],
        }
        html = render_html(_sample_cv(), layout)
        self.assertIn("--layout-section-title: #6366f1", html)
        self.assertIn("--layout-header: #6366f1", html)
        self.assertIn("cv-layout-doc--tpl-creative", html)
        body = html.split("<body", 1)[1]
        self.assertIn("cv-layout-section-title--creative-main", body)
        self.assertIn("cv-layout-section-title--creative-sidebar", body)
        self.assertIn("cv-layout-section-title--bold-main", body)
        self.assertNotIn("cv-layout-section-title--twin-main", body)
        self.assertNotIn("cv-layout-section-title--sidebar-bar", body)
        self.assertIn('data-zone="sidebar"', html)
        self.assertIn("cv-layout-ats-label", html)
        self.assertIn("cv-layout-exp-left", html)
        self.assertIn("cv-layout-bullets--dash", html)
        self.assertIn("cv-layout-bullets--chevron", html)
        self.assertIn("Organisation :", html)
        # Dates twin : tiret ASCII
        self.assertRegex(html, r"\d{4} - \d{4}|\d{4} - | - \d{4}")

    def test_title_style_zone_and_empty_intersections(self):
        """title_style × template × zone × empty — aligné FreeCanvasBlock."""
        cv = _sample_cv()
        cv["certifications"] = []
        cv["formations"] = [
            {
                "diplome": "BBA",
                "etablissement": "ESSEC",
                "date": "2023-2027",
            }
        ]
        layout = {
            "version": 3,
            "theme": {
                "template_id": "bold",
                "color_accent": "#dc2626",
                "color_section_title": "#1e293b",
                "color_header": "#1e293b",
                "color_sidebar": "#f1f5f9",
            },
            "pages": [
                {
                    "id": "p1",
                    "blocks": [
                        {
                            "id": "id",
                            "type": "identity",
                            "x": 10,
                            "y": 10,
                            "w": 120,
                            "h": 20,
                            "z": 1,
                            "style": {
                                "zone": "header",
                                "header_layout": "inline-title",
                                "title_accent": True,
                            },
                        },
                        {
                            "id": "contact",
                            "type": "contact",
                            "x": 10,
                            "y": 32,
                            "w": 180,
                            "h": 10,
                            "z": 1,
                            "style": {
                                "zone": "header",
                                "align": "center",
                                "contact_layout": "header-bar",
                                "contact_icons": True,
                                "contact_uppercase": True,
                            },
                        },
                        {
                            "id": "skills",
                            "type": "skills",
                            "x": 140,
                            "y": 50,
                            "w": 50,
                            "h": 40,
                            "z": 2,
                            "style": {
                                "zone": "sidebar-light",
                                "section_label": "COMPÉTENCES",
                                "sidebar_category": "Compétences techniques",
                                "title_style": "bold-sidebar-section",
                                "list_format": "list",
                            },
                        },
                        {
                            "id": "certs",
                            "type": "certifications",
                            "x": 140,
                            "y": 95,
                            "w": 50,
                            "h": 20,
                            "z": 2,
                            "style": {
                                "zone": "sidebar-light",
                                "sidebar_category": "Certifications",
                                "title_style": "bold-sidebar-category",
                            },
                        },
                        {
                            "id": "form",
                            "type": "formations",
                            "x": 10,
                            "y": 50,
                            "w": 120,
                            "h": 30,
                            "z": 2,
                            "style": {
                                "zone": "main",
                                "section_label": "FORMATION",
                                "title_style": "bold-main",
                                "formation_style": "minimal",
                            },
                        },
                        {
                            "id": "resume",
                            "type": "resume",
                            "x": 10,
                            "y": 85,
                            "w": 120,
                            "h": 20,
                            "z": 2,
                            "style": {
                                "zone": "header",
                                "show_section_title": False,
                            },
                        },
                    ],
                }
            ],
        }
        html = render_html(cv, layout)
        self.assertIn("cv-layout-section-title--bold-sidebar-section", html)
        self.assertIn("cv-layout-section-title--bold-main", html)
        self.assertIn("cv-layout-sidebar-category--bold-sidebar-category", html)
        self.assertIn('data-zone="sidebar-light"', html)
        self.assertIn("cv-layout-contact--align-center", html)
        self.assertIn("cv-layout-formation--minimal", html)
        self.assertIn("cv-layout-formation-date", html)
        self.assertIn("cv-layout-dates--accent", html)
        self.assertIn("ESSEC - BBA", html)
        self.assertNotIn("(2023-2027)", html)
        # Catégorie seule : pas de h3 défaut « Certifications » empilé.
        self.assertNotRegex(
            html.split('data-block-id="certs"', 1)[1].split("</div>", 1)[0],
            r"<h3[^>]*>Certifications</h3>",
        )
        # Liste vide : pas de titre section (placeholder seul, comme le canvas).
        certs_chunk = html.split('data-block-id="certs"', 1)[1][:800]
        self.assertNotIn("COMPÉTENCES", certs_chunk)
        self.assertIn("cv-layout-placeholder", certs_chunk)
        # show_section_title false : pas de PROFIL.
        resume_chunk = html.split('data-block-id="resume"', 1)[1][:600]
        self.assertNotIn("PROFIL", resume_chunk)
        self.assertNotIn("cv-layout-section-title", resume_chunk)

    def test_style_tokens_apply_without_template_id(self):
        """Canva : les tokens de bloc suffisent, sans cv-layout-doc--tpl-*."""
        cv = _sample_cv()
        cv["competences"] = {
            "techniques": ["Python"],
            "logiciels": ["Excel"],
            "langues": [{"langue": "Français", "niveau": "Natif"}],
        }
        cv["formations"] = [
            {"diplome": "BBA", "etablissement": "ESSEC", "date": "2023-2027"},
        ]
        layout = {
            "version": 3,
            "theme": {"color_accent": "#dc2626", "color_section_title": "#6366f1"},
            "pages": [
                {
                    "id": "p1",
                    "blocks": [
                        {
                            "id": "exp",
                            "type": "experiences",
                            "x": 10,
                            "y": 10,
                            "w": 120,
                            "h": 50,
                            "z": 1,
                            "style": {
                                "title_style": "creative-main",
                                "exp_style": "creative",
                                "section_label": "EXP",
                            },
                        },
                        {
                            "id": "form",
                            "type": "formations",
                            "x": 10,
                            "y": 65,
                            "w": 120,
                            "h": 20,
                            "z": 1,
                            "style": {
                                "title_style": "bold-main",
                                "formation_style": "minimal",
                                "section_label": "FORMATION",
                            },
                        },
                        {
                            "id": "skills",
                            "type": "skills",
                            "x": 140,
                            "y": 10,
                            "w": 50,
                            "h": 40,
                            "z": 1,
                            "style": {
                                "title_style": "modern-sidebar",
                                "zone": "sidebar",
                                "skills_nested_outils": True,
                                "format": "chips",
                                "section_label": "SKILLS",
                            },
                        },
                        {
                            "id": "langs",
                            "type": "languages",
                            "x": 140,
                            "y": 55,
                            "w": 50,
                            "h": 20,
                            "z": 1,
                            "style": {
                                "title_style": "minimal-section",
                                "list_format": "list",
                                "section_label": "LANGUES",
                            },
                        },
                        {
                            "id": "contact",
                            "type": "contact",
                            "x": 10,
                            "y": 90,
                            "w": 180,
                            "h": 10,
                            "z": 1,
                            "style": {
                                "zone": "header",
                                "contact_layout": "header-bar",
                                "contact_separator": " · ",
                                "align": "left",
                                "nowrap": True,
                            },
                        },
                    ],
                }
            ],
        }
        html = render_html(cv, layout)
        self.assertRegex(html, r'class="cv-layout-doc">')
        self.assertNotRegex(html, r'class="cv-layout-doc cv-layout-doc--tpl-')
        body = html.split("<body", 1)[1]
        self.assertIn("cv-layout-section-title--creative-main", body)
        self.assertIn("cv-layout-section-title--bold-main", body)
        self.assertIn("cv-layout-section-title--modern-sidebar", body)
        self.assertIn("cv-layout-section-title--minimal-section", body)
        self.assertIn("cv-layout-exp--creative", body)
        self.assertIn("cv-layout-dates--accent", body)
        self.assertIn("cv-layout-bullets--chevron", body)
        self.assertIn("cv-layout-formation--minimal", body)
        self.assertIn("cv-layout-chip--tool", body)
        self.assertIn("Excel", html)
        self.assertIn("cv-layout-contact-spacer", body)
        self.assertIn(" · ", html)
        self.assertIn("white-space:nowrap", html)
        self.assertIn("Français - Natif", html)
        self.assertNotIn("Français (Natif)", body)

    def test_photo_border_light_preset(self):
        layout = {
            "version": 3,
            "pages": [
                {
                    "id": "p1",
                    "blocks": [
                        {
                            "id": "ph",
                            "type": "photo",
                            "x": 5,
                            "y": 5,
                            "w": 28,
                            "h": 28,
                            "z": 1,
                            "style": {
                                "shape": "circle",
                                "zone": "sidebar",
                                "photo_border": "light",
                            },
                        }
                    ],
                }
            ],
        }
        cv = _sample_cv()
        cv["photo_url"] = "https://example.com/p.jpg"
        html = render_html(cv, layout)
        self.assertIn("rgba(255, 255, 255, 0.3)", html)
        self.assertIn("border:0.79mm", html)
        self.assertIn('data-zone="sidebar"', html)

    def test_photo_border_accent_thick_matches_canvas(self):
        layout = {
            "version": 3,
            "pages": [
                {
                    "id": "p1",
                    "blocks": [
                        {
                            "id": "ph",
                            "type": "photo",
                            "x": 5,
                            "y": 5,
                            "w": 28,
                            "h": 28,
                            "z": 1,
                            "style": {
                                "shape": "circle",
                                "zone": "header",
                                "photo_border": "accent-thick",
                            },
                        }
                    ],
                }
            ],
        }
        cv = _sample_cv()
        cv["photo_url"] = "https://example.com/p.jpg"
        html = render_html(cv, layout)
        self.assertIn("border:0.8mm solid var(--layout-accent", html)
        self.assertIn("cv-layout-image-clip", html)
        self.assertNotIn("border:1.1mm", html)

    def test_hairline_shape_line_minimum(self):
        layout = {
            "version": 3,
            "pages": [
                {
                    "id": "p1",
                    "blocks": [
                        {
                            "id": "line",
                            "type": "shape:line",
                            "x": 10,
                            "y": 40,
                            "w": 80,
                            "h": 0.15,
                            "z": 1,
                            "style": {"color": "#e2e8f0", "stroke_width": 0.15},
                        }
                    ],
                }
            ],
        }
        html = render_html(_sample_cv(), layout)
        self.assertIn("cv-layout-shape-line", html)
        self.assertIn("height:0.4mm;width:100%", html)
        self.assertIn("overflow: visible", html)

    def test_contact_icon_and_dash_colors_in_css(self):
        html = render_html(_sample_cv(), _starter_layout())
        self.assertIn(".cv-layout-bullets--dash li::before", html)
        self.assertIn("color: #1e293b", html)

    def test_contact_icons_are_outline_with_accent_stroke(self):
        layout = {
            "version": 3,
            "theme": {"template_id": "bold", "color_accent": "#dc2626"},
            "pages": [
                {
                    "id": "p1",
                    "blocks": [
                        {
                            "id": "c",
                            "type": "contact",
                            "x": 10,
                            "y": 10,
                            "w": 180,
                            "h": 10,
                            "z": 1,
                            "style": {
                                "zone": "header",
                                "contact_layout": "header-bar",
                                "contact_icons": True,
                            },
                        }
                    ],
                }
            ],
        }
        html = render_html(_sample_cv(), layout)
        self.assertIn('fill="none"', html)
        self.assertIn('stroke="#dc2626"', html)
        self.assertIn('stroke-width="1.5"', html)

    def test_elegant_chips_have_no_border(self):
        cv = _sample_cv()
        cv["competences"] = {
            "techniques": ["Python", "Excel"],
            "logiciels": ["Claude"],
        }
        layout = {
            "version": 3,
            "theme": {"template_id": "elegant", "font_heading": "Georgia, serif"},
            "pages": [
                {
                    "id": "p1",
                    "blocks": [
                        {
                            "id": "sk",
                            "type": "skills",
                            "x": 10,
                            "y": 40,
                            "w": 180,
                            "h": 20,
                            "z": 1,
                            "style": {
                                "title_style": "elegant-section",
                                "format": "chips",
                                "section_label": "COMPÉTENCES",
                                "skills_nested_outils": True,
                            },
                        },
                        {
                            "id": "rule",
                            "type": "shape:rect",
                            "x": 10,
                            "y": 30,
                            "w": 180,
                            "h": 0.15,
                            "z": 0,
                            "style": {"color": "#e2e8f0"},
                        },
                    ],
                }
            ],
        }
        html = render_html(cv, layout)
        self.assertIn("cv-layout-section--elegant", html)
        self.assertIn("cv-layout-chip--tool", html)
        self.assertIn("cv-layout-block--hairline", html)
        self.assertIn("height:0.4mm;width:100%", html)
        self.assertIn("border: none", html)

    def test_header_zone_without_dark_rect_keeps_readable_ink(self):
        layout = {
            "version": 3,
            "pages": [
                {
                    "id": "p1",
                    "blocks": [
                        {
                            "id": "id",
                            "type": "identity",
                            "x": 10,
                            "y": 10,
                            "w": 100,
                            "h": 20,
                            "z": 1,
                            "style": {"zone": "header"},
                        }
                    ],
                }
            ],
        }
        html = render_html(_sample_cv(), layout)
        ident = html.split('data-block-id="id"', 1)[1].split("</div>", 1)[0]
        self.assertIn('data-zone="header"', ident)
        self.assertNotIn("data-on-dark", ident)

    def test_header_zone_on_dark_rect_marks_on_dark(self):
        layout = {
            "version": 3,
            "pages": [
                {
                    "id": "p1",
                    "blocks": [
                        {
                            "id": "bg",
                            "type": "shape:rect",
                            "x": 0,
                            "y": 0,
                            "w": 210,
                            "h": 40,
                            "z": 0,
                            "style": {"color": "#1e293b"},
                        },
                        {
                            "id": "id",
                            "type": "identity",
                            "x": 10,
                            "y": 8,
                            "w": 100,
                            "h": 20,
                            "z": 2,
                            "style": {"zone": "header"},
                        },
                    ],
                }
            ],
        }
        html = render_html(_sample_cv(), layout)
        ident = html.split('data-block-id="id"', 1)[1].split(">", 1)[0]
        self.assertIn('data-on-dark="1"', ident)

    def test_invalid_photo_border_color_falls_back(self):
        layout = {
            "version": 3,
            "pages": [
                {
                    "id": "p1",
                    "blocks": [
                        {
                            "id": "ph",
                            "type": "photo",
                            "x": 5,
                            "y": 5,
                            "w": 28,
                            "h": 28,
                            "z": 1,
                            "style": {
                                "photo_border": 0.5,
                                "image_border_color": "red;background:yellow",
                            },
                        }
                    ],
                }
            ],
        }
        cv = _sample_cv()
        cv["photo_url"] = "https://example.com/p.jpg"
        html = render_html(cv, layout)
        self.assertIn("border:0.5mm solid #1e293b", html)
        self.assertNotIn("background:yellow", html)


class TestCssColor(unittest.TestCase):
    def test_hex_and_rgb_accepted(self):
        from backend.services.layout_renderer import _css_color

        self.assertEqual(_css_color("#1e293b"), "#1e293b")
        self.assertEqual(_css_color("rgb(30, 41, 59)"), "rgb(30, 41, 59)")
        self.assertEqual(_css_color("rgba(255, 255, 255, 0.3)"), "rgba(255, 255, 255, 0.3)")

    def test_junk_falls_back(self):
        from backend.services.layout_renderer import _css_color

        self.assertEqual(_css_color("rgb(" * 40), "#1e293b")
        self.assertEqual(_css_color("red"), "#1e293b")
        self.assertEqual(_css_color("rgb(1,2,3);background:red"), "#1e293b")


if __name__ == "__main__":
    unittest.main()
