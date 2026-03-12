#!/usr/bin/env python3
"""
Adaptation du CV à l'offre via Gemini 1.5 Flash.
L'IA ne modifie PAS le JSON complet : elle retourne uniquement des TWEAKS :
- resume (texte réécrit)
- experiences : liste de { id, bullet_points } (même ordre et ids que le CV source)
- mots_cles_cache : chaîne de mots-clés/phrases pour la section ATS invisible (même couleur que le fond)
On fusionne ces tweaks avec cv_base côté app ; cv_base.json n'est jamais écrit.
"""

import json
import re
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent / ".env")
except ImportError:
    pass

import os


# Prompt système strict : cadrer Gemini pour qu'il ne retourne que le schéma autorisé
SYSTEM_PROMPT = """Tu es un expert en rédaction de CV et en ATS (systèmes de suivi de candidatures).
Ton objectif : faire correspondre le CV aux critères du poste en REFORMULANT ce qui est déjà écrit, jamais en inventant.

Tu ne dois JAMAIS :
- inventer une expérience, un diplôme, un chiffre, un outil, une compétence ou un fait absent du CV source
- ajouter des responsabilités ou des réalisations qui ne sont pas déjà décrites (même partiellement) dans le bullet original
- supprimer une expérience ou en ajouter une
- modifier les ids des expériences (tu les recopies à l'identique)
- modifier le titre professionnel, les formations, les compétences, les coordonnées
- retourner autre chose qu'un JSON valide avec EXACTEMENT les clés : resume, experiences, mots_cles_cache, poste_offre

Règles pour les bullet points (CRITIQUE) :
- Chaque bullet en sortie doit décrire UNIQUEMENT ce que le bullet source dit déjà. Tu peux reformuler, raccourcir, ou réordonner les idées.
- Tu peux insérer un mot-clé de l'offre SEULEMENT s'il s'applique vraiment au contenu original (ex. l'offre demande "Excel" et le bullet parle déjà de tableaux / reporting → tu peux écrire "Excel"). Si le bullet ne mentionne rien qui touche à ce mot-clé, ne l'ajoute pas.
- Ne jamais terminer un bullet par des formules plaquées du type « pertinent pour… », « atout pour… », « idéal pour un poste en… », « ce qui est utile pour… ». Ces tournures sonnent artificielles et peu humaines. Chaque bullet doit rester une phrase naturelle sur l'action ou le résultat réalisé, sans ajout en fin de phrase pour « faire le lien » avec le poste. Si le contenu du bullet ne correspond pas à un critère du poste, ne rien ajouter : garder une description claire et honnête de l'expérience.
- Ne pas inventer de pourcentages, de montants, d'outils ou de méthodologies absents du CV source. En cas de doute, garde le bullet tel quel ou reformule très légèrement.
- Maximum 3 bullet points par expérience (fusionner deux bullets existants uniquement s'ils parlent de la même chose, sans ajouter de contenu).

Tu DOIS :
- Utiliser les mots-clés de l'offre au mot près quand tu les insères (pas de synonymes pour les compétences techniques)
- Rédiger le resume en 2-3 phrases max, ton professionnel mais sobre et crédible. Le résumé doit TOUJOURS commencer par « Étudiant ESSEC » (ex. « Étudiant ESSEC, je recherche… », « Étudiant ESSEC, intéressé par… »). Enchaîner avec la 1ère personne et le titre du poste visé, des mots-clés de l'offre. Ne jamais écrire « je suis un futur X » ni revendiquer le poste comme si on l'occupait déjà. NE JAMAIS utiliser « passionné », « passionné par », « passion » (ex. « passionné par l'univers du luxe ») : bannir. Utiliser « intéressé par », « intérêt pour ». Éviter « professionnel autonome », « je suis un professionnel… », « une expertise » (préférer « compétences », « expérience ») : garder l'ancrage étudiant ESSEC, ton direct sans sur-enchère. Pour un domaine que le CV ne décrit pas en expérience directe : « atout pour… », « idéal pour… ».
- Remplir mots_cles_cache avec une chaîne d'environ 50 à 60 mots-clés et courtes expressions de l'annonce (séparés par des espaces), pour optimisation ATS (mots-clés techniques, compétences, outils, métiers). Pas de phrases longues, uniquement des termes pertinents.
- Extraire dans poste_offre UNIQUEMENT l'intitulé du poste (ex. "Alternance Risk Manager", "Gestionnaire Data Center"), sans ajouter de mot parasite : pas de "demande", "offre", "recherche", "poste à pourvoir". Ne jamais inclure « (H/F) » ni « (F/H) » dans le titre du poste ni dans le resume - les retirer systématiquement.
- Ne jamais utiliser de formatage (pas de gras, pas d'astérisques) : tout le texte (resume, bullet_points) doit être en texte brut uniquement, sans ** ni __ ni aucun markdown. Ne jamais utiliser de tirets longs (\u2013 ou \u2014) : utiliser uniquement le tiret simple (-).

Format de sortie : UNIQUEMENT un objet JSON, sans markdown, sans commentaire, sans texte avant ou après.
"""


def _build_user_prompt(cv_base: dict, offre: dict, rapport: dict | None) -> str:
    """Construit le prompt utilisateur : extrait minimal du CV (resume + exp avec id + bullet_points) + offre."""
    experiences_input = []
    for exp in cv_base.get("experiences", []):
        experiences_input.append({
            "id": exp.get("id", ""),
            "poste": exp.get("poste", ""),
            "entreprise": exp.get("entreprise", ""),
            "bullet_points": exp.get("bullet_points", []),
        })

    mots = ", ".join(offre.get("mots_cles_extraits") or [])
    comp = ", ".join(offre.get("competences_requises") or [])

    return f"""<offre_emploi>
<titre>{offre.get("titre", "")}</titre>
<entreprise>{offre.get("entreprise", "")}</entreprise>
<mots_cles_prioritaires>{mots}</mots_cles_prioritaires>
<competences_requises>{comp}</competences_requises>
<description_extrait>{ (offre.get("description_brute") or "")[:4000] }</description_extrait>
</offre_emploi>

<cv_source_resume>
{json.dumps(cv_base.get("resume", ""), ensure_ascii=False)}
</cv_source_resume>

<cv_source_experiences>
{json.dumps(experiences_input, ensure_ascii=False, indent=2)}
</cv_source_experiences>

<instructions>
À partir du CV source ci-dessus et de l'offre :

1. Réécris le résumé (resume) en 2-3 phrases, ton professionnel et sobre. OBLIGATOIRE : la première phrase commence TOUJOURS par « Étudiant ESSEC ». Texte brut uniquement : aucun formatage, pas d'astérisques (**), pas de gras. Ne pas écrire « je suis un futur [poste] » ni « je suis un professionnel… ». NE JAMAIS utiliser « passionné » ni « passion » (ex. « passionné par l'univers du luxe ») : utiliser « intéressé par », « intérêt pour ». Éviter « une expertise » ; privilégier « compétences », « expérience ». Intègre le titre du poste et des mots-clés sans inventer de faits.
2. Pour chaque expérience, réécris les bullet_points en restant FIDÈLE au contenu original. Texte brut uniquement, pas d'astérisques. Ne jamais utiliser « passionné » ni « passion » (utiliser « intéressé par », « intérêt pour »). Chaque bullet doit rester une phrase naturelle sur ce qui a été fait (action, résultat). Ne jamais ajouter en fin de phrase des formules comme « pertinent pour… », « atout pour… », « idéal pour un poste en… » - bannir ces tournures. Tu peux intégrer un mot-clé de l'offre dans la phrase seulement s'il décrit vraiment ce qui est déjà dit (ex. remplacer « tableaux » par « Excel » si c'est le cas). Maximum 3 bullet points par expérience. Garde les mêmes ids.
3. Remplis mots_cles_cache avec une seule chaîne d'environ 50 à 60 mots-clés et courtes expressions de l'annonce (séparés par des espaces), pour que les ATS les détectent (outils, compétences, métier, secteur). Exemple : "gestion de projet Python analyse de données Excel reporting data center opérations bureautique autonomie rigueur".
4. Dans poste_offre, mets UNIQUEMENT l'intitulé du poste (ex. "Gestionnaire Data Center", "Alternance Risk Manager"), sans mot parasite et sans « (H/F) » ni « (F/H) » - les retirer si l'annonce les contient.

Important : l'objectif est de mieux correspondre aux critères en reformulant ce qui est déjà là, pas d'inventer des éléments pour coller à l'offre.

Retourne UNIQUEMENT un JSON avec exactement cette structure (pas d'autre clé) :
{{
  "resume": "ton résumé réécrit",
  "experiences": [
    {{ "id": "exp_1", "bullet_points": ["...", "...", "..."] }},
    ...
  ],
  "mots_cles_cache": "mot1 mot2 expression courte ...",
  "poste_offre": "intitulé du poste tel qu'écrit dans l'annonce"
}}
</instructions>"""


def _strip_markdown_bold(text: str) -> str:
    """Retire le formatage gras markdown (** ou __) et les tirets d'IA (\u2013 \u2014) pour ne garder que du texte brut."""
    if not text or not isinstance(text, str):
        return text
    return text.replace("**", "").replace("__", "").replace("\u2013", "-").replace("\u2014", "-").strip()


def _strip_h_f(text: str) -> str:
    """Retire (H/F) et (F/H) du texte (insensible à la casse)."""
    if not text or not isinstance(text, str):
        return text
    return re.sub(r"\s*\([HhFf]/[HhFf]\)", "", text).strip()


def _strip_passion(text: str) -> str:
    """Remplace « passionné » / « passion » par « intéressé » / « intérêt » (interdit en sortie CV)."""
    if not text or not isinstance(text, str):
        return text
    s = text
    s = re.sub(r"\bpassionné(?:e)?\s+par\b", "intéressé par", s, flags=re.IGNORECASE)
    s = re.sub(r"\bpassionné(?:e)?\s+pour\b", "intéressé pour", s, flags=re.IGNORECASE)
    s = re.sub(r"\bpassionné(?:e)?\b", "intéressé", s, flags=re.IGNORECASE)
    s = re.sub(r"\bpassion\s+pour\b", "intérêt pour", s, flags=re.IGNORECASE)
    s = re.sub(r"\bma\s+passion\b", "mon intérêt", s, flags=re.IGNORECASE)
    return s


def _sanitize_tweaks_text(tweaks: dict) -> None:
    """Modifie tweaks in-place : retire ** et __ ; (H/F) ; remplace passionné/passion par intéressé/intérêt."""
    if "resume" in tweaks and tweaks["resume"]:
        tweaks["resume"] = _strip_markdown_bold(tweaks["resume"])
        tweaks["resume"] = _strip_h_f(tweaks["resume"])
        tweaks["resume"] = _strip_passion(tweaks["resume"])
    for exp in tweaks.get("experiences") or []:
        exp["bullet_points"] = [
            _strip_passion(_strip_markdown_bold(b)) for b in (exp.get("bullet_points") or [])
        ]


def _extract_json(text: str) -> dict | None:
    text = text.strip()
    m = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if m:
        text = m.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}") + 1
        if start != -1 and end > start:
            try:
                return json.loads(text[start:end])
            except json.JSONDecodeError:
                pass
    return None


def adapter_cv(cv_base: dict, offre: dict, rapport: dict | None = None, retry_invalide: bool = True) -> dict:
    """
    Appelle Gemini pour produire uniquement les tweaks (resume, bullet_points par id, mots_cles_cache).
    Ne modifie pas cv_base. Retourne un dict : { "resume", "experiences": [ { "id", "bullet_points" } ], "mots_cles_cache" }.
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY manquante. Ajoutez-la dans le fichier .env.")

    try:
        from google import genai
        from google.genai import types
    except ImportError:
        raise ImportError("pip install google-genai")

    client = genai.Client(api_key=api_key)
    model_id = "gemini-2.5-flash"
    config = types.GenerateContentConfig(temperature=0.2)

    user_prompt = _build_user_prompt(cv_base, offre, rapport)
    exp_ids = [e.get("id") for e in cv_base.get("experiences", [])]

    def _call(prompt: str) -> str:
        full_prompt = SYSTEM_PROMPT.strip() + "\n\n---\n\n" + prompt
        r = client.models.generate_content(
            model=model_id,
            contents=full_prompt,
            config=config,
        )
        if not r or not getattr(r, "text", None):
            raise ValueError("Réponse Gemini vide")
        return r.text

    raw = _call(user_prompt)
    tweaks = _extract_json(raw)

    if tweaks is None and retry_invalide:
        raw = _call(
            "Ta réponse précédente n'était pas un JSON valide. Retourne UNIQUEMENT l'objet JSON demandé, rien d'autre.\n\n" + user_prompt,
        )
        tweaks = _extract_json(raw or "")

    if tweaks is None:
        raise ValueError("Impossible d'extraire un JSON valide de la réponse Gemini.")

    _sanitize_tweaks_text(tweaks)

    # Valider et normaliser le format
    if "resume" not in tweaks:
        tweaks["resume"] = cv_base.get("resume", "")
    if "experiences" not in tweaks or not isinstance(tweaks["experiences"], list):
        tweaks["experiences"] = []
    if "mots_cles_cache" not in tweaks:
        tweaks["mots_cles_cache"] = " ".join(offre.get("mots_cles_extraits") or [])
    if "poste_offre" not in tweaks or not str(tweaks.get("poste_offre", "")).strip():
        tweaks["poste_offre"] = (offre.get("titre") or "").strip()

    # S'assurer que les ids correspondent et qu'on a au plus 3 bullet points par exp
    by_id = {t["id"]: t for t in tweaks["experiences"] if t.get("id")}
    out_experiences = []
    for eid in exp_ids:
        t = by_id.get(eid, {})
        bullets = (t.get("bullet_points") or [])[:3]
        # Si Gemini n'a pas renvoyé cette exp, garder les originaux (limités à 3)
        if not bullets:
            for exp in cv_base.get("experiences", []):
                if exp.get("id") == eid:
                    bullets = (exp.get("bullet_points") or [])[:3]
                    break
        out_experiences.append({"id": eid, "bullet_points": bullets})
    tweaks["experiences"] = out_experiences

    return tweaks


def _nettoyer_poste_offre(poste: str) -> str:
    """Retire les mots parasites souvent collés par les annonces (demande, offre, etc.) et (H/F)/(F/H)."""
    s = (poste or "").strip()
    s = _strip_h_f(s)
    # Mots à retirer (souvent en début d'annonce : "Offre demande ...", "Recherche ...")
    for mot in ("demande", "offre", "recherche", "poste à pourvoir"):
        s = re.sub(rf"\b{re.escape(mot)}\b", "", s, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", s).strip()


def apply_tweaks_to_cv(cv_base: dict, tweaks: dict) -> dict:
    """Fusionne cv_base avec les tweaks (resume, bullet_points, mots_cles_cache, titre_professionnel). Ne modifie pas cv_base."""
    from copy import deepcopy
    merged = deepcopy(cv_base)
    merged["resume"] = tweaks.get("resume", merged.get("resume", ""))
    merged["mots_cles_cache"] = tweaks.get("mots_cles_cache", "")
    poste_offre = _nettoyer_poste_offre(str(tweaks.get("poste_offre") or ""))
    if poste_offre:
        merged["titre_professionnel"] = f"Étudiant ESSEC - {poste_offre}"
    merged["titre_professionnel"] = _strip_h_f(merged.get("titre_professionnel") or "") or merged.get("titre_professionnel", "")
    by_id = {t["id"]: t for t in tweaks.get("experiences", []) if t.get("id")}
    for exp in merged.get("experiences", []):
        eid = exp.get("id")
        if eid and eid in by_id:
            exp["bullet_points"] = by_id[eid].get("bullet_points", exp.get("bullet_points", []))
    return merged


REFINE_SYSTEM = """Tu es un assistant qui modifie un CV existant selon les instructions de l'utilisateur.
Tu ne dois JAMAIS inventer d'expériences, de diplômes ou de faits absents du CV.
Tu retournes UNIQUEMENT un objet JSON avec les clés que tu modifies (les autres restent inchangées côté client).
Clés possibles : "resume" (texte), "experiences" (liste de { "id": "exp_1", "bullet_points": ["...", ...] }), "titre_professionnel", "mots_cles_cache".
- Pour "experiences" : garde les mêmes ids que le CV source, au plus 3 bullet points par expérience.
- Texte brut uniquement, pas de markdown (**), pas de gras.
Retourne uniquement le JSON, sans markdown ni commentaire."""


def refine_cv(cv_current: dict, instruction: str) -> dict:
    """
    Applique une instruction utilisateur (ex. "mets plus en avant Excel", "raccourcis le résumé")
    au CV actuel. Retourne les tweaks à fusionner (même format que adapter_cv).
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY manquante.")

    try:
        from google import genai
        from google.genai import types
    except ImportError:
        raise ImportError("pip install google-genai")

    client = genai.Client(api_key=api_key)
    experiences_input = [
        {"id": e.get("id", ""), "poste": e.get("poste", ""), "bullet_points": e.get("bullet_points", [])}
        for e in (cv_current.get("experiences") or [])[:8]
    ]
    user_prompt = f"""<cv_actuel>
resume: {json.dumps((cv_current.get("resume") or "")[:1500], ensure_ascii=False)}
titre_professionnel: {json.dumps(cv_current.get("titre_professionnel") or "", ensure_ascii=False)}
experiences: {json.dumps(experiences_input, ensure_ascii=False, indent=2)}
</cv_actuel>

<instruction_utilisateur>
{instruction.strip()[:2000]}
</instruction_utilisateur>

Retourne un JSON avec uniquement les clés à modifier (resume, experiences, titre_professionnel, mots_cles_cache). Même structure que le CV pour experiences (id + bullet_points)."""

    r = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=REFINE_SYSTEM.strip() + "\n\n---\n\n" + user_prompt,
        config=types.GenerateContentConfig(temperature=0.3),
    )
    if not r or not getattr(r, "text", None):
        raise ValueError("Réponse Gemini vide")
    tweaks = _extract_json(r.text)
    if tweaks is None:
        raise ValueError("Impossible d'extraire un JSON de la réponse.")
    _sanitize_tweaks_text(tweaks)
    return tweaks
