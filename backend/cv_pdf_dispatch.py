"""
Sélection du moteur PDF CV : WeasyPrint (défaut) ou Chromium (Playwright).

Variable d’environnement : CV_BOT_PDF_ENGINE
  - weasyprint (défaut) : préparation HTML + bundle pdf_export + WeasyPrint
  - chromium | chrome | playwright : rendu proche navigateur (pas de bundle WeasyPrint)
"""
from __future__ import annotations

import logging
import os
from pathlib import Path

_log = logging.getLogger("cv_bot.pdf")


def cv_pdf_engine() -> str:
    raw = os.environ.get("CV_BOT_PDF_ENGINE", "weasyprint").strip().lower()
    if raw in ("chromium", "chrome", "playwright"):
        return "chromium"
    return "weasyprint"


def html_to_cv_pdf_bytes(
    html_str: str,
    base_dir: Path,
    template_id: str | None = None,
) -> bytes:
    """
    Point d’entrée unique depuis generator.py.
    template_id : utilisé par WeasyPrint (bundle custom_*) ; ignoré par Chromium.
    """
    base_resolved = Path(base_dir).resolve()
    engine = cv_pdf_engine()
    raw_env = (os.environ.get("CV_BOT_PDF_ENGINE") or "").strip() or "(default weasyprint)"
    _log.info(
        "Export PDF CV - moteur effectif=%s | CV_BOT_PDF_ENGINE=%s | template_id=%s | html~%d car.",
        engine,
        raw_env,
        template_id or "-",
        len(html_str),
    )
    # Ligne toujours visible dans `docker compose logs` (les logs structurés cv_bot peuvent être noyés)
    print(
        f"[cv-bot] PDF export: engine={engine} CV_BOT_PDF_ENGINE={raw_env!r} template_id={template_id or '-'}",
        flush=True,
    )
    if engine == "chromium":
        from backend.cv_pdf_chromium import html_to_cv_pdf_bytes_chromium

        out = html_to_cv_pdf_bytes_chromium(html_str, base_resolved, template_id=template_id)
        _log.info("Export PDF CV - Chromium termine (%d octets PDF).", len(out))
        return out
    from backend.cv_pdf_weasyprint import html_to_cv_pdf_bytes as _wp

    out = _wp(html_str, base_resolved, template_id=template_id)
    _log.info("Export PDF CV - WeasyPrint termine (%d octets PDF).", len(out))
    return out
