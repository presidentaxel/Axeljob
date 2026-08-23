"""Rendu d'un couple (cv, layout v3) en HTML pour preview / WeasyPrint (P3.8)."""

from __future__ import annotations

import html
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
}

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
.cv-layout-block__inner {
  width: 100%;
  height: 100%;
  overflow: hidden;
  padding: 0;
}
.cv-layout-block[data-type="text"] .cv-layout-block__inner,
.cv-layout-block[data-type="title"] .cv-layout-block__inner,
.cv-layout-block[data-type="resume"] .cv-layout-block__inner {
  padding: 1mm 1.5mm;
}
.cv-layout-identity-name {
  font-family: var(--layout-font-heading, var(--layout-font-body, 'Inter', sans-serif));
  font-size: 14pt;
  font-weight: 700;
  line-height: 1.2;
  color: var(--layout-accent, #1e293b);
}
.cv-layout-identity-title { font-size: 10pt; margin-top: 1mm; color: #475569; }
.cv-layout-identity--inline-title {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0 1.5mm;
}
.cv-layout-identity--inline-title .cv-layout-identity-title { margin-top: 0; }
.cv-layout-identity-sep { color: #64748b; font-weight: 500; }
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
  justify-content: center;
  align-items: center;
  gap: 2mm;
  margin: 0;
  font-size: 8pt;
  color: #334155;
  text-align: center;
}
/* Zones sombres (sidebar-left Modern/Creative, header Classic/Bold) : texte clair. */
.cv-layout-block[data-zone="sidebar"] .cv-layout-identity-name,
.cv-layout-block[data-zone="header"] .cv-layout-identity-name {
  color: #ffffff;
}
.cv-layout-block[data-zone="sidebar"] .cv-layout-identity-title,
.cv-layout-block[data-zone="header"] .cv-layout-identity-title,
.cv-layout-block[data-zone="sidebar"] .cv-layout-identity-sep,
.cv-layout-block[data-zone="header"] .cv-layout-identity-sep {
  color: rgba(255, 255, 255, 0.85);
}
.cv-layout-block[data-zone="sidebar"] .cv-layout-contact p,
.cv-layout-block[data-zone="sidebar"] .cv-layout-contact--header-bar,
.cv-layout-block[data-zone="header"] .cv-layout-contact p,
.cv-layout-block[data-zone="header"] .cv-layout-contact--header-bar,
.cv-layout-block[data-zone="sidebar"] .cv-layout-sidebar-item,
.cv-layout-block[data-zone="header"] .cv-layout-sidebar-item,
.cv-layout-block[data-zone="sidebar"] .cv-layout-block__inner,
.cv-layout-block[data-zone="header"] .cv-layout-block__inner {
  color: rgba(255, 255, 255, 0.92);
}
.cv-layout-block[data-zone="sidebar"] .cv-layout-identity-divider,
.cv-layout-block[data-zone="header"] .cv-layout-identity-divider {
  background: rgba(255, 255, 255, 0.25);
}
.cv-layout-block[data-zone="sidebar"] .cv-layout-section-title--twin-sidebar,
.cv-layout-block[data-zone="sidebar"] .cv-layout-section-title--modern-sidebar,
.cv-layout-block[data-zone="sidebar"] .cv-layout-sidebar-category {
  color: rgba(255, 255, 255, 0.94);
  border-bottom-color: rgba(255, 255, 255, 0.28);
}
.cv-layout-block[data-zone="sidebar"] .cv-layout-section-title--creative-sidebar {
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
.cv-layout-contact-icon svg { width: 100%; height: 100%; display: block; }
.cv-layout-section-title {
  font-family: var(--layout-font-heading, var(--layout-font-body, 'Inter', sans-serif));
  margin: 0 0 1.5mm;
  font-size: 9pt;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--layout-section-title, var(--layout-accent, #1e293b));
  border-bottom: 0.25mm solid var(--layout-accent, #1e293b);
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
.cv-layout-exp-header { display: flex; justify-content: space-between; gap: 2mm; align-items: baseline; font-weight: 600; }
.cv-layout-exp-dates { font-weight: 500; color: var(--layout-sidebar, #64748b); white-space: nowrap; font-size: 8pt; }
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
}
.cv-layout-bullets--dash.cv-layout-bullets--chevron li::before {
  content: '▸';
  color: var(--layout-accent, #1e293b);
}
.cv-layout-chips { display: flex; flex-wrap: wrap; gap: 1mm; }
.cv-layout-sidebar-item { margin: 0 0 0.5mm; font-size: 8pt; }
.cv-layout-chip {
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 2px;
  padding: 0.5mm 2mm;
  font-size: 8pt;
}
.cv-layout-photo { width: 100%; height: 100%; object-fit: cover; display: block; }
.cv-layout-photo--round { border-radius: 50%; }
.cv-layout-photo-ph { width: 100%; height: 100%; background: #e2e8f0; }
.cv-layout-image-frame { width: 100%; height: 100%; overflow: hidden; }
.cv-layout-image-circle { width: 100%; height: 100%; }
.cv-layout-image-circle .cv-layout-photo,
.cv-layout-image-circle .cv-layout-image { width: 100%; height: 100%; object-fit: cover; display: block; }
.cv-layout-image { width: 100%; height: 100%; object-fit: cover; display: block; }
.cv-layout-icon { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
.cv-layout-icon svg { width: 100%; height: 100%; display: block; }
.cv-layout-identity-divider {
  margin-top: 1.5mm;
  height: 0.35mm;
  background: var(--layout-accent, #1e293b);
  opacity: 0.55;
  width: 100%;
}
.cv-layout-contact--uppercase {
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.cv-layout-contact--with-divider p {
  border-bottom: 0.15mm solid rgba(30, 41, 59, 0.18);
  padding-bottom: 0.6mm;
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
.cv-layout-section-title--sidebar-bar {
  border-bottom: none;
  border-left: 0.9mm solid var(--layout-accent, #1e293b);
  padding-left: 1.5mm;
  padding-bottom: 0;
}
/* Twins catalogue (AXE-38). */
.cv-layout-section-title--twin-main {
  border-bottom: 0.55mm solid var(--layout-accent, #1e293b);
  letter-spacing: 0.04em;
  padding-bottom: 0.6mm;
}
.cv-layout-section-title--twin-sidebar,
.cv-layout-section-title--modern-sidebar {
  font-size: 8pt;
  letter-spacing: 0.08em;
  color: var(--layout-section-title, var(--layout-accent, #1e293b));
  border-bottom: 0.25mm solid color-mix(in srgb, var(--layout-accent, #1e293b) 35%, transparent);
}
.cv-layout-section-title--creative-sidebar {
  font-size: 8pt;
  letter-spacing: 0.08em;
  color: var(--layout-accent, #f59e0b);
  border-bottom: 0.25mm solid rgba(255, 255, 255, 0.28);
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

    accent = _esc(merged_theme.get("color_accent") or "#1e293b")
    section_title = _esc(
        merged_theme.get("color_section_title") or merged_theme.get("color_accent") or "#1e293b"
    )
    sidebar = _esc(merged_theme.get("color_sidebar") or "#64748b")
    header = _esc(merged_theme.get("color_header") or sidebar)
    font_heading = _esc(merged_theme.get("font_heading") or "Inter")
    font_body = _esc(merged_theme.get("font_body") or font_heading)
    template_id = str(merged_theme.get("template_id") or "").strip().lower()
    tpl_class = f" cv-layout-doc--tpl-{_esc(template_id)}" if template_id else ""

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
        blocks_html = "".join(_render_block(cv, b) for b in sorted_blocks)
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
{LAYOUT_CSS}
:root {{
  --layout-accent: {accent};
  --layout-section-title: {section_title};
  --layout-sidebar: {sidebar};
  --layout-header: {header};
  --layout-font-heading: {font_heading};
  --layout-font-body: {font_body};
}}
</style>
</head>
<body class="cv-layout-body">
<div class="cv-layout-doc{tpl_class}">{body}</div>
</body>
</html>"""


def _render_block(cv: dict, block: dict) -> str:
    btype = str(block.get("type") or "text")
    x = _num(block.get("x"))
    y = _num(block.get("y"))
    w = _num(block.get("w"), 20)
    h = _num(block.get("h"), 10)
    z = int(block.get("z") or 0)
    style_attr = f"left:{x}mm;top:{y}mm;width:{w}mm;height:{h}mm;z-index:{z};"
    block_style = block.get("style") if isinstance(block.get("style"), dict) else {}
    inner_style = _style_attr(_typography_declarations(block_style))
    inner = _render_semantic(cv, block) if btype in SEMANTIC_TYPES else _render_non_semantic(block)
    bid = _esc(str(block.get("id") or ""))
    zone = str(block_style.get("zone") or "").strip()
    zone_attr = f' data-zone="{_esc(zone)}"' if zone else ""
    return (
        f'<div class="cv-layout-block" data-block-id="{bid}" data-type="{_esc(btype)}"'
        f"{zone_attr} "
        f'style="{style_attr}">'
        f'<div class="cv-layout-block__inner"{inner_style}>{inner}</div></div>'
    )


def _render_semantic(cv: dict, block: dict) -> str:
    btype = str(block.get("type") or "")
    binding = block.get("bind")
    limit = block.get("limit")
    style = block.get("style") if isinstance(block.get("style"), dict) else {}
    fmt = str(style.get("format") or "default")

    if btype == "identity":
        name = bind.resolve_bound_text(cv, ["prenom", "nom"])
        title = bind.resolve_bound_text(cv, "titre_professionnel")
        align = _esc(str(style.get("align") or "left"))
        name_html = (
            f'<div class="cv-layout-identity-name" style="text-align:{align}">'
            f'{_text(name or "Prénom Nom")}</div>'
        )
        if style.get("header_layout") == "inline-title":
            parts = [f'<span class="cv-layout-identity-name">{_text(name or "Prénom Nom")}</span>']
            if title:
                parts.append('<span class="cv-layout-identity-sep"> - </span>')
                parts.append(f'<span class="cv-layout-identity-title">{_text(title)}</span>')
            body = (
                f'<div class="cv-layout-identity cv-layout-identity--inline-title" '
                f'style="text-align:{align}">{"".join(parts)}</div>'
            )
        else:
            parts = [name_html]
            if title:
                parts.append(f'<div class="cv-layout-identity-title">{_text(title)}</div>')
            body = f'<div class="cv-layout-identity">{"".join(parts)}</div>'
        if style.get("identity_divider") or style.get("title_accent"):
            body += '<div class="cv-layout-identity-divider" aria-hidden="true"></div>'
        return body

    if btype == "photo":
        url = (cv.get("photo_url") or "").strip() if isinstance(cv, dict) else ""
        if not url:
            return '<div class="cv-layout-photo-ph" aria-hidden="true"></div>'
        w = _num(block.get("w"))
        h = _num(block.get("h"))
        return _image_frame_html(url, style, w, h, "cv-layout-photo")

    if btype == "contact":
        return _render_contact(cv, style)

    if btype == "resume":
        text = bind.resolve_bound_text(cv, binding if binding else "resume")
        body = f'<p class="cv-layout-text">{_text(text) or _placeholder("Résumé")}</p>'
        return _section_with_style("resume", body, style, default_title=False)

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
        if not items:
            return _section_with_style(
                "skills", _placeholder("Compétences"), style, default_title=False
            )
        list_fmt = str(style.get("list_format") or fmt or "default")
        if fmt == "chips" or list_fmt == "chips":
            inner = "".join(f'<span class="cv-layout-chip">{_text(s)}</span>' for s in items)
            body = f'<div class="cv-layout-chips">{inner}</div>'
        elif list_fmt == "list" or fmt == "list":
            body = "".join(f'<p class="cv-layout-sidebar-item">{_text(s)}</p>' for s in items)
        else:
            body = f"<p>{_text(', '.join(items))}</p>"
        return _section_with_style("skills", body, style, default_title=False)

    if btype == "languages":
        items = bind.resolve_langues(cv)
        if not items:
            return _section_with_style(
                "languages", _placeholder("Langues"), style, default_title=True
            )
        lang_labels: list[str] = []
        for row in items:
            if not isinstance(row, dict):
                continue
            label = (row.get("langue") or "").strip()
            niveau = (row.get("niveau") or "").strip()
            if niveau:
                label = f"{label} ({niveau})"
            if label:
                lang_labels.append(label)
        text = ", ".join(lang_labels)
        return _section_with_style("languages", f"<p>{_text(text)}</p>", style, default_title=True)

    return _placeholder(btype)


def _render_contact(cv: dict, style: dict[str, Any]) -> str:
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
        return (
            f'<span class="cv-layout-contact-icon" aria-hidden="true">'
            f"{_icon_svg(icon_name)}</span>"
        )

    if header_bar:
        segments = []
        for icon_name, val in values:
            icon = _icon_html(icon_name)
            segments.append(f'<span class="cv-layout-contact-segment">{icon}{_text(val)}</span>')
        body = (
            f'<div class="{class_attr} cv-layout-contact--header-bar">' f'{"".join(segments)}</div>'
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
        return _section_with_style(
            "experiences", _placeholder("Expériences"), style, default_title=True
        )

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
            header = left
            if date_line:
                header += f'<span class="cv-layout-exp-dates">{_text(date_line)}</span>'
            role = ""
        else:
            header = f"{ats_org}<strong>{_text(ent or poste)}</strong>"
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
        mid = (
            f"{bullets_html}{clients_html}"
            if clients_after_bullets
            else f"{clients_html}{bullets_html}"
        )
        rows.append(
            f'<div class="cv-layout-exp{compact}">'
            f'<div class="cv-layout-exp-header">{header}</div>{role}{mid}</div>'
        )
    return _section_with_style("experiences", "".join(rows), style, default_title=True)


def _render_formations(cv: dict, limit: Any, style: dict[str, Any] | None = None) -> str:
    style = style or {}
    items = bind.resolve_formations(cv, limit if isinstance(limit, int | float) else None)
    if not items:
        return _section_with_style(
            "formations", _placeholder("Formations"), style, default_title=True
        )
    lines = []
    for f in items:
        dip = (f.get("diplome") or "").strip()
        etab = (f.get("etablissement") or "").strip()
        date = (f.get("date") or "").strip()
        line = f"<strong>{_text(dip or etab)}</strong>"
        if etab and dip:
            line += f" - {_text(etab)}"
        if date:
            line += f' <span class="cv-layout-exp-dates">({_text(date)})</span>'
        lines.append(f"<p>{line}</p>")
    return _section_with_style("formations", "".join(lines), style, default_title=True)


def _render_certifications(cv: dict, limit: Any, style: dict[str, Any] | None = None) -> str:
    style = style or {}
    items = bind.resolve_certifications(cv, limit if isinstance(limit, int | float) else None)
    if not items:
        return _section_with_style(
            "certifications", _placeholder("Certifications"), style, default_title=True
        )
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
        return _section_with_style("projets", _placeholder("Projets"), style, default_title=True)
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
        return _shape_rect_html(style)

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
        return f'<div class="cv-layout-icon" style="color:{color};">{_icon_svg(icon_name)}</div>'

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


def _title_style_modifier(title_style: str) -> str:
    """Classe BEM pour title_style canvas twin / legacy."""
    ts = (title_style or "").strip()
    if not ts:
        return ""
    if ts in {"underline-accent", "pill", "sidebar-bar"}:
        return f" cv-layout-section-title--{ts}"
    if ts == "bold-main":
        return " cv-layout-section-title--sidebar-bar"
    if ts in {
        "modern-main",
        "creative-main",
        "classic-main",
        "executive-main",
        "elegant-section",
        "minimal-section",
    }:
        return " cv-layout-section-title--twin-main"
    if ts in {"modern-sidebar", "sidebar"}:
        return " cv-layout-section-title--modern-sidebar"
    if ts in {"creative-sidebar", "sidebar-creative"}:
        return " cv-layout-section-title--creative-sidebar"
    if ts in {
        "bold-sidebar-section",
        "executive-sidebar-section",
        "bold-sidebar-category",
        "executive-sidebar-category",
    }:
        return " cv-layout-section-title--twin-sidebar"
    return ""


def _section_with_style(
    key: str,
    body: str,
    style: dict[str, Any] | None,
    *,
    default_title: bool,
) -> str:
    """Titre de section : section_label > sidebar_category > défaut SECTION_LABELS."""
    style = style or {}
    custom = str(style.get("section_label") or "").strip()
    category = str(style.get("sidebar_category") or "").strip()
    title_style = str(style.get("title_style") or "").strip()
    title_class = f"cv-layout-section-title{_title_style_modifier(title_style)}"
    headings: list[str] = []
    if custom:
        headings.append(f'<h3 class="{title_class}">{_esc(custom)}</h3>')
    elif default_title:
        title = SECTION_LABELS.get(key, key)
        headings.append(f'<h3 class="{title_class}">{_esc(title)}</h3>')
    if category and category != custom:
        headings.append(f'<p class="cv-layout-sidebar-category">{_esc(category)}</p>')
    if not headings:
        return f'<div class="cv-layout-section">{body}</div>'
    return f'<div class="cv-layout-section">{"".join(headings)}{body}</div>'


def _placeholder(label: str) -> str:
    return f'<p class="cv-layout-placeholder">{_esc(label)}</p>'


def _typography_declarations(style: dict[str, Any]) -> list[str]:
    declarations: list[str] = []
    font_family = style.get("font_family")
    if isinstance(font_family, str) and font_family.strip():
        declarations.append(f"font-family:{_css_value(font_family)}")
    if style.get("font_size") is not None:
        declarations.append(f"font-size:{_num(style.get('font_size'))}pt")
    color = style.get("color_body") or style.get("color")
    if isinstance(color, str) and color.strip():
        declarations.append(f"color:{_css_value(color)}")
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
            f"border-radius:50%;overflow:hidden;opacity:{opacity};"
            f"{_image_border_css(style)}"
        )
        return (
            f'<div class="cv-layout-image-frame" style="position:relative;width:100%;height:100%;">'
            f'<div class="cv-layout-image-circle" style="{frame_style}">'
            f'<img class="{img_class}" src="{esc_src}" alt="" style="{image_style}"/>'
            f"</div></div>"
        )
    radius = _image_radius(style)
    frame_style = f"border-radius:{radius};opacity:{opacity};{_image_border_css(style)}"
    return (
        f'<div class="cv-layout-image-frame" style="{frame_style}">'
        f'<img class="{img_class}" src="{esc_src}" alt="" style="{image_style}"/>'
        f"</div>"
    )


def _image_border_css(style: dict[str, Any]) -> str:
    """Bordure photo / image : mm numériques ou presets twin (`light`, `accent`, …)."""
    raw = style.get("photo_border")
    if raw is None:
        raw = style.get("image_border_mm")
    if raw is None:
        return ""

    preset = str(raw).strip().lower() if not isinstance(raw, (int, float)) else ""
    accent_border = "var(--layout-accent, #1e293b)"
    presets: dict[str, tuple[float, str]] = {
        "light": (0.8, "rgba(255, 255, 255, 0.3)"),
        "accent": (0.8, accent_border),
        "accent-thick": (1.1, accent_border),
        "accent-thin": (0.45, accent_border),
    }
    if preset in presets:
        mm, color = presets[preset]
        override = style.get("image_border_color") or style.get("photo_border_color")
        if isinstance(override, str) and override.strip() and preset != "light":
            color = _css_value(override.strip())
        return f"border:{mm}mm solid {color};"

    if _num(raw) <= 0:
        return ""
    border_color = style.get("image_border_color") or style.get("photo_border_color") or "#1e293b"
    return f"border:{_num(raw)}mm solid {_css_value(str(border_color))};"


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
    stroke = _num(style.get("stroke_width"), _num(block.get("h"), 0.6))
    if stroke <= 0:
        stroke = 0.6
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


def _shape_rect_html(style: dict[str, Any]) -> str:
    bg = _esc(str(style.get("color") or style.get("bg") or "#e2e8f0"))
    opacity = _num(style.get("opacity"), 1)
    radius = style.get("border_radius_mm")
    radius_css = f"{_num(radius)}mm" if radius is not None and _num(radius) > 0 else "0"
    stroke_w = _num(style.get("stroke_width"), 0)
    stroke_color = _esc(str(style.get("stroke_color") or style.get("color") or "#17171c"))
    border = f"border:{stroke_w}mm solid {stroke_color};" if stroke_w > 0 else ""
    return (
        f'<div class="cv-layout-shape-rect" role="presentation" '
        f'style="background:{bg};border-radius:{radius_css};opacity:{opacity};{border}"></div>'
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


def _icon_svg(name: str) -> str:
    paths = {
        "HiPhone": (
            '<path d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 '
            "2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106a1.125 "
            "1.125 0 0 0-1.173.417l-.97 1.293a1.125 1.125 0 0 1-1.21.38 "
            "6.824 6.824 0 0 1-4.143-4.143 1.125 1.125 0 0 1 .38-1.21l1.293-.97"
            "c.363-.272.527-.739.417-1.173L9.963 6.102A1.125 1.125 0 0 0 "
            '8.872 5.25H7.5A2.25 2.25 0 0 0 5.25 7.5v-.75Z"/>'
        ),
        "HiDevicePhoneMobile": (
            '<path d="M10.5 1.5A2.25 2.25 0 0 0 8.25 3.75v16.5a2.25 2.25 0 0 0 '
            "2.25 2.25h3a2.25 2.25 0 0 0 2.25-2.25V3.75A2.25 2.25 0 0 0 "
            '13.5 1.5h-3Zm1.5 18.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z"/>'
        ),
        "HiEnvelope": (
            '<path d="M1.5 8.67v8.58A2.25 2.25 0 0 0 3.75 19.5h16.5a2.25 2.25 '
            '0 0 0 2.25-2.25V8.67l-9.6 5.76a1.75 1.75 0 0 1-1.8 0L1.5 8.67Z"/>'
            '<path d="M22.5 6.75v-.25a2.25 2.25 0 0 0-2.25-2.25H3.75A2.25 '
            '2.25 0 0 0 1.5 6.5v.25l10.35 6.21a.25.25 0 0 0 .3 0L22.5 6.75Z"/>'
        ),
        "HiLink": (
            '<path d="M19.902 4.098a3.75 3.75 0 0 0-5.303 0l-2.122 2.121a.75.75 '
            "0 1 0 1.061 1.061l2.121-2.121a2.25 2.25 0 0 1 3.182 3.182l-2.121 "
            "2.121a2.25 2.25 0 0 1-3.182 0 .75.75 0 1 0-1.061 1.061 3.75 "
            '3.75 0 0 0 5.303 0l2.122-2.121a3.75 3.75 0 0 0 0-5.304Z"/>'
            '<path d="M11.523 12.477a.75.75 0 0 0-1.061 0L8.34 14.598a2.25 2.25 '
            "0 0 1-3.182-3.182l2.121-2.121a2.25 2.25 0 0 1 3.182 0 .75.75 "
            "0 1 0 1.061-1.061 3.75 3.75 0 0 0-5.303 0L4.098 10.355a3.75 "
            '3.75 0 0 0 5.303 5.303l2.122-2.121a.75.75 0 0 0 0-1.061Z"/>'
        ),
        "HiMapPin": (
            '<path fill-rule="evenodd" d="M12 2.25a7.5 7.5 0 0 0-7.5 7.5c0 '
            "5.25 6.75 12 7.5 12s7.5-6.75 7.5-12a7.5 7.5 0 0 0-7.5-7.5Zm0 "
            '10.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clip-rule="evenodd"/>'
        ),
    }
    path = paths.get(name) or (
        '<path fill-rule="evenodd" d="M12 2.25a9.75 9.75 0 1 0 0 19.5 9.75 '
        "9.75 0 0 0 0-19.5ZM8.25 12a3.75 3.75 0 1 1 7.5 0 3.75 3.75 "
        '0 0 1-7.5 0Z" clip-rule="evenodd"/>'
    )
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" '
        'fill="currentColor" aria-hidden="true">'
        f"{path}</svg>"
    )


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


def _num(v: Any, default: float = 0) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return default
