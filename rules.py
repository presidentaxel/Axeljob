#!/usr/bin/env python3
"""
Règles ATS déterministes : scoring, marquage des zones à adapter, réordonnancement, rapport.

Calcul du score ATS (score_global sur 10) :
  - Titre (20 %) : adéquation du titre professionnel du CV avec les mots du titre du poste.
  - Résumé (30 %) : part des mots-clés de l'offre présents dans le résumé.
  - Expériences (50 %) : moyenne des scores de pertinence de chaque expérience (mots-clés
    de l'offre présents dans poste, entreprise, bullet_points, mots_cles).
  Si l'offre n'a pas de titre renseigné, le poids est reporté sur résumé + expériences.
  Les mots-clés de l'offre viennent de : mots_cles_extraits, competences_requises, et
  tokens du titre de l'offre (passés par l'API adapt avec titre/entreprise quand dispo).
"""

import re
from copy import deepcopy

# Suffixes à retirer pour pseudo-stemming français (pas de dépendance externe)
_FR_SUFFIXES = sorted([
    "ement", "ement", "ation", "ition", "ement", "ments", "ment", "ions",
    "tion", "sion", "ence", "ance", "ités", "ités", "ique", "ques",
    "eurs", "euse", "eur", "eux", "ant", "ent", "ait", "ais",
    "aux", "als", "ées", "ées", "és", "ée", "er", "ir", "es", "és",
], key=len, reverse=True)

_FR_STOPWORDS = frozenset({
    "le", "la", "les", "de", "du", "des", "et", "en", "un", "une", "pour",
    "dans", "sur", "avec", "par", "aux", "ce", "cette", "son", "sa", "ses",
    "que", "qui", "qu", "au", "est", "sont", "être", "avoir", "nous", "vous",
    "ils", "elle", "on", "il", "je", "tu", "me", "te", "se", "ou", "mais",
    "donc", "car", "ni", "pas", "plus", "tout", "tous", "ces", "nos", "vos",
    "dont", "comme", "sans", "sous", "chez", "entre", "leur", "leurs",
    "votre", "notre", "fait", "faire", "peut", "doit", "sera", "été",
    "très", "bien", "aussi", "même", "soit", "lors", "où", "quel", "quelle",
    "a", "à", "the", "and", "or", "of", "in", "to", "for", "is", "at", "by",
    "an", "be", "as", "on", "it", "we", "you", "are", "was", "has", "had",
})


def _stem_fr(word: str) -> str:
    """Pseudo-stemming français léger (sans dépendance externe)."""
    if len(word) <= 3:
        return word
    for suffix in _FR_SUFFIXES:
        if word.endswith(suffix) and len(word) - len(suffix) >= 3:
            return word[:-len(suffix)]
    return word


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
    """Ensemble des mots-clés de l'offre, nettoyés et stemmés."""
    mots = set()
    for k in ("mots_cles_extraits", "competences_requises"):
        for item in offre.get(k) or []:
            if isinstance(item, str):
                clean = item.lower().strip()
                if clean and clean not in _FR_STOPWORDS:
                    mots.add(clean)
    titre = (offre.get("titre") or "").lower()
    for token in re.findall(r"\w+", titre):
        if len(token) > 2 and token not in _FR_STOPWORDS:
            mots.add(token)
    return mots


def _score_experience(exp: dict, mots_offre: set) -> float:
    """Score 0-10 : mots-clés de l'offre retrouvés dans l'expérience (word-boundary + stemming)."""
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
    stems_texte = {_stem_fr(t) for t in tokens_texte}

    matches = 0
    for m in mots_offre:
        m_words = m.split()
        if len(m_words) > 1:
            if m in texte:
                matches += 1
        else:
            if m in tokens_texte or _stem_fr(m) in stems_texte:
                matches += 1
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

    # Règle 1 - Scoring de pertinence
    for exp in cv_enrichi.get("experiences", []):
        exp["score_pertinence"] = _score_experience(exp, mots_offre)

    # Règle 2 - Marquage des zones à adapter
    mots_dans_cv = _texte_plat(cv_enrichi)
    mots_manquants = [m for m in mots_offre if len(m) > 2 and m not in mots_dans_cv]
    titres_offre = {t for t in re.findall(r"\w+", titre_offre) if len(t) > 2 and t not in _FR_STOPWORDS}

    titre_a_adapter = bool(titres_offre and not any(t in titre_cv for t in titres_offre))
    cv_enrichi["titre_a_adapter"] = titre_a_adapter

    resume_tokens = set(re.findall(r"\w+", resume_cv))
    resume_a_adapter_count = sum(1 for m in mots_offre if m in resume_cv or m in resume_tokens)
    cv_enrichi["resume_a_adapter"] = resume_a_adapter_count < 2

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

    # Règle 3 - Réordonnancement des expériences par score décroissant
    cv_enrichi["experiences"] = sorted(
        cv_enrichi.get("experiences", []),
        key=lambda e: e.get("score_pertinence", 0),
        reverse=True,
    )

    # Règle 4 - Rapport (score global pondéré pour varier selon le poste)
    scores_exp = [e.get("score_pertinence", 0) for e in cv_enrichi.get("experiences", [])]
    mean_exp = (sum(scores_exp) / len(scores_exp)) if scores_exp else 0.0

    # Score titre 0-10 : mots du titre de l'offre présents dans le titre CV
    if not titres_offre:
        score_titre = 5.0
    else:
        tokens_titre_cv = set(re.findall(r"\w+", titre_cv))
        stems_titre_cv = {_stem_fr(t) for t in tokens_titre_cv}
        match_titre = sum(1 for t in titres_offre if t in tokens_titre_cv or _stem_fr(t) in stems_titre_cv)
        score_titre = min(10.0, (match_titre / max(len(titres_offre), 1)) * 10.0)

    resume_stems = {_stem_fr(t) for t in resume_tokens}
    if not mots_offre:
        score_resume = 5.0
    else:
        resume_match_count = 0
        for m in mots_offre:
            m_words = m.split()
            if len(m_words) > 1:
                if m in resume_cv:
                    resume_match_count += 1
            else:
                if m in resume_tokens or _stem_fr(m) in resume_stems:
                    resume_match_count += 1
        score_resume = min(10.0, (resume_match_count / max(len(mots_offre), 1)) * 10.0)

    # Pondération : titre 20 %, résumé 30 %, expériences 50 % (si pas de titre offre → 40 % résumé, 60 % exp)
    if titres_offre:
        score_global = 0.2 * score_titre + 0.3 * score_resume + 0.5 * mean_exp
    else:
        score_global = 0.4 * score_resume + 0.6 * mean_exp
    score_global = round(min(10.0, max(0.0, score_global)), 1)

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
        "mots_cles_manquants": mots_manquants[:35],
    }

    return cv_enrichi
