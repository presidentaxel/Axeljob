"""Resolution des bindings layout v3 -> contenu CV (parite frontend freeCanvasContent)."""

from __future__ import annotations

from typing import Any


def get_by_path(obj: dict | None, path: str) -> Any:
    if not obj or not path:
        return None
    cur: Any = obj
    for part in path.split("."):
        if cur is None:
            return None
        if isinstance(cur, dict):
            cur = cur.get(part)
        elif isinstance(cur, list):
            try:
                cur = cur[int(part)]
            except (ValueError, IndexError, TypeError):
                return None
        else:
            return None
    return cur


def normalize_bind(bind: str | list | None) -> list[str]:
    if isinstance(bind, str) and bind:
        return [bind]
    if isinstance(bind, list):
        return [b for b in bind if isinstance(b, str) and b]
    return []


def resolve_bound_text(cv: dict | None, bind: str | list | None, *, separator: str = " ") -> str:
    paths = normalize_bind(bind)
    if not cv or not paths:
        return ""
    parts: list[str] = []
    for p in paths:
        v = get_by_path(cv, p)
        if isinstance(v, str) and v.strip():
            parts.append(v.strip())
    return separator.join(parts)


def resolve_bound_string_list(cv: dict | None, bind: str | list | None) -> list[str]:
    paths = normalize_bind(bind)
    if not cv or not paths:
        return []
    v = get_by_path(cv, paths[0])
    if not isinstance(v, list):
        return []
    return [str(item).strip() for item in v if isinstance(item, str) and str(item).strip()]


def _slice_limited(items: list, limit: int | None) -> list:
    if isinstance(limit, int | float) and limit > 0:
        return items[: int(limit)]
    return items


def resolve_experiences(cv: dict | None, limit: int | None = None) -> list[dict]:
    all_exp = cv.get("experiences") if isinstance(cv, dict) else None
    if not isinstance(all_exp, list):
        return []
    filtered = [
        e
        for e in all_exp
        if isinstance(e, dict)
        and (
            (e.get("poste") or "").strip()
            or (e.get("entreprise") or "").strip()
            or any((b or "").strip() for b in (e.get("bullet_points") or []))
        )
    ]
    return _slice_limited(filtered, limit)


def resolve_formations(cv: dict | None, limit: int | None = None) -> list[dict]:
    all_f = cv.get("formations") if isinstance(cv, dict) else None
    if not isinstance(all_f, list):
        return []
    filtered = [
        f
        for f in all_f
        if isinstance(f, dict)
        and (
            (f.get("diplome") or "").strip()
            or (f.get("etablissement") or "").strip()
            or (f.get("date") or "").strip()
        )
    ]
    return _slice_limited(filtered, limit)


def resolve_certifications(cv: dict | None, limit: int | None = None) -> list[dict]:
    all_c = cv.get("certifications") if isinstance(cv, dict) else None
    if not isinstance(all_c, list):
        return []
    filtered = [
        c
        for c in all_c
        if isinstance(c, dict)
        and ((c.get("nom") or "").strip() or (c.get("organisme") or "").strip())
    ]
    return _slice_limited(filtered, limit)


def resolve_projets(cv: dict | None, limit: int | None = None) -> list[dict]:
    all_p = cv.get("projets") if isinstance(cv, dict) else None
    if not isinstance(all_p, list):
        return []
    filtered = [
        p
        for p in all_p
        if isinstance(p, dict)
        and ((p.get("nom") or "").strip() or (p.get("description") or "").strip())
    ]
    return _slice_limited(filtered, limit)


def resolve_langues(cv: dict | None) -> list[dict]:
    comp = cv.get("competences") if isinstance(cv, dict) else None
    langues = comp.get("langues") if isinstance(comp, dict) else None
    if not isinstance(langues, list):
        return []
    return [row for row in langues if isinstance(row, dict) and (row.get("langue") or "").strip()]
