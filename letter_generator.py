#!/usr/bin/env python3
"""
Génération du contenu de la lettre de motivation via Gemini, puis rendu PDF.
"""

import os
import re
from pathlib import Path
from datetime import datetime

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent / ".env")
except ImportError:
    pass


LETTER_SYSTEM_PROMPT = """Tu es un expert en rédaction de lettres de motivation.
Tu rédiges des lettres professionnelles, percutantes et personnalisées.

Règles strictes :
- Ne jamais inventer d'expérience, diplôme ou fait absent du CV
- S'appuyer sur le CV fourni et la fiche de poste pour personnaliser
- Ton professionnel mais authentique, direct et accessible
- 3 paragraphes maximum : accroche + adéquation CV/poste + motivation/disponibilité
- Retourner UNIQUEMENT le corps de la lettre (pas de formule d'appel ni de signature)
- Format : texte brut, paragraphes séparés par une ligne vide (double saut de ligne)

Ton et formulation — à respecter absolument :
- Bannir les tournures pompeuses, guindées ou "haute société" : par exemple "suscite mon plus vif intérêt", "je me permets de", "au vu de", "je nourris l'ambition de", "c'est avec un vif enthousiasme que", "je serais ravi de", "je demeure à votre disposition"
- Privilégier des phrases simples, directes et naturelles : "ce poste m'intéresse parce que", "mon expérience en... correspond à", "je souhaite rejoindre", "je suis disponible pour"
- Rester crédible et humain : pas de sur-enchère ni de formules de courtoisie excessives
- Éviter le jargon corporate creux ; privilégier le concret (missions, compétences, projets)"""


def _cv_resume_for_prompt(cv: dict) -> str:
    """Résumé court du CV pour le prompt."""
    parts = [
        f"Profil : {cv.get('prenom', '')} {cv.get('nom', '')}, {cv.get('titre_professionnel', '')}",
        f"Résumé : {cv.get('resume', '')}",
    ]
    for exp in (cv.get("experiences") or [])[:3]:
        parts.append(f"- {exp.get('poste', '')} chez {exp.get('entreprise', '')} : {' ; '.join((exp.get('bullet_points') or [])[:2])}")
    return "\n".join(parts)


def generer_corps_lettre(cv: dict, fiche_poste: str, poste: str, entreprise: str) -> str:
    """
    Appelle Gemini pour générer le corps de la lettre (texte brut, paragraphes séparés par \n\n).
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY manquante pour générer la lettre.")

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)
    config = types.GenerateContentConfig(
        system_instruction=LETTER_SYSTEM_PROMPT,
        temperature=0.4,
    )

    cv_resume = _cv_resume_for_prompt(cv)
    fiche_short = (fiche_poste or "")[:3500].strip()

    user = f"""<cv>
{cv_resume}
</cv>

<fiche_poste>
Poste visé : {poste}
Entreprise : {entreprise}

{fiche_short}
</fiche_poste>

Rédige le corps de la lettre de motivation (3 paragraphes max). Retourne uniquement le texte, paragraphes séparés par une ligne vide. Pas de "Madame, Monsieur", pas de signature.

Ton : direct et naturel. À proscrire : "suscite mon plus vif intérêt", "je me permets de", formules trop guindées ou pompeuses. Préférer des phrases simples et concrètes."""

    r = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=user,
        config=config,
    )
    if not r or not getattr(r, "text", None):
        raise ValueError("Réponse Gemini vide pour la lettre.")
    return r.text.strip()


def _texte_to_html_paragraphes(texte: str) -> str:
    """Convertit un texte avec paragraphes (séparés par \n\n) en HTML <p>."""
    if not texte:
        return "<p></p>"
    paragraphes = [p.strip() for p in re.split(r"\n\s*\n", texte) if p.strip()]
    return "".join(f"<p>{p}</p>" for p in paragraphes)


def generer_lettre_pdf(
    cv: dict,
    fiche_poste: str,
    poste: str,
    entreprise: str,
    output_path: Path,
) -> None:
    """Génère le PDF de la lettre de motivation et l'enregistre à output_path."""
    base_dir = Path(__file__).resolve().parent
    corps_brut = generer_corps_lettre(cv, fiche_poste, poste, entreprise)
    corps_html = _texte_to_html_paragraphes(corps_brut)

    from jinja2 import Environment, FileSystemLoader, select_autoescape
    from weasyprint import HTML, CSS

    env = Environment(
        loader=FileSystemLoader(str(base_dir)),
        autoescape=select_autoescape(("html", "xml")),
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
    doc = HTML(string=html_str, base_url=str(base_dir))
    css = CSS(filename=base_dir / "letter_template.css")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    doc.write_pdf(output_path, stylesheets=[css])


def generer_lettre_pdf_bytes(
    cv: dict,
    fiche_poste: str,
    poste: str,
    entreprise: str,
) -> tuple[bytes, str]:
    """Génère le PDF de la lettre en mémoire. Retourne (bytes_du_pdf, nom_fichier)."""
    from io import BytesIO

    base_dir = Path(__file__).resolve().parent
    corps_brut = generer_corps_lettre(cv, fiche_poste, poste, entreprise)
    corps_html = _texte_to_html_paragraphes(corps_brut)

    from jinja2 import Environment, FileSystemLoader, select_autoescape
    from weasyprint import HTML, CSS

    env = Environment(
        loader=FileSystemLoader(str(base_dir)),
        autoescape=select_autoescape(("html", "xml")),
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
    doc = HTML(string=html_str, base_url=str(base_dir))
    css = CSS(filename=base_dir / "letter_template.css")
    buffer = BytesIO()
    doc.write_pdf(buffer, stylesheets=[css])

    prenom = (cv.get("prenom") or "").strip()
    nom = (cv.get("nom") or "").strip()
    poste_safe = re.sub(r'[<>:"/\\|?*]', "", (poste or "").strip())
    poste_safe = re.sub(r"\s+", " ", poste_safe).strip()[:60] if poste_safe else ""
    nom_lettre = f"Motivation {prenom} {nom} - {poste_safe}.pdf" if poste_safe else f"Motivation {prenom} {nom}.pdf"
    return buffer.getvalue(), nom_lettre
