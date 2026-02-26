#!/usr/bin/env python3
"""
Point d'entrée CLI : --setup pour configurer le CV, --description pour adapter à une fiche de poste et générer le PDF.
Pas de scraping : dépôt de la fiche de poste (texte) → adaptation CV + export PDF / dossier candidature.
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
    """Exporte le CV en PDF sans adapter (pour tester le rendu)."""
    if not CV_BASE_PATH.exists():
        print("Lance d'abord : python main.py --setup")
        sys.exit(1)

    with open(CV_BASE_PATH, encoding="utf-8") as f:
        cv_base = json.load(f)

    from generator import generer_pdf
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


def cmd_adapt(description: str, output_dir: str, titre: str = "", entreprise: str = "") -> None:
    """Adapte le CV à la fiche de poste (texte) et génère le PDF. Pas de scraping."""
    if not CV_BASE_PATH.exists():
        print("Lance d'abord : python main.py --setup")
        sys.exit(1)

    with open(CV_BASE_PATH, encoding="utf-8") as f:
        cv_base = json.load(f)

    from mots_cles import offre_from_description
    offre = offre_from_description(description, titre=titre, entreprise=entreprise)

    from rules import appliquer_regles
    cv_enrichi = appliquer_regles(cv_base, offre)
    rapport = cv_enrichi.get("rapport", {})

    print("\n" + "─" * 60)
    print(f"Fiche de poste : {offre.get('titre', '') or '(sans intitulé)'} – {offre.get('entreprise', '')}".strip(" –"))
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
    parser = argparse.ArgumentParser(
        description="CV personnalisés par fiche de poste : dépôt de la fiche → génération CV + lettre + fiche (pas de scraping)."
    )
    parser.add_argument("--setup", action="store_true", help="Lancer le questionnaire pour remplir cv_base.json")
    parser.add_argument("--description", type=str, metavar="TEXTE", help="Texte de la fiche de poste (annonce)")
    parser.add_argument("--description-file", type=str, metavar="FICHIER", help="Fichier contenant la fiche de poste")
    parser.add_argument("--titre", type=str, default="", help="Intitulé du poste (optionnel, pour le nom du PDF)")
    parser.add_argument("--entreprise", type=str, default="", help="Nom de l'entreprise (optionnel)")
    parser.add_argument("--output", "-o", type=str, default=".", metavar="DIR", help="Dossier de sortie pour le PDF (défaut: .)")
    parser.add_argument("--pdf-only", action="store_true", help="Export PDF uniquement (pas d'adaptation, pour tester)")
    args = parser.parse_args()

    if args.setup:
        cmd_setup()
        return
    if args.pdf_only:
        cmd_export_pdf(args.output)
        return

    description = ""
    if args.description:
        description = args.description
    elif args.description_file:
        path = Path(args.description_file)
        if not path.exists():
            print(f"Fichier introuvable : {path}")
            sys.exit(1)
        description = path.read_text(encoding="utf-8")
    if description.strip():
        cmd_adapt(description.strip(), args.output, titre=args.titre or "", entreprise=args.entreprise or "")
        return

    parser.print_help()
    print("\nPour adapter à une fiche de poste : --description \"...\" ou --description-file chemin.txt")
    print("Ou lance l'interface web : python app.py")


if __name__ == "__main__":
    main()
