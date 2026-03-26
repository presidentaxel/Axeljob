"""
Métriques CV pour analytics : profil sauvegardé, import, adaptation.
"""
from __future__ import annotations

from typing import Any


def profile_metrics(cv: dict[str, Any] | None) -> dict[str, Any]:
    """Champs « profil / template » (PUT /api/cv), léger pour les logs."""
    if not isinstance(cv, dict):
        return {}
    tid = cv.get("template_id")
    opts = cv.get("template_options")
    return {
        "template_id": (str(tid).strip()[:64] if tid else None),
        "template_options_count": len(opts) if isinstance(opts, dict) else 0,
        "has_photo_url": bool((str(cv.get("photo_url") or "")).strip()),
    }


def cv_content_metrics(cv: dict[str, Any] | None) -> dict[str, Any]:
    """Structure du CV (compteurs), pour suivre la richesse du profil."""
    if not isinstance(cv, dict):
        return {
            "n_experiences": 0,
            "n_formations": 0,
            "n_projets": 0,
            "n_certifications": 0,
            "resume_chars": 0,
            "n_bullets": 0,
        }
    exps = [e for e in (cv.get("experiences") or []) if isinstance(e, dict)]
    n_bullets = 0
    for e in exps:
        for b in e.get("bullet_points") or []:
            if isinstance(b, str) and b.strip():
                n_bullets += 1
    resume = cv.get("resume") or ""
    resume_chars = len(resume.strip()) if isinstance(resume, str) else 0
    forms = [f for f in (cv.get("formations") or []) if isinstance(f, dict)]
    projs = [p for p in (cv.get("projets") or []) if isinstance(p, dict)]
    certs = [c for c in (cv.get("certifications") or []) if isinstance(c, dict)]
    return {
        "n_experiences": len(exps),
        "n_formations": len(forms),
        "n_projets": len(projs),
        "n_certifications": len(certs),
        "resume_chars": resume_chars,
        "n_bullets": n_bullets,
    }


def _rapport_score(r: Any) -> int | None:
    if not isinstance(r, dict):
        return None
    s = r.get("score_global")
    if s is None:
        return None
    try:
        return int(round(float(s)))
    except (TypeError, ValueError):
        return None


def adaptation_metrics(
    cv_base: dict[str, Any] | None,
    merged: dict[str, Any] | None,
    offre: dict[str, Any] | None,
    rapport_before: dict[str, Any] | None,
    rapport_after: dict[str, Any] | None,
) -> dict[str, Any]:
    """Résumé d’une adaptation (scores ATS + taille offre), pour funnels."""
    desc = ""
    if isinstance(offre, dict):
        desc = str(offre.get("description_brute") or "")
    words = len(desc.split()) if desc else 0
    sb = _rapport_score(rapport_before)
    sa = _rapport_score(rapport_after)
    delta = None if sb is None or sa is None else sa - sb
    return {
        "score_ats_before": sb,
        "score_ats_after": sa,
        "score_ats_delta": delta,
        "offre_word_count": words,
        "offre_has_titre": bool(isinstance(offre, dict) and (str(offre.get("titre") or "")).strip()),
        "offre_has_entreprise": bool(isinstance(offre, dict) and (str(offre.get("entreprise") or "")).strip()),
    }


def _nonempty(s: Any) -> bool:
    return isinstance(s, str) and bool(s.strip())


def _exp_meaningful(exp: dict) -> bool:
    if not isinstance(exp, dict):
        return False
    poste = _nonempty(exp.get("poste"))
    ent = _nonempty(exp.get("entreprise"))
    bullets = exp.get("bullet_points") or []
    nb_bullets = sum(1 for b in bullets if _nonempty(b))
    return (poste and ent) or nb_bullets >= 2


def _form_meaningful(f: dict) -> bool:
    if not isinstance(f, dict):
        return False
    return _nonempty(f.get("diplome")) or _nonempty(f.get("etablissement"))


def cv_import_completeness(cv: dict[str, Any] | None) -> dict[str, Any]:
    """
    Score 0–100 + indices lisibles pour comprendre un ré-import ou un profil léger.
    """
    if not isinstance(cv, dict):
        return {
            "score": 0,
            "checks_passed": 0,
            "checks_total": 0,
            "missing_hints": ["invalid_or_empty_cv"],
            "n_experiences": 0,
            "n_experiences_meaningful": 0,
            "n_formations": 0,
            "has_competences_block": False,
        }

    checks: list[tuple[str, bool]] = []

    name_ok = _nonempty(cv.get("prenom")) or _nonempty(cv.get("nom"))
    checks.append(("identity_name", name_ok))

    contact_ok = _nonempty(cv.get("email")) or _nonempty(cv.get("telephone")) or _nonempty(cv.get("linkedin"))
    checks.append(("contact", contact_ok))

    checks.append(("titre_professionnel", _nonempty(cv.get("titre_professionnel"))))

    resume = cv.get("resume") or ""
    checks.append(("resume_80_chars", isinstance(resume, str) and len(resume.strip()) >= 80))

    exps = [e for e in (cv.get("experiences") or []) if isinstance(e, dict)]
    n_meaningful = sum(1 for e in exps if _exp_meaningful(e))
    checks.append(("at_least_one_experience", len(exps) >= 1))
    checks.append(("experience_with_poste_entreprise_or_bullets", n_meaningful >= 1))

    forms = [f for f in (cv.get("formations") or []) if isinstance(f, dict)]
    n_form_ok = sum(1 for f in forms if _form_meaningful(f))
    checks.append(("at_least_one_formation", n_form_ok >= 1))

    comp = cv.get("competences") if isinstance(cv.get("competences"), dict) else {}
    tech = comp.get("techniques") or []
    logi = comp.get("logiciels") or []
    langues = comp.get("langues") or []
    skills_ok = (isinstance(tech, list) and len([x for x in tech if _nonempty(x)]) >= 2) or (
        isinstance(logi, list) and len([x for x in logi if _nonempty(x)]) >= 1
    )
    checks.append(("competences_techniques_or_logiciels", skills_ok))

    lang_ok = isinstance(langues, list) and len([l for l in langues if isinstance(l, dict) and _nonempty(l.get("langue"))]) >= 1
    checks.append(("langues", lang_ok))

    projs = [p for p in (cv.get("projets") or []) if isinstance(p, dict)]
    proj_ok = any(_nonempty(p.get("nom")) or _nonempty(p.get("description")) for p in projs)
    checks.append(("projets_optional", proj_ok))

    passed = sum(1 for _, ok in checks if ok)
    total = len(checks)
    score = int(round(100 * passed / total)) if total else 0
    missing = [name for name, ok in checks if not ok]

    return {
        "score": score,
        "checks_passed": passed,
        "checks_total": total,
        "missing_hints": missing[:16],
        "n_experiences": len(exps),
        "n_experiences_meaningful": n_meaningful,
        "n_formations": len(forms),
        "has_competences_block": bool(comp),
    }
