"""Regles de scoring ATS liees au **contenu et a la structure semantique**.

Chaque regle suit le contrat ``rule_<id>(cv, layout) -> Rule | None``.
Voir ``docs/editor-vision.md`` sections 9.2.4 (bonus contenu) et 9.2.2
(penalites dates exotiques).
"""

from __future__ import annotations

import re
from typing import Any

from backend.services.ats_score.rules._helpers import (
    free_canvas_block_types,
    get_grid,
    get_pages,
    get_sections_order,
    is_section_visible,
    iter_blocks,
)
from backend.services.ats_score.types import Rule, RuleSeverity

# Sections "standards" que les ATS reconnaissent au mot-cle. Chaque section
# visible et nommee selon les conventions donne +1 (cumul borne par la regle).
STANDARD_SECTIONS: frozenset[str] = frozenset(
    {"identity", "experiences", "formations", "skills", "languages"}
)
STANDARD_SECTIONS_BONUS_CAP: int = 3

# Formats de dates "propres" reconnaissables. On verifie que **toutes** les
# dates suivent un meme format pour donner le bonus, et on identifie les
# entrees exotiques pour les penaliser.
_DATE_PATTERNS: dict[str, re.Pattern[str]] = {
    "month_year": re.compile(r"^\d{1,2}/\d{4}$"),  # ex. 06/2024
    "year_only": re.compile(r"^\d{4}$"),  # ex. 2024
    "present_fr": re.compile(r"^(aujourd'hui|en cours|present)$", re.IGNORECASE),
}


def _collect_dates(cv: dict[str, Any], layout: dict[str, Any] | None = None) -> list[str]:
    """Recupere toutes les dates ``cv.experiences[].date_*`` et ``cv.formations[].date``."""
    free_block_types = free_canvas_block_types(layout or {}) if get_grid(layout or {}) == "free" else None
    dates: list[str] = []
    if free_block_types is None or "experiences" in free_block_types:
        for exp in cv.get("experiences", []) or []:
            if not isinstance(exp, dict):
                continue
            for key in ("date_debut", "date_fin"):
                raw = exp.get(key)
                if isinstance(raw, str) and raw.strip():
                    dates.append(raw.strip())
    if free_block_types is None or "formations" in free_block_types:
        for form in cv.get("formations", []) or []:
            if not isinstance(form, dict):
                continue
            raw = form.get("date")
            if isinstance(raw, str) and raw.strip():
                dates.append(raw.strip())
    return dates


def _classify_date(raw: str) -> str:
    """Retourne l'id de pattern ou ``"exotic"`` si aucun ne matche."""
    for name, pattern in _DATE_PATTERNS.items():
        if pattern.match(raw):
            return name
    return "exotic"


def rule_standard_section_titles(cv: dict[str, Any], layout: dict[str, Any]) -> Rule | None:
    """Bonus +1 par section standard visible (plafond +5).

    Si le layout ne fournit pas de ``sections_order`` (templates figes actuels),
    on se rabat sur la presence de donnees dans ``cv`` pour decider quelles
    sections sont "visibles".
    """
    sections = get_sections_order(layout)
    if sections:
        visible_ids = {
            entry.get("id")
            for entry in sections
            if entry.get("visible", True) and entry.get("id") in STANDARD_SECTIONS
        }
    elif get_grid(layout) == "free":
        visible_ids = free_canvas_block_types(layout) & STANDARD_SECTIONS
    else:
        visible_ids = set()
        if cv.get("prenom") or cv.get("nom"):
            visible_ids.add("identity")
        if any((e or {}).get("poste") for e in cv.get("experiences", []) or []):
            visible_ids.add("experiences")
        if any((f or {}).get("diplome") for f in cv.get("formations", []) or []):
            visible_ids.add("formations")
        comp = cv.get("competences") or {}
        if isinstance(comp, dict):
            if any(comp.get("techniques") or []):
                visible_ids.add("skills")
            if any(comp.get("langues") or []):
                visible_ids.add("languages")
    bonus = min(len(visible_ids), STANDARD_SECTIONS_BONUS_CAP)
    if bonus <= 0:
        return None
    return Rule(
        id="bonus_standard_section_titles",
        label=f"{bonus} section(s) standard reconnue(s)",
        delta=bonus,
        severity=RuleSeverity.INFO,
    )


def rule_contact_top_of_page(cv: dict[str, Any], layout: dict[str, Any]) -> Rule | None:
    """Bonus +5 si email/telephone sont dans les 30% superieurs de la page 1.

    Pour un layout ``single-or-sidebar`` (templates figes), on considere que
    la section ``identity`` est en header si elle est marquee ``in: "header"``.
    Pour un layout ``free``, on inspecte la position ``y`` des blocs
    ``identity`` / ``contact``.
    """
    has_email = bool((cv.get("email") or "").strip())
    has_phone = bool((cv.get("telephone") or "").strip())
    if not (has_email or has_phone):
        return None

    sections = get_sections_order(layout)
    for entry in sections:
        if entry.get("id") == "identity" and entry.get("in") == "header":
            return Rule(
                id="bonus_contact_top_of_page",
                label="Contact en haut de page",
                delta=5,
                severity=RuleSeverity.INFO,
            )

    pages = get_pages(layout)
    if pages:
        # Hauteur A4 = 297mm ; on tolere les 30% superieurs (~89mm).
        threshold_mm = 89.1
        for block in iter_blocks(layout):
            if block.get("type") not in {"identity", "contact"}:
                continue
            try:
                y = float(block.get("y", 999))
            except (TypeError, ValueError):
                continue
            if y <= threshold_mm:
                return Rule(
                    id="bonus_contact_top_of_page",
                    label="Contact en haut de page",
                    delta=5,
                    severity=RuleSeverity.INFO,
                )
        return None

    # Layout sans schema (templates figes historiques) : par convention, les
    # templates livres affichent l'identite en header, on accorde le bonus.
    if is_section_visible(layout, "identity"):
        return Rule(
            id="bonus_contact_top_of_page",
            label="Contact en haut de page",
            delta=5,
            severity=RuleSeverity.INFO,
        )
    return None


def rule_dates_format_consistent(cv: dict[str, Any], layout: dict[str, Any]) -> Rule | None:
    """Bonus +3 si toutes les dates suivent un format standard coherent.

    "Coherent" signifie : toutes en ``year_only``, ou toutes en ``month_year``
    (les marqueurs de presence type "Aujourd'hui" sont neutres et ne cassent
    pas la coherence).
    """
    dates = _collect_dates(cv, layout)
    if not dates:
        return None
    classifications = {_classify_date(d) for d in dates}
    classifications.discard("present_fr")
    if not classifications or "exotic" in classifications:
        return None
    if len(classifications) > 1:
        return None
    return Rule(
        id="bonus_dates_format_consistent",
        label="Dates au format coherent",
        delta=3,
        severity=RuleSeverity.INFO,
    )


def rule_inconsistent_dates(cv: dict[str, Any], layout: dict[str, Any]) -> Rule | None:
    """Penalite -1 par date au format exotique (plafond -5).

    Une date est "exotique" si elle ne matche ni ``YYYY``, ni ``MM/YYYY``,
    ni un marqueur "present" connu.
    """
    dates = _collect_dates(cv, layout)
    exotic_count = sum(1 for d in dates if _classify_date(d) == "exotic")
    if exotic_count == 0:
        return None
    delta = max(-5, -exotic_count)
    return Rule(
        id="malus_inconsistent_dates",
        label=f"{exotic_count} date(s) au format exotique",
        delta=delta,
        severity=RuleSeverity.WARNING,
    )
