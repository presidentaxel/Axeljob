"""Regles de scoring ATS liees aux **meta-choix de design** (photo, etc.).

Chaque regle suit le contrat ``rule_<id>(cv, layout) -> Rule | None``.
Voir ``docs/editor-vision.md`` section 9.2.3 (penalites legeres).
"""

from __future__ import annotations

from typing import Any

from backend.services.ats_score.rules._helpers import (
    free_canvas_has_block_type,
    get_grid,
    get_theme,
)
from backend.services.ats_score.types import Rule, RuleSeverity


def rule_photo_present(cv: dict[str, Any], layout: dict[str, Any]) -> Rule | None:
    """Penalite legere -2 si une photo est affichee sur le CV.

    La photo n'est jamais lue par les ATS et peut declencher des biais
    automatises dans certains pays (notamment US). Penalite "info" : on
    informe sans dramatiser, l'utilisateur reste libre.

    La regle s'applique uniquement si :

    - le layout autorise l'affichage (``theme.show_photo``, defaut ``True``) ;
    - **et** le CV fournit effectivement une ``photo_url`` non vide.
    """
    theme = get_theme(layout)
    show_photo = theme.get("show_photo", True)
    if show_photo is False:
        return None
    if get_grid(layout) == "free" and not free_canvas_has_block_type(layout, "photo"):
        return None
    photo_url = cv.get("photo_url") or ""
    if not isinstance(photo_url, str) or not photo_url.strip():
        return None
    return Rule(
        id="malus_photo_present",
        label="Photo affichee sur le CV",
        delta=-3,
        severity=RuleSeverity.INFO,
    )
