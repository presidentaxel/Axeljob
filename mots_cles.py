#!/usr/bin/env python3
"""
Extraction de mots-clés à partir d'une description de poste (fiche de poste).
Utilisé pour l'adaptation du CV et les règles ATS, sans scraping ni navigateur.
"""

import re

# Mots-clés courants (finance, risk, tech) pour extraction sans IA
MOTS_CLES_FINANCE_TECH = [
    "risk", "risque", "gestion des risques", "risk management", "contrôle interne",
    "conformité", "compliance", "audit", "kpi", "reporting", "pilotage",
    "analyse de données", "data", "excel", "vba", "power bi", "sap",
    "credit", "crédit", "market risk", "risque de marché", "opérationnel",
    "stress testing", "var", "basel", "aml", "kyc", "due diligence",
    "finance", "trésorerie", "budget", "forecast", "business analyst",
    "python", "sql", "tableau", "machine learning", "ia", "intelligence artificielle",
    "gestion de projet", "agile", "scrum", "stratégie", "commercial",
    "alternance", "stage", "cdi", "cdd", "finance d'entreprise",
    "valuation", "modélisation", "excel", "powerpoint", "word",
]


def _tokeniser_et_nettoyer(texte: str) -> list[str]:
    if not texte:
        return []
    texte = texte.lower()
    texte = re.sub(r"[^\w\s\-àâäéèêëïîôùûüç]", " ", texte)
    return texte.split()


def extraire_mots_cles(description: str, top_n: int = 15) -> list[str]:
    """Tokenise la description et matche contre MOTS_CLES_FINANCE_TECH + fréquence des n-grams."""
    if not description:
        return []
    desc_lower = description.lower()
    scores: dict[str, int] = {}

    for kw in MOTS_CLES_FINANCE_TECH:
        if kw in desc_lower:
            scores[kw] = scores.get(kw, 0) + 3

    stop = {"le", "la", "les", "de", "du", "des", "et", "en", "un", "une", "pour", "dans", "sur", "avec", "par", "aux", "ce", "cette", "son", "sa", "ses", "que", "qui", "qu", "au", "à", "est", "sont", "être", "avoir", "nous", "vous", "ils", "elle", "on"}
    tokens = _tokeniser_et_nettoyer(description)
    for t in tokens:
        if len(t) >= 2 and t not in stop:
            scores[t] = scores.get(t, 0) + 1

    words = tokens
    for i in range(len(words) - 1):
        if len(words[i]) >= 2 and len(words[i + 1]) >= 2:
            bigram = f"{words[i]} {words[i+1]}"
            scores[bigram] = scores.get(bigram, 0) + 2

    tri = sorted(scores.items(), key=lambda x: -x[1])
    result = []
    seen = set()
    for k, _ in tri[: top_n * 2]:
        k_lower = k.lower()
        if k_lower not in seen and len(k) >= 2:
            seen.add(k_lower)
            result.append(k)
            if len(result) >= top_n:
                break
    return result[:top_n]


def offre_from_description(description: str, titre: str = "", entreprise: str = "") -> dict:
    """Construit un dict offre à partir du texte de la fiche de poste (sans scraping)."""
    description = (description or "").strip()
    mots = extraire_mots_cles(description, 15)
    return {
        "titre": (titre or "").strip(),
        "entreprise": (entreprise or "").strip(),
        "secteur": "",
        "type_contrat": "",
        "localisation": "",
        "description_brute": description,
        "mots_cles_extraits": mots,
        "competences_requises": mots[:15],
        "soft_skills": [],
    }
