#!/usr/bin/env python3
"""
Point d'entrée CLI : --setup pour configurer le CV, --url pour générer un CV adapté à une offre.
"""

import os
import sys
from pathlib import Path

# Charger .env dès le démarrage (pour GEMINI_API_KEY, WEASYPRINT_DLL_DIRECTORIES, etc.)
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent / ".env")
except ImportError:
    pass

# Windows + WeasyPrint : mettre les DLL Pango/GTK dans le PATH avant tout import
if os.name == "nt":
    dll_dirs = os.environ.get("WEASYPRINT_DLL_DIRECTORIES", "").strip()
    if dll_dirs:
        for dir_path in dll_dirs.replace(",", ";").split(";"):
            dir_path = os.path.abspath(dir_path.strip())
            if dir_path and os.path.isdir(dir_path):
                path_sep = os.pathsep
                os.environ["PATH"] = dir_path + path_sep + os.environ.get("PATH", "")

import argparse
import json
import time

BASE_DIR = Path(__file__).resolve().parent
CV_BASE_PATH = BASE_DIR / "cv_base.json"


def _spinner(secs: float, message: str = "Attente") -> None:
    """Affiche un spinner pendant secs secondes."""
    chars = ["|", "/", "-", "\\"]
    end = time.time() + secs
    i = 0
    while time.time() < end:
        print(f"\r  {message} {chars[i % len(chars)]}", end="", flush=True)
        time.sleep(0.15)
        i += 1
    print("\r  " + " " * (len(message) + 2) + "\r", end="", flush=True)


def cmd_setup() -> None:
    from setup import lancer_setup
    lancer_setup()


def cmd_export_pdf(output_dir: str) -> None:
    """Exporte le CV en PDF sans scraper ni adapter (pour tester le rendu)."""
    if not CV_BASE_PATH.exists():
        print("Lance d'abord : python main.py --setup")
        sys.exit(1)

    with open(CV_BASE_PATH, encoding="utf-8") as f:
        cv_base = json.load(f)

    from generator import generer_pdf
    # Offre vide → nom de fichier Prenom_Nom_CV.pdf
    offre = {"titre": "", "entreprise": ""}
    try:
        path_pdf = generer_pdf(cv_base, offre, output_dir)
        print(f"✓ CV généré : {path_pdf}")
    except ImportError as e:
        print(e)
        sys.exit(1)
    except Exception as e:
        print(f"Erreur génération PDF : {e}")
        sys.exit(1)


def cmd_url(url: str, output_dir: str) -> None:
    if not CV_BASE_PATH.exists():
        print("Lance d'abord : python main.py --setup")
        sys.exit(1)

    with open(CV_BASE_PATH, encoding="utf-8") as f:
        cv_base = json.load(f)

    # 1) Scraper l'offre
    from scraper import scrape_offre
    try:
        offre = scrape_offre(url)
    except Exception as e:
        print("Impossible de scraper cette URL.")
        print(f"Erreur : {e}")
        print("\nTu peux copier-coller la description du poste ici (terminer par une ligne vide) :")
        lignes = []
        while True:
            line = sys.stdin.readline()
            if not line or line.strip() == "":
                break
            lignes.append(line.rstrip())
        description = "\n".join(lignes)
        if not description.strip():
            print("Aucune description fournie. Abandon.")
            sys.exit(1)
        offre = {
            "titre": "Poste",
            "entreprise": "",
            "secteur": "",
            "type_contrat": "",
            "localisation": "",
            "description_brute": description,
            "mots_cles_extraits": [],
            "competences_requises": [],
            "soft_skills": [],
        }
        # Extraction mots-clés depuis la description
        from scraper import _extraire_mots_cles
        offre["mots_cles_extraits"] = _extraire_mots_cles(description, 15)
        offre["competences_requises"] = offre["mots_cles_extraits"][:15]

    # 2) Règles ATS
    from rules import appliquer_regles
    cv_enrichi = appliquer_regles(cv_base, offre)
    rapport = cv_enrichi.get("rapport", {})

    # 3) Afficher le rapport
    print("\n" + "─" * 60)
    print(f"Offre : {offre.get('titre', '')} – {offre.get('entreprise', '')}".strip(" –"))
    print(f"Score de pertinence : {rapport.get('score_global', 0)}/10")
    print(f"Zones à adapter : {', '.join(rapport.get('zones_a_adapter', [])) or 'aucune'}")
    m = rapport.get("mots_cles_manquants", [])
    if m:
        print(f"Mots-clés manquants : {', '.join(m[:10])}{'...' if len(m) > 10 else ''}")
    print("─" * 60)
    rep = input("Continuer et adapter le CV ? (o/n) ").strip().lower()
    if rep not in ("o", "oui", "y", "yes"):
        print("Annulé.")
        sys.exit(0)

    # 4) Adapter via Gemini (tweaks uniquement : resume + bullet_points + mots_cles_cache)
    from adapter import adapter_cv, apply_tweaks_to_cv
    try:
        tweaks = adapter_cv(cv_base, offre, rapport=rapport)
    except Exception as e:
        err = str(e).lower()
        if "rate" in err or "429" in err or "resource_exhausted" in err:
            print("Limite d'appels API atteinte. Attente 15 s puis nouvel essai...")
            _spinner(15, "Attente")
            try:
                tweaks = adapter_cv(cv_base, offre, rapport=rapport, retry_invalide=False)
            except Exception as e2:
                print(f"Échec après retry : {e2}")
                sys.exit(1)
        elif "json" in err or "invalide" in err:
            try:
                tweaks = adapter_cv(cv_base, offre, rapport=rapport, retry_invalide=True)
            except Exception as e2:
                print(f"Échec adaptation : {e2}")
                sys.exit(1)
        else:
            print(f"Erreur : {e}")
            sys.exit(1)

    cv_adapte = apply_tweaks_to_cv(cv_base, tweaks)

    # 5) Générer le PDF
    from generator import generer_pdf
    try:
        path_pdf = generer_pdf(cv_adapte, offre, output_dir)
        print(f"✓ CV généré : {path_pdf}")
    except ImportError as e:
        print(e)
        sys.exit(1)
    except Exception as e:
        print(f"Erreur génération PDF : {e}")
        sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser(description="Génération de CV personnalisés par offre d'emploi")
    parser.add_argument("--setup", action="store_true", help="Lancer le questionnaire pour remplir cv_base.json")
    parser.add_argument("--url", type=str, metavar="URL", help="URL de l'offre d'emploi à scraper")
    parser.add_argument("--output", "-o", type=str, default=".", metavar="DIR", help="Dossier de sortie pour le PDF (défaut: .)")
    parser.add_argument("--pdf-only", action="store_true", help="Export PDF uniquement (pas d'adaptation, pour tester)")
    args = parser.parse_args()

    if args.setup:
        cmd_setup()
        return
    if args.pdf_only:
        cmd_export_pdf(args.output)
        return
    if args.url:
        cmd_url(args.url, args.output)
        return
    parser.print_help()


if __name__ == "__main__":
    main()
