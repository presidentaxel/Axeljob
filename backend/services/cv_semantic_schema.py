"""Schéma CV sémantique — dual-key FR/EN (AXE-332).

Source de vérité historique : clés FR (`prenom`, `nom`, …).
Miroirs EN (`first_name`, `last_name`, …) synchronisés pour interop LLM / templates.
"""

from __future__ import annotations

from copy import deepcopy
from typing import Any

# Paires (fr_key, en_key). FR gagne si les deux sont non vides et divergent.
IDENTITY_DUAL_KEYS: tuple[tuple[str, str], ...] = (
    ("prenom", "first_name"),
    ("nom", "last_name"),
)

# Champs scalaires suivis dans semantic_meta.fields
SCALAR_META_FIELDS: tuple[str, ...] = (
    "prenom",
    "nom",
    "first_name",
    "last_name",
    "email",
    "telephone",
    "linkedin",
    "ville",
    "titre_professionnel",
    "resume",
)

SECTION_META_KEYS: tuple[str, ...] = (
    "experiences",
    "formations",
    "certifications",
    "competences",
    "projets",
)


def _nonempty_str(value: Any) -> str:
    return str(value or "").strip()


def sync_dual_keys(cv: dict[str, Any] | None) -> dict[str, Any]:
    """Assure la cohérence prenom↔first_name et nom↔last_name.

    Règle : si une seule côté remplie → copie. Si les deux diffèrent → FR gagne.
    """
    out: dict[str, Any] = deepcopy(cv) if isinstance(cv, dict) else {}
    for fr_key, en_key in IDENTITY_DUAL_KEYS:
        fr_val = _nonempty_str(out.get(fr_key))
        en_val = _nonempty_str(out.get(en_key))
        if fr_val and en_val:
            if fr_val.lower() != en_val.lower():
                out[en_key] = fr_val
            else:
                out[fr_key] = fr_val
                out[en_key] = en_val
        elif fr_val:
            out[en_key] = fr_val
        elif en_val:
            out[fr_key] = en_val
            out[en_key] = en_val
        else:
            out.setdefault(fr_key, "")
            out.setdefault(en_key, "")
    return out


def _section_filled(cv: dict[str, Any], key: str) -> bool:
    val = cv.get(key)
    if key == "competences" and isinstance(val, dict):
        for list_key in ("techniques", "logiciels", "autres"):
            items = val.get(list_key) or []
            if any(_nonempty_str(x) for x in items):
                return True
        langues = val.get("langues") or []
        return any(_nonempty_str(x.get("langue") if isinstance(x, dict) else x) for x in langues)
    if isinstance(val, list):
        for item in val:
            if not isinstance(item, dict):
                if _nonempty_str(item):
                    return True
                continue
            for k, v in item.items():
                if k == "id":
                    continue
                if isinstance(v, list) and any(_nonempty_str(x) for x in v):
                    return True
                if _nonempty_str(v):
                    return True
        return False
    return bool(_nonempty_str(val))


def estimate_field_confidence(cv: dict[str, Any]) -> dict[str, float]:
    """Heuristique de confiance post-extraction (pas un 2e LLM)."""
    conf: dict[str, float] = {}
    for key in SCALAR_META_FIELDS:
        conf[key] = 0.9 if _nonempty_str(cv.get(key)) else 0.0
    # Dual-key : même confiance sur le miroir
    for fr_key, en_key in IDENTITY_DUAL_KEYS:
        c = max(conf.get(fr_key, 0.0), conf.get(en_key, 0.0))
        conf[fr_key] = c
        conf[en_key] = c
    for key in SECTION_META_KEYS:
        conf[key] = 0.85 if _section_filled(cv, key) else 0.0
    return conf


def build_semantic_meta(
    cv: dict[str, Any] | None,
    *,
    field_confidence: dict[str, float] | None = None,
    source: str = "import",
    section_passes: list[str] | None = None,
) -> dict[str, Any]:
    """Métadonnées sémantiques exposées à l'API / FE (hints discrets si confiance basse)."""
    synced = sync_dual_keys(cv)
    conf = field_confidence or estimate_field_confidence(synced)
    low = [k for k, v in conf.items() if 0 < v < 0.75]
    missing = [k for k in ("prenom", "nom", "email") if not _nonempty_str(synced.get(k))]
    return {
        "schema_version": 1,
        "source": source,
        "dual_key": True,
        "fields": {k: round(float(v), 3) for k, v in conf.items()},
        "low_confidence_fields": low,
        "missing_critical_fields": missing,
        "section_passes": list(section_passes or []),
    }
