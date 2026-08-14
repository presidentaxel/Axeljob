"""Policy import PDF — scanned / OCR hors MVP (AXE-328).

Chemins :
- PDF scanné (texte non extractible) → **refus 400** + message UX (pas d'OCR).
- PDF texte OK mais layout structurel ``None`` → **fallback** texte IA + vision/preset.
"""

from __future__ import annotations

# Aligné sur le seuil historique de ``/api/cv/import`` (texte trop court).
MIN_IMPORT_TEXT_CHARS = 50

PDF_SCANNED_REFUSAL_DETAIL = (
    "Ce PDF semble scanné (image sans texte sélectionnable). "
    "L'OCR n'est pas disponible pour l'instant. "
    "Exporte un PDF avec texte sélectionnable, un fichier .docx, "
    "ou colle le texte de ton CV."
)

LAYOUT_FALLBACK_TEXT_AI = "text_ai_vision_or_preset"
LAYOUT_MODE_STRUCTURAL = "structural"
LAYOUT_MODE_REFUSED_SCANNED = "refused_scanned"


def is_insufficient_import_text(
    text: str | None, *, min_chars: int = MIN_IMPORT_TEXT_CHARS
) -> bool:
    """True si le texte extrait est trop court pour un import CV."""
    return len((text or "").strip()) < min_chars


def build_pdf_import_policy(
    *,
    structural_layout: dict | None,
    vision_meta: dict | None = None,
) -> dict:
    """Métadonnées policy exposées au FE (pas d'OCR MVP)."""
    has_structural = bool(structural_layout)
    has_vision = bool(vision_meta)
    if has_structural:
        layout_mode = LAYOUT_MODE_STRUCTURAL
        layout_fallback = None
    else:
        layout_mode = LAYOUT_FALLBACK_TEXT_AI
        layout_fallback = LAYOUT_FALLBACK_TEXT_AI
    return {
        "ocr": False,
        "pdf_native_layout": has_structural,
        "layout_mode": layout_mode,
        "layout_fallback": layout_fallback,
        "vision_used": has_vision,
        "message": (
            None
            if has_structural
            else (
                "Mise en page PDF non recopiée (fichier sans structure native). "
                "Contenu extrait puis adapté — pas un fac-similé. OCR hors MVP."
            )
        ),
    }
