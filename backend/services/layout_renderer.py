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
.cv-layout-contact p { margin: 0 0 0.5mm; font-size: 8pt; color: #334155; }
.cv-layout-section-title {
  font-family: var(--layout-font-heading, var(--layout-font-body, 'Inter', sans-serif));
  margin: 0 0 1.5mm;
  font-size: 9pt;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--layout-accent, #1e293b);
  border-bottom: 0.25mm solid rgba(30, 41, 59, 0.35);
  padding-bottom: 0.4mm;
}
.cv-layout-exp { margin-bottom: 2mm; }
.cv-layout-exp-header { display: flex; justify-content: space-between; gap: 2mm; font-weight: 600; }
.cv-layout-exp-dates { font-weight: 500; color: #64748b; white-space: nowrap; font-size: 8pt; }
.cv-layout-exp-role { color: #64748b; font-size: 8pt; margin-bottom: 0.5mm; }
.cv-layout-bullets { margin: 0.5mm 0 0 3mm; padding: 0; }
.cv-layout-bullets li { margin-bottom: 0.3mm; }
.cv-layout-chips { display: flex; flex-wrap: wrap; gap: 1mm; }
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
.cv-layout-shape-line, .cv-layout-shape-rect { width: 100%; height: 100%; }
.cv-layout-title {
  margin: 0;
  font-family: var(--layout-font-heading, var(--layout-font-body, 'Inter', sans-serif));
  font-size: 11pt;
  font-weight: 700;
}
.cv-layout-text { margin: 0; }
.cv-layout-placeholder { color: #94a3b8; font-style: italic; font-size: 8pt; }
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
    font_heading = _esc(merged_theme.get("font_heading") or "Inter")
    font_body = _esc(merged_theme.get("font_body") or font_heading)

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
  --layout-font-heading: {font_heading};
  --layout-font-body: {font_body};
}}
</style>
</head>
<body class="cv-layout-body">
<div class="cv-layout-doc">{body}</div>
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
    return (
        f'<div class="cv-layout-block" data-block-id="{bid}" data-type="{_esc(btype)}" '
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
        parts = [
            f'<div class="cv-layout-identity-name" style="text-align:{align}">{_text(name or "Prénom Nom")}</div>'
        ]
        if title:
            parts.append(f'<div class="cv-layout-identity-title">{_text(title)}</div>')
        return f'<div class="cv-layout-identity">{"".join(parts)}</div>'

    if btype == "photo":
        url = (cv.get("photo_url") or "").strip() if isinstance(cv, dict) else ""
        if not url:
            return '<div class="cv-layout-photo-ph" aria-hidden="true"></div>'
        round_cls = " cv-layout-photo--round" if style.get("shape") == "circle" else ""
        return f'<img class="cv-layout-photo{round_cls}" src="{_esc(url)}" alt=""/>'

    if btype == "contact":
        lines = []
        for key, label in (
            ("telephone", "Tél."),
            ("email", "Email"),
            ("linkedin", "LinkedIn"),
        ):
            val = bind.resolve_bound_text(cv, key)
            if val:
                lines.append(f"<p><span>{_esc(label)}</span> {_text(val)}</p>")
        return f'<div class="cv-layout-contact">{"".join(lines) or _placeholder("Contact")}</div>'

    if btype == "resume":
        text = bind.resolve_bound_text(cv, binding if binding else "resume")
        return f'<p class="cv-layout-text">{_text(text) or _placeholder("Résumé")}</p>'

    if btype == "experiences":
        return _render_experiences(cv, limit, fmt)

    if btype == "formations":
        return _render_formations(cv, limit)

    if btype == "certifications":
        return _render_certifications(cv, limit)

    if btype == "projets":
        return _render_projets(cv, limit)

    if btype == "skills":
        items = bind.resolve_bound_string_list(cv, binding if binding else "competences.techniques")
        if not items:
            return _section("skills", _placeholder("Compétences"))
        inner = (
            "".join(f'<span class="cv-layout-chip">{_text(s)}</span>' for s in items)
            if fmt == "chips"
            else f"<p>{_text(', '.join(items))}</p>"
        )
        body = f'<div class="cv-layout-chips">{inner}</div>' if fmt == "chips" else inner
        return _section("skills", body)

    if btype == "languages":
        items = bind.resolve_langues(cv)
        if not items:
            return _section("languages", _placeholder("Langues"))
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
        return _section("languages", f"<p>{_text(text)}</p>")

    return _placeholder(btype)


def _render_experiences(cv: dict, limit: Any, fmt: str) -> str:
    items = bind.resolve_experiences(cv, limit if isinstance(limit, int | float) else None)
    if not items:
        return _section("experiences", _placeholder("Expériences"))
    rows = []
    for exp in items:
        ent = (exp.get("entreprise") or "").strip()
        poste = (exp.get("poste") or "").strip()
        dates = " – ".join(
            x
            for x in [(exp.get("date_debut") or "").strip(), (exp.get("date_fin") or "").strip()]
            if x
        )
        header = f"<strong>{_text(ent or poste)}</strong>"
        if dates:
            header += f'<span class="cv-layout-exp-dates">{_text(dates)}</span>'
        role = f'<div class="cv-layout-exp-role">{_text(poste)}</div>' if poste and ent else ""
        bullets = exp.get("bullet_points") or []
        bl = "".join(f"<li>{_text((b or '').strip())}</li>" for b in bullets if (b or "").strip())
        compact = " cv-layout-exp--compact" if fmt == "compact" else ""
        rows.append(
            f'<div class="cv-layout-exp{compact}">'
            f'<div class="cv-layout-exp-header">{header}</div>{role}'
            f'<ul class="cv-layout-bullets">{bl}</ul></div>'
        )
    return _section("experiences", "".join(rows))


def _render_formations(cv: dict, limit: Any) -> str:
    items = bind.resolve_formations(cv, limit if isinstance(limit, int | float) else None)
    if not items:
        return _section("formations", _placeholder("Formations"))
    lines = []
    for f in items:
        dip = (f.get("diplome") or "").strip()
        etab = (f.get("etablissement") or "").strip()
        date = (f.get("date") or "").strip()
        line = f"<strong>{_text(dip or etab)}</strong>"
        if etab and dip:
            line += f" — {_text(etab)}"
        if date:
            line += f' <span class="cv-layout-exp-dates">({_text(date)})</span>'
        lines.append(f"<p>{line}</p>")
    return _section("formations", "".join(lines))


def _render_certifications(cv: dict, limit: Any) -> str:
    items = bind.resolve_certifications(cv, limit if isinstance(limit, int | float) else None)
    if not items:
        return _section("certifications", _placeholder("Certifications"))
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
    return _section("certifications", "".join(lines))


def _render_projets(cv: dict, limit: Any) -> str:
    items = bind.resolve_projets(cv, limit if isinstance(limit, int | float) else None)
    if not items:
        return _section("projets", _placeholder("Projets"))
    lines = []
    for p in items:
        nom = (p.get("nom") or "").strip()
        desc = (p.get("description") or "").strip()
        line = f"<strong>{_text(nom)}</strong>"
        if desc:
            line += f" — {_text(desc)}"
        lines.append(f"<p>{line}</p>")
    return _section("projets", "".join(lines))


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
        color = _esc(str(style.get("color") or "#1e293b"))
        return f'<div class="cv-layout-shape-line" style="background:{color};" role="presentation"></div>'

    if btype == "shape:rect":
        bg = _esc(str(style.get("color") or style.get("bg") or "#e2e8f0"))
        return (
            f'<div class="cv-layout-shape-rect" style="background:{bg};" role="presentation"></div>'
        )

    if btype == "icon":
        label = (block.get("icon_name") or "Icône").strip()
        return f'<div class="cv-layout-placeholder">{_text(label)}</div>'

    if btype == "qrcode":
        return '<div class="cv-layout-placeholder">QR</div>'

    return _placeholder(btype)


def _section(key: str, body: str) -> str:
    title = SECTION_LABELS.get(key, key)
    return (
        f'<div class="cv-layout-section">'
        f'<h3 class="cv-layout-section-title">{_esc(title)}</h3>{body}</div>'
    )


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


def _css_value(value: str) -> str:
    return _esc(str(value).replace(";", "").strip())


def _text(s: str) -> str:
    return html.escape(str(s or ""), quote=True)


def _esc(s: str) -> str:
    return html.escape(s, quote=True)


def _num(v: Any, default: float = 0) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return default
