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


OUTPUT_CV = "cv"
OUTPUT_OFFER = "offer"


def normalize_output_policy(value: str | None) -> str:
    raw = (value or "").strip().lower()
    if raw in {OUTPUT_OFFER, "annonce", "translate", "offer_language"}:
        return OUTPUT_OFFER
    return OUTPUT_CV


def should_prompt_language_choice(cv_lang: dict | None, offer_lang: dict | None) -> bool:
    """Popup seulement si les deux langues sont détectées et distinctes."""
    cv = language_meta(cv_lang)
    offer = language_meta(offer_lang)
    return (
        cv["code"] in {"fr", "en"}
        and offer["code"] in {"fr", "en"}
        and cv["code"] != offer["code"]
        and (cv.get("confidence") or 0) > 0
        and (offer.get("confidence") or 0) > 0
    )


def resolve_output_language(
    cv_lang: dict | None,
    offer_lang: dict | None,
    policy: str | None = None,
) -> dict[str, Any]:
    """Langue de sortie après choix utilisateur (cv = garder, offer = traduire)."""
    cv = language_meta(cv_lang)
    offer = language_meta(offer_lang) if offer_lang is not None else language_meta(None)
    mismatch = should_prompt_language_choice(cv, offer)
    pol = normalize_output_policy(policy)
    if pol == OUTPUT_OFFER and mismatch:
        return {
            "code": offer["code"],
            "policy": OUTPUT_OFFER,
            "translate": True,
            "mismatch": True,
        }
    return {
        "code": cv["code"],
        "policy": OUTPUT_CV,
        "translate": False,
        "mismatch": mismatch,
    }


def language_lock_instruction(
    cv_lang: dict | None,
    offer_lang: dict | None = None,
    output_policy: str | None = None,
) -> str:
    """Consigne à coller dans les prompts Gemini (données, pas le schéma JSON)."""
    cv = language_meta(cv_lang)
    offer = language_meta(offer_lang) if offer_lang is not None else None
    resolved = resolve_output_language(cv, offer, output_policy)
    cv_name = language_label(cv["code"])
    other = "anglais" if cv["code"] == "fr" else "français"
    if resolved["translate"]:
        target_name = language_label(resolved["code"])
        parts = [
            f"LANGUE CIBLE (OBLIGATOIRE) : l'utilisateur a choisi la langue de l'annonce ({target_name}).",
            f"Tu TRADUIS tout le texte rédigé du CV ({cv_name} → {target_name}) ET tu l'adaptes à l'offre.",
            "Ne jamais inventer d'expérience, diplôme, chiffre, outil, compétence ou fait absent du CV source.",
            "Les noms propres (personne, entreprise, école, ville) et les outils (Python, Excel, etc.) restent identiques.",
            f"Tu remplaces la langue : mêmes faits, reformulés et améliorés comme une adaptation ATS, en {target_name}.",
            "resume, bullet_points et titres de poste (experiences.poste) dans cette langue.",
            "mots_cles_cache dans la langue de l'annonce. poste_offre = intitulé de l'annonce tel quel.",
        ]
        return " ".join(parts)
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


def adaptation_language_payload(
    cv: dict | None,
    offre: dict | None,
    output_policy: str | None = None,
) -> dict[str, Any]:
    """Métadonnées langue CV + offre pour l'API d'adaptation."""
    cv_lang = detect_cv_language(cv)
    offer_lang = detect_offer_language(offre)
    resolved = resolve_output_language(cv_lang, offer_lang, output_policy)
    return {
        "cv_language": language_meta(cv_lang),
        "offer_language": language_meta(offer_lang),
        "language_mismatch": bool(resolved["mismatch"]),
        "output_language": resolved["policy"],
        "output_language_code": resolved["code"],
        "translate_cv": bool(resolved["translate"]),
    }


def langue_cv_xml(
    cv: dict | None,
    offre: dict | None = None,
    output_policy: str | None = None,
) -> str:
    """Bloc XML à injecter dans le prompt utilisateur."""
    cv_lang = detect_cv_language(cv)
    offer_lang = detect_offer_language(offre) if offre is not None else None
    meta = language_meta(cv_lang)
    offer_meta = language_meta(offer_lang) if offer_lang is not None else {"code": ""}
    resolved = resolve_output_language(cv_lang, offer_lang, output_policy)
    instruction = language_lock_instruction(cv_lang, offer_lang, output_policy)
    mixed = "true" if meta["mixed"] else "false"
    mode = "traduire" if resolved["translate"] else "conserver"
    return (
        "<langue_cv>\n"
        f"<code>{resolved['code']}</code>\n"
        f"<langue_source>{meta['code']}</langue_source>\n"
        f"<mixte>{mixed}</mixte>\n"
        f"<langue_offre>{offer_meta.get('code') or ''}</langue_offre>\n"
        f"<mode>{mode}</mode>\n"
        f"<consigne>{instruction}</consigne>\n"
        "</langue_cv>"
    )


def _nonempty_str(value: Any) -> str | None:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _replace_str_list(src: Any, new: Any) -> Any:
    if not isinstance(src, list) or not isinstance(new, list) or len(src) != len(new):
        return src
    out = []
    for old, nxt in zip(src, new, strict=False):
        replaced = _nonempty_str(nxt)
        out.append(replaced if replaced is not None else old)
    return out


def merge_localized_fields(cv: dict | None, delta: dict | None) -> dict:
    """Fusionne une traduction fidèle (ids conservés, pas d'invention de lignes)."""
    from copy import deepcopy

    out = deepcopy(cv) if isinstance(cv, dict) else {}
    data = delta if isinstance(delta, dict) else {}
    titre = _nonempty_str(data.get("titre_professionnel"))
    if titre:
        out["titre_professionnel"] = titre
    resume = _nonempty_str(data.get("resume"))
    if resume:
        out["resume"] = resume

    loc_exps = data.get("experiences")
    if isinstance(loc_exps, list):
        by_id = {
            str(row.get("id")): row for row in loc_exps if isinstance(row, dict) and row.get("id")
        }
        for exp in out.get("experiences") or []:
            if not isinstance(exp, dict):
                continue
            row = by_id.get(str(exp.get("id") or ""))
            if not row:
                continue
            poste = _nonempty_str(row.get("poste"))
            if poste:
                exp["poste"] = poste
            contexte = _nonempty_str(row.get("contexte"))
            if contexte:
                exp["contexte"] = contexte
            if isinstance(row.get("bullet_points"), list):
                exp["bullet_points"] = _replace_str_list(
                    exp.get("bullet_points") or [], row.get("bullet_points")
                )

    loc_forms = data.get("formations")
    if isinstance(loc_forms, list):
        by_id = {
            str(row.get("id")): row for row in loc_forms if isinstance(row, dict) and row.get("id")
        }
        by_index = [row for row in loc_forms if isinstance(row, dict)]
        for i, form in enumerate(out.get("formations") or []):
            if not isinstance(form, dict):
                continue
            row = by_id.get(str(form.get("id") or ""))
            if row is None and i < len(by_index):
                row = by_index[i]
            if not row:
                continue
            diplome = _nonempty_str(row.get("diplome") or row.get("intitule"))
            if diplome:
                if form.get("diplome") is not None or "diplome" in form:
                    form["diplome"] = diplome
                if form.get("intitule") is not None or "intitule" in form:
                    form["intitule"] = diplome

    loc_certs = data.get("certifications")
    if isinstance(loc_certs, list):
        by_id = {
            str(row.get("id")): row for row in loc_certs if isinstance(row, dict) and row.get("id")
        }
        for cert in out.get("certifications") or []:
            if not isinstance(cert, dict):
                continue
            row = by_id.get(str(cert.get("id") or ""))
            if not row:
                continue
            nom = _nonempty_str(row.get("nom"))
            if nom:
                cert["nom"] = nom

    loc_proj = data.get("projets")
    if isinstance(loc_proj, list):
        by_id = {
            str(row.get("id")): row for row in loc_proj if isinstance(row, dict) and row.get("id")
        }
        for proj in out.get("projets") or []:
            if not isinstance(proj, dict):
                continue
            row = by_id.get(str(proj.get("id") or ""))
            if not row:
                continue
            nom = _nonempty_str(row.get("nom"))
            if nom:
                proj["nom"] = nom
            desc = _nonempty_str(row.get("description"))
            if desc:
                proj["description"] = desc

    loc_comp = data.get("competences")
    if isinstance(loc_comp, dict):
        comp = out.get("competences") if isinstance(out.get("competences"), dict) else {}
        for key in ("techniques", "logiciels", "autres"):
            if key in loc_comp:
                comp[key] = _replace_str_list(comp.get(key) or [], loc_comp.get(key))
        loc_langues = loc_comp.get("langues")
        src_langues = comp.get("langues") if isinstance(comp.get("langues"), list) else []
        if isinstance(loc_langues, list) and len(loc_langues) == len(src_langues):
            merged_langues = []
            for old, nxt in zip(src_langues, loc_langues, strict=False):
                if not isinstance(old, dict):
                    merged_langues.append(old)
                    continue
                row = nxt if isinstance(nxt, dict) else {}
                item = dict(old)
                langue = _nonempty_str(row.get("langue"))
                niveau = _nonempty_str(row.get("niveau"))
                if langue:
                    item["langue"] = langue
                if niveau:
                    item["niveau"] = niveau
                merged_langues.append(item)
            comp["langues"] = merged_langues
        out["competences"] = comp
    return out
