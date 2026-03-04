"""Accès données : Supabase (cv_base, applications) ou fallback fichiers."""
import json
from pathlib import Path
from datetime import datetime
from typing import Optional

from backend.config import BASE_DIR, USE_SUPABASE, SUPABASE_URL, SUPABASE_SERVICE_KEY

CV_BASE_PATH = BASE_DIR / "cv_base.json"
ADAPTATIONS_DIR = BASE_DIR / "adaptations"

# --- Supabase client (lazy) ---
_supabase = None

def _get_supabase():
    global _supabase
    if _supabase is not None:
        return _supabase
    if not USE_SUPABASE:
        return None
    try:
        from supabase import create_client
        _supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        return _supabase
    except Exception:
        return None


# --- CV de base ---


def get_example_cv() -> dict:
    """CV d'exemple (données fictives) pour les nouveaux utilisateurs qui n'ont pas encore enregistré de CV.
    photo_url reste vide pour ne jamais afficher une photo réelle ; __example__ évite le fallback assets/ côté rendu."""
    return {
        "__example__": True,
        "prenom": "Marie",
        "nom": "Dupont",
        "email": "marie.dupont@exemple.fr",
        "telephone": "+33 6 12 34 56 78",
        "linkedin": "https://linkedin.com/in/marie-dupont-exemple",
        "ville": "Paris",
        "titre_professionnel": "Chef de projet digital",
        "resume": "Chef de projet avec 5 ans d'expérience dans la gestion de projets web et la coordination d'équipes. Passionnée par l'innovation et l'expérience utilisateur. Méthodologie Agile, gestion des parties prenantes et livraison dans les délais.",
        "photo_url": "",
        "experiences": [
            {
                "id": "exp_1",
                "poste": "Chef de projet digital",
                "entreprise": "Agence Web & Co",
                "secteur": "Conseil / Digital",
                "date_debut": "2020",
                "date_fin": "Aujourd'hui",
                "lieu": "Paris",
                "contexte": "Agence de 30 personnes, clients grands comptes.",
                "bullet_points": [
                    "Pilotage de 15+ projets web (sites, apps, refontes).",
                    "Animation d'équipes techniques et créatives (développeurs, designers).",
                    "Suivi budgétaire et reporting client.",
                ],
                "mots_cles": [],
                "clients": "Banque, retail, santé",
            },
            {
                "id": "exp_2",
                "poste": "Chargée de projet",
                "entreprise": "Startup XYZ",
                "secteur": "Tech",
                "date_debut": "2018",
                "date_fin": "2020",
                "lieu": "Lyon",
                "contexte": "Startup B2B SaaS.",
                "bullet_points": [
                    "Lancement de nouvelles fonctionnalités produit.",
                    "Rédaction de spécifications et tests utilisateurs.",
                ],
                "mots_cles": [],
                "clients": "",
            },
            {
                "id": "exp_3",
                "poste": "Assistante chef de projet",
                "entreprise": "Groupe Conseil ABC",
                "secteur": "Conseil",
                "date_debut": "2016",
                "date_fin": "2018",
                "lieu": "Lyon",
                "contexte": "Cabinet conseil en transformation digitale.",
                "bullet_points": [
                    "Support à la gestion de projets et à la planification.",
                    "Préparation des livrables et suivi des plannings.",
                ],
                "mots_cles": [],
                "clients": "",
            },
        ],
        "formations": [
            {
                "id": "form_1",
                "diplome": "Master Management de projet",
                "etablissement": "Université Paris-Dauphine",
                "date": "2018",
                "mention": "Bien",
            },
            {
                "id": "form_2",
                "diplome": "Licence Information-Communication",
                "etablissement": "Université Lyon 2",
                "date": "2016",
                "mention": "Assez bien",
            },
            {
                "id": "form_3",
                "diplome": "Certification PMP",
                "etablissement": "PMI",
                "date": "2021",
                "mention": "",
            },
        ],
        "competences": {
            "techniques": ["Gestion de projet", "Agile/Scrum", "Jira", "Figma", "Conduite de réunions", "Rédaction de cahiers des charges"],
            "logiciels": ["Jira", "Notion", "Figma", "Google Analytics", "Trello", "Miro"],
            "langues": [{"langue": "Français", "niveau": "Langue maternelle"}, {"langue": "Anglais", "niveau": "Courant (C1)"}, {"langue": "Espagnol", "niveau": "Intermédiaire (B2)"}],
            "autres": ["Animation d'équipes", "Conduite du changement", "Négociation", "Gestion des priorités"],
        },
        "projets": [
            {
                "id": "proj_1",
                "nom": "Refonte site e-commerce",
                "description": "Refonte UX/UI et migration technique pour un acteur retail. Pilotage de A à Z, équipe de 8 personnes.",
                "mots_cles": [],
            },
            {
                "id": "proj_2",
                "nom": "Application mobile interne",
                "description": "Conception et déploiement d'une app mobile pour les équipes terrain (React Native).",
                "mots_cles": [],
            },
            {
                "id": "proj_3",
                "nom": "Migration CRM",
                "description": "Accompagnement du changement et formation des utilisateurs sur le nouveau CRM.",
                "mots_cles": [],
            },
        ],
    }


def _cv_row_id(user_id: Optional[str]) -> str:
    """Id de la ligne cv_base : user_id si connecté, sinon 'default'."""
    return (user_id or "default").strip() or "default"


def load_cv_base(user_id: Optional[str] = None) -> dict:
    """Charge le CV depuis Supabase (id=user_id). Avec Supabase configuré : jamais de lecture de cv_base.json, uniquement la table Supabase."""
    row_id = _cv_row_id(user_id)
    sb = _get_supabase()
    if sb:
        try:
            r = sb.table("cv_base").select("data").eq("id", row_id).limit(1).execute()
            if r.data and len(r.data) > 0 and r.data[0].get("data"):
                return r.data[0]["data"]
        except Exception:
            pass
        # Supabase configuré : on ne lit jamais cv_base.json (données exclusivement Supabase)
        if row_id != "default":
            return get_example_cv()
        raise FileNotFoundError("Aucun CV. Connecte-toi puis complète ton profil (onglet Profil).")
    # Pas de Supabase : fallback fichier uniquement pour default
    if row_id == "default" and CV_BASE_PATH.exists():
        with open(CV_BASE_PATH, encoding="utf-8") as f:
            return json.load(f)
    if row_id != "default":
        return get_example_cv()
    raise FileNotFoundError("cv_base.json introuvable. Lance d'abord : python main.py --setup ou complète ton profil.")


def save_cv_base(data: dict, user_id: Optional[str] = None) -> None:
    """Sauvegarde le CV de base dans Supabase ou dans cv_base.json (si default et pas Supabase)."""
    data = {k: v for k, v in data.items() if k != "__example__"}
    row_id = _cv_row_id(user_id)
    sb = _get_supabase()
    if sb:
        try:
            sb.table("cv_base").upsert(
                {"id": row_id, "data": data, "updated_at": datetime.utcnow().isoformat()},
                on_conflict="id",
            ).execute()
            return
        except Exception:
            raise
    if row_id == "default":
        with open(CV_BASE_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    else:
        raise RuntimeError("Supabase requis pour enregistrer le CV d'un utilisateur connecté.")


# --- Photo CV : Supabase Storage (bucket cv_photos, public) ---
CV_PHOTOS_BUCKET = "cv_photos"
CV_PHOTOS_PATH = "photo.jpg"  # une seule image partagée, pas par utilisateur


def _ensure_cv_photos_bucket(sb) -> None:
    """Crée le bucket cv_photos (public) s'il n'existe pas."""
    try:
        sb.storage.create_bucket(CV_PHOTOS_BUCKET, options={"public": True})
    except Exception as e:
        err = str(e).lower()
        if "already exists" in err or "duplicate" in err or "409" in str(e):
            return
        raise


def upload_photo_to_storage(user_safe_id: str, image_bytes: bytes) -> str:
    """Envoie la photo dans Supabase Storage (bucket cv_photos). Une seule image partagée (pas par user). Retourne l’URL publique."""
    sb = _get_supabase()
    if not sb:
        raise RuntimeError("Supabase non configuré.")
    _ensure_cv_photos_bucket(sb)
    path = CV_PHOTOS_PATH
    # Ne pas mettre de booléen dans file_options (ex. upsert) : ils sont parfois envoyés en headers et doivent être str/bytes
    sb.storage.from_(CV_PHOTOS_BUCKET).upload(
        path=path,
        file=image_bytes,
        file_options={"content-type": "image/jpeg"},
    )
    return sb.storage.from_(CV_PHOTOS_BUCKET).get_public_url(path)


# --- Applications (adaptations) ---

def save_adaptation(adaptation_id: str, payload: dict, user_id: Optional[str] = None) -> None:
    """Sauvegarde une adaptation (Supabase table applications ou fichier adaptations/<id>.json). Filtrée par user_id."""
    payload.setdefault("statut", "candidature_envoyee")
    payload.setdefault("archived", False)
    uid = (user_id or "default").strip() or "default"
    payload["user_id"] = uid

    sb = _get_supabase()
    if sb:
        try:
            sb.table("applications").upsert(
                {
                    "id": adaptation_id,
                    "user_id": uid,
                    "payload": payload,
                    "updated_at": datetime.utcnow().isoformat(),
                },
                on_conflict="id",
            ).execute()
            return
        except Exception:
            raise

    ADAPTATIONS_DIR.mkdir(parents=True, exist_ok=True)
    path = ADAPTATIONS_DIR / f"{adaptation_id}.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


def list_applications(include_archived: bool = False, user_id: Optional[str] = None) -> list:
    """Liste les candidatures de l'utilisateur (Supabase ou fichiers). Sans user_id en mode Supabase, retourne []."""
    uid = (user_id or "default").strip() or "default"
    sb = _get_supabase()
    if sb:
        try:
            r = (
                sb.table("applications")
                .select("id, payload, updated_at, user_id")
                .eq("user_id", uid)
                .order("updated_at", desc=True)
                .execute()
            )
            out = []
            for row in r.data or []:
                p = row.get("payload") or {}
                if p.get("archived") and not include_archived:
                    continue
                out.append(_application_row(row["id"], p, row.get("updated_at")))
            return out
        except Exception:
            return _list_applications_files(include_archived, uid)

    return _list_applications_files(include_archived, uid)


def _application_row(aid: str, data: dict, updated_at: Optional[str] = None) -> dict:
    ts = None
    if updated_at:
        try:
            ts = datetime.fromisoformat(updated_at.replace("Z", "+00:00")).timestamp()
        except Exception:
            pass
    date_str = datetime.fromtimestamp(ts).strftime("%Y-%m-%d %H:%M") if ts else ""
    return {
        "id": aid,
        "poste_offre": data.get("poste_offre", ""),
        "poste": data.get("poste", ""),
        "entreprise": data.get("entreprise", ""),
        "description_preview": data.get("description_preview", ""),
        "statut": data.get("statut", "candidature_envoyee"),
        "archived": data.get("archived", False),
        "date": date_str,
    }


def _list_applications_files(include_archived: bool, user_id: str = "default") -> list:
    applications = []
    if not ADAPTATIONS_DIR.is_dir():
        return applications
    for path in sorted(ADAPTATIONS_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
        except (json.JSONDecodeError, OSError):
            continue
        if data.get("user_id", "default") != user_id:
            continue
        archived = data.get("archived", False)
        if archived and not include_archived:
            continue
        applications.append(_application_row(path.stem, data, None))
        applications[-1]["date"] = datetime.fromtimestamp(path.stat().st_mtime).strftime("%Y-%m-%d %H:%M")
    return applications


def get_adaptation(adaptation_id: str, user_id: Optional[str] = None) -> Optional[dict]:
    """Récupère une adaptation par id si elle appartient à l'utilisateur (Supabase ou fichier)."""
    uid = (user_id or "default").strip() or "default"
    sb = _get_supabase()
    if sb:
        try:
            r = (
                sb.table("applications")
                .select("payload, user_id")
                .eq("id", adaptation_id)
                .limit(1)
                .execute()
            )
            if r.data and len(r.data) > 0:
                row = r.data[0]
                if row.get("user_id") != uid:
                    return None
                return row.get("payload")
        except Exception:
            pass
    path = ADAPTATIONS_DIR / f"{adaptation_id}.json"
    if path.is_file():
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        if data.get("user_id", "default") != uid:
            return None
        return data
    return None


def update_adaptation(adaptation_id: str, updates: dict, user_id: Optional[str] = None) -> Optional[dict]:
    """Met à jour statut/archived/poste/entreprise d'une candidature. Retourne le payload mis à jour."""
    current = get_adaptation(adaptation_id, user_id)
    if not current:
        return None
    if "statut" in updates:
        current["statut"] = updates["statut"]
    if "archived" in updates:
        current["archived"] = bool(updates["archived"])
    if "poste" in updates:
        current["poste"] = (updates["poste"] or "").strip()
    if "entreprise" in updates:
        current["entreprise"] = (updates["entreprise"] or "").strip()
    save_adaptation(adaptation_id, current, user_id)
    return current
