"""Ground truth ATS : extraction PDF reel vs CV semantique attendu.

Complete le Score Parsing JSON (``ats_score.score_parsing``) avec des
metriques mesurables sur les octets PDF (pdfplumber + PyMuPDF). Voir
``docs/editor-vision.md`` §9.4 et §10.2.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable
from dataclasses import dataclass
from difflib import SequenceMatcher
from io import BytesIO
from typing import Any

from backend.services.ats_score.scoring import SCORE_MAX, SCORE_MIN
from backend.services.ats_score.types import Rule, RuleSeverity, ScoreResult


def _clamp_score(value: int) -> int:
    if value < SCORE_MIN:
        return SCORE_MIN
    if value > SCORE_MAX:
        return SCORE_MAX
    return value


# Seuils aligns sur la vision produit (§9.4 / §9.2.1).
COVERAGE_WARN: float = 0.85
COVERAGE_ERROR: float = 0.70
SECTION_ORDER_WARN: float = 0.85
PARSER_DISAGREE_WARN: float = 0.15
RASTER_MAX_CHARS: int = 20

DELTA_RASTER: int = -40
DELTA_PARSER_DISAGREE: int = -5
DELTA_COVERAGE_WARN: int = -8
DELTA_COVERAGE_ERROR: int = -15
DELTA_SECTION_ORDER: int = -10
DELTA_CRITICAL_FIELD: int = -10


@dataclass(frozen=True)
class CriticalFieldHit:
    """Presence d'un champ critique dans le texte extrait."""

    field: str
    expected: str
    present: bool
    block_ids: tuple[str, ...] = ()


def extract_text_pdfplumber(pdf_bytes: bytes) -> str:
    """Extrait le texte via pdfplumber (lecture type ATS simple)."""
    import pdfplumber

    pages: list[str] = []
    with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                pages.append(text)
    return "\n\n".join(pages)


def extract_text_pymupdf(pdf_bytes: bytes) -> str:
    """Extrait le texte via PyMuPDF (second parser pour desaccord)."""
    import fitz

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        parts = [page.get_text() or "" for page in doc]
    finally:
        doc.close()
    return "\n\n".join(p for p in parts if p.strip())


def _normalize_text(value: str) -> str:
    """Normalise pour comparaisons (casse, accents, espaces)."""
    if not value:
        return ""
    folded = unicodedata.normalize("NFKD", value)
    ascii_ish = "".join(ch for ch in folded if not unicodedata.combining(ch))
    ascii_ish = ascii_ish.lower()
    ascii_ish = re.sub(r"[^\w\s@.+-]", " ", ascii_ish, flags=re.UNICODE)
    return re.sub(r"\s+", " ", ascii_ish).strip()


def _tokens(value: str) -> list[str]:
    norm = _normalize_text(value)
    return [t for t in norm.split(" ") if t]


def linearize_cv(cv: dict[str, Any] | None) -> str:
    """Produit une lecture lineaire attendue du CV (ordre ATS classique)."""
    cv = cv if isinstance(cv, dict) else {}
    chunks: list[str] = []

    name = " ".join(
        str(cv.get(k) or "").strip() for k in ("prenom", "nom") if str(cv.get(k) or "").strip()
    )
    if name:
        chunks.append(name)
    for key in ("titre_professionnel", "email", "telephone", "ville", "linkedin", "resume"):
        val = str(cv.get(key) or "").strip()
        if val:
            chunks.append(val)

    for exp in cv.get("experiences") or []:
        if not isinstance(exp, dict):
            continue
        for key in ("poste", "entreprise", "date_debut", "date_fin"):
            val = str(exp.get(key) or "").strip()
            if val:
                chunks.append(val)
        for bullet in exp.get("bullet_points") or []:
            b = str(bullet or "").strip()
            if b:
                chunks.append(b)

    for form in cv.get("formations") or []:
        if not isinstance(form, dict):
            continue
        for key in ("diplome", "etablissement", "date"):
            val = str(form.get(key) or "").strip()
            if val:
                chunks.append(val)

    comps = cv.get("competences") if isinstance(cv.get("competences"), dict) else {}
    for key in ("techniques", "logiciels", "autres"):
        for item in comps.get(key) or []:
            val = str(item or "").strip()
            if val:
                chunks.append(val)
    for lang in comps.get("langues") or []:
        if isinstance(lang, dict):
            label = " ".join(
                str(lang.get(k) or "").strip() for k in ("langue", "niveau") if lang.get(k)
            )
            if label:
                chunks.append(label)
        else:
            val = str(lang or "").strip()
            if val:
                chunks.append(val)

    return "\n".join(chunks)


def _coverage_ratio(extracted: str, expected_linear: str) -> float:
    expected_tokens = _tokens(expected_linear)
    if not expected_tokens:
        return 1.0
    hay = set(_tokens(extracted))
    hits = sum(1 for tok in expected_tokens if tok in hay)
    return hits / len(expected_tokens)


def _lcs_ratio(extracted: str, expected_linear: str) -> float:
    a = _tokens(extracted)
    b = _tokens(expected_linear)
    if not b:
        return 1.0
    if not a:
        return 0.0
    return SequenceMatcher(None, a, b).ratio()


def _normalized_diff(left: str, right: str) -> float:
    a = _normalize_text(left)
    b = _normalize_text(right)
    if not a and not b:
        return 0.0
    return 1.0 - SequenceMatcher(None, a, b).ratio()


def _count_bullets(text: str) -> int:
    if not text:
        return 0
    count = 0
    for line in text.splitlines():
        s = line.strip()
        if re.match(r"^([•\-\*]|\d+[.)])\s+\S", s):
            count += 1
    return count


def _count_expected_bullets(cv: dict[str, Any] | None) -> int:
    cv = cv if isinstance(cv, dict) else {}
    total = 0
    for exp in cv.get("experiences") or []:
        if isinstance(exp, dict):
            total += sum(1 for b in (exp.get("bullet_points") or []) if str(b or "").strip())
    return total


def _field_block_ids(layout: dict[str, Any] | None, field: str) -> tuple[str, ...]:
    """Associe un champ CV aux block_ids du layout free-canvas si possible."""
    if not isinstance(layout, dict):
        return ()
    identity_fields = {"prenom", "nom", "titre_professionnel"}
    found: list[str] = []
    for page in layout.get("pages") or []:
        if not isinstance(page, dict):
            continue
        for block in page.get("blocks") or []:
            if not isinstance(block, dict):
                continue
            bid = str(block.get("id") or "").strip()
            if not bid:
                continue
            binding = block.get("bind")
            binds: list[str] = []
            if isinstance(binding, str):
                binds = [binding]
            elif isinstance(binding, list):
                binds = [str(x) for x in binding]
            btype = str(block.get("type") or "")
            if (
                field in binds
                or field in identity_fields
                and btype == "identity"
                or field in {"email", "telephone", "linkedin", "ville"}
                and btype == "contact"
            ):
                found.append(bid)
    seen: set[str] = set()
    out: list[str] = []
    for bid in found:
        if bid not in seen:
            seen.add(bid)
            out.append(bid)
    return tuple(out)


def _critical_field_hits(
    extracted: str,
    cv: dict[str, Any] | None,
    layout: dict[str, Any] | None = None,
) -> list[CriticalFieldHit]:
    cv = cv if isinstance(cv, dict) else {}
    hay = _normalize_text(extracted)
    hits: list[CriticalFieldHit] = []

    name_parts = [str(cv.get(k) or "").strip() for k in ("prenom", "nom")]
    name = " ".join(p for p in name_parts if p)
    if name:
        present = _normalize_text(name) in hay or all(
            _normalize_text(p) in hay for p in name_parts if p
        )
        hits.append(
            CriticalFieldHit(
                field="name",
                expected=name,
                present=present,
                block_ids=_field_block_ids(layout, "prenom")
                or _field_block_ids(layout, "nom")
                or _field_block_ids(layout, "titre_professionnel"),
            )
        )

    for field in ("email", "telephone"):
        expected = str(cv.get(field) or "").strip()
        if not expected:
            continue
        needle = _normalize_text(expected)
        present = bool(needle) and needle in hay
        if field == "telephone" and not present:
            digits_exp = re.sub(r"\D", "", expected)
            digits_hay = re.sub(r"\D", "", extracted)
            present = bool(digits_exp) and digits_exp in digits_hay
        hits.append(
            CriticalFieldHit(
                field=field,
                expected=expected,
                present=present,
                block_ids=_field_block_ids(layout, field),
            )
        )
    return hits


def verify_parsing_quality(
    pdf_bytes: bytes,
    expected_cv: dict[str, Any] | None,
    *,
    layout: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Parse le PDF avec deux extracteurs et compare au CV attendu."""
    expected_cv = expected_cv if isinstance(expected_cv, dict) else {}
    text_plumber = extract_text_pdfplumber(pdf_bytes)
    try:
        text_pymupdf = extract_text_pymupdf(pdf_bytes)
    except Exception:
        text_pymupdf = ""

    expected_linear = linearize_cv(expected_cv)
    coverage = _coverage_ratio(text_plumber, expected_linear)
    section_order = _lcs_ratio(text_plumber, expected_linear)
    disagreement = _normalized_diff(text_plumber, text_pymupdf)
    bullets_ok = _count_bullets(text_plumber) == _count_expected_bullets(expected_cv)
    critical = _critical_field_hits(text_plumber, expected_cv, layout)
    all_critical = all(h.present for h in critical) if critical else True
    raster = (
        len(_normalize_text(text_plumber)) <= RASTER_MAX_CHARS
        and len(_normalize_text(text_pymupdf)) <= RASTER_MAX_CHARS
    )

    missing = [h.field for h in critical if not h.present]
    divergent_blocks: list[str] = []
    for hit in critical:
        if not hit.present:
            divergent_blocks.extend(hit.block_ids)

    preview = text_plumber.strip()
    if len(preview) > 500:
        preview = preview[:500] + "…"

    return {
        "all_critical_fields_present": all_critical,
        "critical_fields": [
            {
                "field": h.field,
                "expected": h.expected,
                "present": h.present,
                "block_ids": list(h.block_ids),
            }
            for h in critical
        ],
        "missing_critical_fields": missing,
        "section_order_correct": round(section_order, 4),
        "bullets_parsed_as_list": bullets_ok,
        "no_text_loss_coverage": round(coverage, 4),
        "parser_disagreement": round(disagreement, 4),
        "likely_raster_pdf": raster,
        "block_ids_divergent": list(dict.fromkeys(divergent_blocks)),
        "text_preview": preview,
        "text_chars_pdfplumber": len(text_plumber),
        "text_chars_pymupdf": len(text_pymupdf),
    }


def adjust_score_with_ground_truth(
    score: ScoreResult,
    gt: dict[str, Any] | None,
) -> ScoreResult:
    """Applique les penalites ground-truth au score JSON (nouvelles regles)."""
    gt = gt if isinstance(gt, dict) else {}
    extra: list[Rule] = []

    if gt.get("likely_raster_pdf"):
        extra.append(
            Rule(
                id="gt_raster_pdf",
                label="PDF probablement rasterise (peu ou pas de texte extractible)",
                delta=DELTA_RASTER,
                severity=RuleSeverity.ERROR,
                advice="Exporter du texte selectionnable, pas une image plate.",
            )
        )

    disagreement = float(gt.get("parser_disagreement") or 0.0)
    if disagreement > PARSER_DISAGREE_WARN:
        extra.append(
            Rule(
                id="gt_parser_disagreement",
                label="Desaccord entre extracteurs PDF (design ambigu)",
                delta=DELTA_PARSER_DISAGREE,
                severity=RuleSeverity.WARNING,
                advice="Simplifier colonnes / formes qui brouillent la lecture machine.",
            )
        )

    coverage = float(gt.get("no_text_loss_coverage") or 1.0)
    if coverage < COVERAGE_ERROR:
        extra.append(
            Rule(
                id="gt_text_loss",
                label="Perte de texte importante a l'extraction PDF",
                delta=DELTA_COVERAGE_ERROR,
                severity=RuleSeverity.ERROR,
                block_ids=tuple(gt.get("block_ids_divergent") or ()),
                advice="Verifier que le contenu critique apparait bien dans le PDF.",
            )
        )
    elif coverage < COVERAGE_WARN:
        extra.append(
            Rule(
                id="gt_text_loss",
                label="Perte de texte partielle a l'extraction PDF",
                delta=DELTA_COVERAGE_WARN,
                severity=RuleSeverity.WARNING,
                block_ids=tuple(gt.get("block_ids_divergent") or ()),
                advice="Certains mots du CV ne sont pas retrouves dans le PDF.",
            )
        )

    section_order = float(gt.get("section_order_correct") or 1.0)
    if section_order < SECTION_ORDER_WARN:
        extra.append(
            Rule(
                id="gt_section_order",
                label="Ordre de lecture PDF eloigne de l'ordre semantique",
                delta=DELTA_SECTION_ORDER,
                severity=RuleSeverity.WARNING,
                advice="Eviter les colonnes / empilements qui melangent l'ordre ATS.",
            )
        )

    missing = gt.get("missing_critical_fields") or []
    if isinstance(missing, list) and missing:
        block_ids = tuple(gt.get("block_ids_divergent") or ())
        extra.append(
            Rule(
                id="gt_critical_fields_missing",
                label=f"Champs critiques absents du PDF : {', '.join(missing)}",
                delta=DELTA_CRITICAL_FIELD * len(missing),
                severity=RuleSeverity.ERROR,
                block_ids=block_ids,
                advice="Nom, email et telephone doivent etre extractibles.",
            )
        )

    if not extra:
        return score

    rules = (*score.rules, *extra)
    total = _clamp_score(score.total + sum(r.delta for r in extra))
    return ScoreResult(
        kind=score.kind,
        total=total,
        version=score.version,
        rules=rules,
    )


def rules_diff(
    score_json: ScoreResult,
    score_pdf: ScoreResult,
) -> dict[str, Any]:
    """Compare les regles JSON vs PDF (ids manquants / deltas changes)."""
    left = {r.id: r for r in score_json.rules}
    right = {r.id: r for r in score_pdf.rules}
    only_json = sorted(set(left) - set(right))
    only_pdf = sorted(set(right) - set(left))
    changed = sorted(
        rid
        for rid in set(left) & set(right)
        if left[rid].delta != right[rid].delta or left[rid].label != right[rid].label
    )
    return {
        "only_json": only_json,
        "only_pdf": only_pdf,
        "changed": changed,
    }


def expected_text_chunks(cv: dict[str, Any] | None, *, limit: int = 12) -> list[str]:
    """Morceaux de texte stables pour les snapshots PDF de non-regression."""
    linear = linearize_cv(cv)
    chunks: list[str] = []
    for line in linear.splitlines():
        s = line.strip()
        if len(s) < 3:
            continue
        chunks.append(s)
        if len(chunks) >= limit:
            break
    return chunks


def assert_chunks_in_text(extracted: str, chunks: Iterable[str]) -> list[str]:
    """Retourne la liste des chunks absents (vide = OK)."""
    import html as html_lib

    plain = html_lib.unescape(extracted or "")
    hay = _normalize_text(plain)
    missing: list[str] = []
    for chunk in chunks:
        if _normalize_text(chunk) not in hay:
            # telephone : comparer aussi les chiffres seuls
            digits = re.sub(r"\D", "", chunk)
            if digits and len(digits) >= 8 and digits in re.sub(r"\D", "", plain):
                continue
            missing.append(chunk)
    return missing
