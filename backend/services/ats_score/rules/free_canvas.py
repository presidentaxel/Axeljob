"""Regles ATS specifiques au canvas libre (layout v3, ``grid == "free"``).

Ces regles completent ``layout.rule_free_canvas_text_positions`` et
``layout.rule_multi_column`` en ciblant l'ordre de lecture machine :
les parsers ATS parcourent souvent la page de haut en bas, puis de
gauche a droite, sans tenir compte du z-index visuel.
"""

from __future__ import annotations

from typing import Any

from backend.services.ats_score.rules._helpers import get_grid, iter_blocks
from backend.services.ats_score.types import Rule, RuleSeverity

# Ordre canonique recommande pour un CV ATS (sections semantiques).
_CANONICAL_READ_ORDER: tuple[str, ...] = (
    "identity",
    "contact",
    "photo",
    "resume",
    "experiences",
    "formations",
    "certifications",
    "skills",
    "languages",
    "projets",
)

_READ_RANK: dict[str, int] = {t: i for i, t in enumerate(_CANONICAL_READ_ORDER)}

_MISSING_SECTION_LABELS: dict[str, str] = {
    "identity": "identite",
    "contact": "contact",
    "experiences": "experiences",
    "formations": "formations",
    "skills": "competences",
    "languages": "langues",
}


def _reading_position(block: dict[str, Any]) -> tuple[float, float]:
    """Cle de tri : haut-gauche du bloc (y puis x en mm)."""
    try:
        y = float(block.get("y", 0))
    except (TypeError, ValueError):
        y = 0.0
    try:
        x = float(block.get("x", 0))
    except (TypeError, ValueError):
        x = 0.0
    return (y, x)


def _semantic_blocks(layout: dict[str, Any]) -> list[dict[str, Any]]:
    return [b for b in iter_blocks(layout) if b.get("type") in _READ_RANK]


def _count_inversions(ranks: list[int]) -> int:
    inv = 0
    for i in range(len(ranks)):
        for j in range(i + 1, len(ranks)):
            if ranks[i] > ranks[j]:
                inv += 1
    return inv


def _cv_has_identity(cv: dict[str, Any]) -> bool:
    return bool((cv.get("prenom") or "").strip() or (cv.get("nom") or "").strip())


def _cv_has_contact(cv: dict[str, Any]) -> bool:
    return bool((cv.get("email") or "").strip() or (cv.get("telephone") or "").strip())


def _cv_has_skills(cv: dict[str, Any], key: str) -> bool:
    competences = cv.get("competences") or {}
    return isinstance(competences, dict) and bool(competences.get(key) or [])


def rule_free_canvas_missing_profile_sections(
    cv: dict[str, Any], layout: dict[str, Any]
) -> Rule | None:
    """Penalise les informations du profil absentes du canvas affiche.

    En mode libre, le score doit juger le CV réellement visible, pas les champs
    stockes dans le profil. Une page blanche doit donc perdre des points pour
    contenu non affiche, pas pour une photo ou des dates qui n'apparaissent pas.
    """
    if get_grid(layout) != "free":
        return None
    displayed_types = {str(block.get("type")) for block in iter_blocks(layout) if block.get("type")}
    expected: list[str] = []
    if _cv_has_identity(cv):
        expected.append("identity")
    if _cv_has_contact(cv):
        expected.append("contact")
    if any(isinstance(exp, dict) for exp in cv.get("experiences", []) or []):
        expected.append("experiences")
    if any(isinstance(form, dict) for form in cv.get("formations", []) or []):
        expected.append("formations")
    if _cv_has_skills(cv, "techniques"):
        expected.append("skills")
    if _cv_has_skills(cv, "langues"):
        expected.append("languages")

    missing = [section for section in expected if section not in displayed_types]
    if not missing:
        return None
    visible_missing = ", ".join(
        _MISSING_SECTION_LABELS.get(section, section) for section in missing[:3]
    )
    suffix = "..." if len(missing) > 3 else ""
    delta = max(-18, -4 * len(missing))
    return Rule(
        id="malus_free_canvas_missing_profile_sections",
        label=f"Canvas libre : contenu du profil non affiche ({visible_missing}{suffix})",
        delta=delta,
        severity=RuleSeverity.ERROR if len(missing) >= 3 else RuleSeverity.WARNING,
        advice=(
            f"Des infos du profil ne sont pas sur le canvas ({visible_missing}{suffix}). "
            "Ajoute les blocs manquants depuis la sidebar pour qu'ils soient scorés."
        ),
    )


def rule_free_canvas_reading_order(cv: dict[str, Any], layout: dict[str, Any]) -> Rule | None:
    """Penalise les inversions d'ordre entre sections semantiques.

    Compare l'ordre spatial (y, x) des blocs a l'ordre canonique ATS.
    Plafond -9 (-3 par inversion).
    """
    del cv
    if get_grid(layout) != "free":
        return None
    blocks = _semantic_blocks(layout)
    if len(blocks) < 2:
        return None
    ordered = sorted(blocks, key=_reading_position)
    ranks = [_READ_RANK[str(b.get("type"))] for b in ordered]
    inversions = _count_inversions(ranks)
    if inversions == 0:
        return None
    delta = max(-9, -3 * inversions)
    block_ids = tuple(
        str(b["id"]) for b in ordered if isinstance(b.get("id"), str) and b["id"]
    )
    return Rule(
        id="malus_free_canvas_reading_order",
        label=f"Canvas libre : ordre de lecture ambigu ({inversions} inversion(s))",
        delta=delta,
        severity=RuleSeverity.WARNING,
        block_ids=block_ids[:6],
        advice=(
            "L'ordre de lecture machine (haut → bas) ne suit pas l'ordre "
            "attendu des sections. Les parsers ATS peuvent mal enchaîner "
            "identité, contact et expériences."
        ),
    )


def rule_identity_not_first_in_reading(cv: dict[str, Any], layout: dict[str, Any]) -> Rule | None:
    """Penalise si l'identite n'est pas la premiere section lue.

    Un bloc ``identity`` existe mais un autre bloc semantique est place
    plus haut (y plus petit) ou a la meme hauteur mais plus a gauche.
    """
    del cv
    if get_grid(layout) != "free":
        return None
    blocks = _semantic_blocks(layout)
    identities = [b for b in blocks if b.get("type") == "identity"]
    if not identities:
        return None
    first = min(blocks, key=_reading_position)
    if first.get("type") == "identity":
        return None
    identity = identities[0]
    ids: list[str] = []
    for block in (identity, first):
        bid = block.get("id")
        if isinstance(bid, str) and bid and bid not in ids:
            ids.append(bid)
    return Rule(
        id="malus_identity_not_first",
        label="Identite pas en tete de lecture (risque ATS)",
        delta=-5,
        severity=RuleSeverity.WARNING,
        block_ids=tuple(ids),
        advice=(
            "Un autre bloc est lu avant l'identité. Place le nom / titre "
            "en haut à gauche pour que les ATS le capturent en premier."
        ),
    )


def rule_experiences_before_resume(cv: dict[str, Any], layout: dict[str, Any]) -> Rule | None:
    """Penalise si les experiences sont lues avant le resume.

    Structure attendue : resume (synthese) avant le detail des experiences.
    """
    del cv
    if get_grid(layout) != "free":
        return None
    resume_blocks = [b for b in _semantic_blocks(layout) if b.get("type") == "resume"]
    exp_blocks = [b for b in _semantic_blocks(layout) if b.get("type") == "experiences"]
    if not resume_blocks or not exp_blocks:
        return None
    resume_pos = min(_reading_position(b) for b in resume_blocks)
    exp_pos = min(_reading_position(b) for b in exp_blocks)
    if exp_pos < resume_pos:
        ids: list[str] = []
        for block in (*exp_blocks[:1], *resume_blocks[:1]):
            bid = block.get("id")
            if isinstance(bid, str) and bid and bid not in ids:
                ids.append(bid)
        return Rule(
            id="malus_experiences_before_resume",
            label="Experiences placees avant le resume (ordre de lecture)",
            delta=-5,
            severity=RuleSeverity.WARNING,
            block_ids=tuple(ids),
            advice=(
                "Les expériences sont placées avant le résumé. "
                "Les ATS s'attendent souvent à une synthèse avant le détail."
            ),
        )
    return None


def rule_contact_far_from_top(cv: dict[str, Any], layout: dict[str, Any]) -> Rule | None:
    """Penalise un bloc contact trop bas sur la page 1 (> 30 % hauteur A4).

    Complementaire au bonus ``bonus_contact_top_of_page`` : en mode libre,
    un contact a y > 89 mm est rarement lu en entier par les ATS.
    """
    if get_grid(layout) != "free":
        return None
    has_contact = bool((cv.get("email") or "").strip() or (cv.get("telephone") or "").strip())
    if not has_contact:
        return None
    threshold_mm = 89.1
    for block in iter_blocks(layout):
        if block.get("type") != "contact":
            continue
        try:
            y = float(block.get("y", 999))
        except (TypeError, ValueError):
            continue
        if y > threshold_mm:
            bid = block.get("id")
            block_ids = (str(bid),) if isinstance(bid, str) and bid else ()
            return Rule(
                id="malus_contact_low_on_page",
                label="Contact place trop bas sur la page",
                delta=-3,
                severity=RuleSeverity.WARNING,
                block_ids=block_ids,
                advice=(
                    "Le contact est trop bas sur la page. Remonte-le dans "
                    "le haut du CV pour qu'il soit lu par les parsers ATS."
                ),
            )
    return None
