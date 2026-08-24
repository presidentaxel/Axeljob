"""Langue source d'un CV (FR/EN) pour verrouiller l'adaptation IA (AXE-357).

Heuristique déterministe (stopwords + accents), sans dépendance externe.
On ne détecte que le français et l'anglais : le produit est bilingue FR/EN.
"""

from __future__ import annotations

import re
from typing import Any

# Mots-outils + marqueurs fréquents en CV. Minuscule, sans accents pour le matching
# (le texte est normalisé). Les accents FR sont scorés à part.
_FR_WORDS = frozenset(
    {
        "le",
        "la",
        "les",
        "un",
        "une",
        "des",
        "du",
        "de",
        "au",
        "aux",
        "et",
        "ou",
        "en",
        "dans",
        "pour",
        "avec",
        "sur",
        "par",
        "que",
        "qui",
        "dont",
        "est",
        "sont",
        "ete",
        "etais",
        "etait",
        "avons",
        "avez",
        "ont",
        "jai",
        "je",
        "nous",
        "vous",
        "ils",
        "elles",
        "elle",
        "il",
        "mon",
        "ma",
        "mes",
        "ton",
        "ta",
        "tes",
        "son",
        "sa",
        "ses",
        "notre",
        "nos",
        "votre",
        "vos",
        "leur",
        "leurs",
        "cette",
        "ces",
        "cet",
        "plus",
        "moins",
        "tres",
        "aussi",
        "comme",
        "mais",
        "donc",
        "car",
        "ainsi",
        "alors",
        "apres",
        "avant",
        "depuis",
        "pendant",
        "entre",
        "sans",
        "sous",
        "vers",
        "chez",
        "experience",
        "experiences",
        "formation",
        "formations",
        "competence",
        "competences",
        "gestion",
        "charge",
        "chargee",
        "responsable",
        "diplome",
        "diplomee",
        "stage",
        "alternance",
        "projet",
        "projets",
        "equipe",
        "analyse",
        "suivi",
        "mise",
        "oeuvre",
        "realisation",
        "realise",
        "developpe",
        "pilote",
        "assure",
        "contribue",
        "aujourdhui",
        "annees",
        "mois",
    }
)

_EN_WORDS = frozenset(
    {
        "the",
        "a",
        "an",
        "and",
        "of",
        "to",
        "in",
        "for",
        "with",
        "on",
        "at",
        "by",
        "from",
        "that",
        "which",
        "this",
        "these",
        "those",
        "is",
        "are",
        "was",
        "were",
        "been",
        "being",
        "have",
        "has",
        "had",
        "i",
        "we",
        "you",
        "they",
        "he",
        "she",
        "it",
        "my",
        "your",
        "our",
        "their",
        "his",
        "her",
        "its",
        "more",
        "less",
        "very",
        "also",
        "as",
        "but",
        "or",
        "so",
        "because",
        "where",
        "when",
        "while",
        "after",
        "before",
        "during",
        "into",
        "over",
        "under",
        "about",
        "through",
        "experience",
        "experiences",
        "education",
        "skills",
        "skill",
        "managed",
        "developed",
        "responsible",
        "bachelor",
        "master",
        "internship",
        "project",
        "projects",
        "team",
        "analysis",
        "led",
        "built",
        "delivered",
        "improved",
        "supported",
        "working",
        "years",
        "months",
        "currently",
        "including",
        "using",
        "across",
    }
)

_TOKEN_RE = re.compile(r"[A-Za-zÀ-ÿ']+", re.UNICODE)
_ACCENT_RE = re.compile(r"[àâäéèêëïîôùûüçÀÂÄÉÈÊËÏÎÔÙÛÜÇ]")

# Ambigu : présents dans les deux listes après normalisation (experience, projet/project no).
# On les compte des deux côtés ; le reste du texte départage.
_MIN_TOKENS = 8
_MIXED_RATIO = 0.38
_MIXED_MIN_EACH = 4


def _fold(token: str) -> str:
    raw = (token or "").strip().lower().replace("'", "")
    table = str.maketrans(
        {
            "à": "a",
            "â": "a",
            "ä": "a",
            "é": "e",
            "è": "e",
            "ê": "e",
            "ë": "e",
            "ï": "i",
            "î": "i",
            "ô": "o",
            "ù": "u",
            "û": "u",
            "ü": "u",
            "ç": "c",
        }
    )
    return raw.translate(table)


def _tokens(text: str) -> list[str]:
    return [m.group(0) for m in _TOKEN_RE.finditer(text or "")]


def score_text_language(text: str) -> dict[str, Any]:
    """Score FR/EN d'un blob de texte. Retourne counts + accents."""
    tokens = _tokens(text or "")
    fr = 0
    en = 0
    for tok in tokens:
        folded = _fold(tok)
        if len(folded) < 2:
            continue
        if folded in _FR_WORDS:
            fr += 1
        if folded in _EN_WORDS:
            en += 1
    accents = len(_ACCENT_RE.findall(text or ""))
    # Accents français : signal fort, plafonné pour ne pas écraser un CV EN avec un mot accentué.
    fr += min(accents, 12)
    return {
        "fr": fr,
        "en": en,
        "token_count": len(tokens),
        "accent_count": accents,
    }


def _decide_from_scores(scores: dict[str, Any]) -> dict[str, Any]:
    fr = int(scores.get("fr") or 0)
    en = int(scores.get("en") or 0)
    tokens = int(scores.get("token_count") or 0)
    total = fr + en
    if tokens < _MIN_TOKENS or total == 0:
        return {
            "code": "fr",
            "mixed": False,
            "confidence": 0.0,
            "scores": {"fr": fr, "en": en},
        }
    dominant = "fr" if fr >= en else "en"
    loser = en if dominant == "fr" else fr
    winner = fr if dominant == "fr" else en
    mixed = winner > 0 and loser >= _MIXED_MIN_EACH and (loser / winner) >= _MIXED_RATIO
    confidence = winner / total if total else 0.0
    if mixed:
        confidence = min(confidence, 0.7)
    return {
        "code": dominant,
        "mixed": mixed,
        "confidence": round(float(confidence), 3),
        "scores": {"fr": fr, "en": en},
    }


def cv_text_blob(cv: dict | None) -> str:
    """Texte utile pour détecter la langue (résumé, titre, bullets, postes)."""
    data = cv if isinstance(cv, dict) else {}
    parts: list[str] = [
        str(data.get("resume") or ""),
        str(data.get("titre_professionnel") or ""),
    ]
    for exp in data.get("experiences") or []:
        if not isinstance(exp, dict):
            continue
        parts.append(str(exp.get("poste") or ""))
        parts.append(str(exp.get("entreprise") or ""))
        for bullet in exp.get("bullet_points") or []:
            parts.append(str(bullet or ""))
    for form in data.get("formations") or []:
        if isinstance(form, dict):
            parts.append(str(form.get("intitule") or form.get("diplome") or ""))
            parts.append(str(form.get("etablissement") or ""))
    return " ".join(p for p in parts if p and str(p).strip())


def offre_text_blob(offre: dict | None) -> str:
    data = offre if isinstance(offre, dict) else {}
    parts = [
        str(data.get("titre") or ""),
        str(data.get("entreprise") or ""),
        str(data.get("description_brute") or ""),
    ]
    return " ".join(p for p in parts if p and str(p).strip())


def detect_text_language(text: str) -> dict[str, Any]:
    return _decide_from_scores(score_text_language(text or ""))


def detect_cv_language(cv: dict | None) -> dict[str, Any]:
    return detect_text_language(cv_text_blob(cv))


def detect_offer_language(offre: dict | None) -> dict[str, Any]:
    return detect_text_language(offre_text_blob(offre))


def language_meta(result: dict | None) -> dict[str, Any]:
    """Payload API / front (clés stables)."""
    data = result if isinstance(result, dict) else {}
    code = data.get("code") if data.get("code") in ("fr", "en") else "fr"
    scores = data.get("scores") if isinstance(data.get("scores"), dict) else {}
    return {
        "code": code,
        "mixed": bool(data.get("mixed")),
        "confidence": float(data.get("confidence") or 0.0),
        "scores": {
            "fr": int(scores.get("fr") or 0),
            "en": int(scores.get("en") or 0),
        },
    }


def language_label(code: str) -> str:
    return "anglais" if code == "en" else "français"


def language_lock_instruction(cv_lang: dict | None, offer_lang: dict | None = None) -> str:
    """Consigne à coller dans les prompts Gemini (données, pas le schéma JSON)."""
    cv = language_meta(cv_lang)
    offer = language_meta(offer_lang) if offer_lang is not None else None
    cv_name = language_label(cv["code"])
    other = "anglais" if cv["code"] == "fr" else "français"
    parts = [
        f"LANGUE DU CV (OBLIGATOIRE) : rédige resume et bullet_points uniquement en {cv_name}.",
        f"Ne traduis pas le CV vers {other}.",
        "Tu peux reprendre des mots-clés techniques de l'annonce (outils, intitulés métier) tels quels "
        f"s'ils s'appliquent au contenu source, mais la phrase reste en {cv_name}.",
        "mots_cles_cache peut rester dans la langue de l'annonce (termes ATS).",
        "poste_offre = intitulé de l'annonce tel quel (ne pas le traduire).",
    ]
    if cv["mixed"]:
        parts.append(
            f"Le CV source mélange français et anglais : tu verrouilles quand même le {cv_name} "
            "(langue dominante). Ne bascule pas le reste vers l'autre langue."
        )
    if offer and offer["code"] != cv["code"] and (offer.get("confidence") or 0) > 0:
        offer_name = language_label(offer["code"])
        parts.append(
            f"L'offre est rédigée en {offer_name} : tu NE traduis PAS le CV vers cette langue."
        )
    return " ".join(parts)


def adaptation_language_payload(cv: dict | None, offre: dict | None) -> dict[str, Any]:
    """Métadonnées langue CV + offre pour l'API d'adaptation."""
    return {
        "cv_language": language_meta(detect_cv_language(cv)),
        "offer_language": language_meta(detect_offer_language(offre)),
    }


def langue_cv_xml(cv: dict | None, offre: dict | None = None) -> str:
    """Bloc XML à injecter dans le prompt utilisateur."""
    cv_lang = detect_cv_language(cv)
    offer_lang = detect_offer_language(offre) if offre is not None else None
    meta = language_meta(cv_lang)
    offer_meta = language_meta(offer_lang) if offer_lang is not None else {"code": ""}
    instruction = language_lock_instruction(cv_lang, offer_lang)
    mixed = "true" if meta["mixed"] else "false"
    return (
        "<langue_cv>\n"
        f"<code>{meta['code']}</code>\n"
        f"<mixte>{mixed}</mixte>\n"
        f"<langue_offre>{offer_meta.get('code') or ''}</langue_offre>\n"
        f"<consigne>{instruction}</consigne>\n"
        "</langue_cv>"
    )
