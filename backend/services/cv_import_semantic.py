"""Import CV sémantique — passes par sections + annotations blocs (AXE-332)."""

from __future__ import annotations

import logging
import re
from collections.abc import Callable
from copy import deepcopy
from typing import Any

from fastapi import HTTPException

from backend.gemini_usage import GeminiQuotaExceeded
from backend.services.cv_semantic_schema import build_semantic_meta, sync_dual_keys

logger = logging.getLogger(__name__)

GenerateFn = Callable[[str, str | None], dict]

# Exceptions fatales : ne jamais avaler (429 / 5xx côté API).
_FATAL_EXC: tuple[type[BaseException], ...] = (GeminiQuotaExceeded, HTTPException)

# Découpe heuristique du texte brut avant passes LLM focalisées.
# « Profil / Profile » → résumé (aligné FE structuralSemanticBind), pas identité.
_SECTION_MARKERS: tuple[tuple[str, re.Pattern[str]], ...] = (
    (
        "identity",
        re.compile(
            r"^(?:identité|identity|coordonn[ée]es|contact)\s*[:.]?\s*$",
            re.I,
        ),
    ),
    (
        "experiences",
        re.compile(
            r"^(?:(?:work|professional)\s+experiences?|exp[ée]riences?(?:\s+professionnelles?)?"
            r"|work\s+history|employment)\s*[:.]?\s*$",
            re.I,
        ),
    ),
    (
        "formations",
        re.compile(
            r"^(?:formations?|education|études|etudes|dipl[oô]mes?)\s*[:.]?\s*$",
            re.I,
        ),
    ),
    (
        "skills",
        re.compile(
            r"^(?:comp[ée]tences?|skills?|technologies?|outils?)\s*[:.]?\s*$",
            re.I,
        ),
    ),
    (
        "languages",
        re.compile(r"^(?:langues?|languages?)\s*[:.]?\s*$", re.I),
    ),
    (
        "certifications",
        re.compile(r"^(?:certifications?|accreditations?)\s*[:.]?\s*$", re.I),
    ),
    (
        "projets",
        re.compile(
            r"^(?:projets?|projects?|réalisations?|realisations?)\s*[:.]?\s*$",
            re.I,
        ),
    ),
    (
        "resume",
        re.compile(
            r"^(?:profil|profile|r[ée]sum[ée]|summary|about|à propos|a propos)\s*[:.]?\s*$",
            re.I,
        ),
    ),
)

# Titres « métier » : resume/profil seul ne compte pas (sinon le corps après Profil
# est mangé par la passe résumé et le fallback full ne part jamais).
_STRUCTURAL_SECTION_KEYS = frozenset(
    {
        "experiences",
        "formations",
        "skills",
        "languages",
        "certifications",
        "projets",
    }
)

_EMAIL_RE = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.I)
_PHONE_RE = re.compile(r"(?:\+?\d[\d\s().-]{7,}\d)")

_HEADING_CLASSIFY: tuple[tuple[str, re.Pattern[str]], ...] = tuple(
    (name, pat) for name, pat in _SECTION_MARKERS if name != "identity"
)

SECTION_ORDER: tuple[str, ...] = (
    "identity",
    "resume",
    "experiences",
    "formations",
    "skills",
    "languages",
    "certifications",
    "projets",
    "body",
)


def split_cv_text_into_sections(text: str) -> dict[str, str]:
    """Découpe le texte CV en sections via titres de ligne (heuristique)."""
    raw = (text or "").replace("\r\n", "\n")
    lines = raw.split("\n")
    buckets: dict[str, list[str]] = {k: [] for k in SECTION_ORDER}
    current = "identity"
    # Premières lignes → identity jusqu'au 1er vrai titre
    seen_heading = False
    for line in lines:
        stripped = line.strip()
        matched: str | None = None
        if stripped and len(stripped) <= 64:
            for name, pat in _SECTION_MARKERS:
                if pat.match(stripped):
                    matched = name
                    break
        if matched:
            current = matched
            seen_heading = True
            continue
        if not seen_heading and current == "identity":
            buckets["identity"].append(line)
        else:
            if current not in buckets:
                buckets[current] = []
            buckets[current].append(line)
    # Corps résiduel
    out: dict[str, str] = {}
    for key in SECTION_ORDER:
        chunk = "\n".join(buckets.get(key) or []).strip()
        if chunk:
            out[key] = chunk
    if not out and raw.strip():
        out["body"] = raw.strip()
    return out


_IDENTITY_PROMPT = """Tu extrais UNIQUEMENT l'identité / contact d'un CV.
Retourne UNIQUEMENT un JSON valide :
{
  "prenom": "", "nom": "", "first_name": "", "last_name": "",
  "email": "", "telephone": "", "linkedin": "", "ville": "",
  "titre_professionnel": ""
}
Règles : prenom↔first_name et nom↔last_name doivent être synchronisés (même valeur).
Texte :
"""

_RESUME_PROMPT = """Tu extrais le résumé / accroche professionnelle.
JSON unique : { "resume": "" }
Texte :
"""

_EXPERIENCES_PROMPT = """Tu extrais les expériences professionnelles.
JSON unique :
{ "experiences": [ {
  "id": "exp_1", "poste": "", "entreprise": "", "secteur": "",
  "date_debut": "", "date_fin": "", "lieu": "", "contexte": "",
  "bullet_points": [], "mots_cles": [], "clients": ""
} ] }
Ids exp_1, exp_2… Texte :
"""

_FORMATIONS_PROMPT = """Tu extrais formations / diplômes.
JSON : { "formations": [ {
  "id": "form_1", "diplome": "", "etablissement": "", "date": "", "mention": ""
} ] }
Texte :
"""

_SKILLS_PROMPT = """Tu extrais compétences / langues / logiciels.
JSON : { "competences": {
  "techniques": [], "logiciels": [],
  "langues": [{"langue": "", "niveau": ""}], "autres": []
} }
Texte :
"""

_CERTS_PROMPT = """Tu extrais certifications.
JSON : { "certifications": [ {
  "id": "cert_1", "nom": "", "organisme": "", "date": ""
} ] }
Texte :
"""

_PROJETS_PROMPT = """Tu extrais projets / réalisations.
JSON : { "projets": [ {
  "id": "proj_1", "nom": "", "description": "", "mots_cles": []
} ] }
Texte :
"""

_LAYOUT_HINTS_PROMPT = """Tu déduis UNIQUEMENT le style de mise en page probable du CV.
Retourne UNIQUEMENT un JSON valide :
{
  "layout_hints": {
    "layout_style": "sidebar-left|sidebar-right|single-column|header-band",
    "accent_color": "#RRGGBB ou vide si inconnu",
    "sidebar_color": "#RRGGBB ou vide",
    "header_color": "#RRGGBB ou vide",
    "sections_emphasis": ["experiences", "formations", "skills", "projets"]
  }
}
sections_emphasis = sections les plus fournies (ordre d'importance).
Texte :
"""

_SECTION_PROMPTS: dict[str, str] = {
    "identity": _IDENTITY_PROMPT,
    "resume": _RESUME_PROMPT,
    "experiences": _EXPERIENCES_PROMPT,
    "formations": _FORMATIONS_PROMPT,
    "skills": _SKILLS_PROMPT,
    "languages": _SKILLS_PROMPT,
    "certifications": _CERTS_PROMPT,
    "projets": _PROJETS_PROMPT,
}


def _merge_cv_parts(parts: list[dict[str, Any]]) -> dict[str, Any]:
    merged: dict[str, Any] = {}
    for part in parts:
        if not isinstance(part, dict):
            continue
        for key, val in part.items():
            if key == "layout_hints":
                continue
            if key == "competences" and isinstance(val, dict):
                raw_base = merged.get("competences")
                base: dict[str, Any] = raw_base if isinstance(raw_base, dict) else {}
                merged["competences"] = {**base, **{k: v for k, v in val.items() if v}}
            elif key in ("experiences", "formations", "certifications", "projets") and isinstance(
                val, list
            ):
                prev_raw = merged.get(key)
                prev: list[Any] = prev_raw if isinstance(prev_raw, list) else []
                merged[key] = [*prev, *val]
            elif val not in (None, "", [], {}):
                merged[key] = val
    return sync_dual_keys(merged)


def _cv_has_minimum(cv: dict[str, Any]) -> bool:
    if (cv.get("prenom") or cv.get("first_name") or cv.get("nom") or cv.get("last_name")) and (
        cv.get("email") or cv.get("experiences") or cv.get("titre_professionnel")
    ):
        return True
    exps = cv.get("experiences") or []
    return isinstance(exps, list) and len(exps) >= 1


def _cv_has_content_sections(cv: dict[str, Any]) -> bool:
    """True si le CV a au moins une section métier (expériences, formations, …).

    Un ``resume`` seul ne suffit pas : un bloc Profil/Summary peut contenir
    (ou précéder) le reste du CV sans titres Expériences/Formations.
    """
    for key in ("experiences", "formations", "certifications", "projets"):
        val = cv.get(key)
        if isinstance(val, list) and len(val) >= 1:
            return True
    comps = cv.get("competences")
    if isinstance(comps, dict):
        for key in ("techniques", "logiciels", "langues", "autres"):
            val = comps.get(key)
            if isinstance(val, list) and len(val) >= 1:
                return True
    return False


def _sections_look_headingless(sections: dict[str, str]) -> bool:
    """Sans titres structurels, full parse requis (Profil/résumé seul ≠ structure)."""
    return not any(key in sections for key in _STRUCTURAL_SECTION_KEYS)


def parse_cv_by_sections(
    text: str,
    user_id: str | None,
    generate_json: GenerateFn,
    *,
    fallback_full: Callable[[str, str | None], dict] | None = None,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    """Parse par sections LLM puis merge. Retourne (cv, layout_hints, semantic_meta).

    ``generate_json(prompt, user_id) -> dict`` doit appeler Gemini (ou un mock).
    ``fallback_full`` : parse monolithique si résultat trop pauvre / sans titres.
    """
    sections = split_cv_text_into_sections(text)
    # identity : toujours inclure le début du doc si section vide
    if "identity" not in sections and text.strip():
        sections["identity"] = text.strip()[:2500]

    parts: list[dict[str, Any]] = []
    used_passes: list[str] = []
    layout_hints: dict[str, Any] = {}
    headingless = _sections_look_headingless(sections)

    # Sans titres métier, le texte entier est dans identity → full parse d'emblée.
    skip_sections = headingless and fallback_full is not None

    if not skip_sections:
        for name in SECTION_ORDER:
            chunk = sections.get(name)
            if not chunk or name == "body":
                continue
            prompt_prefix = _SECTION_PROMPTS.get(name)
            if not prompt_prefix:
                continue
            try:
                parsed = generate_json(prompt_prefix + chunk[:6000], user_id)
            except _FATAL_EXC:
                raise
            except Exception as exc:
                logger.warning("cv_import_semantic: section %s failed: %s", name, exc)
                continue
            if not isinstance(parsed, dict):
                continue
            hints = parsed.pop("layout_hints", None)
            if isinstance(hints, dict) and hints:
                layout_hints = {**layout_hints, **hints}
            # Enveloppe éventuelle { "cv": {...} }
            payload = parsed.get("cv") if isinstance(parsed.get("cv"), dict) else parsed
            parts.append(payload)
            used_passes.append(name)

    cv = _merge_cv_parts(parts)

    need_full = fallback_full is not None and (
        headingless or (not _cv_has_minimum(cv)) or (not _cv_has_content_sections(cv))
    )
    if need_full and fallback_full is not None:
        try:
            full = fallback_full(text, user_id)
            if isinstance(full, dict):
                inner_raw = full.get("cv") if isinstance(full.get("cv"), dict) else full
                inner: dict[str, Any] = inner_raw if isinstance(inner_raw, dict) else {}
                fb_hints_raw = full.get("layout_hints")
                fb_hints: dict[str, Any] = fb_hints_raw if isinstance(fb_hints_raw, dict) else {}
                # Full parse comble les trous ; clés déjà remplies en section gagnent.
                cv = sync_dual_keys({**inner, **{k: v for k, v in cv.items() if v}})
                if fb_hints:
                    layout_hints = {**fb_hints, **layout_hints}
                used_passes.append("fallback_full")
        except _FATAL_EXC:
            raise
        except Exception as exc:
            logger.warning("cv_import_semantic: fallback_full failed: %s", exc)

    # Passe cosmétique : soft-fail même sur quota/HTTP — ne pas perdre un CV déjà parsé.
    if not layout_hints and text.strip():
        try:
            hints_parsed = generate_json(_LAYOUT_HINTS_PROMPT + text.strip()[:4000], user_id)
            if isinstance(hints_parsed, dict):
                raw_hints = hints_parsed.get("layout_hints")
                if isinstance(raw_hints, dict) and raw_hints:
                    layout_hints = raw_hints
                    used_passes.append("layout_hints")
                elif any(
                    k in hints_parsed for k in ("layout_style", "accent_color", "sections_emphasis")
                ):
                    layout_hints = {
                        k: hints_parsed[k]
                        for k in (
                            "layout_style",
                            "accent_color",
                            "sidebar_color",
                            "header_color",
                            "sections_emphasis",
                        )
                        if k in hints_parsed
                    }
                    if layout_hints:
                        used_passes.append("layout_hints")
        except Exception as exc:
            logger.warning("cv_import_semantic: layout_hints pass failed: %s", exc)

    cv = sync_dual_keys(cv)
    meta = build_semantic_meta(cv, source="import_sectioned", section_passes=used_passes)
    return cv, layout_hints, meta


def annotate_structural_blocks(
    layout: dict[str, Any] | None,
    cv: dict[str, Any] | None,
    *,
    min_confidence: float = 0.75,
) -> list[dict[str, Any]]:
    """Annote les blocs texte d'un layout structurel (déterministe, pas d'IA)."""
    if not layout or not isinstance(layout.get("pages"), list):
        return []
    cv = sync_dual_keys(cv)
    prenom = (cv.get("prenom") or "").strip().lower()
    nom = (cv.get("nom") or "").strip().lower()
    email = (cv.get("email") or "").strip().lower()
    annotations: list[dict[str, Any]] = []

    for page in layout["pages"]:
        blocks = page.get("blocks") if isinstance(page, dict) else None
        if not isinstance(blocks, list):
            continue
        page_h = float(page.get("height_mm") or page.get("h") or 297)
        for block in blocks:
            if not isinstance(block, dict) or block.get("type") != "text":
                continue
            bid = block.get("id")
            if not bid:
                continue
            text = re.sub(r"\s+", " ", str(block.get("content") or "")).strip()
            if not text:
                continue

            hit: dict[str, Any] | None = None
            if len(text) <= 48:
                for stype, pat in _HEADING_CLASSIFY:
                    if pat.match(text):
                        conf = 0.55
                        style = block.get("style") if isinstance(block.get("style"), dict) else {}
                        if style.get("bold"):
                            conf += 0.2
                        if float(style.get("font_size") or 0) >= 11:
                            conf += 0.15
                        if len(text) <= 32:
                            conf += 0.1
                        hit = {
                            "block_id": bid,
                            "type": stype if stype != "skills" else "skills",
                            "kind": "heading",
                            "confidence": min(1.0, conf),
                            "section_label": text.upper(),
                        }
                        break

            if hit is None and (prenom or nom):
                lower = text.lower()
                has_p = bool(prenom and prenom in lower)
                has_n = bool(nom and nom in lower)
                if has_p or has_n:
                    conf = 0.45
                    y = float(block.get("y") or 0)
                    style = block.get("style") if isinstance(block.get("style"), dict) else {}
                    if y < page_h * 0.32:
                        conf += 0.25
                    if float(style.get("font_size") or 0) >= 14 or style.get("bold"):
                        conf += 0.2
                    if has_p and has_n:
                        conf += 0.15
                    if conf >= min_confidence:
                        hit = {
                            "block_id": bid,
                            "type": "identity",
                            "kind": "identity",
                            "confidence": min(1.0, conf),
                            "bind": ["prenom", "nom", "titre_professionnel"],
                        }

            if hit is None:
                conf = 0.0
                if _EMAIL_RE.search(text):
                    conf += 0.8
                if _PHONE_RE.search(text):
                    conf += 0.35
                if email and email in text.lower():
                    conf += 0.1
                if conf >= min_confidence:
                    hit = {
                        "block_id": bid,
                        "type": "contact",
                        "kind": "contact",
                        "confidence": min(1.0, conf),
                        "bind": ["email", "telephone", "linkedin", "ville"],
                    }

            if hit and float(hit.get("confidence") or 0) >= min_confidence:
                annotations.append(hit)

    return annotations


def attach_annotations_to_layout(
    layout: dict[str, Any] | None,
    annotations: list[dict[str, Any]],
) -> dict[str, Any] | None:
    """Attache ``semantic_annotations`` sur le layout (copie)."""
    if not layout:
        return layout
    out = deepcopy(layout)
    out["semantic_annotations"] = list(annotations)
    return out
