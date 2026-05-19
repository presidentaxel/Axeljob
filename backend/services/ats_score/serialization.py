"""Serialisation JSON du scoring ATS.

Sortie compatible avec :

- l'API HTTP (``POST /api/ats/score-parsing``) ;
- le stockage dans ``event_log`` ou ``user_layouts.metadata.score`` ;
- les fixtures de tests (snapshot).

Aucune dependance reseau ou DB : module pur.
"""

from __future__ import annotations

from typing import Any

from backend.services.ats_score.types import Rule, ScoreResult


def rule_to_dict(rule: Rule) -> dict[str, Any]:
    """Serialise un :class:`Rule` en dict JSON-friendly."""
    return {
        "id": rule.id,
        "label": rule.label,
        "delta": rule.delta,
        "severity": rule.severity.value,
    }


def score_result_to_dict(result: ScoreResult) -> dict[str, Any]:
    """Serialise un :class:`ScoreResult` complet pour le transport.

    Les regles sont serialisees dans le meme ordre que dans le ``ScoreResult``
    (ordre de declenchement = ordre defini par ``rules/__init__.py``). Cet
    ordre est important : l'UI affiche les regles dans cet ordre pour
    expliquer le score au plus pres de l'experience utilisateur attendue.
    """
    return {
        "kind": result.kind,
        "total": result.total,
        "version": result.version,
        "rules": [rule_to_dict(rule) for rule in result.rules],
    }
