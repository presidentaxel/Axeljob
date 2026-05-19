"""Routes API du scoring ATS.

Module isole de ``backend/main.py`` pour conserver une separation claire
"transport HTTP <-> logique metier". Le calcul reel vit dans
``backend.services.ats_score`` ; ici on ne fait que :

1. valider le payload (Pydantic) ;
2. resoudre un layout depuis ``template_id`` si necessaire ;
3. appeler ``score_parsing`` ;
4. serialiser la reponse via ``serialization.score_result_to_dict``.

Ce decoupage permet de tester :

- les schemas / la resolution layout sans serveur (tests directs sur la fonction) ;
- la logique de scoring sans HTTP (tests dans ``test_ats_score_*``).

Voir ``docs/editor-vision.md`` section 10.5 pour la liste complete des routes
ATS prevues (parsing, match, verify-pdf).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel, Field

from backend.services.ats_score import score_parsing
from backend.services.ats_score.serialization import score_result_to_dict
from backend.services.ats_score.template_layout import template_meta_to_layout

# Resolution paresseuse du dossier ``templates/`` : on accepte la valeur par
# defaut du repo, mais on peut la surcharger via ``set_templates_dir`` pour
# les tests.
_DEFAULT_TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates"
_templates_dir: Path = _DEFAULT_TEMPLATES_DIR


def set_templates_dir(path: Path) -> None:
    """Surcharge le repertoire des templates (tests uniquement)."""
    global _templates_dir
    _templates_dir = path


def reset_templates_dir() -> None:
    """Reinitialise le repertoire des templates a sa valeur par defaut."""
    global _templates_dir
    _templates_dir = _DEFAULT_TEMPLATES_DIR


class ScoreParsingBody(BaseModel):
    """Payload d'entree de ``POST /api/ats/score-parsing``.

    Au moins l'un de ``layout`` ou ``template_id`` doit etre fourni :

    - ``layout`` : permet de scorer un layout custom (L2, L3).
    - ``template_id`` : permet de scorer un template livre sans construire
      manuellement un layout (utilise par le selecteur de templates en P0).

    ``cv`` peut etre vide (par exemple pour scorer un template a l'inscription).
    """

    cv: dict[str, Any] | None = None
    layout: dict[str, Any] | None = None
    template_id: str | None = Field(default=None, max_length=64)


def _load_template_meta(template_id: str) -> dict[str, Any]:
    """Charge le ``meta.json`` d'un template livre.

    Leve ``HTTPException(404)`` si le template n'existe pas (interface API
    explicite plutot que ``FileNotFoundError`` cote serveur).
    """
    safe_id = (template_id or "").strip()
    if not safe_id or "/" in safe_id or ".." in safe_id:
        raise HTTPException(status_code=400, detail="template_id invalide")
    meta_path = _templates_dir / safe_id / "meta.json"
    if not meta_path.is_file():
        raise HTTPException(status_code=404, detail=f"Template introuvable : {safe_id}")
    try:
        return json.loads(meta_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as err:
        raise HTTPException(
            status_code=500,
            detail=f"Template invalide : {safe_id} ({err.msg})",
        ) from err


def resolve_layout_for_scoring(
    layout: dict[str, Any] | None,
    template_id: str | None,
) -> dict[str, Any]:
    """Determine le ``layout`` a scorer a partir du body.

    Priorite :

    1. ``layout`` fourni par le client s'il est non vide.
    2. Sinon, conversion ``template_id -> meta.json -> layout``.
    3. Sinon, leve ``HTTPException(400)``.
    """
    if isinstance(layout, dict) and layout:
        return layout
    if template_id:
        meta = _load_template_meta(template_id)
        return template_meta_to_layout(meta)
    raise HTTPException(
        status_code=400,
        detail="layout ou template_id requis.",
    )


def handle_score_parsing(body: ScoreParsingBody) -> dict[str, Any]:
    """Handler pur : prend un body valide, retourne un dict JSON.

    Volontairement decouple du framework HTTP (pas de ``request``) pour
    permettre :

    - les tests directs sans TestClient ;
    - le reuse depuis un job de calibration ou un script CLI.

    L'attachement a FastAPI se fait dans ``backend/main.py`` qui appelle
    cette fonction depuis sa route ``@app.post``.
    """
    layout = resolve_layout_for_scoring(body.layout, body.template_id)
    cv = body.cv if isinstance(body.cv, dict) else {}
    result = score_parsing(cv, layout)
    return score_result_to_dict(result)
