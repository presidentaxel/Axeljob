#!/usr/bin/env python3
"""
Heuristiques pour deviner le nom d'employeur depuis le texte brut d'une annonce.
Retourne (nom, confiance) avec confiance dans [0, 1] — jamais d'appel LLM.
"""

from __future__ import annotations

import re

_BAD_COMPANY_PREFIXES = frozenset(
    {
        "le",
        "la",
        "les",
        "un",
        "une",
        "des",
        "l",
        "d",
        "nous",
        "on",
        "ils",
        "elle",
        "je",
        "tu",
        "il",
        "ce",
        "cette",
        "notre",
        "votre",
        "leur",
        "offre",
        "poste",
        "mission",
        "stage",
        "alternance",
        "cdi",
        "cdd",
        "emploi",
        "recrutement",
        "dans",
        "pour",
        "avec",
        "chez",
    }
)

_SLOGAN_MARKERS = (
    "taille humaine",
    "grand groupe",
    "force d'un",
    "force dune",
    "dans une entreprise",
    "d'une entreprise",
    "dune entreprise",
    "utilité publique",
    "contribuer à une mission",
    "rejoignez-nous",
    "personnes en situation de handicap",
    "banque publique",
)

_STOPISH = frozenset(
    {
        "une",
        "des",
        "les",
        "pour",
        "dans",
        "avec",
        "notre",
        "votre",
        "cette",
        "toute",
        "tous",
        "afin",
        "depuis",
        "offrant",
        "permettant",
    }
)


def _clean_company(raw: str) -> str:
    s = (raw or "").strip()
    s = re.sub(r"\s+", " ", s)
    s = s.strip(" \t\"'«»•-–—:|")
    if len(s) > 90:
        s = s[:90].rsplit(" ", 1)[0]
    return s.strip()


def _looks_like_slogan_or_phrase(name: str) -> bool:
    low = name.lower().strip()
    if any(m in low for m in _SLOGAN_MARKERS):
        return True
    words = name.split()
    if len(words) > 5:
        return True
    if len(name) > 52:
        return True
    if words and sum(1 for w in words if w.lower() in _STOPISH) >= 3:
        return True
    return False


def _valid_company_name(name: str) -> bool:
    if not name or len(name) < 2:
        return False
    low = name.lower()
    first = low.split()[0] if low.split() else ""
    if first in _BAD_COMPANY_PREFIXES:
        return False
    if len(name) < 3 and not name.isupper():
        return False
    if _looks_like_slogan_or_phrase(name):
        return False
    return True


def infer_entreprise_from_annonce(text: str) -> tuple[str, float]:
    if not text or not str(text).strip():
        return "", 0.0

    t = text.strip()
    for label, conf in (
        (r"(?:^|\n)\s*Entreprise\s*:\s*([^\n]+)", 0.92),
        (r"(?:^|\n)\s*Employeur\s*:\s*([^\n]+)", 0.92),
        (r"(?:^|\n)\s*Société\s*:\s*([^\n]+)", 0.9),
        (r"(?:^|\n)\s*Company\s*:\s*([^\n]+)", 0.9),
        (r"(?:^|\n)\s*Employer\s*:\s*([^\n]+)", 0.9),
    ):
        m = re.search(label, t, re.IGNORECASE | re.MULTILINE)
        if m:
            name = _clean_company(m.group(1))
            if _valid_company_name(name):
                return name, conf

    for pat, conf in (
        (
            r"\b(?:travailler|postuler|rejoindre|venir)\s+chez\s+([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9&\-\.]{0,48}?)(?:\s*[,\.;]|\s+[:—–-]|\s+c['']est\b|\s+et\s+|\s*$|\n)",
            0.9,
        ),
        (
            r"\b(?:bienvenue|welcome)\s+chez\s+([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9&\-\.]{0,48}?)(?:\s*[,\.;]|\s*$|\n)",
            0.86,
        ),
    ):
        m = re.search(pat, t, re.IGNORECASE)
        if m:
            name = _clean_company(m.group(1))
            if _valid_company_name(name):
                return name, conf

    m = re.search(
        r"\bchez\s+([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9&\-\.]{0,48}?)(?:\s*[,\.;]|\s+en\s+|\s+pour\s+|\s+un\s+|\s+une\s+|\s+sur\s+|\s*$|\n)",
        t,
        re.IGNORECASE,
    )
    if m:
        name = _clean_company(m.group(1))
        if _valid_company_name(name):
            return name, 0.78

    m = re.search(
        r"(?:^|[\n\.])\s*(?:la\s+)?société\s+([A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ0-9][A-Za-zÀ-ÿ0-9&\-\.\s'’]{1,42}?)\s+(?:recrute|propose|recherche|est\s)",
        t,
        re.IGNORECASE | re.MULTILINE,
    )
    if m:
        name = _clean_company(m.group(1))
        if _valid_company_name(name) and len(name.split()) <= 5:
            return name, 0.72

    m = re.search(
        r"(?:^|[\n\.])\s*(?:notre|le)\s+groupe\s+([A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ0-9][A-Za-zÀ-ÿ0-9&\-\.]{1,40}?)(?:\s*[,\.;]|\s+recrute|\s+est\b|\s*$|\n)",
        t,
        re.IGNORECASE | re.MULTILINE,
    )
    if m:
        name = _clean_company(m.group(1))
        if _valid_company_name(name) and len(name.split()) <= 4:
            return name, 0.68

    m = re.search(
        r"(?:^|\n)\s*([A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ0-9][A-Za-zÀ-ÿ0-9&\-\.\s'’]{2,45}?)\s+recrute\b",
        t,
        re.MULTILINE,
    )
    if m:
        name = _clean_company(m.group(1))
        if _valid_company_name(name) and len(name.split()) <= 5:
            return name, 0.84

    first = t.split("\n", 1)[0].strip()
    for sep in (" — ", " – ", " - ", " | ", " / "):
        if sep in first:
            parts = [p.strip() for p in first.split(sep) if p.strip()]
            if len(parts) >= 2:
                candidate = parts[-1]
                name = _clean_company(candidate)
                if _valid_company_name(name) and len(name) <= 70:
                    return name, 0.55

    return "", 0.0
