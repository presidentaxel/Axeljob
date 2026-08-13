"""Routes API du scoring ATS.

Module isole de ``backend/main.py`` pour conserver une separation claire
"transport HTTP <-> logique metier". Le calcul reel vit dans
``backend.services.ats_score`` ; ici on ne fait que :

1. valider le payload (Pydantic) ;
2. resoudre un layout depuis ``template_id`` si necessaire ;
3. appeler ``score_parsing`` / ``verify-pdf`` ;
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

from backend.path_safety import is_safe_id_segment, resolve_under_base
from backend.services.ats_parsing_check import (
    adjust_score_with_ground_truth,
    rules_diff,
    verify_parsing_quality,
)
from backend.services.ats_score import score_parsing
from backend.services.ats_score.serialization import score_result_to_dict
from backend.services.ats_score.template_layout import template_meta_to_layout

# Resolution paresseuse du dossier ``templates/`` : on accepte la valeur par
# defaut du repo, mais on peut la surcharger via ``set_templates_dir`` pour
# les tests.
_DEFAULT_TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates"
_templates_dir: Path = _DEFAULT_TEMPLATES_DIR
_REPO_ROOT = Path(__file__).resolve().parent.parent

# Ecart score JSON vs PDF au-dela duquel un test de non-regression echoue.
VERIFY_PDF_SCORE_DELTA_THRESHOLD: int = 25


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


class VerifyPdfBody(ScoreParsingBody):
    """Payload de ``POST /api/ats/verify-pdf``.

    Meme forme que score-parsing. Optionnellement ``pdf_base64`` permet de
    rejouer une verification sur un PDF deja genere (debug / CI).
    """

    pdf_base64: str | None = Field(default=None, max_length=12_000_000)


def _load_template_meta(template_id: str) -> dict[str, Any]:
    """Charge le ``meta.json`` d'un template livre.

    Leve ``HTTPException(404)`` si le template n'existe pas (interface API
    explicite plutot que ``FileNotFoundError`` cote serveur).
    """
    safe_id = (template_id or "").strip()
    if not is_safe_id_segment(safe_id, max_len=64):
        raise HTTPException(status_code=400, detail="template_id invalide")
    try:
        meta_path = resolve_under_base(_templates_dir, safe_id, "meta.json")
    except ValueError as err:
        raise HTTPException(status_code=400, detail="template_id invalide") from err
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


def _layout_has_pages(layout: dict[str, Any]) -> bool:
    pages = layout.get("pages")
    return isinstance(pages, list) and bool(pages)


def render_verify_pdf_bytes(
    cv: dict[str, Any],
    layout: dict[str, Any],
    template_id: str | None,
) -> bytes:
    """Genere les octets PDF a verifier (layout free-canvas ou template HTML)."""
    from backend.services.generator import generer_pdf_bytes, generer_pdf_bytes_from_html

    if _layout_has_pages(layout):
        from backend.services.layout_renderer import render_html

        html = render_html(cv, layout, for_preview=False)
        pdf_bytes, _ = generer_pdf_bytes_from_html(
            html,
            _REPO_ROOT,
            cv,
            {},
            template_id=template_id,
        )
        return pdf_bytes

    tid = (template_id or "").strip() or str(layout.get("template_id") or "").strip()
    if not tid:
        raise HTTPException(
            status_code=400,
            detail="Pour verify-pdf sans layout.pages, template_id est requis.",
        )
    pdf_bytes, _ = generer_pdf_bytes(
        cv,
        {},
        base_dir=_REPO_ROOT,
        template_id=tid,
    )
    return pdf_bytes


def _decode_optional_pdf_base64(raw: str | None) -> bytes | None:
    if not raw or not str(raw).strip():
        return None
    import base64

    try:
        data = base64.b64decode(str(raw).strip(), validate=False)
    except Exception as err:
        raise HTTPException(status_code=400, detail="pdf_base64 invalide") from err
    if not data.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="pdf_base64 n'est pas un PDF")
    return data


def handle_verify_pdf(body: VerifyPdfBody) -> dict[str, Any]:
    """Compare le score ATS JSON au score ajuste apres extraction du PDF reel.

    Pipeline :

    1. score JSON via ``score_parsing`` ;
    2. PDF fourni (``pdf_base64``) ou genere depuis layout/template ;
    3. metriques ground truth ;
    4. score PDF = score JSON + penalites ground truth ;
    5. diff de regles + blocs divergents.
    """
    layout = resolve_layout_for_scoring(body.layout, body.template_id)
    cv = body.cv if isinstance(body.cv, dict) else {}
    score_json = score_parsing(cv, layout)

    pdf_bytes = _decode_optional_pdf_base64(body.pdf_base64)
    if pdf_bytes is None:
        try:
            pdf_bytes = render_verify_pdf_bytes(cv, layout, body.template_id)
        except HTTPException:
            raise
        except Exception as err:
            raise HTTPException(
                status_code=500,
                detail=f"Impossible de generer le PDF pour verify-pdf : {err}",
            ) from err

    gt = verify_parsing_quality(pdf_bytes, cv, layout=layout)
    score_pdf = adjust_score_with_ground_truth(score_json, gt)
    diff = rules_diff(score_json, score_pdf)
    delta_total = int(score_pdf.total) - int(score_json.total)

    return {
        "score_json": score_result_to_dict(score_json),
        "score_pdf": score_result_to_dict(score_pdf),
        "delta_total": delta_total,
        "within_threshold": abs(delta_total) <= VERIFY_PDF_SCORE_DELTA_THRESHOLD,
        "threshold": VERIFY_PDF_SCORE_DELTA_THRESHOLD,
        "rules_diff": diff,
        "ground_truth": gt,
        "block_ids_divergent": list(gt.get("block_ids_divergent") or []),
    }
