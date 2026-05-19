"""Regles de scoring ATS liees a la **typographie**.

Chaque regle suit le contrat ``rule_<id>(cv, layout) -> Rule | None``.
Voir ``docs/editor-vision.md`` sections 9.2.2 (penalites typo) et 9.2.4 (bonus).
"""

from __future__ import annotations

from typing import Any

from backend.services.ats_score.rules._helpers import (
    ATS_SAFE_FONTS,
    count_columns,
    get_grid,
    get_theme,
    normalize_font_name,
)
from backend.services.ats_score.types import Rule, RuleSeverity

BODY_FONT_SIZE_MIN: float = 9.0
BODY_FONT_SIZE_MAX: float = 12.0


def rule_exotic_font(cv: dict[str, Any], layout: dict[str, Any]) -> Rule | None:
    """Penalise l'usage d'une police non listee comme ATS-safe.

    La verification porte sur ``theme.font_heading`` et ``theme.font_body``.
    Si l'une ou les deux est exotique, on applique -5 (cumul evite : on note
    "au moins une police exotique" et pas chaque occurrence, pour ne pas
    enfoncer le score sur un detail typographique).
    """
    theme = get_theme(layout)
    heading = normalize_font_name(theme.get("font_heading"))
    body = normalize_font_name(theme.get("font_body"))
    exotic = []
    if heading and heading not in ATS_SAFE_FONTS:
        exotic.append(heading)
    if body and body not in ATS_SAFE_FONTS and body != heading:
        exotic.append(body)
    if not exotic:
        return None
    return Rule(
        id="malus_exotic_font",
        label=f"Police non standard ({', '.join(exotic)})",
        delta=-5,
        severity=RuleSeverity.WARNING,
    )


def rule_body_font_size_out_of_range(cv: dict[str, Any], layout: dict[str, Any]) -> Rule | None:
    """Penalise une taille de corps de texte hors plage ``[9pt, 12pt]``.

    En dessous de 9pt : lisibilite degradee (humain et machine).
    Au dessus de 12pt : suggere un contenu trop court, possible flag spam ATS.
    """
    theme = get_theme(layout)
    raw = theme.get("font_size_body")
    if raw is None:
        return None
    try:
        size = float(raw)
    except (TypeError, ValueError):
        return None
    if BODY_FONT_SIZE_MIN <= size <= BODY_FONT_SIZE_MAX:
        return None
    return Rule(
        id="malus_body_font_size_out_of_range",
        label=f"Taille de corps hors plage 9-12pt (actuel : {size:g}pt)",
        delta=-3,
        severity=RuleSeverity.WARNING,
    )


def rule_mono_column_bonus(cv: dict[str, Any], layout: dict[str, Any]) -> Rule | None:
    """Bonus pour les layouts mono-colonne (lecture lineaire ATS-safe)."""
    if get_grid(layout) == "free":
        return None
    if count_columns(layout) != 1:
        return None
    return Rule(
        id="bonus_mono_column",
        label="Layout mono-colonne",
        delta=10,
        severity=RuleSeverity.INFO,
    )
