"""Orchestrateur du scoring ATS.

Responsabilites isolees :

1. Charger la collection de regles applicables (``rules.parsing_rules``).
2. Executer chaque regle sur ``(cv, layout)`` en isolant ses erreurs.
3. Agreger les ``Rule`` retournees, calculer le total, clamper a ``[0, 100]``.
4. Retourner un :class:`ScoreResult` immuable.

Le module ne connait **aucune** logique metier : ajouter une regle n'oblige
jamais a modifier ce fichier (cf. ``rules/__init__.py`` qui agrege).
"""

from __future__ import annotations

import logging
from collections.abc import Callable, Iterable
from typing import Any

from backend.services.ats_score.rules import parsing_rules
from backend.services.ats_score.types import Rule, ScoreResult
from backend.services.ats_score.version import SCORING_VERSION

logger = logging.getLogger(__name__)

# Base et bornes du score. Le score peut descendre via les penalites
# mais est ramene a ``[SCORE_MIN, SCORE_MAX]`` en sortie.
SCORE_BASE: int = 100
SCORE_MIN: int = 0
SCORE_MAX: int = 100

RuleFn = Callable[[dict[str, Any], dict[str, Any]], Rule | None]


def _clamp(value: int) -> int:
    """Borne un score entier dans la plage publique ``[SCORE_MIN, SCORE_MAX]``."""
    if value < SCORE_MIN:
        return SCORE_MIN
    if value > SCORE_MAX:
        return SCORE_MAX
    return value


def _apply_rules(
    cv: dict[str, Any],
    layout: dict[str, Any],
    rules: Iterable[RuleFn],
) -> list[Rule]:
    """Execute chaque regle, capture les exceptions et logue sans casser le scoring.

    Une regle qui leve est consideree comme **inappliquee** : on logue mais le
    score global reste calculable. Ce comportement est defendu par
    ``test_ats_score_engine.TestEngineRobustness``.
    """
    applied: list[Rule] = []
    for rule_fn in rules:
        try:
            result = rule_fn(cv, layout)
        except Exception:
            logger.exception(
                "ats_score: regle %s a leve, ignoree", getattr(rule_fn, "__name__", rule_fn)
            )
            continue
        if result is None:
            continue
        applied.append(result)
    return applied


def score_parsing(
    cv: dict[str, Any] | None,
    layout: dict[str, Any] | None,
    *,
    rules: Iterable[RuleFn] | None = None,
) -> ScoreResult:
    """Calcule le ``Score Parsing`` d'un couple ``(cv, layout)``.

    Args:
        cv: dictionnaire CV semantique (voir ``frontend/src/data/cvDefault.js``).
        layout: dictionnaire layout (voir ``docs/editor-vision.md`` annexe 16.2).
        rules: liste de regles a appliquer. Par defaut, ``parsing_rules``
               (toutes les regles parsing publiques).

    Returns:
        :class:`ScoreResult` immuable, ``kind="parsing"``, ``total`` borne 0..100.
    """
    safe_cv: dict[str, Any] = cv or {}
    safe_layout: dict[str, Any] = layout or {}
    rule_collection: Iterable[RuleFn] = parsing_rules if rules is None else rules

    applied = _apply_rules(safe_cv, safe_layout, rule_collection)
    raw_total = SCORE_BASE + sum(rule.delta for rule in applied)
    total = _clamp(raw_total)

    return ScoreResult(
        kind="parsing",
        total=total,
        version=SCORING_VERSION,
        rules=tuple(applied),
    )
