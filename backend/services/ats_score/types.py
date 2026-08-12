"""Structures de donnees pures du scoring ATS.

Toutes les valeurs retournees par le scoring transitent par ces dataclasses
immuables (``frozen=True``). Cela garantit que :

- l'API publique reste typee et stable ;
- aucune mutation interne ne fuit chez le caller ;
- les snapshots tests peuvent comparer par egalite structurelle.

Voir ``docs/editor-vision.md`` section 9 pour le contrat fonctionnel.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Literal


class RuleSeverity(str, Enum):
    """Severite d'une regle ATS.

    - ``info``    : information neutre ou bonus pedagogique.
    - ``warning`` : choix de design risque mais defendable.
    - ``error``   : design fortement deconseille (lecture machine compromise).
    """

    INFO = "info"
    WARNING = "warning"
    ERROR = "error"


ScoreKind = Literal["parsing", "match"]


@dataclass(frozen=True)
class Rule:
    """Resultat applique d'une regle ATS.

    Une regle ne produit un ``Rule`` que si elle s'applique (``delta`` significatif).
    Les regles inappliquees retournent ``None`` et ne sont pas listees.

    Attributs:
        id: identifiant stable de la regle (snake_case), utilise pour les fixtures.
        label: libelle affichable en UI (francais).
        delta: variation appliquee au score total (peut etre negative).
        severity: severite ; conditionne l'affichage front (couleur, icone).
        block_ids: ids de blocs layout concernes (coach : highlight canvas).
        advice: explication courte pour le coach (peut etre vide = label seul).
    """

    id: str
    label: str
    delta: int
    severity: RuleSeverity
    block_ids: tuple[str, ...] = ()
    advice: str = ""


@dataclass(frozen=True)
class ScoreResult:
    """Resultat complet d'un calcul de score ATS.

    Attributs:
        kind: ``"parsing"`` ou ``"match"``.
        total: score 0..100 borne (clamp applique par l'engine).
        rules: liste ordonnee des regles appliquees (deltas non nuls).
        version: ``SCORING_VERSION`` au moment du calcul.
    """

    kind: ScoreKind
    total: int
    version: str
    rules: tuple[Rule, ...] = field(default_factory=tuple)

    def with_rule(self, rule: Rule) -> ScoreResult:
        """Retourne un nouveau ``ScoreResult`` enrichi d'une regle supplementaire.

        Le total n'est pas recalcule ici : l'engine (``scoring.py``) doit appeler
        :func:`finalize` apres avoir ajoute toutes les regles voulues. Cette
        immutabilite empeche les bugs ou un caller append une regle sans
        repercuter le delta sur le total.
        """
        return ScoreResult(
            kind=self.kind,
            total=self.total,
            version=self.version,
            rules=(*self.rules, rule),
        )
