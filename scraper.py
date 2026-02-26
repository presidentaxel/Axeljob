#!/usr/bin/env python3
"""
Scraping d'une offre d'emploi via Playwright (headless).
Extrait titre, entreprise, secteur, type de contrat, localisation, description.
Mots-clés et compétences requises : extraction par tokenisation + liste hardcodée.
"""

import re
from pathlib import Path

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
    # Garder lettres, chiffres, espaces et quelques signes
    texte = re.sub(r"[^\w\s\-àâäéèêëïîôùûüç]", " ", texte)
    return texte.split()


def _extraire_mots_cles(description: str, top_n: int = 15) -> list[str]:
    """Tokenise la description et matche contre MOTS_CLES_FINANCE_TECH + fréquence des n-grams."""
    if not description:
        return []
    desc_lower = description.lower()
    scores: dict[str, int] = {}

    # 1) Match mots-clés connus (exacts ou contenus)
    for kw in MOTS_CLES_FINANCE_TECH:
        if kw in desc_lower:
            scores[kw] = scores.get(kw, 0) + 3  # bonus pour connu

    # 2) Fréquence des mots (2+ caractères, hors stop très courants)
    stop = {"le", "la", "les", "de", "du", "des", "et", "en", "un", "une", "pour", "dans", "sur", "avec", "par", "aux", "ce", "cette", "son", "sa", "ses", "que", "qui", "qu", "au", "à", "est", "sont", "être", "avoir", "nous", "vous", "ils", "elle", "on"}
    tokens = _tokeniser_et_nettoyer(description)
    for t in tokens:
        if len(t) >= 2 and t not in stop:
            scores[t] = scores.get(t, 0) + 1

    # 3) Bigrammes fréquents (ex: "gestion du risque")
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


def _extraire_competences_requises(description: str, mots_cles: list[str]) -> list[str]:
    """Réutilise les mots-clés comme compétences requises (évite doublon avec IA)."""
    return list(dict.fromkeys(mots_cles))[:15]


def scrape_offre(url: str) -> dict:
    """
    Scrape l'offre d'emploi à l'URL donnée.
    Retourne un dict avec titre, entreprise, secteur, type_contrat, localisation,
    description_brute, mots_cles_extraits, competences_requises, soft_skills.
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        raise ImportError(
            "Le module 'playwright' est requis. Installez-le avec : pip install playwright\n"
            "Puis exécutez : playwright install chromium"
        )

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            page = browser.new_page()
            page.goto(url, wait_until="networkidle", timeout=30000)
            page.wait_for_timeout(2000)

            # Sélecteurs génériques : on prend tout le body text pour la description
            body = page.query_selector("body")
            description_brute = body.inner_text() if body else ""

            # Tentative d'extraction structurée (sites courants)
            titre = ""
            entreprise = ""
            secteur = ""
            type_contrat = ""
            localisation = ""

            # h1 souvent = titre du poste
            h1 = page.query_selector("h1")
            if h1:
                titre = h1.inner_text().strip() or titre

            # Meta ou éléments courants
            meta_title = page.title()
            if not titre and meta_title:
                titre = meta_title

            # Chercher des patterns dans le texte
            if not titre:
                titre = "Poste"
            if not description_brute:
                description_brute = page.content()

            # Nettoyer un peu la description (trop long = tronquer pour mots-clés)
            desc_clean = description_brute[:15000] if len(description_brute) > 15000 else description_brute

            mots_cles_extraits = _extraire_mots_cles(desc_clean, top_n=15)
            competences_requises = _extraire_competences_requises(desc_clean, mots_cles_extraits)
            soft_skills = []  # optionnel : pourrait matcher une liste plus tard

            return {
                "titre": titre.strip(),
                "entreprise": entreprise.strip(),
                "secteur": secteur.strip(),
                "type_contrat": type_contrat.strip(),
                "localisation": localisation.strip(),
                "description_brute": description_brute.strip(),
                "mots_cles_extraits": mots_cles_extraits,
                "competences_requises": competences_requises,
                "soft_skills": soft_skills,
            }
        finally:
            browser.close()


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python scraper.py <url>")
        sys.exit(1)
    r = scrape_offre(sys.argv[1])
    import json
    print(json.dumps(r, ensure_ascii=False, indent=2))
