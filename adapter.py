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
- Pour faire le lien avec le poste sans inventer : si l'offre mentionne un domaine (ex. gestion du risque, suivi des risques) que le bullet ne décrit pas directement, ne prétends pas que la personne a fait ce travail. Préfère des tournures du type : « ce qui est idéal pour un poste sur le suivi des risques », « pertinent pour un rôle en gestion du risque », « atout pour… » — tu relies ainsi les compétences réelles du CV au contexte du poste sans inventer d'expérience.
- Ne pas inventer de pourcentages, de montants, d'outils ou de méthodologies absents du CV source. En cas de doute, garde le bullet tel quel ou reformule très légèrement.
- Maximum 3 bullet points par expérience (fusionner deux bullets existants uniquement s'ils parlent de la même chose, sans ajouter de contenu).

Tu DOIS :
- Utiliser les mots-clés de l'offre au mot près quand tu les insères (pas de synonymes pour les compétences techniques)
- Rédiger le resume en 2-3 phrases max : inclure le titre du poste visé et des mots-clés de l'offre. Pour un domaine du poste que le CV ne décrit pas comme expérience directe, privilégier des tournures type « idéal pour un poste en… », « atout pour… » plutôt que de prétendre que la personne a déjà fait ce travail.
- Remplir mots_cles_cache avec une chaîne de mots-clés et courtes phrases de l'annonce (séparés par des espaces), pour optimisation ATS ; pas de phrase longue, uniquement des termes pertinents
- Extraire de l'annonce l'intitulé exact du poste (ex. "Alternance Risk Manager", "Business Analyst") et le mettre dans poste_offre (chaîne, tel qu'écrit dans l'offre). C'est ce poste qui sera affiché comme titre professionnel sur le CV adapté.

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

1. Réécris le résumé (resume) en 2-3 phrases en intégrant le titre du poste visé et des mots-clés exacts de l'offre. Ne invente aucun fait.
2. Pour chaque expérience, réécris les bullet_points en restant FIDÈLE au contenu original. Pour faire le lien avec le poste sans inventer : si un critère du poste (ex. gestion du risque) n'est pas déjà décrit dans le bullet, ne prétends pas que la personne l'a fait ; utilise plutôt des tournures comme « ce qui est idéal pour un poste sur le suivi des risques », « pertinent pour un rôle en… », « atout pour… ». Insère un mot-clé de l'offre seulement s'il correspond au contenu original, sinon relie les compétences réelles au poste avec ce type de formulation. Maximum 3 bullet points par expérience. Garde les mêmes ids.
3. Remplis mots_cles_cache avec une seule chaîne de caractères contenant des mots-clés et courtes expressions de l'annonce (séparés par des espaces), pour que les ATS les détectent. Exemple : "gestion de projet Python analyse de données Excel reporting".
4. Extrais de l'annonce l'intitulé exact du poste (ex. "Alternance Risk Manager", "Business Analyst en Stratégie") et mets-le dans poste_offre (chaîne, telle qu'écrite dans l'offre).

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


def apply_tweaks_to_cv(cv_base: dict, tweaks: dict) -> dict:
    """Fusionne cv_base avec les tweaks (resume, bullet_points, mots_cles_cache, titre_professionnel). Ne modifie pas cv_base."""
    from copy import deepcopy
    merged = deepcopy(cv_base)
    merged["resume"] = tweaks.get("resume", merged.get("resume", ""))
    merged["mots_cles_cache"] = tweaks.get("mots_cles_cache", "")
    poste_offre = str(tweaks.get("poste_offre") or "").strip()
    if poste_offre:
        merged["titre_professionnel"] = f"Étudiant ESSEC - {poste_offre}"
    by_id = {t["id"]: t for t in tweaks.get("experiences", []) if t.get("id")}
    for exp in merged.get("experiences", []):
        eid = exp.get("id")
        if eid and eid in by_id:
            exp["bullet_points"] = by_id[eid].get("bullet_points", exp.get("bullet_points", []))
    return merged
