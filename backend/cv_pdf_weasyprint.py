"""
Pipeline unique WeasyPrint pour les CV HTML produits par render_cv_html().

Règles à respecter (toute refonte doit les préserver ou les documenter explicitement) :

1) Média WeasyPrint
   - media_type = « screen » : le profil « print » navigateur enlève souvent les fonds colorés
     (header, sidebar). On reste sur screen pour coller à l’aperçu.

2) Ordre de cascade CSS (du plus faible au plus fort pour l’export)
   - CSS du template déjà inliné dans le HTML (render_cv_html) : :root, typo, scale éventuel.
   - Retrait des @import dans tout le document : un @import Google Fonts qui échoue au fetch
     peut invalider tout le bloc <style> suivant → PDF « vide » ou sans couleurs.
   - Suppression des <link href="…template.css"> : WeasyPrint les résoudrait avec base_url
     (racine projet) et pourrait charger le mauvais fichier ou écraser le bundle pdf_export.
   - Injection en fin de <body> (préférée) ou avant </head> :
       layout (weasyprint_cv_layout.css)
     + align  (weasyprint_cv_export.css)  — @page, cv-print-split, bandes multi-pages, ATS PDF…
     + [templates custom_* uniquement] weasyprint_custom_template.css — @page margin 0, body blanc.
   - Dernière couche : write_pdf(..., stylesheets=[CSS(string=PDF_FROM_HTML_FINAL_CSS)])
     pour forcer des couleurs de texte sur .cv-main / .cv-sidebar quand l’héritage WeasyPrint casse.

3) Templates personnalisés (id prefix custom_)
   - Le même fichier weasyprint_custom_template.css est injecté dans le bundle (fin de body),
     comme l’ancien chemin _render_pdf_bytes_from_custom_ctx — plus de duplication ad hoc dans main
     (anciens <style> injectés dans </head> seuls).

4) Windows
   - WEASYPRINT_DLL_DIRECTORIES : géré dans generator.py avant import WeasyPrint (PATH + add_dll_directory).

5) Idempotence
   - Si le HTML contient déjà id="cv-bot-pdf-export-align", on ne réinjecte pas le bundle
     (évite double cascade en cas d’appels multiples).

6) base_url
   - Toujours la racine cv-bot (BASE_DIR) pour résoudre images locales / chemins relatifs cohérents
     avec le HTML généré côté API.
"""

from __future__ import annotations

import re
from pathlib import Path

# Racine cv-bot (parent de backend/)
CV_BOT_ROOT = Path(__file__).resolve().parent.parent
PDF_EXPORT_DIR = CV_BOT_ROOT / "pdf_export"

# Aligné sur generator.py historique
WEASYPRINT_CV_MEDIA = "screen"

# Après le document HTML : corrige héritage couleur sous WeasyPrint
PDF_FROM_HTML_FINAL_CSS = """
article.cv.cv-print-split .cv-main { color: #0f172a !important; }
article.cv.cv-print-split .cv-sidebar { color: #334155 !important; }
body.cv-preview article.cv.cv-pdf-dual-column > .cv-main,
.cv-preview article.cv.cv-pdf-dual-column > .cv-main { color: #0f172a !important; }
.cv .bullet, .cv p.bullet, .cv .experience-item .bullet { font-size: var(--cv-fs-bullet, 9pt) !important; line-height: 1.45 !important; }
.cv .bullet::before, .cv .experience-item .bullet::before { font-size: 0.92em !important; }
"""

_CSS_IMPORT_RE = re.compile(
    r"@import\s+(?:url\()?[\"']?[^\"');]+[\"']?\)?[^;]*;\s*",
    re.IGNORECASE | re.MULTILINE,
)

# Tout lien vers template.css (y compris chemins avec slash)
_TEMPLATE_CSS_LINK_RE = re.compile(
    r'<link\s[^>]*href\s*=\s*["\']?(?:[^"\'>\s]*/)?template\.css["\']?[^>]*>\s*',
    re.IGNORECASE,
)

CUSTOM_TEMPLATE_ID_PREFIX = "custom_"


def is_custom_template_id(template_id: str | None) -> bool:
    return bool((template_id or "").strip().startswith(CUSTOM_TEMPLATE_ID_PREFIX))


def strip_css_imports(text: str) -> str:
    if not text:
        return text
    return _CSS_IMPORT_RE.sub("", text)


def strip_template_css_links(html: str) -> str:
    return _TEMPLATE_CSS_LINK_RE.sub("", html)


def _read_pdf_export_css_file(filename: str) -> str:
    path = PDF_EXPORT_DIR / filename
    if not path.is_file():
        raise FileNotFoundError(
            f"Fichier CSS d'export PDF introuvable : {path}. Réinstallez le dossier pdf_export."
        )
    return path.read_text(encoding="utf-8")


def _build_pdf_export_style_tags() -> tuple[str, str, str]:
    layout = _read_pdf_export_css_file("weasyprint_cv_layout.css")
    align = _read_pdf_export_css_file("weasyprint_cv_export.css")
    custom = _read_pdf_export_css_file("weasyprint_custom_template.css")
    return (
        f'<style id="cv-bot-pdf-export-layout">{layout}</style>',
        f'<style id="cv-bot-pdf-export-align">{align}</style>',
        f'<style id="cv-bot-pdf-export-custom-base">{custom}</style>',
    )


PDF_EXPORT_LAYOUT_STYLE, PDF_EXPORT_ALIGN_STYLE, PDF_EXPORT_CUSTOM_BASE_STYLE = (
    _build_pdf_export_style_tags()
)


def inject_weasyprint_export_bundle(
    html_str: str,
    *,
    template_id: str | None = None,
    prepend_to_bundle: str = "",
) -> str:
    """
    Insère le bundle pdf_export pour que la cascade l’emporte sur les <style> du template.

    Ordre (identique à l’ancien generer_pdf_bytes + _render_pdf_bytes_from_custom_ctx) :
    - Feuille « custom base » (weasyprint_custom_template.css) en premier si template custom_*,
      puis layout, puis align — les :root utilisateur restent dans le <head> du HTML.
    prepend_to_bundle : extension rare (ex. scale injecté hors render_cv_html).
    """
    if 'id="cv-bot-pdf-export-align"' in html_str:
        return html_str

    custom_lead = PDF_EXPORT_CUSTOM_BASE_STYLE if is_custom_template_id(template_id) else ""
    bundle = prepend_to_bundle + custom_lead + PDF_EXPORT_LAYOUT_STYLE + PDF_EXPORT_ALIGN_STYLE

    lower = html_str.lower()
    i = lower.rfind("</body>")
    if i != -1:
        return html_str[:i] + bundle + html_str[i:]
    if "</head>" in html_str:
        return html_str.replace("</head>", bundle + "</head>", 1)
    return bundle + html_str


def prepare_cv_html_for_weasyprint(html_str: str, template_id: str | None = None) -> str:
    """
    Prépare le HTML issu de render_cv_html() avant HTML(string=...).write_pdf().
    """
    html_str = strip_template_css_links(html_str)
    html_str = strip_css_imports(html_str)
    html_str = inject_weasyprint_export_bundle(html_str, template_id=template_id)
    return html_str


def html_to_cv_pdf_bytes(html_str: str, base_dir: Path, template_id: str | None = None) -> bytes:
    """WeasyPrint : string HTML → bytes PDF (une seule API interne)."""
    from io import BytesIO

    from weasyprint import CSS, HTML

    html_str = prepare_cv_html_for_weasyprint(html_str, template_id=template_id)
    base_resolved = Path(base_dir).resolve()
    doc = HTML(string=html_str, base_url=str(base_resolved), media_type=WEASYPRINT_CV_MEDIA)
    buf = BytesIO()
    doc.write_pdf(buf, stylesheets=[CSS(string=PDF_FROM_HTML_FINAL_CSS)])
    return buf.getvalue()
