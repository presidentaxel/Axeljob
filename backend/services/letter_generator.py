#!/usr/bin/env python3
"""Letter generation service."""

import os
import re
from datetime import datetime
from pathlib import Path

from backend.config import GEMINI_MODEL_DEFAULT

LETTER_SYSTEM_PROMPT = """Tu es un expert en rédaction de lettres de motivation.
Tu rédiges des lettres professionnelles, percutantes et personnalisées.
..."""

_CV_TEMPLATE_SLUGS = frozenset(
    {
        "classic",
        "classique",
        "modern",
        "moderne",
        "creative",
        "creatif",
        "créatif",
        "minimal",
        "elegant",
        "élégant",
        "bold",
        "executive",
        "impact",
    }
)


def _is_leading_template_line(line: str) -> bool:
    s = (line or "").strip()
    if not s or len(s) > 200:
        return False
    low = s.lower().rstrip(".!")
    if low in _CV_TEMPLATE_SLUGS:
        return True
    if re.fullmatch(r"custom_[a-z0-9_]+", low):
        return True
    if re.fullmatch(r"template\s+[a-z0-9_\-]{1,48}", low):
        return True
    for prefix in (
        "type de template",
        "template cv",
        "template de cv",
        "modèle cv",
        "modèle de cv",
        "type de lettre",
    ):
        if low.startswith(prefix):
            return True
    return False


def _split_first_paragraph(text: str) -> tuple[str, str]:
    idx = text.find("\n\n")
    if idx < 0:
        return text.strip(), ""
    return text[:idx].strip(), text[idx + 2 :].strip()


def _strip_leading_template_echo(corps: str) -> str:
    s = (corps or "").strip()
    while s:
        first, rest = _split_first_paragraph(s)
        if not first:
            s = rest
            continue
        lines = [ln.strip() for ln in first.splitlines() if ln.strip()]
        if len(lines) != 1:
            break
        line = lines[0]
        if _is_leading_template_line(line):
            s = rest
            continue
        break
    return s


def _normalize_lettre_corps_brut(raw: str) -> str:
    return _strip_leading_template_echo(
        (raw or "")
        .strip()
        .replace("**", "")
        .replace("__", "")
        .replace("\u2013", "-")
        .replace("\u2014", "-")
    )


def _cv_resume_for_prompt(cv: dict) -> str:
    parts = [
        f"Profil : {cv.get('prenom', '')} {cv.get('nom', '')}, {cv.get('titre_professionnel', '')}",
        f"Résumé : {cv.get('resume', '')}",
    ]
    for exp in (cv.get("experiences") or [])[:3]:
        parts.append(
            f"- {exp.get('poste', '')} chez {exp.get('entreprise', '')} : {' ; '.join((exp.get('bullet_points') or [])[:2])}"
        )
    return "\n".join(parts)


def _gemini_usage_guard():
    try:
        from backend.gemini_usage import ensure_budget, record_and_check

        return ensure_budget, record_and_check
    except ImportError:
        return lambda uid: None, lambda uid, op, r: None


def generer_corps_lettre(
    cv: dict,
    fiche_poste: str,
    poste: str,
    entreprise: str,
    user_id: str | None = None,
    operation: str = "letter",
) -> str:
    ensure_budget, record_and_check = _gemini_usage_guard()
    ensure_budget(user_id)
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY manquante pour générer la lettre.")
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)
    config = types.GenerateContentConfig(system_instruction=LETTER_SYSTEM_PROMPT, temperature=0.4)
    user = f"<cv>\n{_cv_resume_for_prompt(cv)}\n</cv>\n\n<fiche_poste>\nPoste visé : {poste}\nEntreprise : {entreprise}\n\n{(fiche_poste or '')[:3500].strip()}\n</fiche_poste>"
    r = client.models.generate_content(model=GEMINI_MODEL_DEFAULT, contents=user, config=config)
    if not r or not getattr(r, "text", None):
        raise ValueError("Réponse Gemini vide pour la lettre.")
    record_and_check(user_id, operation, r)
    return _normalize_lettre_corps_brut(r.text)


def _texte_to_html_paragraphes(texte: str) -> str:
    if not texte:
        return "<p></p>"
    parts: list[str] = []
    chunk = texte
    while chunk:
        para, chunk = _split_first_paragraph(chunk)
        if not para and not chunk:
            break
        if not para and chunk:
            para, chunk = chunk, ""
        if para:
            parts.append(para)
        if not chunk:
            break
    return "".join(f"<p>{p}</p>" for p in parts) if parts else "<p></p>"


def corps_lettre_to_html(corps_brut: str) -> str:
    return _texte_to_html_paragraphes(_normalize_lettre_corps_brut(corps_brut))


def generer_lettre_pdf(
    cv: dict,
    fiche_poste: str,
    poste: str,
    entreprise: str,
    output_dir: Path,
    pdf_filename: str,
) -> None:
    from jinja2 import Environment, FileSystemLoader, select_autoescape
    from weasyprint import CSS, HTML

    templates_dir = Path(__file__).resolve().parents[1] / "templates" / "documents"
    corps_html = _texte_to_html_paragraphes(
        _normalize_lettre_corps_brut(generer_corps_lettre(cv, fiche_poste, poste, entreprise))
    )
    env = Environment(
        loader=FileSystemLoader(str(templates_dir)), autoescape=select_autoescape(("html", "xml"))
    )
    template = env.get_template("letter_template.html")
    html_str = template.render(
        prenom=cv.get("prenom", ""),
        nom=cv.get("nom", ""),
        email=cv.get("email", ""),
        telephone=cv.get("telephone", ""),
        ville=cv.get("ville", ""),
        date_envoi=datetime.now().strftime("%d/%m/%Y"),
        entreprise=entreprise,
        poste=poste,
        corps_lettre=corps_html,
    )
    from backend.path_safety import resolve_under_base, safe_basename

    out_dir = output_dir.resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    safe_out = resolve_under_base(out_dir, safe_basename(pdf_filename, default="Motivation.pdf"))
    HTML(string=html_str, base_url=str(templates_dir)).write_pdf(
        safe_out, stylesheets=[CSS(filename=templates_dir / "letter_template.css")]
    )


def generer_lettre_pdf_bytes_from_corps(
    cv: dict, corps_brut: str, poste: str, entreprise: str, base_dir: "str | Path | None" = None
) -> tuple[bytes, str]:
    from io import BytesIO

    from jinja2 import Environment, FileSystemLoader, select_autoescape
    from weasyprint import CSS, HTML

    templates_dir = Path(__file__).resolve().parents[1] / "templates" / "documents"
    corps_html = _texte_to_html_paragraphes(_normalize_lettre_corps_brut(corps_brut))
    env = Environment(
        loader=FileSystemLoader(str(templates_dir)), autoescape=select_autoescape(("html", "xml"))
    )
    template = env.get_template("letter_template.html")
    html_str = template.render(
        prenom=cv.get("prenom", ""),
        nom=cv.get("nom", ""),
        email=cv.get("email", ""),
        telephone=cv.get("telephone", ""),
        ville=cv.get("ville", ""),
        date_envoi=datetime.now().strftime("%d/%m/%Y"),
        entreprise=entreprise or "",
        poste=poste or "",
        corps_lettre=corps_html,
    )
    buffer = BytesIO()
    HTML(string=html_str, base_url=str(templates_dir)).write_pdf(
        buffer, stylesheets=[CSS(filename=templates_dir / "letter_template.css")]
    )
    prenom = (cv.get("prenom") or "").strip()
    nom = (cv.get("nom") or "").strip()
    poste_safe = re.sub(
        r'[<>:"/\\|?*]', "", (poste or "").strip().replace("\u2013", "-").replace("\u2014", "-")
    )
    poste_safe = re.sub(r"\s+", " ", poste_safe).strip()[:60] if poste_safe else ""
    nom_lettre = (
        f"Motivation {prenom} {nom} - {poste_safe}.pdf"
        if poste_safe
        else f"Motivation {prenom} {nom}.pdf"
    )
    return buffer.getvalue(), nom_lettre


def generer_lettre_pdf_bytes(
    cv: dict, fiche_poste: str, poste: str, entreprise: str
) -> tuple[bytes, str]:
    corps = generer_corps_lettre(cv, fiche_poste, poste, entreprise)
    return generer_lettre_pdf_bytes_from_corps(cv, corps, poste, entreprise)
