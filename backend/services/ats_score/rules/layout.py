"""Regles de scoring ATS liees a la **structure du layout**.

Chaque fonction implemente **une seule regle** documentee dans
``docs/editor-vision.md`` section 9.2. Le contrat est :

    rule_<id>(cv, layout) -> Rule | None

- Retourne ``None`` si la regle ne s'applique pas.
- Retourne un :class:`Rule` avec ``delta`` non nul si elle s'applique.

Les ``id`` de regles sont stables : ils sont utilises par les fixtures et
l'UI front pour expliquer le score. Ne jamais renommer un id sans bumper
``SCORING_VERSION``.
"""

from __future__ import annotations

from typing import Any

from backend.services.ats_score.rules._helpers import (
    count_columns,
    get_sidebar_ratio,
)
from backend.services.ats_score.types import Rule, RuleSeverity


def rule_multi_column(cv: dict[str, Any], layout: dict[str, Any]) -> Rule | None:
    """Penalise les layouts multi-colonnes (lecture lineaire ATS perturbee)."""
    columns = count_columns(layout)
    if columns <= 1:
        return None
    if columns == 2:
        return Rule(
            id="malus_two_columns",
            label="Layout sur 2 colonnes",
            delta=-8,
            severity=RuleSeverity.WARNING,
        )
    return Rule(
        id="malus_three_or_more_columns",
        label=f"Layout sur {columns} colonnes",
        delta=-15,
        severity=RuleSeverity.ERROR,
    )


def rule_sidebar_present(cv: dict[str, Any], layout: dict[str, Any]) -> Rule | None:
    """Penalite legere pour la presence d'une sidebar.

    La sidebar est deja partiellement comptee dans ``rule_multi_column`` (2 colonnes) ;
    cette regle reflete le risque specifique d'ordre de lecture (sidebar lue
    avant ou apres le contenu principal selon le parser).
    """
    if get_sidebar_ratio(layout) <= 0.0:
        return None
    return Rule(
        id="malus_sidebar_present",
        label="Sidebar presente (ordre de lecture ambigu)",
        delta=-5,
        severity=RuleSeverity.WARNING,
    )


def rule_free_canvas_text_positions(cv: dict[str, Any], layout: dict[str, Any]) -> Rule | None:
    """Ancienne penalite systematique « positions libres » — desactivee (AXE-336).

    Le canvas libre est le produit Beta : pénaliser chaque bloc textuel en
    absolu (-2, plafond -10) punissait tout design libre, y compris lisible.
    Les garde-fous réels restent dans ``free_canvas.py`` (ordre de lecture,
    identité en tête, sections manquantes, contact trop bas) + multi-colonnes
    + verify-pdf.

    La fonction reste exportée pour ne pas casser les imports / tests ; elle
    ne retourne plus jamais de ``Rule``. Ne pas la réintroduire dans
    ``parsing_rules`` sans bump ``SCORING_VERSION``.
    """
    del cv, layout
    return None


def rule_table_layout(cv: dict[str, Any], layout: dict[str, Any]) -> Rule | None:
    """Penalite lourde si le layout est explicitement marque comme utilisant un tableau.

    Un layout peut indiquer ``"uses_table_layout": true`` (drapeau pose par le
    renderer quand le template HTML repose sur ``<table>``). Les ATS lisent
    souvent les tableaux ligne par ligne, ce qui melange les colonnes.
    """
    if not bool(layout.get("uses_table_layout", False)):
        return None
    return Rule(
        id="malus_table_layout",
        label="Mise en page par tableau (lecture machine perturbee)",
        delta=-10,
        severity=RuleSeverity.ERROR,
    )
