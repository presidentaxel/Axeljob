#!/usr/bin/env python3
"""
Sélection du contenu CV pour tenir sur une page A4.
L'IA choisit les expériences, formations, projets et compétences les plus pertinents
(par rapport à l'offre si fournie, sinon les plus représentatifs).
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

from backend.config import GEMINI_MODEL_DEFAULT


SELECT_A4_SYSTEM = """Tu es un expert en recrutement et en rédaction de CV.
Le CV doit tenir sur UNE SEULE page A4. On te donne un CV complet et (optionnellement) une offre d'emploi.
Tu dois choisir QUELS éléments garder pour que le CV reste percutant et tienne sur une page.

Règles :
- Si une offre est fournie : privilégie les expériences, formations, compétences et projets les plus PERTINENTS pour ce poste (mots-clés, secteur, métier).
- Sans offre : privilégie les éléments les plus représentatifs du profil (récence, niveau de responsabilité, diversité).
- Expériences : garde entre 4 et 7 maximum, dans l'ordre chronologique inverse (plus récent en premier). Pour chaque expérience tu peux indiquer 1 ou 2 bullet points max.
- Formations : garde 2 à 4 maximum (les plus significatives ou les plus en lien avec l'offre).
- Projets : 0 à 2 maximum si très pertinents.
- Compétences techniques et logiciels : garde 6 à 12 items au total (les plus en phase avec l'offre ou les plus valorisants).
- Certifications et langues : garde toutes si peu nombreuses, sinon les plus pertinentes (max 4-5 langues, 3-4 certifs si beaucoup).

Tu ne dois JAMAIS inventer d'élément : tu sélectionnes uniquement parmi ceux fournis dans le CV.
Retourne UNIQUEMENT un objet JSON valide, sans markdown ni commentaire."""


def _build_select_prompt(cv: dict, offre: dict | None) -> str:
    """Construit le prompt pour la sélection A4."""
    experiences = []
    for i, exp in enumerate(cv.get("experiences") or [])[:12]:
        exp_id = exp.get("id") or f"exp_{i+1}"
        experiences.append({
            "id": exp_id,
            "poste": (exp.get("poste") or "").strip(),
            "entreprise": (exp.get("entreprise") or "").strip(),
            "bullet_points": (exp.get("bullet_points") or [])[:3],
        })

    formations = []
    for i, f in enumerate(cv.get("formations") or [])[:10]:
        formations.append({
            "index": i,
            "diplome": (f.get("diplome") or "").strip(),
            "etablissement": (f.get("etablissement") or "").strip(),
            "date": (f.get("date") or "").strip(),
        })

    projets = []
    for i, p in enumerate(cv.get("projets") or [])[:8]:
        projets.append({
            "index": i,
            "nom": (p.get("nom") or "").strip(),
            "description": (p.get("description") or "")[:200].strip(),
        })

    comp = cv.get("competences") or {}
    tech = comp.get("techniques") or comp.get("competences_techniques") or []
    logiciels = comp.get("logiciels") or comp.get("informatiques") or []
    if isinstance(tech, list):
        tech = [str(t).strip() for t in tech if t]
    else:
        tech = []
    if isinstance(logiciels, list):
        logiciels = [str(l).strip() for l in logiciels if l]
    else:
        logiciels = []

    certs = cv.get("certifications") or []
    langues = (comp.get("langues") or []) if isinstance(comp.get("langues"), list) else []

    offre_block = ""
    if offre and (offre.get("titre") or offre.get("entreprise") or offre.get("mots_cles_extraits")):
        titre = (offre.get("titre") or "").strip()
        entreprise = (offre.get("entreprise") or "").strip()
        mots = (offre.get("mots_cles_extraits") or [])[:30]
        if isinstance(mots, list):
            mots_str = ", ".join(str(m) for m in mots)
        else:
            mots_str = str(mots)
        offre_block = f"""
<offre>
Titre : {titre}
Entreprise : {entreprise}
Mots-clés : {mots_str}
</offre>
"""
    else:
        offre_block = "\n<offre>Aucune offre (CV générique : sélectionne les éléments les plus représentatifs du profil).</offre>\n"

    return f"""<cv>
<experiences>
{json.dumps(experiences, ensure_ascii=False, indent=2)}
</experiences>
<formations>
{json.dumps(formations, ensure_ascii=False, indent=2)}
</formations>
<projets>
{json.dumps(projets, ensure_ascii=False, indent=2)}
</projets>
<competences_techniques>
{json.dumps(tech, ensure_ascii=False)}
</competences_techniques>
<logiciels>
{json.dumps(logiciels, ensure_ascii=False)}
</logiciels>
<certifications>
{json.dumps([(c.get("nom") or "")[:80] for c in certs[:15]], ensure_ascii=False)}
</certifications>
<langues>
{json.dumps([(l.get("langue") or "") + " - " + (l.get("niveau") or "") for l in langues[:10] if isinstance(l, dict)], ensure_ascii=False)}
</langues>
</cv>
{offre_block}

<instructions>
Choisis les éléments à GARDER pour un CV d'une page A4, les plus pertinents pour l'offre (ou les plus représentatifs sans offre).
Retourne UNIQUEMENT un JSON avec exactement ces clés (utilise les ids des expériences et les index pour formations/projets/certifications/langues) :

{{
  "experience_ids": ["id1", "id2", ...],
  "experience_bullets": {{ "id1": 2, "id2": 1, ... }},
  "formation_indices": [0, 1, ...],
  "projet_indices": [0, ...],
  "competence_techniques": ["item1", "item2", ...],
  "competence_logiciels": ["item1", ...],
  "certification_indices": [0, 1, ...],
  "langue_indices": [0, 1, ...]
}}

- experience_ids : liste des id d'expériences à garder, dans l'ordre d'affichage (plus récent en premier).
- experience_bullets : pour chaque id, nombre de bullet points à garder (1 ou 2).
- formation_indices, projet_indices, certification_indices, langue_indices : indices dans les listes fournies (0-based).
- competence_techniques et competence_logiciels : sous-ensemble des listes fournies (recopie les chaînes à l'identique).
</instructions>"""


def _extract_json(text: str) -> dict | None:
    text = (text or "").strip()
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


def _should_skip_selection(cv: dict) -> bool:
    """Retourne True si le CV a peu de contenu : on garde le comportement par défaut (pas d'appel IA)."""
    n_exp = len([e for e in (cv.get("experiences") or []) if e.get("poste") or e.get("entreprise") or (e.get("bullet_points") or [])])
    n_form = len([f for f in (cv.get("formations") or []) if f.get("diplome") or f.get("etablissement") or f.get("date")])
    n_proj = len([p for p in (cv.get("projets") or []) if p.get("nom") or p.get("description")])
    comp = cv.get("competences") or {}
    n_tech = len(comp.get("techniques") or comp.get("competences_techniques") or [])
    n_log = len(comp.get("logiciels") or comp.get("informatiques") or [])
    # Si tout tient déjà dans les limites classiques (6 exp, 5 form, 5 proj, peu de compétences), pas besoin de sélection
    if n_exp <= 6 and n_form <= 5 and n_proj <= 5 and (n_tech + n_log) <= 15:
        return True
    return False


def select_cv_content_for_a4(
    cv: dict,
    offre: dict | None = None,
    user_id: str | None = None,
    *,
    force: bool = False,
) -> dict | None:
    """
    Appelle l'IA pour sélectionner les éléments du CV à afficher sur une page A4.
    Retourne un dict de sélection (experience_ids, formation_indices, etc.) ou None en cas d'erreur.
    Si force=True (ex. au moment de l'adaptation à une offre), la sélection est toujours exécutée pour garantir 1 page.
    """
    if not force and _should_skip_selection(cv):
        return None

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return None

    try:
        from google import genai
        from google.genai import types
    except ImportError:
        return None

    try:
        from backend.gemini_usage import ensure_budget, record_and_check
    except ImportError:
        ensure_budget = lambda uid: None
        record_and_check = lambda uid, op, r: None

    ensure_budget(user_id)

    client = genai.Client(api_key=api_key)
    prompt = _build_select_prompt(cv, offre)

    r = client.models.generate_content(
        model=GEMINI_MODEL_DEFAULT,
        contents=SELECT_A4_SYSTEM.strip() + "\n\n---\n\n" + prompt,
        config=types.GenerateContentConfig(temperature=0.2),
    )
    if not r or not getattr(r, "text", None):
        return None
    record_and_check(user_id, "select_a4", r)

    raw = (r.text or "").strip()
    sel = _extract_json(raw)
    if not sel or not isinstance(sel, dict):
        return None

    # Normaliser : s'assurer que les clés existent et sont des listes/dicts valides
    out = {}
    exp_ids = sel.get("experience_ids")
    if isinstance(exp_ids, list):
        out["experience_ids"] = [str(x) for x in exp_ids]
    else:
        return None

    exp_bullets = sel.get("experience_bullets")
    if isinstance(exp_bullets, dict):
        out["experience_bullets"] = {str(k): int(v) for k, v in exp_bullets.items() if isinstance(v, (int, float)) and 1 <= int(v) <= 3}
    else:
        out["experience_bullets"] = {}

    for key, default in (
        ("formation_indices", []),
        ("projet_indices", []),
        ("certification_indices", []),
        ("langue_indices", []),
    ):
        val = sel.get(key)
        if isinstance(val, list):
            out[key] = [int(x) for x in val if isinstance(x, (int, float))]
        else:
            out[key] = default

    for key in ("competence_techniques", "competence_logiciels"):
        val = sel.get(key)
        if isinstance(val, list):
            out[key] = [str(x).strip() for x in val if x]
        else:
            out[key] = []

    return out


def apply_selection_to_cv(cv: dict, selection: dict | None) -> dict:
    """
    Retourne une copie du CV filtrée selon la sélection A4.
    Si selection est None, retourne cv tel quel (le rendu fera le truncation par défaut).
    """
    if not selection:
        return dict(cv)

    from copy import deepcopy
    out = deepcopy(cv)

    exp_ids = selection.get("experience_ids") or []
    exp_bullets = selection.get("experience_bullets") or {}
    if exp_ids:
        by_id = {e.get("id"): e for e in (out.get("experiences") or []) if e.get("id")}
        kept = []
        for eid in exp_ids:
            if eid not in by_id:
                continue
            e = by_id[eid]
            n_bullets = exp_bullets.get(eid, 2)
            if isinstance(n_bullets, (int, float)):
                n_bullets = max(1, min(3, int(n_bullets)))
            else:
                n_bullets = 2
            bullets = (e.get("bullet_points") or [])[:n_bullets]
            kept.append({**e, "bullet_points": bullets})
        out["experiences"] = kept

    form_idx = selection.get("formation_indices")
    if form_idx is not None and isinstance(form_idx, list):
        all_form = out.get("formations") or []
        out["formations"] = [all_form[i] for i in form_idx if 0 <= i < len(all_form)]

    proj_idx = selection.get("projet_indices")
    if proj_idx is not None and isinstance(proj_idx, list):
        all_proj = out.get("projets") or []
        out["projets"] = [all_proj[i] for i in proj_idx if 0 <= i < len(all_proj)]

    cert_idx = selection.get("certification_indices")
    if cert_idx is not None and isinstance(cert_idx, list):
        all_cert = out.get("certifications") or []
        out["certifications"] = [all_cert[i] for i in cert_idx if 0 <= i < len(all_cert)]

    lang_idx = selection.get("langue_indices")
    comp = out.get("competences") or {}
    if isinstance(comp, dict):
        comp = dict(comp)
        langues_all = comp.get("langues") or []
        if lang_idx is not None and isinstance(lang_idx, list) and langues_all:
            comp["langues"] = [langues_all[i] for i in lang_idx if 0 <= i < len(langues_all)]
        tech_sel = selection.get("competence_techniques")
        if isinstance(tech_sel, list) and tech_sel:
            comp["techniques"] = tech_sel
        log_sel = selection.get("competence_logiciels")
        if isinstance(log_sel, list) and log_sel:
            comp["logiciels"] = log_sel
        out["competences"] = comp

    return out
