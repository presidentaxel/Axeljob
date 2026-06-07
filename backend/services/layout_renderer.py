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
.cv-layout-image-frame { width: 100%; height: 100%; overflow: hidden; }
.cv-layout-image { width: 100%; height: 100%; object-fit: cover; display: block; }
.cv-layout-icon { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
.cv-layout-icon svg { width: 100%; height: 100%; display: block; }
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
            line += f" - {_text(etab)}"
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
            line += f" - {_text(desc)}"
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

    if btype == "image":
        src = block.get("image_src") if isinstance(block.get("image_src"), str) else ""
        if not src.strip():
            return '<div class="cv-layout-photo-ph" aria-hidden="true"></div>'
        radius = _image_radius(style)
        focal_x = _num(style.get("focal_x"), 50)
        focal_y = _num(style.get("focal_y"), 50)
        zoom = max(1.0, _num(style.get("image_zoom"), 1))
        opacity = _num(style.get("opacity"), 1)
        frame_style = f"border-radius:{radius};opacity:{opacity};"
        image_style = (
            f"object-position:{focal_x}% {focal_y}%;"
            f"transform:scale({zoom});"
            f"transform-origin:{focal_x}% {focal_y}%;"
        )
        return (
            f'<div class="cv-layout-image-frame" style="{frame_style}">'
            f'<img class="cv-layout-image" src="{_esc(src)}" alt="" style="{image_style}"/>'
            f"</div>"
        )

    if btype == "icon":
        icon_name = (block.get("icon_name") or "").strip()
        color = _esc(str(style.get("color") or "#1e293b"))
        return f'<div class="cv-layout-icon" style="color:{color};">{_icon_svg(icon_name)}</div>'

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


def _image_radius(style: dict[str, Any]) -> str:
    shape = str(style.get("shape") or "rect")
    if shape == "circle":
        return "50%"
    if shape == "rounded":
        return "12%"
    return "0"


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
    return html.escape(str(s or ""), quote=True)


def _esc(s: str) -> str:
    return html.escape(s, quote=True)


def _num(v: Any, default: float = 0) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return default
