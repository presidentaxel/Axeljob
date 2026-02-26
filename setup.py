#!/usr/bin/env python3
"""
Questionnaire interactif pour remplir cv_base.json.
"""

import json
from pathlib import Path


def _prompt(label: str, default: str = "") -> str:
    if default:
        s = input(f"  {label} [{default}] : ").strip()
        return s if s else default
    return input(f"  {label} : ").strip()


def _prompt_yn(question: str, default: bool = True) -> bool:
    d = "o" if default else "n"
    r = input(f"  {question} (o/n) [{d}] : ").strip().lower()
    if not r:
        return default
    return r in ("o", "oui", "y", "yes")


def _saisie_infos_personnelles() -> dict:
    print("\n--- Informations personnelles ---")
    return {
        "prenom": _prompt("Prénom"),
        "nom": _prompt("Nom"),
        "email": _prompt("Email"),
        "telephone": _prompt("Téléphone"),
        "linkedin": _prompt("LinkedIn (URL ou identifiant)"),
        "ville": _prompt("Ville / Région"),
    }


def _saisie_experiences() -> list:
    print("\n--- Expériences professionnelles ---")
    experiences = []
    i = 1
    while True:
        if not _prompt_yn("Ajouter une expérience ?", default=len(experiences) == 0):
            break
        print(f"\n  Expérience {i} :")
        exp = {
            "id": f"exp_{i}",
            "poste": _prompt("Poste / intitulé"),
            "entreprise": _prompt("Entreprise"),
            "secteur": _prompt("Secteur (optionnel)"),
            "date_debut": _prompt("Date de début (ex. 2022)"),
            "date_fin": _prompt("Date de fin (ex. Aujourd'hui)"),
            "lieu": _prompt("Lieu (optionnel)"),
            "bullet_points": [],
            "clients": _prompt("Clients (optionnel)"),
            "mots_cles": [],
        }
        j = 1
        while _prompt_yn("Ajouter un bullet point ?", default=j == 1):
            bp = _prompt(f"Bullet point {j}")
            if bp:
                exp["bullet_points"].append(bp)
                j += 1
        if not exp["bullet_points"]:
            exp["bullet_points"].append("")
        experiences.append(exp)
        i += 1
    return experiences


def _saisie_formations() -> list:
    print("\n--- Formation ---")
    formations = []
    i = 1
    while True:
        if not _prompt_yn("Ajouter une formation ?", default=len(formations) == 0):
            break
        print(f"\n  Formation {i} :")
        form = {
            "id": f"form_{i}",
            "diplome": _prompt("Diplôme"),
            "etablissement": _prompt("Établissement"),
            "date": _prompt("Date (ex. 2023 - 2027)"),
            "mention": _prompt("Mention / détails (optionnel)"),
        }
        formations.append(form)
        i += 1
    return formations


def _saisie_competences() -> dict:
    print("\n--- Compétences ---")
    tech = _prompt("Compétences techniques (séparées par des virgules)")
    techniques = [s.strip() for s in tech.split(",") if s.strip()] if tech else []
    info = _prompt("Compétences informatiques / logiciels (séparées par des virgules)")
    informatiques = [s.strip() for s in info.split(",") if s.strip()] if info else []
    print("  Langues (une par une, laisser vide pour terminer) :")
    langues = []
    while True:
        langue = _prompt("  Langue (ex. Anglais)")
        if not langue:
            break
        niveau = _prompt("  Niveau (ex. Courant)")
        langues.append({"langue": langue, "niveau": niveau or ""})
    return {
        "techniques": techniques or [""],
        "informatiques": informatiques or [""],
        "langues": langues if langues else [{"langue": "", "niveau": ""}],
    }


def _saisie_loisirs() -> list:
    print("\n--- Loisirs ---")
    l = _prompt("Loisirs / centres d'intérêt (séparés par des virgules, ou vide pour passer)")
    if not l:
        return []
    return [s.strip() for s in l.split(",") if s.strip()]


def _afficher_resume(data: dict) -> None:
    print("\n" + "=" * 50)
    print("RÉSUMÉ DE VOTRE CV")
    print("=" * 50)
    print(f"  {data['prenom']} {data['nom']} — {data['titre_professionnel']}")
    print(f"  {data['email']} | {data['telephone']} | {data['ville']}")
    print(f"  Expériences : {len(data['experiences'])}")
    print(f"  Formations : {len(data['formations'])}")
    print(f"  Compétences techniques : {len(data['competences']['techniques'])}")
    print(f"  Loisirs : {len(data['loisirs'])}")
    print("=" * 50)


def lancer_setup() -> None:
    """Guide l'utilisateur pour remplir le CV et sauvegarde dans cv_base.json."""
    base_dir = Path(__file__).resolve().parent
    output_path = base_dir / "cv_base.json"

    print("\n  Configuration du CV (cv_base.json)")
    print("  Laissez vide et appuyez sur Entrée pour ignorer un champ.\n")

    data = _saisie_infos_personnelles()
    data["titre_professionnel"] = _prompt("Titre professionnel")
    data["resume"] = _prompt("Résumé / accroche (plusieurs phrases possibles)")
    data["photo_url"] = _prompt("URL de la photo (optionnel)")

    data["experiences"] = _saisie_experiences()
    data["formations"] = _saisie_formations()
    data["competences"] = _saisie_competences()
    data["loisirs"] = _saisie_loisirs()

    _afficher_resume(data)

    if not _prompt_yn("\nEnregistrer ces informations dans cv_base.json ?", default=True):
        print("  Annulé.")
        return

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"\n  ✓ CV enregistré : {output_path}")


if __name__ == "__main__":
    lancer_setup()
