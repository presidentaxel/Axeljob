"""AXE-325 — Scorer plusieurs variantes layout d'import (score_parsing + delta).

Service pur (pas de FastAPI) : utile pour les tests fixtures `import_samples`
et un éventuel endpoint batch plus tard. Le chemin produit FE appelle
``POST /api/ats/score-parsing`` en parallèle via ``scoreImportLayoutVariants.js``.
"""

from __future__ import annotations

from typing import Any

from backend.services.ats_score.scoring import score_parsing
from backend.services.ats_score.serialization import score_result_to_dict


def attach_delta_vs_best(
    scored: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Ajoute ``delta_vs_best`` (= total − meilleur). Le meilleur a 0."""
    if not scored:
        return []
    totals: list[int] = []
    for row in scored:
        total = row.get("score_json", {}).get("total")
        totals.append(int(total) if isinstance(total, (int, float)) else 0)
    best = max(totals) if totals else 0
    out: list[dict[str, Any]] = []
    for row, total in zip(scored, totals, strict=True):
        out.append({**row, "delta_vs_best": total - best})
    return out


def score_import_layout_variants(
    cv: dict[str, Any] | None,
    variants: list[dict[str, Any]],
) -> dict[str, Any]:
    """Score chaque variante ``{ id, layout }``.

    Retour ::
        {
          "variants": [
            { "id", "score_json", "delta_vs_best" },
            ...
          ],
          "best_total": int,
        }
    """
    profile = cv if isinstance(cv, dict) else {}
    scored: list[dict[str, Any]] = []
    for variant in variants:
        if not isinstance(variant, dict):
            raise ValueError("variant must be a dict")
        vid = variant.get("id")
        layout = variant.get("layout")
        if not isinstance(vid, str) or not vid:
            raise ValueError("variant.id required")
        if not isinstance(layout, dict) or not layout:
            raise ValueError(f"variant.layout required for {vid}")
        result = score_parsing(profile, layout)
        scored.append(
            {
                "id": vid,
                "score_json": score_result_to_dict(result),
            }
        )
    with_delta = attach_delta_vs_best(scored)
    best_total = max((int(v["score_json"]["total"]) for v in with_delta), default=0)
    return {"variants": with_delta, "best_total": best_total}
