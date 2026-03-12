"""
Métriques structurelles et qualitatives calculées sur un CV pour le mémoire.
Toutes les fonctions sont pures (pas d'I/O) et retournent des dicts sérialisables.
"""
import re
from typing import Any

VERBES_ACTION_FR = {
    "géré", "développé", "créé", "piloté", "animé", "coordonné", "optimisé",
    "conçu", "dirigé", "réalisé", "analysé", "implémenté", "mis", "amélioré",
    "organisé", "supervisé", "lancé", "établi", "contribué", "accompagné",
    "négocié", "formé", "encadré", "déployé", "restructuré", "conduit",
    "élaboré", "défini", "assuré", "réduit", "augmenté", "automatisé",
    "suivi", "participé", "identifié", "résolu", "proposé", "livré",
    "managed", "developed", "created", "led", "coordinated", "optimized",
    "designed", "implemented", "improved", "organized", "launched", "built",
    "analyzed", "delivered", "reduced", "increased", "automated", "resolved",
}


def _words(text: str) -> list[str]:
    if not text:
        return []
    return re.findall(r"\w+", text.lower())


def _has_quantification(text: str) -> bool:
    return bool(re.search(r"\d+[%€$kKmM]?|\d+\s*%|\d+\s*€", text or ""))


def _starts_with_action_verb(text: str) -> bool:
    words = _words(text)
    return bool(words and words[0] in VERBES_ACTION_FR)


def profile_metrics(cv: dict) -> dict[str, Any]:
    """Métriques de complétion et structure du profil."""
    experiences = cv.get("experiences") or []
    formations = cv.get("formations") or []
    projets = cv.get("projets") or []
    competences = cv.get("competences") or {}
    comp_tech = competences.get("techniques") or []
    comp_soft = competences.get("soft_skills") or competences.get("transversales") or []
    langues = competences.get("langues") or cv.get("langues") or []

    has_name = bool((cv.get("prenom") or "").strip() and (cv.get("nom") or "").strip())
    has_title = bool((cv.get("titre_professionnel") or "").strip())
    has_email = bool((cv.get("email") or "").strip())
    has_phone = bool((cv.get("telephone") or "").strip())
    has_photo = bool((cv.get("photo_url") or "").strip())
    has_resume = bool((cv.get("resume") or "").strip())
    has_linkedin = bool((cv.get("linkedin") or "").strip())

    all_bullets = []
    for exp in experiences:
        for bp in exp.get("bullet_points") or []:
            if isinstance(bp, str) and bp.strip():
                all_bullets.append(bp.strip())

    resume_words = _words(cv.get("resume") or "")

    checks = [has_name, has_title, has_email,
              any(e.get("poste", "").strip() for e in experiences),
              any(f.get("diplome", "").strip() for f in formations),
              bool([c for c in comp_tech if isinstance(c, str) and c.strip()])]
    completion_pct = round(sum(checks) / max(len(checks), 1) * 100)

    return {
        "completion_pct": completion_pct,
        "has_name": has_name,
        "has_title": has_title,
        "has_email": has_email,
        "has_phone": has_phone,
        "has_photo": has_photo,
        "has_resume": has_resume,
        "has_linkedin": has_linkedin,
        "nb_experiences": len(experiences),
        "nb_formations": len(formations),
        "nb_projets": len(projets),
        "nb_competences_tech": len([c for c in comp_tech if isinstance(c, str) and c.strip()]),
        "nb_competences_soft": len([c for c in comp_soft if isinstance(c, str) and c.strip()]),
        "nb_langues": len([la for la in langues if (la.get("langue") if isinstance(la, dict) else la or "").strip()]),
        "resume_word_count": len(resume_words),
        "total_bullet_points": len(all_bullets),
        "avg_bullets_per_exp": round(len(all_bullets) / max(len(experiences), 1), 1),
    }


def cv_content_metrics(cv: dict) -> dict[str, Any]:
    """Analyse qualitative du contenu : verbes d'action, quantifications, diversité lexicale."""
    all_bullets = []
    for exp in cv.get("experiences") or []:
        for bp in exp.get("bullet_points") or []:
            if isinstance(bp, str) and bp.strip():
                all_bullets.append(bp.strip())

    bullets_with_verb = sum(1 for b in all_bullets if _starts_with_action_verb(b))
    bullets_with_quant = sum(1 for b in all_bullets if _has_quantification(b))
    total = max(len(all_bullets), 1)

    resume = cv.get("resume") or ""
    resume_words_list = _words(resume)
    resume_unique = set(resume_words_list)
    lexical_diversity = round(len(resume_unique) / max(len(resume_words_list), 1), 2)

    all_text_words = _words(resume)
    for b in all_bullets:
        all_text_words.extend(_words(b))

    return {
        "action_verb_ratio": round(bullets_with_verb / total, 2),
        "quantification_ratio": round(bullets_with_quant / total, 2),
        "bullets_with_action_verb": bullets_with_verb,
        "bullets_with_quantification": bullets_with_quant,
        "resume_lexical_diversity": lexical_diversity,
        "total_cv_word_count": len(all_text_words),
    }


def adaptation_metrics(cv_base: dict, merged_cv: dict, offre: dict, rapport: dict, rapport_after: dict | None = None) -> dict[str, Any]:
    """Métriques comparatives avant/après adaptation, plus infos offre."""
    base_bullets = []
    for exp in cv_base.get("experiences") or []:
        for bp in exp.get("bullet_points") or []:
            if isinstance(bp, str) and bp.strip():
                base_bullets.append(bp.strip())

    merged_bullets = []
    for exp in merged_cv.get("experiences") or []:
        for bp in exp.get("bullet_points") or []:
            if isinstance(bp, str) and bp.strip():
                merged_bullets.append(bp.strip())

    description = offre.get("description_brute") or ""
    contract_type = _detect_contract_type(description)
    sector = _detect_sector(description, offre)

    score_before = rapport.get("score_global")
    score_after = rapport_after.get("score_global") if rapport_after else None
    keywords_missing_before = len(rapport.get("mots_cles_manquants") or [])

    return {
        "score_ats_before": score_before,
        "score_ats_after": score_after,
        "keywords_missing_before": keywords_missing_before,
        "nb_experiences": len(cv_base.get("experiences") or []),
        "nb_formations": len(cv_base.get("formations") or []),
        "nb_competences_tech": len([c for c in (cv_base.get("competences") or {}).get("techniques") or [] if isinstance(c, str) and c.strip()]),
        "resume_word_count_before": len(_words(cv_base.get("resume") or "")),
        "resume_word_count_after": len(_words(merged_cv.get("resume") or "")),
        "total_bullets_before": len(base_bullets),
        "total_bullets_after": len(merged_bullets),
        "offre_word_count": len(_words(description)),
        "offre_type_contrat": contract_type,
        "offre_sector": sector,
    }


_CONTRACT_PATTERNS = [
    (r"\b(alternance|contrat\s+d['\u2019]?apprentissage)\b", "alternance"),
    (r"\b(stage)\b", "stage"),
    (r"\b(CDI)\b", "cdi"),
    (r"\b(CDD)\b", "cdd"),
    (r"\b(freelance|ind[ée]pendant|mission)\b", "freelance"),
    (r"\b(int[ée]rim)\b", "interim"),
]

_SECTOR_KEYWORDS = {
    "tech": ["développeur", "software", "engineering", "data", "devops", "cloud", "saas", "startup", "tech"],
    "finance": ["finance", "banque", "audit", "comptabilité", "trading", "asset", "investment", "risk"],
    "conseil": ["conseil", "consulting", "consultant", "strategy", "stratégie"],
    "luxe": ["luxe", "luxury", "fashion", "mode", "maison"],
    "industrie": ["industrie", "manufacturing", "production", "supply chain", "logistique"],
    "sante": ["santé", "pharma", "médical", "biotech", "healthcare"],
    "marketing": ["marketing", "communication", "digital", "brand", "marque", "social media"],
    "rh": ["ressources humaines", "rh", "recrutement", "talent", "people"],
    "immobilier": ["immobilier", "real estate", "property"],
    "energie": ["énergie", "energy", "renouvelable", "nucléaire", "pétrole"],
}


def _detect_contract_type(text: str) -> str:
    t = text.lower()
    for pattern, label in _CONTRACT_PATTERNS:
        if re.search(pattern, t, re.IGNORECASE):
            return label
    return "unknown"


def _detect_sector(text: str, offre: dict) -> str:
    combined = (text + " " + (offre.get("titre") or "") + " " + (offre.get("entreprise") or "")).lower()
    best, best_count = "unknown", 0
    for sector, keywords in _SECTOR_KEYWORDS.items():
        count = sum(1 for kw in keywords if kw in combined)
        if count > best_count:
            best, best_count = sector, count
    return best
