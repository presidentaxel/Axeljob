"""Rendu d'un couple (cv, layout v3) en HTML pour preview / WeasyPrint (P3.8)."""

from __future__ import annotations

import html
import re
from typing import Any

from backend.services import layout_bindings as bind

PAGE_WIDTH_MM = 210
PAGE_HEIGHT_MM = 297
PAGE_MARGIN_MM = 10

SEMANTIC_TYPES = frozenset(
    {
        "identity",
        "photo",
        "contact",
        "resume",
        "experiences",
        "formations",
        "certifications",
        "projets",
        "skills",
        "languages",
    }
)

SECTION_LABELS = {
    "experiences": "Expérience professionnelle",
    "formations": "Formation",
    "certifications": "Certifications",
    "projets": "Projets",
    "skills": "Compétences",
    "languages": "Langues",
    "resume": "Profil",
}

_BEM_TOKEN_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def _bem_token(raw: str) -> str:
    """Token BEM sûr (title_style / identity_layout canvas)."""
    ts = (raw or "").strip().lower()
    return ts if _BEM_TOKEN_RE.fullmatch(ts) else ""


LAYOUT_CSS = """
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
body.cv-layout-body {
  margin: 0;
  padding: 0;
  background: #f1f5f9;
  font-family: var(--layout-font-body, 'Inter', system-ui, sans-serif);
  color: #1e293b;
}
.cv-layout-doc { display: flex; flex-direction: column; align-items: center; gap: 0; }
.cv-layout-page {
  position: relative;
  width: 210mm;
  height: 297mm;
  background: #fff;
  overflow: hidden;
  page-break-after: always;
  font-size: 9pt;
  line-height: 1.4;
}
.cv-layout-page:last-child { page-break-after: auto; }
.cv-layout-block {
  position: absolute;
  overflow: hidden;
}
.cv-layout-block[data-type="shape:line"],
.cv-layout-block[data-type="shape:line"] .cv-layout-block__inner,
.cv-layout-block--hairline,
.cv-layout-block--hairline .cv-layout-block__inner {
  overflow: visible;
}
.cv-layout-block__inner {
  width: 100%;
  height: 100%;
  overflow: hidden;
  padding: 0;
}
/* Centrage vertical header (photo / identity / contact) — comme CanvasTemplateFidelity. */
.cv-layout-block[data-type="identity"][data-zone="header"] .cv-layout-block__inner,
.cv-layout-block[data-type="contact"][data-zone="header"] .cv-layout-block__inner,
.cv-layout-block[data-type="identity"][data-zone="sidebar"] .cv-layout-block__inner {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: stretch;
}
.cv-layout-block[data-type="contact"][data-zone="header"] .cv-layout-block__inner {
  align-items: center;
}
.cv-layout-block[data-type="text"] .cv-layout-block__inner,
.cv-layout-block[data-type="title"] .cv-layout-block__inner,
.cv-layout-block[data-type="resume"] .cv-layout-block__inner {
  padding: 1mm 1.5mm;
}
.cv-layout-doc--tpl-bold .cv-layout-block[data-type="resume"] .cv-layout-block__inner,
.cv-layout-doc--tpl-classic .cv-layout-block[data-type="resume"] .cv-layout-block__inner,
.cv-layout-doc--tpl-creative .cv-layout-block[data-type="resume"] .cv-layout-block__inner,
.cv-layout-doc--tpl-modern .cv-layout-block[data-type="resume"] .cv-layout-block__inner,
.cv-layout-doc--tpl-executive .cv-layout-block[data-type="resume"] .cv-layout-block__inner {
  padding: 0;
}
.cv-layout-identity-name {
  font-family: var(--layout-font-heading, var(--layout-font-body, 'Inter', sans-serif));
  font-size: 14pt;
  font-weight: 700;
  line-height: 1.2;
  color: var(--layout-accent, #1e293b);
}
.cv-layout-doc--tpl-bold .cv-layout-identity-name {
  font-size: 20pt;
  font-weight: 800;
  letter-spacing: -0.01em;
}
.cv-layout-doc--tpl-classic .cv-layout-identity-name,
.cv-layout-doc--tpl-executive .cv-layout-identity-name {
  font-size: 18pt;
  font-weight: 700;
}
.cv-layout-doc--tpl-creative .cv-layout-identity-name,
.cv-layout-doc--tpl-modern .cv-layout-identity-name {
  font-size: 13pt;
  font-weight: 700;
}
.cv-layout-identity-title { font-size: 10pt; margin-top: 1mm; color: #475569; }
.cv-layout-identity-title--accent {
  color: var(--layout-accent, #dc2626);
}
.cv-layout-identity--inline-title {
  display: flex;
  flex-wrap: nowrap;
  align-items: baseline;
  gap: 0 1.5mm;
  overflow: hidden;
  max-width: 100%;
}
.cv-layout-identity--inline-title .cv-layout-identity-name,
.cv-layout-identity--inline-title .cv-layout-identity-sep,
.cv-layout-identity--inline-title .cv-layout-identity-title {
  white-space: nowrap;
}
.cv-layout-identity--inline-title .cv-layout-identity-title { margin-top: 0; }
.cv-layout-identity-sep { color: #64748b; font-weight: 500; }
.cv-layout-doc--tpl-bold .cv-layout-block[data-on-dark="1"][data-zone="header"] .cv-layout-identity--inline-title .cv-layout-identity-sep,
.cv-layout-doc--tpl-classic .cv-layout-block[data-on-dark="1"][data-zone="header"] .cv-layout-identity--inline-title .cv-layout-identity-sep,
.cv-layout-doc--tpl-executive .cv-layout-block[data-on-dark="1"][data-zone="header"] .cv-layout-identity--inline-title .cv-layout-identity-sep {
  color: #ffffff;
  opacity: 0.4;
  font-weight: 400;
}
.cv-layout-doc--tpl-bold .cv-layout-identity--inline-title .cv-layout-identity-title,
.cv-layout-doc--tpl-bold .cv-layout-identity--inline-title .cv-layout-identity-title--accent {
  font-size: 11pt;
  font-weight: 600;
}
.cv-layout-contact p {
  margin: 0 0 0.5mm;
  display: flex;
  align-items: center;
  gap: 1mm;
  font-size: 8pt;
  color: #334155;
}
.cv-layout-contact--header-bar {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start;
  align-items: center;
  gap: 2mm;
  margin: 0;
  font-size: 8pt;
  color: #334155;
  text-align: left;
}
.cv-layout-contact--has-sep {
  gap: 0;
}
.cv-layout-contact-spacer {
  white-space: pre;
  margin: 0 2mm;
  color: inherit;
}
.cv-layout-block[data-zone="header"] .cv-layout-contact-spacer {
  color: inherit;
}
.cv-layout-block[data-on-dark="1"][data-zone="header"] .cv-layout-contact-spacer {
  color: rgba(255, 255, 255, 0.55);
}
.cv-layout-contact--align-center {
  justify-content: center;
  text-align: center;
}
.cv-layout-contact--align-right {
  justify-content: flex-end;
  text-align: right;
}
/* Texte clair seulement si le bloc recouvre un shape:rect sombre (pas zone seule). */
.cv-layout-block[data-on-dark="1"] .cv-layout-identity-name {
  color: #ffffff;
}
.cv-layout-block[data-on-dark="1"] .cv-layout-identity-title,
.cv-layout-block[data-on-dark="1"] .cv-layout-identity-sep {
  color: rgba(255, 255, 255, 0.85);
}
.cv-layout-block[data-zone="header"] .cv-layout-identity-title--accent {
  color: var(--layout-accent, #dc2626);
}
.cv-layout-block[data-on-dark="1"] .cv-layout-contact p,
.cv-layout-block[data-on-dark="1"] .cv-layout-contact--header-bar,
.cv-layout-block[data-on-dark="1"] .cv-layout-contact-segment,
.cv-layout-block[data-on-dark="1"] .cv-layout-sidebar-item,
.cv-layout-block[data-on-dark="1"] .cv-layout-block__inner {
  color: rgba(255, 255, 255, 0.92);
}
/* sidebar-light (Bold / Executive / Classic) : jamais le texte blanc des sidebars sombres. */
.cv-layout-block[data-zone="sidebar-light"] .cv-layout-block__inner,
.cv-layout-block[data-zone="sidebar-light"] .cv-layout-section-title,
.cv-layout-block[data-zone="sidebar-light"] .cv-layout-sidebar-category,
.cv-layout-block[data-zone="sidebar-light"] .cv-layout-sidebar-item {
  color: #1e293b;
}
.cv-layout-block[data-on-dark="1"] .cv-layout-contact--header-bar {
  color: rgba(255, 255, 255, 0.75);
}
.cv-layout-block[data-on-dark="1"] .cv-layout-identity-divider {
  background: rgba(255, 255, 255, 0.25);
}
.cv-layout-block[data-on-dark="1"] .cv-layout-section-title--modern-sidebar,
.cv-layout-block[data-on-dark="1"] .cv-layout-section-title--sidebar,
.cv-layout-block[data-on-dark="1"] .cv-layout-sidebar-category {
  color: rgba(255, 255, 255, 0.94);
  border-bottom-color: rgba(255, 255, 255, 0.28);
}
.cv-layout-block[data-on-dark="1"] .cv-layout-section-title--creative-sidebar {
  color: var(--layout-accent, #f59e0b);
  border-bottom-color: rgba(255, 255, 255, 0.28);
}
.cv-layout-contact-segment {
  display: inline-flex;
  align-items: center;
  gap: 1mm;
  white-space: nowrap;
}
.cv-layout-contact-icon {
  width: 3.2mm;
  height: 3.2mm;
  flex-shrink: 0;
  color: inherit;
}
.cv-layout-contact-icon svg {
  width: 100%;
  height: 100%;
  display: block;
  overflow: visible;
  fill: none;
}
.cv-layout-block[data-zone="header"] .cv-layout-contact-icon {
  color: var(--layout-accent, #dc2626);
}
.cv-layout-doc--tpl-classic .cv-layout-block[data-on-dark="1"][data-zone="header"] .cv-layout-contact-icon {
  color: rgba(255, 255, 255, 0.9);
}
.cv-layout-block[data-on-dark="1"][data-zone="sidebar"] .cv-layout-contact-icon {
  color: rgba(255, 255, 255, 0.92);
}
.cv-layout-section-title {
  font-family: var(--layout-font-heading, var(--layout-font-body, 'Inter', sans-serif));
  margin: 0 0 1.5mm;
  font-size: 9pt;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--layout-section-title, var(--layout-accent, #1e293b));
  border-bottom: 0.4mm solid var(--layout-accent, #1e293b);
  padding-bottom: 0.4mm;
}
.cv-layout-sidebar-category {
  margin: 0 0 1mm;
  font-size: 8pt;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--layout-section-title, var(--layout-accent, #1e293b));
}
.cv-layout-exp { margin-bottom: 2mm; }
.cv-layout-exp--bold,
.cv-layout-exp--classic {
  margin-bottom: 1.8mm;
  padding-bottom: 1.6mm;
  border-bottom: 0.4mm solid #f1f5f9;
}
.cv-layout-exp--bold:last-child,
.cv-layout-exp--classic:last-child {
  border-bottom: none;
  padding-bottom: 0;
}
.cv-layout-exp--modern,
.cv-layout-exp--creative,
.cv-layout-exp--executive {
  margin-bottom: 2mm;
  padding-bottom: 1.2mm;
  border-bottom: 0.4mm solid #eeeeee;
}
.cv-layout-exp--modern:last-child,
.cv-layout-exp--creative:last-child,
.cv-layout-exp--executive:last-child {
  border-bottom: none;
  padding-bottom: 0;
}
.cv-layout-exp-header {
  display: flex;
  justify-content: space-between;
  gap: 2mm;
  align-items: baseline;
  font-weight: 600;
}
.cv-layout-exp-left {
  flex: 1 1 auto;
  min-width: 0;
}
.cv-layout-exp-dates {
  flex: 0 0 auto;
  font-weight: 500;
  color: var(--layout-accent, #64748b);
  white-space: nowrap;
  font-size: 8pt;
}
.cv-layout-exp--bold .cv-layout-exp-dates,
.cv-layout-exp--classic .cv-layout-exp-dates,
.cv-layout-dates--accent .cv-layout-formation-date {
  font-weight: 700;
  color: var(--layout-accent, #dc2626);
}
.cv-layout-exp--creative .cv-layout-exp-dates,
.cv-layout-dates--brand .cv-layout-formation-date {
  color: var(--layout-section-title, var(--layout-sidebar, #6366f1));
  font-weight: 600;
}
.cv-layout-exp--modern .cv-layout-exp-dates,
.cv-layout-dates--ink .cv-layout-formation-date {
  color: #1a1a1a;
  font-weight: 700;
}
.cv-layout-exp--executive .cv-layout-exp-dates {
  font-weight: 600;
  color: var(--layout-accent, #b8860b);
}
.cv-layout-exp--minimal .cv-layout-exp-dates,
.cv-layout-dates--soft .cv-layout-formation-date {
  color: #444444;
  font-weight: 600;
}
.cv-layout-exp--elegant .cv-layout-exp-dates {
  font-weight: 600;
}
.cv-layout-exp-role { color: #64748b; font-size: 8pt; margin-bottom: 0.5mm; }
.cv-layout-exp-clients { margin: 0 0 0.5mm; font-size: 8pt; color: #475569; }
.cv-layout-ats-label { font-size: 0.9em; color: #999; font-weight: 400; }
.cv-layout-bullets { margin: 0.5mm 0 0 3mm; padding: 0; }
.cv-layout-bullets li { margin-bottom: 0.3mm; }
.cv-layout-bullets--dash {
  list-style: none;
  margin-left: 0;
  padding: 0;
}
.cv-layout-bullets--dash li {
  position: relative;
  padding-left: 2.8mm;
}
.cv-layout-bullets--dash li::before {
  content: '-';
  position: absolute;
  left: 0;
  color: #1e293b;
}
.cv-layout-bullets--dash.cv-layout-bullets--chevron li::before {
  content: '▸';
  color: var(--layout-accent, #1e293b);
}
.cv-layout-exp--elegant .cv-layout-bullets--dash li::before {
  color: var(--layout-accent, #1e293b);
}
.cv-layout-chips { display: flex; flex-wrap: wrap; gap: 1mm; }
.cv-layout-sidebar-item { margin: 0 0 0.5mm; font-size: 8pt; }
.cv-layout-chip {
  display: inline-block;
  background: #f1f5f9;
  border: 0.4mm solid #cbd5e1;
  border-radius: 2px;
  padding: 0.5mm 2mm;
  font-size: 8pt;
  box-shadow: none;
}
.cv-layout-section--elegant {
  padding: 2.1mm 0;
  border-bottom: 0.4mm solid #e2e8f0;
}
.cv-layout-section--elegant .cv-layout-chip {
  background: #edf2f7;
  border: none;
  border-radius: 3px;
  color: #2d3748;
  padding: 0.5mm 2.1mm;
}
.cv-layout-section--elegant .cv-layout-chip--tool {
  background: #e2e8f0;
}
.cv-layout-photo { width: 100%; height: 100%; object-fit: cover; display: block; }
.cv-layout-photo--round { border-radius: 50%; }
.cv-layout-photo-ph { width: 100%; height: 100%; background: #e2e8f0; }
.cv-layout-image-frame { width: 100%; height: 100%; }
.cv-layout-image-circle { width: 100%; height: 100%; box-sizing: border-box; }
.cv-layout-image-clip {
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: inherit;
}
.cv-layout-image-circle .cv-layout-image-clip { border-radius: 50%; }
.cv-layout-image-circle .cv-layout-photo,
.cv-layout-image-circle .cv-layout-image { width: 100%; height: 100%; object-fit: cover; display: block; }
.cv-layout-image { width: 100%; height: 100%; object-fit: cover; display: block; }
.cv-layout-icon { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
.cv-layout-icon svg,
.cv-layout-icon path {
  width: 100%;
  height: 100%;
  display: block;
  fill: none;
  stroke: currentColor;
}
.cv-layout-identity-divider {
  margin-top: 1.5mm;
  height: 0.4mm;
  background: var(--layout-accent, #1e293b);
  opacity: 0.55;
  width: 100%;
}
/* Filet identité canvas : border sur le bloc (évite clipping du child). */
.cv-layout-identity--with-divider {
  border-bottom: 0.4mm solid rgba(255, 255, 255, 0.22);
  padding-bottom: 2mm;
  margin-bottom: 1mm;
}
.cv-layout-block[data-zone="sidebar"] .cv-layout-identity--with-divider .cv-layout-identity-divider,
.cv-layout-block[data-zone="header"] .cv-layout-identity--with-divider .cv-layout-identity-divider {
  display: none;
}
.cv-layout-contact--uppercase {
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
/* Un seul filet sous le bloc contact (comme canvas), pas une ligne par entrée. */
.cv-layout-contact--with-divider {
  padding-bottom: 2mm;
  margin-bottom: 1mm;
  border-bottom: 0.4mm solid rgba(30, 41, 59, 0.18);
}
.cv-layout-block[data-on-dark="1"] .cv-layout-contact--with-divider {
  border-bottom-color: rgba(255, 255, 255, 0.2);
}
.cv-layout-contact--with-divider p {
  margin-bottom: 0.8mm;
}
.cv-layout-section-title--underline-accent {
  border-bottom: 0.55mm solid var(--layout-accent, #1e293b);
  padding-bottom: 0.6mm;
}
.cv-layout-section-title--pill {
  display: inline-block;
  border: none;
  background: color-mix(in srgb, var(--layout-accent, #1e293b) 12%, #fff);
  border-radius: 999px;
  padding: 0.6mm 2.5mm;
  letter-spacing: 0.02em;
}
.cv-layout-section-title--sidebar-bar,
.cv-layout-section-title--bold-main,
.cv-layout-section-title--bold-sidebar-section {
  border-bottom: none;
  border-left: 1.1mm solid var(--layout-accent, #1e293b);
  padding: 0.8mm 0 0.8mm 2mm;
  font-weight: 800;
  font-size: 10pt;
}
.cv-layout-sidebar-category--bold-sidebar-category {
  font-size: 8.5pt;
  font-weight: 800;
  border-left: 0.8mm solid var(--layout-accent, #1e293b);
  padding-left: 1.6mm;
  margin: 0 0 1.3mm;
}
.cv-layout-section-title--modern-main,
.cv-layout-section-title--underline-accent {
  border-bottom: 0.55mm solid var(--layout-accent, #1e293b);
  letter-spacing: 0.04em;
  padding-bottom: 0.6mm;
  font-size: 9.5pt;
}
.cv-layout-section-title--creative-main {
  color: var(--layout-section-title, var(--layout-sidebar, #6366f1));
  border-bottom: 0.55mm solid var(--layout-accent, #f59e0b);
  letter-spacing: 0.04em;
  padding-bottom: 0.6mm;
}
.cv-layout-section-title--classic-main,
.cv-layout-section-title--executive-main,
.cv-layout-section-title--executive-sidebar-section {
  border-bottom: 0.55mm solid var(--layout-accent, #1e293b);
  letter-spacing: 0.06em;
  padding-bottom: 0.6mm;
  color: var(--layout-section-title, var(--layout-accent, #1e293b));
}
.cv-layout-section-title--elegant-section {
  border-bottom: none;
  letter-spacing: 0.06em;
  padding-bottom: 0;
}
.cv-layout-section-title--minimal-section {
  text-transform: none;
  border-bottom: 0.4mm solid #d1d5db;
  letter-spacing: 0.02em;
  padding-bottom: 0.5mm;
}
.cv-layout-section-title--modern-sidebar,
.cv-layout-section-title--sidebar {
  font-size: 8pt;
  letter-spacing: 0.08em;
  color: var(--layout-section-title, var(--layout-accent, #1e293b));
  border-bottom: 0.4mm solid rgba(186, 230, 253, 0.35);
}
.cv-layout-section-title--creative-sidebar,
.cv-layout-section-title--sidebar-creative {
  font-size: 8pt;
  letter-spacing: 0.08em;
  color: var(--layout-accent, #f59e0b);
  border-bottom: 0.4mm solid rgba(255, 255, 255, 0.28);
}
.cv-layout-section-title--executive-sidebar-category,
.cv-layout-sidebar-category--executive-sidebar-category {
  border: none;
  color: var(--layout-accent, #b8860b);
  font-size: 9pt;
  text-transform: none;
  letter-spacing: 0.04em;
  padding-bottom: 0;
}
/* Classic canvas restyle bold-* tokens (underline, pas barre) — même exception que le CSS twin. */
.cv-layout-doc--tpl-classic .cv-layout-section-title--bold-main,
.cv-layout-doc--tpl-classic .cv-layout-section-title--bold-sidebar-section,
.cv-layout-doc--tpl-classic .cv-layout-section-title--classic-main {
  border-left: none;
  border-bottom: 0.55mm solid var(--layout-accent, #1e2a3a);
  padding: 0 0 0.3mm;
  font-weight: 700;
  font-size: 9.5pt;
}
.cv-layout-doc--tpl-classic .cv-layout-sidebar-category--bold-sidebar-category {
  border-left: none;
  text-transform: none;
  letter-spacing: 0;
}
.cv-layout-identity--modern-sidebar,
.cv-layout-identity--creative-sidebar {
  text-align: center;
}
.cv-layout-formation--minimal .cv-layout-formation-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 2mm;
  margin: 0 0 0.8mm;
}
.cv-layout-formation-diplome { font-weight: 700; }
.cv-layout-formation-date {
  flex: 0 0 auto;
  white-space: nowrap;
  font-size: 8.5pt;
  font-weight: 700;
  color: #64748b;
}
.cv-layout-formation-mention {
  margin: 0;
  font-size: 8pt;
  color: #64748b;
}
.cv-layout-shape-svg {
  width: 100%;
  height: 100%;
  display: block;
}
.cv-layout-shape-line, .cv-layout-shape-rect { width: 100%; height: 100%; }
.cv-layout-title {
  margin: 0;
  font-family: var(--layout-font-heading, var(--layout-font-body, 'Inter', sans-serif));
  font-size: 11pt;
  font-weight: 700;
}
.cv-layout-text { margin: 0; }
.cv-layout-placeholder { color: #94a3b8; font-style: italic; font-size: 8pt; }
.cv-layout-qr {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0.25mm dashed #94a3b8;
  color: #64748b;
  font-size: 7pt;
  text-align: center;
  padding: 1mm;
}
"""


def render_html(
    cv: dict,
    layout: dict,
    theme: dict | None = None,
    *,
    for_preview: bool = False,
) -> str:
    """Produit un document HTML complet (A4, blocs absolus en mm)."""
    del for_preview  # reserve pour styles preview futurs
    if not isinstance(cv, dict):
        cv = {}
    if not isinstance(layout, dict):
        layout = {}
    merged_theme = {**(layout.get("theme") or {}), **(theme or {})}
    pages = layout.get("pages")
    if not isinstance(pages, list) or not pages:
        pages = [{"id": "page-1", "blocks": []}]

    accent = _css_color(merged_theme.get("color_accent") or "#1e293b")
    section_title = _css_color(
        merged_theme.get("color_section_title") or merged_theme.get("color_accent") or "#1e293b"
    )
    sidebar = _css_color(merged_theme.get("color_sidebar") or "#64748b")
    header = _css_color(merged_theme.get("color_header") or sidebar)
    font_heading = _css_font_stack(str(merged_theme.get("font_heading") or "Inter, sans-serif"))
    font_body = _css_font_stack(str(merged_theme.get("font_body") or font_heading))
    template_id = str(merged_theme.get("template_id") or "").strip().lower()
    tpl_class = f" cv-layout-doc--tpl-{_esc(template_id)}" if template_id else ""
    font_faces = _local_font_faces_css()

    pages_html: list[str] = []
    for page in pages:
        if not isinstance(page, dict):
            continue
        blocks = page.get("blocks")
        if not isinstance(blocks, list):
            blocks = []
        sorted_blocks = sorted(
            [b for b in blocks if isinstance(b, dict) and b.get("id")],
            key=lambda b: int(b.get("z") or 0),
        )
        ctx = {
            "accent": accent,
            "template_id": template_id,
            "dark_rects": _dark_fill_rects(sorted_blocks),
        }
        blocks_html = "".join(_render_block(cv, b, ctx) for b in sorted_blocks)
        pages_html.append(
            f'<div class="cv-layout-page" data-page-id="{_esc(str(page.get("id") or ""))}">'
            f"{blocks_html}</div>"
        )

    body = "".join(pages_html)
    return f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>CV layout</title>
<style>
{font_faces}
{LAYOUT_CSS}
:root {{
  --layout-accent: {accent};
  --layout-section-title: {section_title};
  --layout-sidebar: {sidebar};
  --layout-header: {header};
  --layout-muted: #64748b;
  --layout-font-heading: {font_heading};
  --layout-font-body: {font_body};
}}
</style>
</head>
<body class="cv-layout-body">
<div class="cv-layout-doc{tpl_class}">{body}</div>
</body>
</html>"""


def _rgb_from_css(value: str) -> tuple[int, int, int] | None:
    raw = str(value or "").strip()
    if raw.startswith("#"):
        h = raw[1:]
        if len(h) in {3, 4}:
            h = "".join(c * 2 for c in h[:3])
        elif len(h) in {6, 8}:
            h = h[:6]
        else:
            return None
        try:
            return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
        except ValueError:
            return None
    m = re.fullmatch(r"rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})", raw)
    if not m:
        return None
    return int(m.group(1)), int(m.group(2)), int(m.group(3))


def _is_dark_css_color(value: str, *, threshold: float = 0.55) -> bool:
    rgb = _rgb_from_css(value)
    if rgb is None:
        return False
    r, g, b = rgb
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255.0 < threshold


def _blocks_overlap(a: dict, b: dict, pad_mm: float = 0.8) -> bool:
    ax, ay, aw, ah = _num(a.get("x")), _num(a.get("y")), _num(a.get("w")), _num(a.get("h"))
    bx, by, bw, bh = _num(b.get("x")), _num(b.get("y")), _num(b.get("w")), _num(b.get("h"))
    return (
        ax < bx + bw + pad_mm
        and ax + aw > bx - pad_mm
        and ay < by + bh + pad_mm
        and ay + ah > by - pad_mm
    )


def _dark_fill_rects(blocks: list[dict]) -> list[dict]:
    dark: list[dict] = []
    for block in blocks:
        if str(block.get("type") or "") != "shape:rect":
            continue
        style = block.get("style") if isinstance(block.get("style"), dict) else {}
        color = _css_color(style.get("color") or style.get("bg") or "")
        if _is_dark_css_color(color):
            dark.append(block)
    return dark


def _block_on_dark(block: dict, zone: str, ctx: dict[str, Any] | None) -> bool:
    """Texte clair seulement si zone header/sidebar ET recouvre un fond sombre."""
    if zone not in {"header", "sidebar"}:
        return False
    rects = (ctx or {}).get("dark_rects") or []
    return any(_blocks_overlap(block, rect) for rect in rects if isinstance(rect, dict))


def _render_block(cv: dict, block: dict, ctx: dict[str, Any] | None = None) -> str:
    btype = str(block.get("type") or "text")
    x = _num(block.get("x"))
    y = _num(block.get("y"))
    w = _num(block.get("w"), 20)
    h = _num(block.get("h"), 10)
    z = int(block.get("z") or 0)
    style_attr = f"left:{x}mm;top:{y}mm;width:{w}mm;height:{h}mm;z-index:{z};"
    block_style = block.get("style") if isinstance(block.get("style"), dict) else {}
    thin_rule = btype in {"shape:rect", "shape:line"} and 0 < min(w, h) < 0.45
    hairline_cls = " cv-layout-block--hairline" if thin_rule else ""
    decls = _typography_declarations(block_style)
    if thin_rule:
        decls.append("overflow:visible")
    inner_style = _style_attr(decls)
    zone = str(block_style.get("zone") or "").strip()
    on_dark = _block_on_dark(block, zone, ctx)
    block_ctx = {**(ctx or {}), "on_dark": on_dark}
    inner = (
        _render_semantic(cv, block, block_ctx)
        if btype in SEMANTIC_TYPES
        else _render_non_semantic(block)
    )
    bid = _esc(str(block.get("id") or ""))
    zone_attr = f' data-zone="{_esc(zone)}"' if zone else ""
    on_dark_attr = ' data-on-dark="1"' if on_dark else ""
    return (
        f'<div class="cv-layout-block{hairline_cls}" data-block-id="{bid}" '
        f'data-type="{_esc(btype)}"{zone_attr}{on_dark_attr} '
        f'style="{style_attr}">'
        f'<div class="cv-layout-block__inner"{inner_style}>{inner}</div></div>'
    )


def _render_semantic(cv: dict, block: dict, ctx: dict[str, Any] | None = None) -> str:
    btype = str(block.get("type") or "")
    binding = block.get("bind")
    limit = block.get("limit")
    style = block.get("style") if isinstance(block.get("style"), dict) else {}
    fmt = str(style.get("format") or "default")

    if btype == "identity":
        name = bind.resolve_bound_text(cv, ["prenom", "nom"])
        title = bind.resolve_bound_text(cv, "titre_professionnel")
        align = _esc(str(style.get("align") or "left"))
        title_accent = bool(style.get("title_accent"))
        title_cls = "cv-layout-identity-title"
        if title_accent:
            title_cls += " cv-layout-identity-title--accent"
        layout_tok = _bem_token(str(style.get("identity_layout") or ""))
        layout_mod = f" cv-layout-identity--{layout_tok}" if layout_tok else ""
        name_html = (
            f'<div class="cv-layout-identity-name" style="text-align:{align}">'
            f'{_text(name or "Prénom Nom")}</div>'
        )
        if style.get("header_layout") == "inline-title":
            parts = [f'<span class="cv-layout-identity-name">{_text(name or "Prénom Nom")}</span>']
            if title:
                parts.append('<span class="cv-layout-identity-sep"> - </span>')
                parts.append(f'<span class="{title_cls}">{_text(title)}</span>')
            id_cls = "cv-layout-identity cv-layout-identity--inline-title" + layout_mod
            if style.get("identity_divider"):
                id_cls += " cv-layout-identity--with-divider"
            body = f'<div class="{id_cls}" ' f'style="text-align:{align}">{"".join(parts)}</div>'
        else:
            parts = [name_html]
            if title:
                parts.append(f'<div class="{title_cls}">{_text(title)}</div>')
            id_cls = "cv-layout-identity" + layout_mod
            if style.get("identity_divider"):
                id_cls += " cv-layout-identity--with-divider"
            body = f'<div class="{id_cls}">{"".join(parts)}</div>'
        return body

    if btype == "photo":
        url = (cv.get("photo_url") or "").strip() if isinstance(cv, dict) else ""
        if not url:
            return '<div class="cv-layout-photo-ph" aria-hidden="true"></div>'
        w = _num(block.get("w"))
        h = _num(block.get("h"))
        return _image_frame_html(url, style, w, h, "cv-layout-photo")

    if btype == "contact":
        return _render_contact(cv, style, ctx)

    if btype == "resume":
        text = bind.resolve_bound_text(cv, binding if binding else "resume")
        body = f'<p class="cv-layout-text">{_text(text) or _placeholder("Résumé")}</p>'
        return _section_with_style("resume", body, style, default_title=True)

    if btype == "experiences":
        return _render_experiences(cv, limit, fmt, style)

    if btype == "formations":
        return _render_formations(cv, limit, style)

    if btype == "certifications":
        return _render_certifications(cv, limit, style)

    if btype == "projets":
        return _render_projets(cv, limit, style)

    if btype == "skills":
        items = bind.resolve_bound_string_list(cv, binding if binding else "competences.techniques")
        outils: list[str] = []
        if style.get("skills_nested_outils"):
            outils = bind.resolve_bound_string_list(cv, "competences.logiciels")
        if not items and not outils:
            return _section_with_style(
                "skills", _placeholder("Compétences"), style, default_title=False
            )
        list_fmt = str(style.get("list_format") or fmt or "default")
        if fmt == "chips" or list_fmt == "chips":
            chips = "".join(f'<span class="cv-layout-chip">{_text(s)}</span>' for s in items)
            chips += "".join(
                f'<span class="cv-layout-chip cv-layout-chip--tool">{_text(s)}</span>'
                for s in outils
            )
            body = f'<div class="cv-layout-chips">{chips}</div>'
        elif list_fmt == "list" or fmt == "list":
            body = "".join(f'<p class="cv-layout-sidebar-item">{_text(s)}</p>' for s in items)
            if outils:
                body += (
                    f'<p class="cv-layout-skills-outils"><strong>Outils :</strong> '
                    f"{_text(', '.join(outils))}</p>"
                )
        else:
            body = f"<p>{_text(', '.join(items))}</p>"
            if outils:
                body += (
                    f'<p class="cv-layout-skills-outils"><strong>Outils :</strong> '
                    f"{_text(', '.join(outils))}</p>"
                )
        return _section_with_style("skills", body, style, default_title=False)

    if btype == "languages":
        items = bind.resolve_langues(cv)
        if not items:
            return _placeholder("Langues")
        as_inline = str(style.get("list_format") or fmt or "") == "inline"
        lang_rows: list[str] = []
        for row in items:
            if not isinstance(row, dict):
                continue
            label = (row.get("langue") or "").strip()
            niveau = (row.get("niveau") or "").strip()
            if not label:
                continue
            if niveau:
                label = f"{label} ({niveau})" if as_inline else f"{label} - {niveau}"
            lang_rows.append(label)
        if as_inline:
            body = f"<p>{_text(', '.join(lang_rows))}</p>"
        else:
            body = "".join(f'<p class="cv-layout-sidebar-item">{_text(s)}</p>' for s in lang_rows)
        return _section_with_style("languages", body, style, default_title=True)

    return _placeholder(btype)


def _contact_icon_paint(style: dict[str, Any], ctx: dict[str, Any] | None) -> str:
    """Couleur de trait des icônes contact (hi2 outline) — hex, pas currentColor."""
    ctx = ctx or {}
    zone = str(style.get("zone") or "")
    accent = str(ctx.get("accent") or "#1e293b")
    tpl = str(ctx.get("template_id") or "")
    on_dark = bool(ctx.get("on_dark"))
    if zone == "header":
        if tpl == "classic" and on_dark:
            return "rgba(255, 255, 255, 0.9)"
        return accent
    if zone == "sidebar":
        return "rgba(255, 255, 255, 0.92)" if on_dark else accent
    return "#334155"


def _render_contact(cv: dict, style: dict[str, Any], ctx: dict[str, Any] | None = None) -> str:
    fields = (
        ("telephone", "HiPhone"),
        ("email", "HiEnvelope"),
        ("linkedin", "HiLink"),
    )
    values: list[tuple[str, str]] = []
    for key, icon_name in fields:
        val = bind.resolve_bound_text(cv, key)
        if val:
            values.append((icon_name, val))
    if not values:
        return f'<div class="cv-layout-contact">{_placeholder("Contact")}</div>'

    header_bar = style.get("contact_layout") == "header-bar"
    show_icons = bool(style.get("contact_icons"))
    contact_classes = ["cv-layout-contact"]
    if style.get("contact_uppercase"):
        contact_classes.append("cv-layout-contact--uppercase")
    if style.get("contact_divider") and not header_bar:
        contact_classes.append("cv-layout-contact--with-divider")
    if show_icons:
        contact_classes.append("cv-layout-contact--icons")
    class_attr = " ".join(contact_classes)

    def _icon_html(icon_name: str) -> str:
        if not show_icons:
            return ""
        paint = _contact_icon_paint(style, ctx)
        return (
            f'<span class="cv-layout-contact-icon" aria-hidden="true">'
            f"{_icon_svg(icon_name, paint=paint)}</span>"
        )

    if header_bar:
        align = str(style.get("align") or "left").strip()
        align_mod = f" cv-layout-contact--align-{align}" if align in {"center", "right"} else ""
        sep_raw = style.get("contact_separator")
        has_sep = sep_raw is not None
        sep_mod = " cv-layout-contact--has-sep" if has_sep else ""
        sep_html = (
            f'<span class="cv-layout-contact-spacer">{_text(str(sep_raw))}</span>'
            if has_sep
            else ""
        )
        segments = []
        for icon_name, val in values:
            icon = _icon_html(icon_name)
            segments.append(f'<span class="cv-layout-contact-segment">{icon}{_text(val)}</span>')
        joined = sep_html.join(segments) if sep_html else "".join(segments)
        body = (
            f'<div class="{class_attr} cv-layout-contact--header-bar{align_mod}{sep_mod}">'
            f"{joined}</div>"
        )
        return _section_with_style("contact", body, style, default_title=False)

    lines = []
    for icon_name, val in values:
        icon = _icon_html(icon_name)
        lines.append(f"<p>{icon}{_text(val)}</p>")
    body = f'<div class="{class_attr}">{"".join(lines)}</div>'
    return _section_with_style("contact", body, style, default_title=False)


def _render_experiences(cv: dict, limit: Any, fmt: str, style: dict[str, Any] | None = None) -> str:
    """Expériences : aligne FreeCanvasBlock (exp_style twin / ATS / dates / bullets)."""
    style = style or {}
    exp_style = str(style.get("exp_style") or "").strip()
    twin_exp = exp_style in {
        "bold",
        "elegant",
        "classic",
        "modern",
        "executive",
        "creative",
        "minimal",
    }
    ats_labels = twin_exp  # même règle canvas : tous les twins + minimal
    hyphen_dates = exp_style in {
        "minimal",
        "elegant",
        "bold",
        "modern",
        "executive",
        "creative",
    }
    dash_bullets = exp_style in {
        "minimal",
        "elegant",
        "classic",
        "bold",
        "modern",
        "executive",
        "creative",
    }
    chevron_bullets = exp_style == "creative"
    clients_after_bullets = exp_style in {
        "classic",
        "bold",
        "modern",
        "executive",
        "creative",
    }
    secteur_inline = exp_style in {"bold", "modern", "executive", "creative"}
    minimal_exp = exp_style == "minimal"

    items = bind.resolve_experiences(cv, limit if isinstance(limit, int | float) else None)
    if not items:
        return _placeholder("Expériences")

    ats_org = '<span class="cv-layout-ats-label">Organisation : </span>' if ats_labels else ""
    ats_fn = '<span class="cv-layout-ats-label">Fonction : </span>' if ats_labels else ""
    date_sep = " - " if hyphen_dates else " – "
    bullet_cls = "cv-layout-bullets"
    if dash_bullets:
        bullet_cls += " cv-layout-bullets--dash"
        if chevron_bullets:
            bullet_cls += " cv-layout-bullets--chevron"

    rows = []
    for exp in items:
        ent = (exp.get("entreprise") or "").strip()
        poste = (exp.get("poste") or "").strip()
        lieu = (exp.get("lieu") or "").strip()
        secteur = (exp.get("secteur") or "").strip()
        date_parts = [
            x
            for x in [(exp.get("date_debut") or "").strip(), (exp.get("date_fin") or "").strip()]
            if x
        ]
        dates = date_sep.join(date_parts)
        if minimal_exp:
            date_line = dates
        else:
            date_line = " · ".join(x for x in [dates, lieu] if x)

        if minimal_exp:
            left = f"{ats_org}<strong>{_text(ent or poste)}</strong>"
            if poste and ent:
                left += f" - {ats_fn}{_text(poste)}"
            header = f'<span class="cv-layout-exp-left">{left}</span>'
            if date_line:
                header += f'<span class="cv-layout-exp-dates">{_text(date_line)}</span>'
            role = ""
        else:
            left = f"{ats_org}<strong>{_text(ent or poste)}</strong>"
            header = f'<span class="cv-layout-exp-left">{left}</span>'
            if date_line:
                header += f'<span class="cv-layout-exp-dates">{_text(date_line)}</span>'
            role = ""
            if poste and ent:
                role_body = f"{ats_fn}{_text(poste)}"
                if secteur_inline and secteur:
                    role_body += f" - {_text(secteur)}"
                role = f'<div class="cv-layout-exp-role">{role_body}</div>'

        clients = (exp.get("clients") or "").strip()
        clients_html = (
            f'<p class="cv-layout-exp-clients">Clients : {_text(clients)}</p>' if clients else ""
        )
        bullets = exp.get("bullet_points") or []
        bl = "".join(f"<li>{_text((b or '').strip())}</li>" for b in bullets if (b or "").strip())
        bullets_html = f'<ul class="{bullet_cls}">{bl}</ul>' if bl else ""
        compact = " cv-layout-exp--compact" if fmt == "compact" else ""
        exp_mod = f" cv-layout-exp--{exp_style}" if exp_style else ""
        mid = (
            f"{bullets_html}{clients_html}"
            if clients_after_bullets
            else f"{clients_html}{bullets_html}"
        )
        rows.append(
            f'<div class="cv-layout-exp{compact}{exp_mod}">'
            f'<div class="cv-layout-exp-header">{header}</div>{role}{mid}</div>'
        )
    return _section_with_style("experiences", "".join(rows), style, default_title=True)


def _render_formations(cv: dict, limit: Any, style: dict[str, Any] | None = None) -> str:
    style = style or {}
    items = bind.resolve_formations(cv, limit if isinstance(limit, int | float) else None)
    if not items:
        return _placeholder("Formations")
    formation_style = str(style.get("formation_style") or "").strip()
    minimal_form = formation_style in {"minimal", "classic"}
    lines = []
    for f in items:
        dip = (f.get("diplome") or "").strip()
        etab = (f.get("etablissement") or "").strip()
        date = (f.get("date") or "").strip()
        mention = (f.get("mention") or "").strip()
        tone = _dates_tone_mod(style)
        if minimal_form:
            left = " - ".join(x for x in (etab, dip) if x) or dip or etab
            date_html = (
                f'<span class="cv-layout-formation-date">{_text(date)}</span>' if date else ""
            )
            mention_html = (
                f'<p class="cv-layout-formation-mention">{_text(mention)}</p>' if mention else ""
            )
            lines.append(
                f'<div class="cv-layout-formation cv-layout-formation--minimal{tone}">'
                f'<div class="cv-layout-formation-header">'
                f'<span class="cv-layout-formation-diplome">{_text(left)}</span>'
                f"{date_html}</div>{mention_html}</div>"
            )
            continue
        line = f"<strong>{_text(dip or etab)}</strong>"
        if etab and dip:
            line += f" - {_text(etab)}"
        if date:
            line += f' <span class="cv-layout-formation-date">{_text(date)}</span>'
        lines.append(f'<div class="cv-layout-formation{tone}"><p>{line}</p></div>')
    return _section_with_style("formations", "".join(lines), style, default_title=True)


def _render_certifications(cv: dict, limit: Any, style: dict[str, Any] | None = None) -> str:
    style = style or {}
    items = bind.resolve_certifications(cv, limit if isinstance(limit, int | float) else None)
    if not items:
        return _placeholder("Certifications")
    lines = []
    for c in items:
        parts = [
            x
            for x in [
                (c.get("nom") or "").strip(),
                (c.get("organisme") or "").strip(),
                (c.get("date") or "").strip(),
            ]
            if x
        ]
        lines.append(f"<p>{_text(' · '.join(parts))}</p>")
    return _section_with_style("certifications", "".join(lines), style, default_title=True)


def _render_projets(cv: dict, limit: Any, style: dict[str, Any] | None = None) -> str:
    style = style or {}
    items = bind.resolve_projets(cv, limit if isinstance(limit, int | float) else None)
    if not items:
        return _placeholder("Projets")
    lines = []
    for p in items:
        nom = (p.get("nom") or "").strip()
        desc = (p.get("description") or "").strip()
        line = f"<strong>{_text(nom)}</strong>"
        if desc:
            line += f" - {_text(desc)}"
        lines.append(f"<p>{line}</p>")
    return _section_with_style("projets", "".join(lines), style, default_title=True)


def _render_non_semantic(block: dict) -> str:
    btype = str(block.get("type") or "text")
    content = block.get("content") if isinstance(block.get("content"), str) else ""
    style = block.get("style") if isinstance(block.get("style"), dict) else {}

    if btype == "text":
        extra = []
        if style.get("italic"):
            extra.append("font-style:italic")
        if style.get("font_size"):
            extra.append(f"font-size:{_num(style.get('font_size'))}pt")
        if style.get("align"):
            extra.append(f"text-align:{_esc(str(style.get('align')))}")
        st = f' style="{";".join(extra)}"' if extra else ""
        return f'<p class="cv-layout-text"{st}>{_text(content) or _placeholder("Texte libre")}</p>'

    if btype == "title":
        align = _esc(str(style.get("align") or "left"))
        color = style.get("color")
        st = f"text-align:{align};"
        if color:
            st += f"color:{_esc(str(color))};"
        return f'<h3 class="cv-layout-title" style="{st}">{_text(content) or _placeholder("Titre")}</h3>'

    if btype == "shape:line":
        return _shape_line_html(block, style)

    if btype == "shape:rect":
        return _shape_rect_html(style, block)

    if btype in _SHAPE_SVG_PATHS:
        return _shape_svg_html(btype, style)

    if btype == "image":
        src = block.get("image_src") if isinstance(block.get("image_src"), str) else ""
        if not src.strip():
            return '<div class="cv-layout-photo-ph" aria-hidden="true"></div>'
        w = _num(block.get("w"))
        h = _num(block.get("h"))
        return _image_frame_html(src, style, w, h, "cv-layout-image")

    if btype == "icon":
        icon_name = (block.get("icon_name") or "").strip()
        color = _esc(str(style.get("color") or "#1e293b"))
        return (
            f'<div class="cv-layout-icon" style="color:{color};">'
            f"{_icon_svg(icon_name, paint=color)}</div>"
        )

    if btype == "qrcode":
        url = block.get("target_url") if isinstance(block.get("target_url"), str) else ""
        hint = _esc((url or "QR").strip()[:42] or "QR")
        return (
            f'<div class="cv-layout-qr" role="img" aria-label="QR code non généré">'
            f"QR<br/><span>{hint}</span></div>"
        )

    return _placeholder(btype)


def _section(key: str, body: str) -> str:
    return _section_with_style(key, body, {}, default_title=True)


def _dates_tone_mod(style: dict[str, Any]) -> str:
    """Couleur des dates formation : suit le token de titre / exp, pas toujours l’accent."""
    blob = f"{style.get('title_style') or ''} {style.get('exp_style') or ''}".lower()
    if "creative" in blob:
        return " cv-layout-dates--brand"
    if "modern" in blob:
        return " cv-layout-dates--ink"
    if "minimal" in blob:
        return " cv-layout-dates--soft"
    if any(t in blob for t in ("bold", "classic", "executive", "elegant")):
        return " cv-layout-dates--accent"
    return ""


def _title_style_modifier(title_style: str) -> str:
    """Classe BEM = token canvas exact (n’importe quel kebab)."""
    ts = _bem_token(title_style)
    return f" cv-layout-section-title--{ts}" if ts else ""


def _category_class(title_style: str) -> str:
    ts = _bem_token(title_style)
    if ts:
        return f"cv-layout-sidebar-category cv-layout-sidebar-category--{ts}"
    return "cv-layout-sidebar-category"


def _section_with_style(
    key: str,
    body: str,
    style: dict[str, Any] | None,
    *,
    default_title: bool,
) -> str:
    """Titres : même règle que FreeCanvasBlock (label / catégorie / show_section_title)."""
    style = style or {}
    skip_section = style.get("show_section_title") is False
    custom = str(style.get("section_label") or "").strip()
    category = str(style.get("sidebar_category") or "").strip()
    title_style = str(style.get("title_style") or "").strip()
    title_class = f"cv-layout-section-title{_title_style_modifier(title_style)}"
    sec_cls = "cv-layout-section"
    if "elegant" in title_style.lower():
        sec_cls += " cv-layout-section--elegant"
    headings: list[str] = []
    if not skip_section:
        if custom:
            headings.append(f'<h3 class="{title_class}">{_esc(custom)}</h3>')
        elif default_title and not category:
            title = SECTION_LABELS.get(key, key)
            headings.append(f'<h3 class="{title_class}">{_esc(title)}</h3>')
    if category and category != custom:
        headings.append(f'<p class="{_category_class(title_style)}">{_esc(category)}</p>')
    if not headings:
        return f'<div class="{sec_cls}">{body}</div>'
    return f'<div class="{sec_cls}">{"".join(headings)}{body}</div>'


def _placeholder(label: str) -> str:
    return f'<p class="cv-layout-placeholder">{_esc(label)}</p>'


def _typography_declarations(style: dict[str, Any]) -> list[str]:
    declarations: list[str] = []
    font_family = style.get("font_family")
    if isinstance(font_family, str) and font_family.strip():
        declarations.append(f"font-family:{_css_font_stack(font_family)}")
    if style.get("font_size") is not None:
        declarations.append(f"font-size:{_num(style.get('font_size'))}pt")
    color = style.get("color_body") or style.get("color")
    if isinstance(color, str) and color.strip():
        declarations.append(
            f"color:{_css_color(color) if color.startswith(('#', 'rgb')) else _css_value(color)}"
        )
    if style.get("bold"):
        declarations.append("font-weight:700")
    if style.get("italic") or style.get("font_style") == "italic":
        declarations.append("font-style:italic")
    decoration = []
    if style.get("underline"):
        decoration.append("underline")
    if style.get("strikethrough"):
        decoration.append("line-through")
    if decoration:
        declarations.append(f"text-decoration:{' '.join(decoration)}")
    if style.get("align"):
        declarations.append(f"text-align:{_css_value(str(style.get('align')))}")
    if style.get("opacity") is not None:
        declarations.append(f"opacity:{_num(style.get('opacity'), 1)}")
    if style.get("nowrap"):
        declarations.append("white-space:nowrap")
    return declarations


def _style_attr(declarations: list[str]) -> str:
    if not declarations:
        return ""
    return f' style="{";".join(declarations)}"'


def _image_radius(style: dict[str, Any]) -> str:
    radius_mm = style.get("border_radius_mm")
    if radius_mm is not None and _num(radius_mm) > 0:
        return f"{_num(radius_mm)}mm"
    shape = str(style.get("shape") or "rect")
    if shape == "circle":
        return "50%"
    if shape == "rounded":
        return "12px"
    return "0"


def _image_frame_html(
    src: str,
    style: dict[str, Any],
    block_w: float,
    block_h: float,
    img_class: str,
) -> str:
    focal_x = _num(style.get("focal_x"), 50)
    focal_y = _num(style.get("focal_y"), 50)
    zoom = max(1.0, _num(style.get("image_zoom"), 1))
    opacity = _num(style.get("opacity"), 1)
    image_style = (
        f"object-position:{focal_x}% {focal_y}%;"
        f"transform:scale({zoom});"
        f"transform-origin:{focal_x}% {focal_y}%;"
    )
    esc_src = _esc(src)
    shape = str(style.get("shape") or "rect")
    if shape == "circle" and block_w > 0 and block_h > 0:
        side = min(block_w, block_h)
        left = (block_w - side) / 2
        top = (block_h - side) / 2
        frame_style = (
            f"position:absolute;left:{left}mm;top:{top}mm;width:{side}mm;height:{side}mm;"
            f"border-radius:50%;box-sizing:border-box;opacity:{opacity};"
            f"{_image_border_css(style)}"
        )
        return (
            f'<div class="cv-layout-image-frame" style="position:relative;width:100%;height:100%;">'
            f'<div class="cv-layout-image-circle" style="{frame_style}">'
            f'<div class="cv-layout-image-clip">'
            f'<img class="{img_class}" src="{esc_src}" alt="" style="{image_style}"/>'
            f"</div></div></div>"
        )
    radius = _image_radius(style)
    frame_style = (
        f"border-radius:{radius};box-sizing:border-box;opacity:{opacity};"
        f"{_image_border_css(style)}"
    )
    return (
        f'<div class="cv-layout-image-frame" style="{frame_style}">'
        f'<div class="cv-layout-image-clip" style="border-radius:{radius}">'
        f'<img class="{img_class}" src="{esc_src}" alt="" style="{image_style}"/>'
        f"</div></div>"
    )


def _image_border_css(style: dict[str, Any]) -> str:
    """Bordure photo / image : mm numériques ou presets twin (`light`, `accent`, …)."""
    raw = style.get("photo_border")
    if raw is None:
        raw = style.get("image_border_mm")
    if raw is None:
        return ""

    preset = str(raw).strip().lower() if not isinstance(raw, int | float) else ""
    accent_border = "var(--layout-accent, #1e293b)"
    presets: dict[str, tuple[float, str]] = {
        # Canvas : light 3px, accent/thick Bold 0.8mm, thin ~2px, Exec 2.5px.
        "light": (0.79, "rgba(255, 255, 255, 0.3)"),
        "accent": (0.8, accent_border),
        "accent-thick": (0.8, accent_border),
        "accent-thin": (0.53, accent_border),
    }
    if preset in presets:
        mm, color = presets[preset]
        override = style.get("image_border_color") or style.get("photo_border_color")
        if isinstance(override, str) and override.strip() and preset != "light":
            color = _css_color(override)
        return f"border:{mm}mm solid {color};box-sizing:border-box;"

    if _num(raw) <= 0:
        return ""
    border_color = style.get("image_border_color") or style.get("photo_border_color") or "#1e293b"
    return (
        f"border:{_pdf_hairline_mm(_num(raw))}mm solid {_css_color(border_color)};"
        "box-sizing:border-box;"
    )


# Paths SVG alignés sur frontend/src/lib/canvasShapePresets.js (viewBox 0 0 100 100).
_SHAPE_SVG_PATHS: dict[str, str] = {
    "shape:circle": "M50,50 m-50,0 a50,50 0 1,0 100,0 a50,50 0 1,0 -100,0",
    "shape:ellipse": "M50,50 m-50,0 a50,30 0 1,0 100,0 a50,30 0 1,0 -100,0",
    "shape:triangle": "M50,5 L95,95 L5,95 Z",
    "shape:diamond": "M50,2 L98,50 L50,98 L2,50 Z",
    "shape:star": "M50,2 L61,38 L98,38 L67,60 L78,96 L50,74 L22,96 L33,60 L2,38 L39,38 Z",
    "shape:hexagon": "M50,2 L93,27 L93,73 L50,98 L7,73 L7,27 Z",
    "shape:frame": "M0,0 H100 V100 H0 Z",
    "shape:arrow-right": "M2,50 H72 M72,50 L55,32 M72,50 L55,68",
    "shape:arrow-left": "M98,50 H28 M28,50 L45,32 M28,50 L45,68",
    "shape:arrow-up": "M50,98 V28 M50,28 L32,45 M50,28 L68,45",
    "shape:arrow-down": "M50,2 V72 M50,72 L32,55 M50,72 L68,55",
    "shape:cross": "M50,10 V90 M10,50 H90",
    "shape:heart": (
        "M50,88 C20,62 2,42 2,26 C2,12 14,2 28,2 C38,2 46,8 50,16 "
        "C54,8 62,2 72,2 C86,2 98,12 98,26 C98,42 80,62 50,88 Z"
    ),
}

_STROKE_ONLY_SHAPES = frozenset(
    {
        "shape:frame",
        "shape:arrow-right",
        "shape:arrow-left",
        "shape:arrow-up",
        "shape:arrow-down",
        "shape:cross",
    }
)


def _shape_line_html(block: dict, style: dict[str, Any]) -> str:
    color = _esc(str(style.get("color") or "#1e293b"))
    stroke = _pdf_hairline_mm(_num(style.get("stroke_width"), _num(block.get("h"), 0.6)))
    opacity = _num(style.get("opacity"), 1)
    w = _num(block.get("w"), 1)
    h = _num(block.get("h"), stroke)
    vertical = str(style.get("orientation") or "") == "vertical" or (w < h and w <= 2.5)
    if vertical:
        margin = max(0.0, (w - stroke) / 2)
        return (
            f'<div class="cv-layout-shape-line" role="presentation" '
            f'style="background:{color};width:{stroke}mm;height:100%;'
            f'margin-left:{margin}mm;opacity:{opacity};"></div>'
        )
    margin = max(0.0, (h - stroke) / 2)
    return (
        f'<div class="cv-layout-shape-line" role="presentation" '
        f'style="background:{color};height:{stroke}mm;width:100%;'
        f'margin-top:{margin}mm;opacity:{opacity};"></div>'
    )


def _shape_rect_html(style: dict[str, Any], block: dict | None = None) -> str:
    bg = _esc(str(style.get("color") or style.get("bg") or "#e2e8f0"))
    opacity = _num(style.get("opacity"), 1)
    radius = style.get("border_radius_mm")
    radius_css = f"{_num(radius)}mm" if radius is not None and _num(radius) > 0 else "0"
    stroke_w = _num(style.get("stroke_width"), 0)
    stroke_color = _esc(str(style.get("stroke_color") or style.get("color") or "#17171c"))
    border = f"border:{_pdf_hairline_mm(stroke_w)}mm solid {stroke_color};" if stroke_w > 0 else ""
    extra = ""
    w = _num((block or {}).get("w"), 1)
    h = _num((block or {}).get("h"), 1)
    if h > 0 and h <= w and h < 0.45:
        extra = f"height:{_pdf_hairline_mm(h)}mm;width:100%;"
    elif w > 0 and w < h and w < 0.45:
        extra = f"width:{_pdf_hairline_mm(w)}mm;height:100%;"
    return (
        f'<div class="cv-layout-shape-rect" role="presentation" '
        f'style="background:{bg};border-radius:{radius_css};opacity:{opacity};'
        f'{border}{extra}"></div>'
    )


def _shape_svg_html(btype: str, style: dict[str, Any]) -> str:
    path = _SHAPE_SVG_PATHS.get(btype)
    if not path:
        return _placeholder(btype)
    fill = _esc(str(style.get("color") or style.get("bg") or "#eeece7"))
    stroke = _esc(str(style.get("stroke_color") or style.get("color") or "#17171c"))
    stroke_w = _num(style.get("stroke_width"), 0)
    opacity = _num(style.get("opacity"), 1)
    stroke_only = btype in _STROKE_ONLY_SHAPES
    fill_attr = "none" if stroke_only else fill
    # Approximation front CanvasShapeSvg : stroke * 6 dans viewBox 0..100
    svg_stroke = max(1.5, stroke_w * 8) if stroke_only else (stroke_w * 6 if stroke_w > 0 else 0)
    return (
        f'<svg class="cv-layout-shape-svg" viewBox="0 0 100 100" preserveAspectRatio="none" '
        f'aria-hidden="true" style="opacity:{opacity}">'
        f'<path d="{path}" fill="{fill_attr}" stroke="{stroke}" '
        f'stroke-width="{svg_stroke}" stroke-linecap="round" stroke-linejoin="round" '
        f'vector-effect="non-scaling-stroke"/></svg>'
    )


def _icon_svg(name: str, fill: str = "currentColor", paint: str | None = None) -> str:
    """Glyphs hi2 outline (même famille que FreeCanvasBlock), stroke hex pour WeasyPrint."""
    color = _esc(paint or fill or "currentColor")
    paths = {
        "HiPhone": (
            '<path stroke-linecap="round" stroke-linejoin="round" '
            'd="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 '
            "2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.494-.125"
            "-1.002.116-1.226.582l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 "
            "12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.466"
            "-.224.707-.732.582-1.226L6.963 3.602a1.125 1.125 0 0 0-1.091-.852H4.5"
            'A2.25 2.25 0 0 0 2.25 4.5v2.25Z"/>'
        ),
        "HiDevicePhoneMobile": (
            '<path stroke-linecap="round" stroke-linejoin="round" '
            'd="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 '
            "2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25"
            '-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3"/>'
        ),
        "HiEnvelope": (
            '<path stroke-linecap="round" stroke-linejoin="round" '
            'd="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1'
            "-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0"
            "-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 "
            '2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"/>'
        ),
        "HiLink": (
            '<path stroke-linecap="round" stroke-linejoin="round" '
            'd="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1'
            "-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364"
            '-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244"/>'
        ),
        "HiMapPin": (
            '<path stroke-linecap="round" stroke-linejoin="round" '
            'd="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/>'
            '<path stroke-linecap="round" stroke-linejoin="round" '
            'd="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 '
            '7.5 0 1 1 15 0Z"/>'
        ),
    }
    path = paths.get(name) or (
        '<path stroke-linecap="round" stroke-linejoin="round" '
        'd="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 '
        "2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 "
        '1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z"/>'
    )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" '
        f'fill="none" stroke="{color}" stroke-width="1.5" aria-hidden="true">'
        f"{path}</svg>"
    )


def _local_font_faces_css() -> str:
    """@font-face locaux (pdf_export/fonts) — fiables pour WeasyPrint sans réseau."""
    faces = [
        ("Inter", 400, "Inter-Regular.ttf"),
        ("Inter", 600, "Inter-SemiBold.ttf"),
        ("Inter", 700, "Inter-Bold.ttf"),
        ("Plus Jakarta Sans", 400, "PlusJakartaSans-Regular.ttf"),
        ("Plus Jakarta Sans", 600, "PlusJakartaSans-SemiBold.ttf"),
        ("Plus Jakarta Sans", 700, "PlusJakartaSans-Bold.ttf"),
        ("Plus Jakarta Sans", 800, "PlusJakartaSans-ExtraBold.ttf"),
    ]
    chunks: list[str] = []
    for family, weight, filename in faces:
        url = f"pdf_export/fonts/{filename}"
        chunks.append(
            "@font-face {\n"
            f"  font-family: '{family}';\n"
            f"  font-weight: {weight};\n"
            "  font-style: normal;\n"
            f"  src: url('{url}') format('truetype');\n"
            "}\n"
        )
    return "".join(chunks)


def _css_font_stack(value: str) -> str:
    """Stack CSS sûr (pas d'html.escape — WeasyPrint ne décode pas les entités)."""
    cleaned = re.sub(r"[^a-zA-Z0-9\s,'\"\-]", "", value or "").strip()
    return cleaned[:180] or "Inter, sans-serif"


def _css_color(value: Any) -> str:
    raw = str(value or "").strip()
    if re.fullmatch(r"#[0-9a-fA-F]{3,8}", raw):
        return raw
    lower = raw.lower()
    if (lower.startswith("rgb(") or lower.startswith("rgba(")) and raw.endswith(")"):
        if raw.count("(") == 1 and raw.count(")") == 1 and len(raw) <= 64:
            inner = raw[raw.find("(") + 1 : -1]
            if re.fullmatch(r"[0-9.,%\s]+", inner):
                return raw
    return "#1e293b"


def _css_value(value: str) -> str:
    return _esc(str(value).replace(";", "").strip())


def _text(s: str) -> str:
    raw = s if isinstance(s, str) else ("" if s is None else str(s))
    from backend.html_sanitize import looks_like_rich_html, sanitize_rich_text_html

    if looks_like_rich_html(raw):
        return sanitize_rich_text_html(raw)
    return html.escape(raw, quote=True)


def _esc(s: str) -> str:
    return html.escape(s, quote=True)


def _pdf_hairline_mm(raw: float, minimum: float = 0.4) -> float:
    """WeasyPrint droppe les filets CSS < ~0.4 mm."""
    try:
        val = float(raw)
    except (TypeError, ValueError):
        return minimum
    if val <= 0:
        return minimum
    return max(val, minimum)


def _num(v: Any, default: float = 0) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return default
