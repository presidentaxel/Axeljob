#!/usr/bin/env python3
"""
Règles ATS déterministes : scoring, marquage des zones à adapter, réordonnancement, rapport.
"""

import re
from copy import deepcopy


def _texte_plat(obj) -> str:
    """Flatten dict/list/bullets into one lowercase string for matching."""
    if isinstance(obj, str):
        return obj.lower()
    if isinstance(obj, list):
        return " ".join(_texte_plat(x) for x in obj).lower()
    if isinstance(obj, dict):
        return " ".join(_texte_plat(v) for v in obj.values()).lower()
    return ""


def _mots_offre(offre: dict) -> set:
    """Ensemble des mots-clés et compétences de l'offre (tokens)."""
    mots = set()
    for k in ("mots_cles_extraits", "competences_requises"):
        for item in offre.get(k) or []:
            if isinstance(item, str):
                mots.add(item.lower().strip())
    # Tokeniser le titre de l'offre
    titre = (offre.get("titre") or "").lower()
    mots.update(re.findall(r"\w+", titre))
    return mots


def _score_experience(exp: dict, mots_offre: set) -> float:
    """Score 0-10 : nombre de mots-clés de l'offre présents dans l'expérience."""
    if not mots_offre:
        return 5.0
    texte = _texte_plat({
        "poste": exp.get("poste", ""),
        "entreprise": exp.get("entreprise", ""),
        "bullet_points": exp.get("bullet_points", []),
        "mots_cles": exp.get("mots_cles", []),
        "clients": exp.get("clients", ""),
    })
    tokens_texte = set(re.findall(r"\w+", texte))
    # Match exact de mots
    matches = sum(1 for m in mots_offre if m in texte or m in tokens_texte)
    # Normaliser sur 10 (au moins 1 mot = 1 point, plafond 10)
    return min(10.0, max(0.0, (matches / max(len(mots_offre), 1)) * 10.0))


def appliquer_regles(cv: dict, offre: dict) -> dict:
    """
    Enrichit le CV avec score_pertinence, a_renforcer, titre_a_adapter, resume_a_adapter,
    réordonne les expériences par pertinence, et ajoute un objet rapport.
    """
    cv_enrichi = deepcopy(cv)
    mots_offre = _mots_offre(offre)
    titre_offre = (offre.get("titre") or "").lower()
    titre_cv = (cv.get("titre_professionnel") or "").lower()
    resume_cv = (cv.get("resume") or "").lower()

    # Règle 1 — Scoring de pertinence
    for exp in cv_enrichi.get("experiences", []):
        exp["score_pertinence"] = _score_experience(exp, mots_offre)

    # Règle 2 — Marquage des zones à adapter
    mots_dans_cv = _texte_plat(cv_enrichi)
    mots_manquants = [m for m in mots_offre if len(m) > 2 and m not in mots_dans_cv]
    titres_offre = set(re.findall(r"\w+", titre_offre))

    titre_a_adapter = bool(titres_offre and not any(t in titre_cv for t in titres_offre))
    cv_enrichi["titre_a_adapter"] = titre_a_adapter

    resume_mots = set(re.findall(r"\w+", resume_cv))
    resume_match = sum(1 for m in mots_offre if m in resume_cv or m in resume_mots)
    cv_enrichi["resume_a_adapter"] = resume_match < 2

    # Marquer a_renforcer sur les expériences les plus pertinentes par secteur si mots manquants
    if mots_manquants:
        experiences = cv_enrichi.get("experiences", [])
        if experiences:
            # Trier par score pour marquer les top exp (où on va injecter les mots-clés)
            sorted_exp = sorted(experiences, key=lambda e: e.get("score_pertinence", 0), reverse=True)
            for exp in sorted_exp[: max(2, len(experiences) // 2)]:
                exp["a_renforcer"] = True
    else:
        for exp in cv_enrichi.get("experiences", []):
            exp["a_renforcer"] = False

    # Règle 3 — Réordonnancement des expériences par score décroissant
    cv_enrichi["experiences"] = sorted(
        cv_enrichi.get("experiences", []),
        key=lambda e: e.get("score_pertinence", 0),
        reverse=True,
    )

    # Règle 4 — Rapport
    scores = [e.get("score_pertinence", 0) for e in cv_enrichi.get("experiences", [])]
    score_global = round((sum(scores) / len(scores)) if scores else 0, 1)

    zones = []
    if cv_enrichi.get("titre_a_adapter"):
        zones.append("titre")
    if cv_enrichi.get("resume_a_adapter"):
        zones.append("resume")
    for i, exp in enumerate(cv_enrichi.get("experiences", [])):
        if exp.get("a_renforcer"):
            zones.append(f"exp_{i+1}")

    cv_enrichi["rapport"] = {
        "score_global": score_global,
        "zones_a_adapter": zones,
        "mots_cles_manquants": mots_manquants[:20],
    }

    return cv_enrichi
