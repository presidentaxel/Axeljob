"""Accès données : Supabase (cv_base, applications) ou fallback fichiers."""
import json
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional

from backend.config import (
    BASE_DIR,
    USE_SUPABASE,
    SUPABASE_URL,
    SUPABASE_SERVICE_KEY,
    GEMINI_BUDGET_EUR,
    GEMINI_USD_PER_EUR,
)

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


def invite_user_by_email(email: str, redirect_to: str | None = None) -> dict:
    """Envoie une invitation par email (Auth Admin). Nécessite le client avec service_role."""
    sb = _get_supabase()
    if not sb:
        raise RuntimeError("Supabase non configuré.")
    try:
        # supabase-py: invite_user_by_email(email, options=None) avec options.redirect_to
        if redirect_to:
            return sb.auth.admin.invite_user_by_email(email, {"redirect_to": redirect_to})
        return sb.auth.admin.invite_user_by_email(email)
    except TypeError:
        # Fallback si la lib n'accepte qu'un seul argument
        return sb.auth.admin.invite_user_by_email(email)


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
        # Pour un utilisateur connecté (row_id != "default"), ne jamais retourner le CV d'exemple :
        # un PATCH/autre save pourrait le persister et écraser le profil (bug "Marie Dupont").
        if row_id != "default":
            return {}
        raise FileNotFoundError("Aucun CV. Connecte-toi puis complète ton profil (onglet Profil).")
    # Pas de Supabase : fallback fichier uniquement pour default
    if row_id == "default" and CV_BASE_PATH.exists():
        with open(CV_BASE_PATH, encoding="utf-8") as f:
            return json.load(f)
    if row_id != "default":
        return {}
    raise FileNotFoundError("cv_base.json introuvable. Lance d'abord : python main.py --setup ou complète ton profil.")


def _is_example_cv_data(data: dict) -> bool:
    """Détecte si les données correspondent au CV d'exemple (Marie Dupont). Évite de persister l'exemple comme profil utilisateur."""
    if not data:
        return False
    prenom = (data.get("prenom") or "").strip()
    nom = (data.get("nom") or "").strip()
    titre = (data.get("titre_professionnel") or "").strip()
    return (
        prenom == "Marie"
        and nom == "Dupont"
        and titre == "Chef de projet digital"
    )


def save_cv_base(data: dict, user_id: Optional[str] = None) -> None:
    """Sauvegarde le CV de base dans Supabase ou dans cv_base.json (si default et pas Supabase).
    Préserve template_id et template_options existants si absents du payload (évite de perdre
    les réglages template Supabase lors d'une sauvegarde qui ne les envoie pas)."""
    data = {k: v for k, v in data.items() if k != "__example__"}
    row_id = _cv_row_id(user_id)
    if row_id != "default" and _is_example_cv_data(data):
        raise ValueError("Refusing to save example CV as user profile. Please complete your own profile in the Profile tab.")
    # Ne jamais écraser template_id / template_options par défaut : conserver ceux déjà enregistrés si le payload ne les contient pas
    if "template_id" not in data or "template_options" not in data:
        try:
            existing = load_cv_base(user_id)
            if "template_id" not in data and existing.get("template_id") is not None:
                data["template_id"] = existing["template_id"]
            if "template_options" not in data and existing.get("template_options") is not None:
                data["template_options"] = existing["template_options"]
        except FileNotFoundError:
            pass
    sb = _get_supabase()
    if sb:
        try:
            sb.table("cv_base").upsert(
                {"id": row_id, "data": data, "updated_at": datetime.now(timezone.utc).isoformat()},
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


def _user_photo_path(user_id: str) -> str:
    """Chemin Storage pour la photo de l'utilisateur (un fichier par user)."""
    safe = "".join(c for c in (user_id or "").strip() if c.isalnum() or c in "_-") or "user"
    return f"{safe}/photo.jpg"


def _ensure_cv_photos_bucket(sb) -> None:
    """Crée le bucket cv_photos (public) s'il n'existe pas."""
    try:
        sb.storage.create_bucket(CV_PHOTOS_BUCKET, options={"public": False})
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
    path = _user_photo_path(user_safe_id)
    sb.storage.from_(CV_PHOTOS_BUCKET).upload(
        path=path,
        file=image_bytes,
        file_options={"content-type": "image/jpeg", "upsert": "true"},
    )
    return _signed_url(sb, CV_PHOTOS_BUCKET, path)


def _signed_url(sb, bucket: str, path: str) -> str:
    try:
        res = sb.storage.from_(bucket).create_signed_url(path, _SIGNED_URL_EXPIRY)
        if isinstance(res, dict):
            return res.get("signedURL") or res.get("signedUrl") or ""
        return ""
    except Exception:
        return ""


# 1 an en secondes — évite que la photo ne s’affiche plus après une nuit (JWT expiré)
_SIGNED_URL_EXPIRY = 604800  # 1 semaine


def get_cv_photo_public_url_for_user(user_id: Optional[str]) -> Optional[str]:
    if not user_id or not _get_supabase():
        return None
    sb = _get_supabase()
    path = _user_photo_path(user_id)
    url = _signed_url(sb, CV_PHOTOS_BUCKET, path)
    return url or None


# --- Documents candidature (PDF : lettre, CV, fiche) - Supabase Storage ---
APPLICATION_DOCS_BUCKET = "application_docs"
APPLICATION_DOC_TYPES = ("lettre", "cv", "fiche")


def _application_doc_path(user_id: str, application_id: str, doc_type: str) -> str:
    """Chemin Storage pour un document PDF d'une candidature."""
    safe_uid = "".join(c for c in (user_id or "").strip() if c.isalnum() or c in "_-") or "user"
    safe_aid = "".join(c for c in (application_id or "").strip() if c.isalnum() or c in "_-") or "app"
    if doc_type not in APPLICATION_DOC_TYPES:
        doc_type = "fiche"
    return f"{safe_uid}/{safe_aid}/{doc_type}.pdf"


def _ensure_application_docs_bucket(sb) -> None:
    """Crée le bucket application_docs (public) s'il n'existe pas."""
    try:
        sb.storage.create_bucket(APPLICATION_DOCS_BUCKET, options={"public": False})
    except Exception as e:
        err = str(e).lower()
        if "already exists" in err or "duplicate" in err or "409" in str(e):
            return
        raise


def upload_application_doc(
    user_id: str, application_id: str, doc_type: str, file_bytes: bytes
) -> str:
    """Envoie un PDF (lettre, cv ou fiche) dans Supabase Storage. Retourne l'URL publique."""
    if doc_type not in APPLICATION_DOC_TYPES:
        raise ValueError(f"doc_type doit être parmi {APPLICATION_DOC_TYPES}")
    sb = _get_supabase()
    if not sb:
        raise RuntimeError("Supabase non configuré.")
    _ensure_application_docs_bucket(sb)
    path = _application_doc_path(user_id, application_id, doc_type)
    sb.storage.from_(APPLICATION_DOCS_BUCKET).upload(
        path=path,
        file=file_bytes,
        file_options={"content-type": "application/pdf", "upsert": "true"},
    )
    return _signed_url(sb, APPLICATION_DOCS_BUCKET, path)


# --- Applications (adaptations) ---

def save_adaptation(adaptation_id: str, payload: dict, user_id: Optional[str] = None) -> None:
    """Sauvegarde une adaptation (Supabase table applications ou fichier adaptations/<id>.json). Filtrée par user_id."""
    payload.setdefault("statut", "candidature_envoyee")
    payload.setdefault("archived", False)
    uid = (user_id or "default").strip() or "default"
    payload["user_id"] = uid
    if "created_at" not in payload:
        payload["created_at"] = datetime.now(timezone.utc).isoformat()
    # Date d'envoi : fixée une seule fois quand la candidature est en "candidature_envoyee" (pour stats et affichage)
    if payload.get("statut") == "candidature_envoyee" and not payload.get("date_envoi"):
        payload["date_envoi"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    sb = _get_supabase()
    if sb:
        try:
            sb.table("applications").upsert(
                {
                    "id": adaptation_id,
                    "user_id": uid,
                    "payload": payload,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
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
    # Date affichée = date d'envoi (apply) si présente, sinon fallback updated_at / created_at (rétrocompat)
    date_str = (data.get("date_envoi") or "").strip()
    if date_str and len(date_str) >= 10:
        date_str = date_str[:10] + " 00:00" if len(date_str) <= 10 else date_str
    else:
        date_str = ""
        ts = None
        if updated_at:
            try:
                ts = datetime.fromisoformat(updated_at.replace("Z", "+00:00")).timestamp()
            except Exception:
                pass
        if ts:
            date_str = datetime.fromtimestamp(ts).strftime("%Y-%m-%d %H:%M")
        created_val = data.get("created_at") or ""
        if created_val and not date_str:
            try:
                ts_created = datetime.fromisoformat(created_val.replace("Z", "+00:00")).timestamp()
                date_str = datetime.fromtimestamp(ts_created).strftime("%Y-%m-%d %H:%M")
            except Exception:
                pass
    created = data.get("created_at") or ""
    return {
        "id": aid,
        "poste_offre": data.get("poste_offre", ""),
        "poste": data.get("poste", ""),
        "entreprise": data.get("entreprise", ""),
        "description_preview": data.get("description_preview", ""),
        "statut": data.get("statut", "candidature_envoyee"),
        "archived": data.get("archived", False),
        "date": date_str,
        "created_at": created,
        "refus_raison": data.get("refus_raison", ""),
        "refus_raison_type": data.get("refus_raison_type", ""),
        "interview_type": data.get("interview_type", ""),
        "interview_feedback": data.get("interview_feedback", ""),
        "interview_date": data.get("interview_date", ""),
        "source_offre": data.get("source_offre", ""),
        "pdf_lettre_url": data.get("pdf_lettre_url", ""),
        "pdf_cv_url": data.get("pdf_cv_url", ""),
        "pdf_fiche_url": data.get("pdf_fiche_url", ""),
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
        if not applications[-1]["date"]:
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


def count_applications(user_id: Optional[str] = None) -> int:
    """Nombre total de candidatures (adaptations) pour l'utilisateur (toutes, y compris archivées)."""
    uid = (user_id or "default").strip() or "default"
    sb = _get_supabase()
    if sb:
        try:
            r = (
                sb.table("applications")
                .select("id", count="exact")
                .eq("user_id", uid)
                .execute()
            )
            return r.count if r.count is not None else len(r.data or [])
        except Exception:
            pass
    if not ADAPTATIONS_DIR.is_dir():
        return 0
    count = 0
    for path in ADAPTATIONS_DIR.glob("*.json"):
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
            if data.get("user_id", "default") == uid:
                count += 1
        except (json.JSONDecodeError, OSError):
            continue
    return count


def get_user_plan(user_id: Optional[str] = None) -> str:
    """Retourne 'free' ou 'pro'. Par défaut 'free' si pas de ligne."""
    uid = (user_id or "default").strip() or "default"
    sb = _get_supabase()
    if sb:
        try:
            r = sb.table("user_plans").select("plan").eq("user_id", uid).limit(1).execute()
            if r.data and len(r.data) > 0 and r.data[0].get("plan") == "pro":
                return "pro"
        except Exception:
            pass
    return "free"


def get_paywall_disabled(user_id: Optional[str] = None) -> bool:
    """True si le paywall est désactivé pour cet utilisateur (option dans user_plans.paywall_disabled)."""
    uid = (user_id or "default").strip() or "default"
    sb = _get_supabase()
    if not sb:
        return False
    try:
        r = sb.table("user_plans").select("paywall_disabled").eq("user_id", uid).limit(1).execute()
        if r.data and len(r.data) > 0:
            return bool(r.data[0].get("paywall_disabled"))
    except Exception:
        pass
    return False


def set_user_plan(user_id: str, plan: str, stripe_customer_id: Optional[str] = None, stripe_subscription_id: Optional[str] = None) -> None:
    """Met à jour le plan utilisateur (free/pro). Créé la ligne si besoin."""
    uid = (user_id or "default").strip() or "default"
    sb = _get_supabase()
    if not sb:
        return
    try:
        row = {
            "user_id": uid,
            "plan": plan,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        if stripe_customer_id is not None:
            row["stripe_customer_id"] = stripe_customer_id
        if stripe_subscription_id is not None:
            row["stripe_subscription_id"] = stripe_subscription_id
        sb.table("user_plans").upsert(row, on_conflict="user_id").execute()
    except Exception:
        raise


def update_adaptation(adaptation_id: str, updates: dict, user_id: Optional[str] = None) -> Optional[dict]:
    """Met à jour statut/archived/poste/entreprise et champs quali d'une candidature. Retourne le payload mis à jour."""
    current = get_adaptation(adaptation_id, user_id)
    if not current:
        return None
    statut_prev = current.get("statut", "candidature_envoyee")
    if "statut" in updates:
        current["statut"] = updates["statut"]
        # Ne fixer date_envoi que lors du premier passage en "candidature_envoyee" (pas quand on y revient après un autre statut)
        if updates["statut"] == "candidature_envoyee" and statut_prev != "candidature_envoyee":
            current["date_envoi"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if "archived" in updates:
        current["archived"] = bool(updates["archived"])
    if "poste" in updates:
        current["poste"] = (updates["poste"] or "").strip()
    if "entreprise" in updates:
        current["entreprise"] = (updates["entreprise"] or "").strip()
    for key in ("refus_raison", "refus_raison_type", "interview_type", "interview_feedback", "interview_date", "source_offre"):
        if key in updates:
            current[key] = (updates[key] or "").strip() if isinstance(updates[key], str) else updates[key]
    save_adaptation(adaptation_id, current, user_id)
    return current


# --- Usage Gemini (tokens par requête + par compte, limite ~10 €) ---
# Tarifs Standard (USD / million tokens) : entrée 0.10, sortie 0.40
GEMINI_COST_INPUT_PER_M = 0.10
GEMINI_COST_OUTPUT_PER_M = 0.40


def _gemini_cost_usd(input_tokens: int, output_tokens: int) -> float:
    return (input_tokens * GEMINI_COST_INPUT_PER_M / 1_000_000) + (
        output_tokens * GEMINI_COST_OUTPUT_PER_M / 1_000_000
    )


def record_gemini_usage(
    user_id: Optional[str],
    operation: str,
    input_tokens: int,
    output_tokens: int,
) -> float:
    """Enregistre l'usage Gemini pour une requête (table log) et met à jour le total par compte.
    Retourne le coût USD de cette requête. Sans Supabase : no-op, retourne 0."""
    if not input_tokens and not output_tokens:
        return 0.0
    uid = (user_id or "default").strip() or "default"
    cost_usd = _gemini_cost_usd(input_tokens, output_tokens)
    sb = _get_supabase()
    if not sb:
        return cost_usd
    try:
        sb.table("gemini_usage_log").insert(
            {
                "user_id": uid,
                "operation": (operation or "unknown")[:64],
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "cost_usd": round(cost_usd, 6),
            }
        ).execute()
    except Exception:
        pass
    try:
        r = (
            sb.table("gemini_usage")
            .select("total_input_tokens, total_output_tokens")
            .eq("user_id", uid)
            .limit(1)
            .execute()
        )
        prev_input = prev_output = 0
        if r.data and len(r.data) > 0:
            prev_input = int(r.data[0].get("total_input_tokens") or 0)
            prev_output = int(r.data[0].get("total_output_tokens") or 0)
        sb.table("gemini_usage").upsert(
            {
                "user_id": uid,
                "total_input_tokens": prev_input + input_tokens,
                "total_output_tokens": prev_output + output_tokens,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
            on_conflict="user_id",
        ).execute()
    except Exception:
        pass
    return cost_usd


def get_gemini_usage(user_id: Optional[str]) -> tuple[int, int, float]:
    """Retourne (total_input_tokens, total_output_tokens, total_cost_usd) pour le compte."""
    uid = (user_id or "default").strip() or "default"
    sb = _get_supabase()
    if not sb:
        return 0, 0, 0.0
    try:
        r = (
            sb.table("gemini_usage")
            .select("total_input_tokens, total_output_tokens")
            .eq("user_id", uid)
            .limit(1)
            .execute()
        )
        if r.data and len(r.data) > 0:
            row = r.data[0]
            ti = int(row.get("total_input_tokens") or 0)
            to = int(row.get("total_output_tokens") or 0)
            return ti, to, _gemini_cost_usd(ti, to)
    except Exception:
        pass
    return 0, 0, 0.0


def check_gemini_budget(user_id: Optional[str]) -> tuple[bool, float, float]:
    """Vérifie si le compte est sous la limite (€). Retourne (allowed, used_usd, limit_usd)."""
    limit_usd = GEMINI_BUDGET_EUR * GEMINI_USD_PER_EUR
    _, _, used_usd = get_gemini_usage(user_id)
    return (used_usd < limit_usd, used_usd, limit_usd)


# --- Templates CV personnalisés (Supabase cv_templates) ---
CUSTOM_TEMPLATE_ID_PREFIX = "custom_"
PENDING_OWNER_ID = "__pending__"  # Templates importés par le bot : invisibles tant qu'un humain n'assigne pas owner / allowed_user_ids


def _norm_uid(u: str | None) -> str:
    """Normalise un user_id pour comparaison (casse, espaces)."""
    return (u or "").strip().lower()


def _normalize_allowed_ids(allowed: any) -> list[str]:
    """Retourne une liste d'IDs normalisés (lower, strip). Gère list, string JSON, ou valeur bizarre."""
    if allowed is None:
        return []
    if isinstance(allowed, list):
        return [_norm_uid(str(x)) for x in allowed]
    if isinstance(allowed, str):
        s = allowed.strip()
        if not s:
            return []
        if s.startswith("["):
            try:
                import json
                parsed = json.loads(s)
                return [_norm_uid(str(x)) for x in (parsed if isinstance(parsed, list) else [])]
            except Exception:
                return [_norm_uid(s)] if s else []
        return [_norm_uid(s)]
    return [_norm_uid(str(x)) for x in (allowed if isinstance(allowed, (list, tuple)) else [])]


def list_custom_templates_for_user(user_id: Optional[str]) -> list[dict]:
    """Liste les templates personnalisés accessibles par l'utilisateur (owner ou dans allowed_user_ids). Exclut les templates __pending__."""
    uid = _norm_uid(user_id)
    if not uid:
        return []
    sb = _get_supabase()
    if not sb:
        return []
    try:
        r = sb.table("cv_templates").select("id, name, description, options, owner_user_id, allowed_user_ids").execute()
        out = []
        for row in (r.data or []):
            owner = (row.get("owner_user_id") or "").strip()
            if owner == PENDING_OWNER_ID:
                continue
            if _norm_uid(owner) == uid:
                out.append(_custom_template_meta(row, is_owner=True))
                continue
            allowed_norm = _normalize_allowed_ids(row.get("allowed_user_ids"))
            if uid in allowed_norm:
                out.append(_custom_template_meta(row, is_owner=False))
        return out
    except Exception:
        return []


def _custom_template_meta(row: dict, is_owner: bool = False) -> dict:
    """Construit le meta d'un template custom pour list_templates / get_template (sans html/css)."""
    return {
        "id": row.get("id") or "",
        "name": row.get("name") or "Template perso",
        "description": row.get("description") or "",
        "options": row.get("options") or [],
        "tags": ["custom", "perso"],
        "premium": False,
        "_custom": True,
        "_owner": is_owner,
    }


def get_custom_template_by_id(template_id: str) -> dict | None:
    """Charge un template personnalisé par id (HTML + CSS). Utilisé par le rendu backend (pas de check user)."""
    if not (template_id or "").strip().startswith(CUSTOM_TEMPLATE_ID_PREFIX):
        return None
    sb = _get_supabase()
    if not sb:
        return None
    try:
        r = sb.table("cv_templates").select("*").eq("id", template_id.strip()).limit(1).execute()
        if not r.data or len(r.data) == 0:
            return None
        row = r.data[0]
        meta = _custom_template_meta(row)
        meta["_dir"] = None
        meta["_html_content"] = row.get("html_content") or ""
        meta["_css_content"] = row.get("css_content") or ""
        return meta
    except Exception:
        return None


def can_user_use_custom_template(template_id: str, user_id: Optional[str]) -> bool:
    """Vérifie si l'utilisateur peut utiliser ce template (owner ou dans allowed_user_ids). Comparaison insensible à la casse (UUID)."""
    uid = _norm_uid(user_id)
    if not uid or not (template_id or "").strip().startswith(CUSTOM_TEMPLATE_ID_PREFIX):
        return False
    sb = _get_supabase()
    if not sb:
        return False
    try:
        r = sb.table("cv_templates").select("owner_user_id, allowed_user_ids").eq("id", template_id.strip()).limit(1).execute()
        if not r.data or len(r.data) == 0:
            return False
        row = r.data[0]
        owner = (row.get("owner_user_id") or "").strip()
        if _norm_uid(owner) == uid:
            return True
        allowed_norm = _normalize_allowed_ids(row.get("allowed_user_ids"))
        return uid in allowed_norm
    except Exception:
        return False


def create_custom_template(
    owner_user_id: str,
    name: str,
    html_content: str,
    description: str = "",
    css_content: str | None = None,
    options: list | None = None,
    allowed_user_ids: list | None = None,
) -> dict:
    """Crée un template personnalisé. Retourne le meta (id, name, ...) du template créé."""
    import uuid
    tid = CUSTOM_TEMPLATE_ID_PREFIX + str(uuid.uuid4())
    sb = _get_supabase()
    if not sb:
        raise RuntimeError("Supabase non configuré.")
    payload = {
        "id": tid,
        "name": (name or "Template perso").strip() or "Template perso",
        "description": (description or "").strip(),
        "html_content": html_content or "",
        "css_content": (css_content or "").strip() or None,
        "options": options if options is not None else [],
        "owner_user_id": (owner_user_id or "").strip(),
        "allowed_user_ids": list(allowed_user_ids) if allowed_user_ids is not None else [],
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    sb.table("cv_templates").insert(payload).execute()
    row = {**payload, "allowed_user_ids": payload["allowed_user_ids"]}
    return _custom_template_meta(row, is_owner=True)


def create_pending_custom_template(
    name: str,
    html_content: str,
    description: str = "",
    css_content: str | None = None,
    options: list | None = None,
) -> dict:
    """Insère un template personnalisé en attente d'affectation (owner_user_id=__pending__, allowed_user_ids=[]).
    Aucun utilisateur ne le voit ; un humain devra mettre à jour owner_user_id et/ou allowed_user_ids dans Supabase."""
    import uuid
    tid = CUSTOM_TEMPLATE_ID_PREFIX + str(uuid.uuid4())
    sb = _get_supabase()
    if not sb:
        raise RuntimeError("Supabase non configuré.")
    payload = {
        "id": tid,
        "name": (name or "Template importé").strip() or "Template importé",
        "description": (description or "").strip(),
        "html_content": html_content or "",
        "css_content": (css_content or "").strip() or None,
        "options": options if options is not None else [],
        "owner_user_id": PENDING_OWNER_ID,
        "allowed_user_ids": [],
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    sb.table("cv_templates").insert(payload).execute()
    return {"id": tid, "name": payload["name"], "description": payload["description"]}


def update_custom_template_content(template_id: str, html_content: str, css_content: str | None = None) -> bool:
    """Met à jour uniquement html_content et css_content d'un template (par id, sans vérifier le owner).
    Utilisé par le script d'import pour remplacer le contenu par une nouvelle génération IA."""
    tid = (template_id or "").strip()
    if not tid.startswith(CUSTOM_TEMPLATE_ID_PREFIX):
        return False
    sb = _get_supabase()
    if not sb:
        raise RuntimeError("Supabase non configuré.")
    try:
        updates = {
            "html_content": html_content or "",
            "css_content": (css_content or "").strip() or None,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        sb.table("cv_templates").update(updates).eq("id", tid).execute()
        return True
    except Exception:
        return False


def update_custom_template(
    template_id: str,
    owner_user_id: str,
    name: str | None = None,
    description: str | None = None,
    html_content: str | None = None,
    css_content: str | None = None,
    options: list | None = None,
    allowed_user_ids: list | None = None,
) -> dict | None:
    """Met à jour un template personnalisé (réservé au owner). Retourne le meta ou None si pas trouvé / pas owner."""
    tid = (template_id or "").strip()
    if not tid.startswith(CUSTOM_TEMPLATE_ID_PREFIX):
        return None
    uid = (owner_user_id or "").strip()
    sb = _get_supabase()
    if not sb:
        raise RuntimeError("Supabase non configuré.")
    try:
        r = sb.table("cv_templates").select("*").eq("id", tid).eq("owner_user_id", uid).limit(1).execute()
        if not r.data or len(r.data) == 0:
            return None
        updates = {"updated_at": datetime.now(timezone.utc).isoformat()}
        if name is not None:
            updates["name"] = (name or "Template perso").strip() or "Template perso"
        if description is not None:
            updates["description"] = (description or "").strip()
        if html_content is not None:
            updates["html_content"] = html_content
        if css_content is not None:
            updates["css_content"] = (css_content or "").strip() or None
        if options is not None:
            updates["options"] = options
        if allowed_user_ids is not None:
            updates["allowed_user_ids"] = list(allowed_user_ids)
        sb.table("cv_templates").update(updates).eq("id", tid).eq("owner_user_id", uid).execute()
        r2 = sb.table("cv_templates").select("id, name, description, options, owner_user_id, allowed_user_ids").eq("id", tid).limit(1).execute()
        if r2.data and len(r2.data) > 0:
            return _custom_template_meta(r2.data[0], is_owner=True)
        return None
    except Exception:
        return None


def delete_custom_template(template_id: str, owner_user_id: str) -> bool:
    """Supprime un template personnalisé (réservé au owner). Retourne True si supprimé."""
    tid = (template_id or "").strip()
    if not tid.startswith(CUSTOM_TEMPLATE_ID_PREFIX):
        return False
    uid = (owner_user_id or "").strip()
    sb = _get_supabase()
    if not sb:
        raise RuntimeError("Supabase non configuré.")
    try:
        r = sb.table("cv_templates").delete().eq("id", tid).eq("owner_user_id", uid).execute()
        return bool(r.data)
    except Exception:
        return False
