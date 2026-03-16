"""
Bot d'import : prend un PDF de CV, utilise l'IA (Gemini) pour générer un template
HTML/CSS qui reproduit le design (copier-coller visuel). Si pas d'IA ou échec,
repli sur extraction des couleurs + template classic.
Insère dans Supabase en __pending__ (owner_user_id='__pending__', allowed_user_ids=[]).
Usage (depuis la racine cv-bot) :
  python -m backend.scripts.cv_pdf_to_template          # ouvre l'explorateur, tu choisis le PDF
  python -m backend.scripts.cv_pdf_to_template "chemin/vers/CV.pdf"
"""
from __future__ import annotations

import argparse
import base64
import io
import re
import sys
from pathlib import Path


def choose_pdf_path():
    """Ouvre l'explorateur de fichiers pour choisir un PDF. Retourne le Path ou None si annulé."""
    try:
        import tkinter as tk
        from tkinter import filedialog
    except ImportError:
        return None
    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    path = filedialog.askopenfilename(
        title="Choisir un CV (PDF)",
        filetypes=[("PDF", "*.pdf"), ("Tous les fichiers", "*.*")],
    )
    root.destroy()
    return Path(path) if path else None


# Racine du projet = cv-bot (parent de backend)
SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
PROJECT_ROOT = BACKEND_DIR.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from dotenv import load_dotenv
load_dotenv(PROJECT_ROOT / ".env")

from backend.db import create_pending_custom_template, update_custom_template_content
from backend.config import USE_SUPABASE


# Variables Jinja2 que le moteur de rendu CV injecte (le template doit les utiliser).
# IMPORTANT : langues_for_display et listes de compétences sont des listes d'objets ; ne JAMAIS faire {{ langues_for_display }} seul (afficherait du Python brut).
JINJA_VARS_REF = """
Variables disponibles (Jinja2) — syntaxe EXACTE à respecter :
- En-tête : {{ prenom }}, {{ nom }}, {{ titre_professionnel_display }}, {{ resume_display }}, {{ telephone }}, {{ email }}, {{ linkedin }}, {{ photo_url }} (optionnel), {{ for_preview }}
- Expériences : {% for exp in experiences_for_display %} ... {{ exp.entreprise_display }}, {{ exp.date_debut_display }}, {{ exp.date_fin_display }}, {{ exp.lieu_display }}, {{ exp.poste_display }}, {{ exp.secteur_display }}, {{ exp.clients_display }}, {% for bullet in exp.bullet_points %} {{ bullet.html|safe }} {% endfor %} {% endfor %}
- Formations : {% for form in formations_for_display %} {{ form.etablissement }}, {{ form.diplome }}, {{ form.date }}, {{ form.mention }} {% endfor %}
- Projets : {% for proj in projets_for_display %} {{ proj.nom }}, {{ proj.description }} {% endfor %}
- Langues : OBLIGATOIRE — {% for l in langues_for_display %} {{ l.langue }} - {{ l.niveau }} {% endfor %}. Ne JAMAIS écrire {{ langues_for_display }} seul (sinon affichage type {'langue': 'Français', ...}).
- Compétences (listes) : {% for item in competences.techniques %} {{ item }} {% endfor %}, idem pour competences.logiciels, competences.autres. Ou boucles équivalentes.
- Certifications : {% for c in certifications_for_display %} {{ c.nom }}, {{ c.organisme }}, {{ c.date }} {% endfor %}
- ATS : {{ show_mots_cles_ats }}, {{ mots_cles_cache }}
Utilise |safe pour les champs déjà échappés (titre_professionnel_display, resume_display, exp.*_display, bullet.html). Pour les dates en texte, tu peux utiliser |safe si besoin.
Structure : <!DOCTYPE html>, <html lang="fr">, <head> avec <link rel="stylesheet" href="template.css">, <body> avec <article class="cv">. Pas de JavaScript.
"""


CV_TEMPLATE_AI_PROMPT = f"""Tu es un expert en mise en page de CV. L'image jointe est la première page d'un CV (PDF).

Ta tâche : générer un template HTML + CSS qui REPRODUIT AU MIEUX ce design (mise en page, couleurs, polices, espacements, bordures) pour que le rendu soit un vrai "copier-coller" visuel du CV.

Contraintes obligatoires :
1. Le HTML doit être du Jinja2 valide utilisant EXACTEMENT les variables listées ci-dessous (pas de texte en dur pour le contenu du CV). Les textes affichés dans l'image doivent être remplacés par les variables Jinja2 correspondantes.
2. Sortie : exactement deux blocs de code. Premier bloc : une ligne contenant uniquement ```html puis tes lignes HTML puis une ligne contenant uniquement ```. Second bloc : une ligne ```css puis tes lignes CSS puis ```. Pas de texte avant ou après ces deux blocs.
3. Le HTML doit contenir <link rel="stylesheet" href="template.css"> dans <head> pour que le CSS soit injecté côté serveur.
4. Dimensions adaptées à un CV A4 (210mm x 297mm), polices lisibles (9pt-12pt pour le corps).
{JINJA_VARS_REF}
Génère UNIQUEMENT les deux blocs (```html ... ``` puis ```css ... ```)."""


def pdf_page_to_pil_image(pdf_path: Path, page_index: int = 0, dpi: int = 150):
    """Rend la première page du PDF en image PIL."""
    import fitz
    doc = fitz.open(pdf_path)
    try:
        page = doc[page_index]
        mat = fitz.Matrix(dpi / 72, dpi / 72)
        pix = page.get_pixmap(matrix=mat, alpha=False)
        from PIL import Image
        img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        return img
    finally:
        doc.close()


def pil_to_jpeg_bytes(img, max_long_side: int = 1200, quality: int = 88):
    """Redimensionne si besoin et renvoie les bytes JPEG (pour envoi à l'IA)."""
    from PIL import Image
    w, h = img.size
    if max(w, h) > max_long_side:
        img = img.copy()
        img.thumbnail((max_long_side, max_long_side), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality)
    return buf.getvalue()


def _extract_html_css_blocks(text: str) -> tuple[str | None, str | None]:
    """Extrait le premier bloc HTML et le premier bloc CSS de la réponse (plusieurs formats acceptés)."""
    text = (text or "").strip()
    html_content = None
    css_content = None
    # 1) Bloc explicite ```html ... ```
    m = re.search(r"```\s*html\s*\n(.*?)```", text, re.DOTALL | re.IGNORECASE)
    if m:
        html_content = m.group(1).strip()
    # 2) Sinon premier bloc ``` ... ``` qui ressemble à du HTML/Jinja2
    if not html_content:
        for m in re.finditer(r"```\s*\n(.*?)```", text, re.DOTALL):
            cand = m.group(1).strip()
            if ("<" in cand and ">" in cand) or ("{{ " in cand or "{% " in cand) and ("prenom" in cand or "nom" in cand):
                html_content = cand
                break
    # 3) Bloc ```css ... ```
    m = re.search(r"```\s*css\s*\n(.*?)```", text, re.DOTALL | re.IGNORECASE)
    if m:
        css_content = m.group(1).strip()
    if not css_content and html_content:
        # Tout ce qui est entre le premier ``` fermant et un deuxième bloc ``` peut être du CSS
        idx = text.find("```")
        if idx >= 0:
            rest = text[idx + 3 :].strip()
            if rest.startswith("css"):
                rest = rest[3:].lstrip("\n")
            n = rest.find("```")
            if n > 0 and ("{" in rest[:n] or ":" in rest[:n]):
                css_content = rest[:n].strip()
    return html_content, css_content or ""


def generate_template_with_ai(image_jpeg_bytes: bytes, api_key: str, debug: bool = False) -> tuple[str | None, str | None]:
    """Appelle Gemini avec l'image + prompt, retourne (html_content, css_content) ou (None, None)."""
    try:
        from google import genai
        from google.genai import types
    except ImportError:
        return None, None
    client = genai.Client(api_key=api_key)
    image_part = types.Part.from_bytes(data=image_jpeg_bytes, mime_type="image/jpeg")
    contents = [image_part, CV_TEMPLATE_AI_PROMPT]
    for model_id in ("gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-1.5-flash", "gemini-1.5-pro"):
        try:
            r = client.models.generate_content(
                model=model_id,
                contents=contents,
                config=types.GenerateContentConfig(temperature=0.2),
            )
            break
        except Exception as e:
            err_str = str(e).upper()
            if "404" in err_str or "NOT_FOUND" in err_str or "no longer available" in err_str:
                if debug:
                    print(f"[Debug] Modèle {model_id} indisponible, essai suivant...", file=sys.stderr)
                continue
            if debug:
                print(f"[Debug] Erreur API Gemini: {e}", file=sys.stderr)
            return None, None
    else:
        if debug:
            print("[Debug] Aucun modèle Gemini avec vision disponible (404 sur tous).", file=sys.stderr)
        return None, None
    if not r or not getattr(r, "text", None):
        if debug:
            print("[Debug] Réponse Gemini vide ou sans .text", file=sys.stderr)
        return None, None
    text = r.text.strip()
    if debug:
        print(f"[Debug] Réponse (début, 1200 car.):\n{text[:1200]}", file=sys.stderr)
    html_content, css_content = _extract_html_css_blocks(text)
    if not html_content:
        return None, None
    # Validation minimale : prénom et nom en Jinja2
    if not ("{{ prenom }}" in html_content or "{{prenom}}" in html_content) or not ("{{ nom }}" in html_content or "{{nom}}" in html_content):
        if not ("experiences_for_display" in html_content and "nom" in html_content):
            if debug:
                print("[Debug] HTML extrait mais variables requises manquantes (prenom/nom).", file=sys.stderr)
            return None, None
    # Contre-vérification : refuser les templates qui afficheraient des dict Python bruts (ex. langues)
    if "langues_for_display" in html_content and "for " in html_content and " in langues_for_display" not in html_content:
        if debug:
            print("[Debug] Template rejeté : langues_for_display utilisé sans boucle (affichérait des dict).", file=sys.stderr)
        return None, None
    if "{{ langues_for_display }}" in html_content or "{{langues_for_display}}" in html_content:
        if debug:
            print("[Debug] Template rejeté : {{ langues_for_display }} interdit (utiliser une boucle for l in langues_for_display).", file=sys.stderr)
        return None, None
    # Test de rendu avec un contexte minimal pour détecter erreurs (optionnel, peut être coûteux)
    try:
        from jinja2 import Environment, select_autoescape
        env = Environment(autoescape=select_autoescape(("html", "xml")))
        tpl = env.from_string(html_content)
        ctx = {
            "prenom": "Test", "nom": "User", "titre_professionnel_display": "", "resume_display": "",
            "telephone": "", "email": "", "linkedin": "", "photo_url": "", "for_preview": True,
            "experiences_for_display": [{"entreprise_display": "A", "date_debut_display": "2020", "date_fin_display": "Aujourd'hui", "lieu_display": "", "poste_display": "", "secteur_display": "", "clients_display": "", "bullet_points": [{"html": "- Point"}]}],
            "formations_for_display": [], "projets_for_display": [], "certifications_for_display": [],
            "competences": {"techniques": [], "logiciels": [], "informatiques": [], "autres": []},
            "langues_for_display": [{"langue": "Français", "niveau": "Natif"}],
            "loisirs": [], "show_mots_cles_ats": True, "mots_cles_cache": "",
        }
        out = tpl.render(**ctx)
        if "'langue'" in out or "'niveau'" in out or "{'" in out:
            if debug:
                print("[Debug] Contre-vérification : le rendu contient des dict Python bruts (langues mal gérées). Template rejeté.", file=sys.stderr)
            return None, None
    except Exception as e:
        if debug:
            print(f"[Debug] Contre-vérification (rendu test) : {e}", file=sys.stderr)
        return None, None
    return html_content, css_content or ""


def extract_dominant_colors(img, n_colors: int = 5, sample_size: int = 80):
    """Retourne une liste de couleurs (R,G,B) triées par luminance."""
    from PIL import Image
    img_small = img.copy()
    img_small.thumbnail((sample_size, sample_size))
    pixels = list(img_small.getdata())
    if not pixels:
        return [(30, 42, 58), (244, 244, 242), (30, 42, 58)]

    def luminance(r, g, b):
        return 0.299 * r + 0.587 * g + 0.114 * b

    by_lum = sorted(set((p[:3] for p in pixels if len(p) >= 3)), key=lambda c: luminance(*c))
    if len(by_lum) <= n_colors:
        colors = by_lum
    else:
        step = max(1, len(by_lum) // n_colors)
        colors = [by_lum[i] for i in range(0, len(by_lum), step)][:n_colors]
    return sorted(colors, key=lambda c: luminance(*c)) if colors else [(30, 42, 58), (244, 244, 242), (30, 42, 58)]


def pick_header_sidebar_accent(colors: list):
    def to_hex(r, g, b):
        return f"#{r:02x}{g:02x}{b:02x}"
    if len(colors) >= 3:
        return to_hex(*colors[0]), to_hex(*colors[-1]), to_hex(*colors[len(colors) // 2])
    if len(colors) == 2:
        return to_hex(*colors[0]), to_hex(*colors[1]), to_hex(*colors[0])
    header = colors[0] if colors else (30, 42, 58)
    return to_hex(*header), "#f4f4f2", to_hex(*header)


def build_css_with_colors(classic_css: str, header_hex: str, sidebar_hex: str, accent_hex: str) -> str:
    css = classic_css
    for old, new in [
        ("--cv-header-color: #1e2a3a", f"--cv-header-color: {header_hex}"),
        ("--cv-sidebar-color: #f4f4f2", f"--cv-sidebar-color: {sidebar_hex}"),
        ("--cv-accent-color: #1e2a3a", f"--cv-accent-color: {accent_hex}"),
    ]:
        css = css.replace(old, new, 1)
    return css


def main():
    parser = argparse.ArgumentParser(description="Importe un PDF de CV : l'IA reproduit le design en template HTML/CSS (ou couleurs seules si pas d'IA).")
    parser.add_argument("pdf_path", type=str, nargs="?", default="", help="Chemin PDF (optionnel : ouvre l'explorateur)")
    parser.add_argument("--name", type=str, default="", help="Nom du template")
    parser.add_argument("--description", type=str, default="", help="Description optionnelle")
    parser.add_argument("--no-ai", action="store_true", help="Ne pas appeler l'IA : seulement extraire les couleurs (template classic)")
    parser.add_argument("--update-id", type=str, default="", help="Mettre à jour le HTML/CSS de ce template existant (ex. custom_28b6539c-...) au lieu d'en créer un nouveau")
    parser.add_argument("--debug", action="store_true", help="Afficher le début de la réponse IA en cas d'échec (pour diagnostiquer)")
    args = parser.parse_args()

    if not (args.pdf_path or "").strip():
        pdf_path = choose_pdf_path()
        if not pdf_path:
            print("Aucun fichier choisi.", file=sys.stderr)
            sys.exit(1)
    else:
        pdf_path = Path(args.pdf_path).resolve()
    if not pdf_path.is_file():
        print(f"Fichier introuvable: {pdf_path}", file=sys.stderr)
        sys.exit(1)

    if not USE_SUPABASE:
        print("Supabase n'est pas configuré (.env). Impossible d'insérer le template.", file=sys.stderr)
        sys.exit(1)

    try:
        img = pdf_page_to_pil_image(pdf_path)
    except Exception as e:
        print(f"Impossible de lire le PDF: {e}", file=sys.stderr)
        sys.exit(1)

    html_content = None
    css_content = None
    use_ai = not args.no_ai
    api_key = __import__("os").environ.get("GEMINI_API_KEY")

    if use_ai and api_key:
        print("Génération du template par l'IA (reproduction du design)...")
        jpeg_bytes = pil_to_jpeg_bytes(img)
        html_content, css_content = generate_template_with_ai(jpeg_bytes, api_key, debug=args.debug)
        if html_content:
            print("Template généré par l'IA (design reproduit).")
        else:
            print("L'IA n'a pas renvoyé un template valide, repli sur couleurs + template classic.")

    if html_content is None:
        if use_ai and not api_key:
            print("GEMINI_API_KEY absente dans .env : impossible de reproduire le design. Repli sur template « classic » + couleurs.")
        print("(Repli) Extraction des couleurs + template « classic » — le rendu ne reproduit pas la mise en page de ton PDF.")
        colors = extract_dominant_colors(img)
        header_hex, sidebar_hex, accent_hex = pick_header_sidebar_accent(colors)
        print(f"Couleurs extraites: header={header_hex} sidebar={sidebar_hex} accent={accent_hex}")
        templates_dir = PROJECT_ROOT / "templates" / "classic"
        html_path = templates_dir / "template.html"
        css_path = templates_dir / "template.css"
        if not html_path.is_file() or not css_path.is_file():
            print(f"Templates classic introuvables dans {templates_dir}", file=sys.stderr)
            sys.exit(1)
        html_content = html_path.read_text(encoding="utf-8")
        classic_css = css_path.read_text(encoding="utf-8")
        css_content = build_css_with_colors(classic_css, header_hex, sidebar_hex, accent_hex)

    name = (args.name or pdf_path.stem).strip() or "Template importé"
    description = (args.description or f"Importé depuis {pdf_path.name}.").strip()
    if use_ai and api_key and "reproduit" not in description and "IA" not in description:
        description = f"Importé depuis {pdf_path.name} (design reproduit par IA)."

    options = [
        {"key": "show_photo", "type": "boolean", "default": True, "label": "Afficher la photo"},
        {"key": "show_mots_cles_ats", "type": "boolean", "default": True, "label": "Mots-clés ATS"},
    ]

    update_id = (args.update_id or "").strip()
    if update_id and update_id.startswith("custom_"):
        try:
            ok = update_custom_template_content(update_id, html_content, css_content or "")
            if ok:
                print(f"Template mis à jour: {update_id}")
                print("Recharge l'app pour voir le nouveau design.")
            else:
                print(f"Impossible de mettre à jour {update_id}. Vérifie que l'id existe dans cv_templates.", file=sys.stderr)
                sys.exit(1)
        except Exception as e:
            print(f"Erreur mise à jour Supabase: {e}", file=sys.stderr)
            sys.exit(1)
        return

    try:
        result = create_pending_custom_template(
            name=name,
            description=description,
            html_content=html_content,
            css_content=css_content or "",
            options=options,
        )
        print(f"Template créé en __pending__: id={result['id']} name={result['name']}")
        print("Assigner owner_user_id et/ou allowed_user_ids dans Supabase pour le rendre visible dans « Mes templates ».")
    except Exception as e:
        print(f"Erreur insertion Supabase: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
