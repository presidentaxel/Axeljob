#!/usr/bin/env python3
"""
Règles ATS déterministes : scoring, marquage des zones à adapter, réordonnancement, rapport.
"""

import re
from copy import deepcopy

_FR_SUFFIXES = sorted(
    [
        "ement",
        "ation",
        "ition",
        "ments",
        "ment",
        "ions",
        "tion",
        "sion",
        "ence",
        "ance",
        "ités",
        "ique",
        "ques",
        "eurs",
        "euse",
        "eur",
        "eux",
        "ant",
        "ent",
        "ait",
        "ais",
        "aux",
        "als",
        "ées",
        "és",
        "ée",
        "er",
        "ir",
        "es",
    ],
    key=len,
    reverse=True,
)

_FR_STOPWORDS = frozenset(
    {
        "le",
        "la",
        "les",
        "de",
        "du",
        "des",
        "et",
        "en",
        "un",
        "une",
        "pour",
        "dans",
        "sur",
        "avec",
        "par",
        "aux",
        "ce",
        "cette",
        "son",
        "sa",
        "ses",
        "que",
        "qui",
        "qu",
        "au",
        "est",
        "sont",
        "être",
        "avoir",
        "nous",
        "vous",
        "ils",
        "elle",
        "on",
        "il",
        "je",
        "tu",
        "me",
        "te",
        "se",
        "ou",
        "mais",
        "donc",
        "car",
        "ni",
        "pas",
        "plus",
        "tout",
        "tous",
        "ces",
        "nos",
        "vos",
        "dont",
        "comme",
        "sans",
        "sous",
        "chez",
        "entre",
        "leur",
        "leurs",
        "votre",
        "notre",
        "fait",
        "faire",
        "peut",
        "doit",
        "sera",
        "été",
        "très",
        "bien",
        "aussi",
        "même",
        "soit",
        "lors",
        "où",
        "quel",
        "quelle",
        "a",
        "à",
        "the",
        "and",
        "or",
        "of",
        "in",
        "to",
        "for",
        "is",
        "at",
        "by",
        "an",
        "be",
        "as",
        "it",
        "we",
        "you",
        "are",
        "was",
        "has",
        "had",
    }
)

_ACTION_VERBS = frozenset(
    {
        "géré",
        "développé",
        "créé",
        "piloté",
        "animé",
        "coordonné",
        "optimisé",
        "conçu",
        "dirigé",
        "réalisé",
        "analysé",
        "implémenté",
        "mis",
        "amélioré",
        "organisé",
        "supervisé",
        "lancé",
        "établi",
        "contribué",
        "accompagné",
        "négocié",
        "formé",
        "encadré",
        "déployé",
        "restructuré",
        "conduit",
        "élaboré",
        "défini",
        "assuré",
        "réduit",
        "augmenté",
        "automatisé",
        "suivi",
        "participé",
        "identifié",
        "résolu",
        "proposé",
        "livré",
        "managed",
        "developed",
        "created",
        "led",
        "coordinated",
        "optimized",
        "designed",
        "implemented",
        "improved",
        "organized",
        "launched",
        "built",
        "analyzed",
        "delivered",
        "reduced",
        "increased",
        "automated",
        "resolved",
    }
)


def _stem_fr(word: str) -> str:
    if len(word) <= 3:
        return word
    for suffix in _FR_SUFFIXES:
        if word.endswith(suffix) and len(word) - len(suffix) >= 3:
            return word[: -len(suffix)]
    return word


def _tokenize(text: str) -> set[str]:
    return set(re.findall(r"\w+", text.lower())) if text else set()


def _strip_hf_suffix(text: str) -> str:
    if not text or not isinstance(text, str):
        return text or ""
    s = text.strip()
    for suffix in ("(H/F)", "(F/H)", "(h/f)", "(f/h)"):
        if s.endswith(suffix):
            s = s[: -len(suffix)].strip()
    return s


def _titre_offre_effectif_lower(offre: dict) -> str:
    explicit = (offre.get("titre") or "").strip()
    if explicit:
        return explicit.lower()
    desc = (offre.get("description_brute") or "").strip()
    if not desc:
        return ""
    first_line = desc.split("\n", 1)[0].strip()
    if not first_line or len(first_line) > 120 or len(first_line.split()) > 14:
        return ""
    return first_line.lower()


def _texte_plat(obj) -> str:
    if isinstance(obj, str):
        return obj.lower()
    if isinstance(obj, list):
        return " ".join(_texte_plat(x) for x in obj).lower()
    if isinstance(obj, dict):
        return " ".join(_texte_plat(v) for v in obj.values()).lower()
    return ""


def _mots_offre(offre: dict) -> set[str]:
    mots = set()
    for k in ("mots_cles_extraits", "competences_requises"):
        for item in offre.get(k) or []:
            if isinstance(item, str):
                clean = item.lower().strip()
                if clean and clean not in _FR_STOPWORDS:
                    mots.add(clean)
    for token in re.findall(r"\w+", (offre.get("titre") or "").lower()):
        if len(token) > 2 and token not in _FR_STOPWORDS:
            mots.add(token)
    return mots


def _keyword_in_text(keyword: str, text_flat: str, tokens: set[str], stems: set[str]) -> float:
    kw_words = keyword.split()
    if len(kw_words) > 1:
        if keyword in text_flat:
            return 1.0
        stems_phrase = " ".join(_stem_fr(w) for w in kw_words)
        stemmed_text = " ".join(_stem_fr(w) for w in re.findall(r"\w+", text_flat))
        return 0.5 if stems_phrase in stemmed_text else 0.0
    if keyword in tokens:
        return 1.0
    return 0.5 if _stem_fr(keyword) in stems else 0.0


def _score_keyword_coverage(cv: dict, mots: set[str]) -> tuple[float, list[str], list[str]]:
    if not mots:
        return 50.0, [], []
    full_text = _texte_plat(
        {
            "titre": cv.get("titre_professionnel", ""),
            "resume": cv.get("resume", ""),
            "experiences": cv.get("experiences", []),
            "competences": cv.get("competences", {}),
            "formations": cv.get("formations", []),
            "projets": cv.get("projets", []),
            "mots_cles_cache": cv.get("mots_cles_cache", ""),
        }
    )
    tokens = _tokenize(full_text)
    stems = {_stem_fr(t) for t in tokens}
    total_score = 0.0
    matched, missing = [], []
    for m in mots:
        s = _keyword_in_text(m, full_text, tokens, stems)
        total_score += s
        (matched if s > 0 else missing).append(m)
    ratio = total_score / len(mots)
    return min(100.0, ratio * 100.0), matched, missing


def _score_ats_section(cv: dict, mots: set[str]) -> float:
    cache = (cv.get("mots_cles_cache") or "").strip()
    if not cache:
        return 0.0
    if not mots:
        return 60.0
    cache_lower = cache.lower()
    cache_tokens = _tokenize(cache)
    cache_stems = {_stem_fr(t) for t in cache_tokens}
    matches = sum(
        1 for m in mots if _keyword_in_text(m, cache_lower, cache_tokens, cache_stems) > 0
    )
    density = matches / len(mots)
    length_bonus = min(1.0, len(cache.split()) / 30.0)
    return min(100.0, density * 70.0 + length_bonus * 30.0)


def _score_structure(cv: dict) -> tuple[float, list[str], list[str]]:
    points = 0.0
    max_points = 0.0
    strengths, weaknesses = [], []
    has_title = bool((cv.get("titre_professionnel") or "").strip())
    max_points += 12
    if has_title:
        points += 12
        strengths.append("Titre professionnel présent")
    else:
        weaknesses.append("Ajouter un titre professionnel clair")
    has_resume = bool((cv.get("resume") or "").strip())
    resume_len = len((cv.get("resume") or "").split())
    max_points += 15
    if has_resume and resume_len >= 15:
        points += 15
        strengths.append("Résumé / accroche bien développé")
    elif has_resume:
        points += 8
        weaknesses.append("Étoffer le résumé (viser 30+ mots)")
    else:
        weaknesses.append("Ajouter un résumé professionnel")
    experiences = cv.get("experiences") or []
    max_points += 20
    if experiences:
        points += min(20, len(experiences) * 5)
    else:
        weaknesses.append("Aucune expérience renseignée")
    all_bullets = []
    for exp in experiences:
        for bp in exp.get("bullet_points") or []:
            if isinstance(bp, str) and bp.strip():
                all_bullets.append(bp.strip())
    if len(all_bullets) >= 3:
        strengths.append(f"{len(all_bullets)} bullet points structurés")
    elif experiences:
        weaknesses.append("Ajouter des bullet points aux expériences")
    max_points += 10
    if all_bullets:
        verb_ratio = sum(
            1 for b in all_bullets if b.split() and b.split()[0].lower() in _ACTION_VERBS
        ) / len(all_bullets)
        points += verb_ratio * 10
        if verb_ratio >= 0.5:
            strengths.append("Verbes d'action utilisés")
    has_contact = bool((cv.get("email") or "").strip()) or bool((cv.get("telephone") or "").strip())
    max_points += 8
    if has_contact:
        points += 8
        strengths.append("Coordonnées présentes")
    else:
        weaknesses.append("Ajouter des coordonnées (email, téléphone)")
    tech = [
        c
        for c in ((cv.get("competences") or {}).get("techniques") or [])
        if isinstance(c, str) and c.strip()
    ]
    max_points += 15
    if len(tech) >= 3:
        points += 15
        strengths.append(f"{len(tech)} compétences techniques listées")
    elif tech:
        points += 8
        weaknesses.append("Ajouter plus de compétences techniques")
    else:
        weaknesses.append("Section compétences techniques manquante")
    max_points += 10
    if cv.get("formations") or []:
        points += 10
        strengths.append("Formation renseignée")
    else:
        weaknesses.append("Ajouter au moins une formation")
    max_points += 10
    if all_bullets:
        quant_count = sum(1 for b in all_bullets if any(ch.isdigit() for ch in b))
        quant_ratio = quant_count / len(all_bullets)
        points += min(10, quant_ratio * 10)
        if quant_ratio >= 0.2:
            strengths.append("Résultats chiffrés mentionnés")
    return (points / max(max_points, 1)) * 100.0, strengths, weaknesses


def _score_title_match(cv: dict, offre: dict) -> float:
    offre_tokens = {
        t
        for t in re.findall(r"\w+", _titre_offre_effectif_lower(offre))
        if len(t) > 2 and t not in _FR_STOPWORDS
    }
    if not offre_tokens:
        return 50.0
    cv_tokens = _tokenize(_strip_hf_suffix((cv.get("titre_professionnel") or "").strip()).lower())
    cv_stems = {_stem_fr(t) for t in cv_tokens}
    matches = 0.0
    for t in offre_tokens:
        if t in cv_tokens:
            matches += 1.0
        elif _stem_fr(t) in cv_stems:
            matches += 0.6
    return min(100.0, (matches / len(offre_tokens)) * 100.0)


def _score_skills_match(cv: dict, offre: dict) -> float:
    all_skills = []
    comp = cv.get("competences") or {}
    for key in ("techniques", "soft_skills", "transversales", "outils"):
        for c in comp.get(key) or []:
            if isinstance(c, str) and c.strip():
                all_skills.append(c.lower().strip())
    if not all_skills:
        return 20.0
    offre_text = _texte_plat(
        {
            "desc": offre.get("description_brute", ""),
            "comp": offre.get("competences_requises", []),
            "kw": offre.get("mots_cles_extraits", []),
            "titre": offre.get("titre", ""),
        }
    )
    offre_tokens = _tokenize(offre_text)
    offre_stems = {_stem_fr(t) for t in offre_tokens}
    matched = 0
    for skill in all_skills:
        skill_tokens = set(re.findall(r"\w+", skill))
        if len(skill_tokens) > 1 and skill in offre_text:
            matched += 1
            continue
        for st in skill_tokens:
            if st in offre_tokens or _stem_fr(st) in offre_stems:
                matched += 1
                break
    return min(100.0, (matched / len(all_skills)) * 100.0)


def _score_experience(exp: dict, mots: set[str]) -> float:
    if not mots:
        return 5.0
    texte = _texte_plat(
        {
            "poste": exp.get("poste", ""),
            "entreprise": exp.get("entreprise", ""),
            "bullet_points": exp.get("bullet_points", []),
            "mots_cles": exp.get("mots_cles", []),
            "clients": exp.get("clients", ""),
        }
    )
    tokens = _tokenize(texte)
    stems = {_stem_fr(t) for t in tokens}
    total = sum(_keyword_in_text(m, texte, tokens, stems) for m in mots)
    return min(10.0, max(0.0, (total / max(len(mots), 1)) * 10.0))


def appliquer_regles(cv: dict, offre: dict) -> dict:
    cv_enrichi = deepcopy(cv)
    mots = _mots_offre(offre)
    titre_offre = _titre_offre_effectif_lower(offre)
    titre_cv = _strip_hf_suffix((cv.get("titre_professionnel") or "").strip()).lower()
    resume_cv = (cv.get("resume") or "").lower()
    for exp in cv_enrichi.get("experiences", []):
        exp["score_pertinence"] = _score_experience(exp, mots)
    mots_dans_cv = _texte_plat(cv_enrichi)
    mots_manquants_set = [m for m in mots if len(m) > 2 and m not in mots_dans_cv]
    titres_offre = {
        t for t in re.findall(r"\w+", titre_offre) if len(t) > 2 and t not in _FR_STOPWORDS
    }
    cv_enrichi["titre_a_adapter"] = bool(
        titres_offre and not any(t in titre_cv for t in titres_offre)
    )
    resume_tokens = _tokenize(resume_cv)
    cv_enrichi["resume_a_adapter"] = (
        sum(1 for m in mots if m in resume_cv or m in resume_tokens) < 2
    )
    if mots_manquants_set and cv_enrichi.get("experiences"):
        sorted_exp = sorted(
            cv_enrichi["experiences"], key=lambda e: e.get("score_pertinence", 0), reverse=True
        )
        for exp in sorted_exp[: max(2, len(cv_enrichi["experiences"]) // 2)]:
            exp["a_renforcer"] = True
    else:
        for exp in cv_enrichi.get("experiences", []):
            exp["a_renforcer"] = False
    cv_enrichi["experiences"] = sorted(
        cv_enrichi.get("experiences", []), key=lambda e: e.get("score_pertinence", 0), reverse=True
    )
    kw_score, kw_matched, kw_missing = _score_keyword_coverage(cv, mots)
    ats_section_score = _score_ats_section(cv, mots)
    structure_score, struct_strengths, struct_weaknesses = _score_structure(cv)
    title_score = _score_title_match(cv, offre)
    skills_score = _score_skills_match(cv, offre)
    score_global = round(
        min(
            100.0,
            max(
                0.0,
                0.35 * kw_score
                + 0.15 * ats_section_score
                + 0.20 * structure_score
                + 0.15 * title_score
                + 0.15 * skills_score,
            ),
        )
    )
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
        "mots_cles_manquants": kw_missing[:35],
        "mots_cles_trouves": kw_matched[:35],
        "detail": {
            "keyword_coverage": round(kw_score),
            "ats_section": round(ats_section_score),
            "structure": round(structure_score),
            "title_match": round(title_score),
            "skills_match": round(skills_score),
        },
        "strengths": struct_strengths,
        "weaknesses": struct_weaknesses,
    }
    return cv_enrichi
