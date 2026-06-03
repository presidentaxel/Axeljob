"""Module de scoring ATS pour les CV genere par cv-bot.

Expose l'API publique du scoring ATS :

- :func:`score_parsing` : note un couple ``(cv, layout)`` selon des regles
  deterministes documentees (voir ``docs/editor-vision.md`` section 9).
- :class:`ScoreResult` / :class:`Rule` / :class:`RuleSeverity` : structures
  de donnees retournees au caller.
- :data:`SCORING_VERSION` : version semantique des ponderations courantes.

Le module est volontairement decoupe en sous-fichiers (``types``, ``scoring``,
``rules/``) pour garder chaque responsabilite testable independamment :

- ``types.py``       : structures de donnees pures (dataclasses immuables).
- ``scoring.py``     : orchestrateur (applique les regles, agrege, clamp 0..100).
- ``rules/``         : une regle par fonction, regroupees par theme
                       (``layout``, ``typography``, ``content``, ``meta``).
- ``version.py``     : constante centrale ``SCORING_VERSION`` versionnee.

Aucun I/O, aucun appel reseau, aucune dependance Supabase : tout est pur,
deterministe, et testable hors infra.
"""

from backend.services.ats_score.scoring import score_parsing
from backend.services.ats_score.types import Rule, RuleSeverity, ScoreResult
from backend.services.ats_score.version import SCORING_VERSION

__all__ = [
    "score_parsing",
    "Rule",
    "RuleSeverity",
    "ScoreResult",
    "SCORING_VERSION",
]
