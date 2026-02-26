#!/usr/bin/env python3
"""
Génère preview.html à partir du template et de preview_data.json
pour visualiser le rendu dans un navigateur sans WeasyPrint.
Utilise la photo du dossier assets/ (compressée en photo_cv.jpg) si photo_url est vide.
"""

import json
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from photo_assets import get_photo_url_for_cv


def main() -> None:
    base_dir = Path(__file__).resolve().parent
    data_path = base_dir / "preview_data.json"
    template_dir = base_dir
    output_path = base_dir / "preview.html"

    if not data_path.exists():
        print(f"Erreur : {data_path} introuvable.")
        return

    with open(data_path, encoding="utf-8") as f:
        data = json.load(f)

    photo_url = get_photo_url_for_cv(base_dir, data.get("photo_url"))
    if photo_url:
        data["photo_url"] = photo_url

    # Même contexte que generator.py pour le template (titre_professionnel_display, resume_display, experiences_for_display)
    import html as html_module
    data["titre_professionnel_display"] = html_module.escape(data.get("titre_professionnel") or "")
    data["resume_display"] = html_module.escape(data.get("resume") or "")
    data["for_preview"] = True
    experiences_for_display = []
    for exp in (data.get("experiences") or [])[:6]:
        bullets = (exp.get("bullet_points") or [])[:2]
        experiences_for_display.append({**exp, "bullet_points": [{"text": b, "html": html_module.escape(b)} for b in bullets]})
    data["experiences_for_display"] = experiences_for_display

    env = Environment(
        loader=FileSystemLoader(str(template_dir)),
        autoescape=select_autoescape(("html", "xml")),
    )
    template = env.get_template("template.html")
    html = template.render(**data)

    output_path.write_text(html, encoding="utf-8")
    print(f"Preview généré : {output_path}")
    print("Ouvre ce fichier dans un navigateur pour voir le rendu.")


if __name__ == "__main__":
    main()
