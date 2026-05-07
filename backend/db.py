"""Accès données : Supabase (cv_base, applications) ou fallback fichiers."""

import json
import logging
import threading
import time
from collections import OrderedDict
from datetime import datetime, timezone

from backend.config import (
    BASE_DIR,
    GEMINI_BUDGET_EUR,
    GEMINI_USD_PER_EUR,
    SUPABASE_SERVICE_KEY,
    SUPABASE_URL,
    USE_SUPABASE,
    USE_SUPABASE_PG,
    USER_PLAN_CACHE_TTL_SEC,
)
from backend.supabase_metrics import inc_pg_fallback

logger = logging.getLogger(__name__)

# Aligné sur main.FREE_ADAPTATIONS_LIMIT : au-delà, ancrage implicite possible.
_FREE_ADAPTATIONS_BASE_LIMIT = 3

_user_plan_lock = threading.Lock()
# uid -> (plan, paywall_disabled, free_adaptation_bonus, free_adaptation_count_anchor, expire_monotonic)
# OrderedDict pour éviction LRU O(1) bornée à _USER_PLAN_CACHE_MAX entrées : sans cap, le dict
# grossit sans fin (un user vu une fois reste en RAM jusqu'au redémarrage).
_USER_PLAN_CACHE_MAX = 5000
_user_plan_cache: "OrderedDict[str, tuple[str, bool, int, int, float]]" = OrderedDict()


def _warn_pg_fallback(operation: str, exc: BaseException) -> None:
    """PG direct indisponible : repli sur le client Supabase (PostgREST)."""
    inc_pg_fallback(operation)
    logger.info("Supabase PG → repli REST pour %s : %s", operation, exc)


def _invalidate_user_plan_cache(uid: str) -> None:
    with _user_plan_lock:
        _user_plan_cache.pop(uid, None)


def _user_plan_cache_purge_expired_locked(now: float) -> None:
    """Supprime toutes les entrées expirées (appelé sous _user_plan_lock).

    Léger : appelé seulement sur miss/insertion, pas à chaque hit. Limite la dérive RAM
    quand des milliers d'utilisateurs distincts touchent l'API puis disparaissent.
    """
    if not _user_plan_cache:
        return
    expired = [k for k, v in _user_plan_cache.items() if v[4] <= now]
    for k in expired:
        _user_plan_cache.pop(k, None)


def _user_plan_cache_set_locked(uid: str, value: tuple[str, bool, int, int, float]) -> None:
    """Insère une entrée et applique la cap LRU (sous _user_plan_lock)."""
    if uid in _user_plan_cache:
        _user_plan_cache.move_to_end(uid)
    _user_plan_cache[uid] = value
    # Eviction LRU : pop oldest si dépassement
    while len(_user_plan_cache) > _USER_PLAN_CACHE_MAX:
        _user_plan_cache.popitem(last=False)


def _fetch_user_plan_state(uid: str) -> tuple[str, bool, int, int]:
    """Store : (plan, paywall_disabled, free_adaptation_bonus, free_adaptation_count_anchor)."""
    sb = _get_supabase()
    if not sb:
        return "free", False, 0, 0
    if USE_SUPABASE_PG:
        try:
            from backend import supabase_pg as spg

            row = spg.get_user_plan_row(uid)
            if row:
                plan = "pro" if row[0] == "pro" else "free"
                return plan, bool(row[1]), int(row[2]), int(row[3])
            return "free", False, 0, 0
        except Exception as e:
            _warn_pg_fallback("get_user_plan_row", e)
    try:
        r = (
            sb.table("user_plans")
            .select("plan, paywall_disabled, free_adaptation_bonus, free_adaptation_count_anchor")
            .eq("user_id", uid)
            .limit(1)
            .execute()
        )
        if r.data and len(r.data) > 0:
            row = r.data[0]
            plan = "pro" if row.get("plan") == "pro" else "free"
            raw_bonus = row.get("free_adaptation_bonus")
            try:
                bonus = max(0, int(raw_bonus or 0))
            except (TypeError, ValueError):
                bonus = 0
            raw_anchor = row.get("free_adaptation_count_anchor")
            try:
                anchor = max(0, int(raw_anchor or 0))
            except (TypeError, ValueError):
                anchor = 0
            return plan, bool(row.get("paywall_disabled")), bonus, anchor
    except Exception:
        pass
    return "free", False, 0, 0


def _get_cached_user_plan_state(uid: str) -> tuple[str, bool, int, int]:
    ttl = USER_PLAN_CACHE_TTL_SEC
    if ttl <= 0:
        return _fetch_user_plan_state(uid)
    now = time.monotonic()
    with _user_plan_lock:
        hit = _user_plan_cache.get(uid)
        if hit is not None and hit[4] > now:
            _user_plan_cache.move_to_end(uid)
            return hit[0], hit[1], hit[2], hit[3]
    plan, pw, bonus, anchor = _fetch_user_plan_state(uid)
    with _user_plan_lock:
        _user_plan_cache_purge_expired_locked(now)
        _user_plan_cache_set_locked(uid, (plan, pw, bonus, anchor, now + ttl))
    return plan, pw, bonus, anchor


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
    photo_url reste vide pour ne jamais afficher une photo réelle ; __example__ évite le fallback assets/ côté rendu.
    """
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
            "techniques": [
                "Gestion de projet",
                "Agile/Scrum",
                "Jira",
                "Figma",
                "Conduite de réunions",
                "Rédaction de cahiers des charges",
            ],
            "logiciels": ["Jira", "Notion", "Figma", "Google Analytics", "Trello", "Miro"],
            "langues": [
                {"langue": "Français", "niveau": "Langue maternelle"},
                {"langue": "Anglais", "niveau": "Courant (C1)"},
                {"langue": "Espagnol", "niveau": "Intermédiaire (B2)"},
            ],
            "autres": [
                "Animation d'équipes",
                "Conduite du changement",
                "Négociation",
                "Gestion des priorités",
            ],
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


def _cv_row_id(user_id: str | None) -> str:
    """Id de la ligne cv_base : user_id si connecté, sinon 'default'."""
    return (user_id or "default").strip() or "default"


def load_cv_base(user_id: str | None = None) -> dict:
    """Charge le CV depuis Supabase (id=user_id). Avec Supabase configuré : jamais de lecture de cv_base.json, uniquement la table Supabase."""
    row_id = _cv_row_id(user_id)
    sb = _get_supabase()
    if sb:
        if USE_SUPABASE_PG:
            try:
                from backend import supabase_pg as spg

                data = spg.load_cv_base_data(row_id)
                if data is not None:
                    return data
            except Exception as e:
                _warn_pg_fallback("load_cv_base", e)
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
    raise FileNotFoundError(
        "cv_base.json introuvable. Complète ton profil via l'application ou crée le fichier localement."
    )


def _is_example_cv_data(data: dict) -> bool:
    """Détecte si les données correspondent au CV d'exemple (Marie Dupont). Évite de persister l'exemple comme profil utilisateur."""
    if not data:
        return False
    prenom = (data.get("prenom") or "").strip()
    nom = (data.get("nom") or "").strip()
    titre = (data.get("titre_professionnel") or "").strip()
    return prenom == "Marie" and nom == "Dupont" and titre == "Chef de projet digital"


def save_cv_base(data: dict, user_id: str | None = None) -> None:
    """Sauvegarde le CV de base dans Supabase ou dans cv_base.json (si default et pas Supabase).
    Préserve template_id et template_options existants si absents du payload (évite de perdre
    les réglages template Supabase lors d'une sauvegarde qui ne les envoie pas)."""
    data = {k: v for k, v in data.items() if k != "__example__"}
    row_id = _cv_row_id(user_id)
    if row_id != "default" and _is_example_cv_data(data):
        raise ValueError(
            "Refusing to save example CV as user profile. Please complete your own profile in the Profile tab."
        )
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
        ts = datetime.now(timezone.utc).isoformat()
        if USE_SUPABASE_PG:
            try:
                from backend import supabase_pg as spg

                spg.upsert_cv_base(row_id, data, ts)
                return
            except Exception as e:
                _warn_pg_fallback("save_cv_base", e)
        try:
            sb.table("cv_base").upsert(
                {"id": row_id, "data": data, "updated_at": ts},
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


# --- Photo CV : Supabase Storage (bucket cv_photos privé) ---
CV_PHOTOS_BUCKET = "cv_photos"


def _user_photo_path(user_id: str) -> str:
    """Chemin Storage pour la photo de l'utilisateur (un fichier par user)."""
    safe = "".join(c for c in (user_id or "").strip() if c.isalnum() or c in "_-") or "user"
    return f"{safe}/photo.jpg"


def _ensure_cv_photos_bucket(sb) -> None:
    """Crée le bucket cv_photos (privé) s'il n'existe pas."""
    try:
        sb.storage.create_bucket(CV_PHOTOS_BUCKET, options={"public": False})
    except Exception as e:
        err = str(e).lower()
        if "already exists" in err or "duplicate" in err or "409" in str(e):
            return
        raise


def upload_photo_to_storage(user_safe_id: str, image_bytes: bytes) -> str:
    """Envoie la photo dans Supabase Storage (bucket cv_photos). Retourne une URL signée."""
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
    url = _signed_url(sb, CV_PHOTOS_BUCKET, path)
    # Invalide le cache : l'URL signée précédente pointe vers une autre version du fichier.
    _CV_PHOTO_URL_CACHE.invalidate(user_safe_id)
    if url:
        _CV_PHOTO_URL_CACHE.set(user_safe_id, url)
    return url


def _signed_url(sb, bucket: str, path: str) -> str:
    try:
        res = sb.storage.from_(bucket).create_signed_url(path, _SIGNED_URL_EXPIRY)
        if isinstance(res, dict):
            return res.get("signedURL") or res.get("signedUrl") or ""
        return ""
    except Exception:
        return ""


# 1 semaine en secondes - évite que la photo ne s’affiche plus après une nuit (JWT expiré)
_SIGNED_URL_EXPIRY = 604800

# Cache mémoire des URLs signées : un GET /api/cv ou /api/render-html n'a pas besoin
# d'un round-trip Supabase Storage à chaque appel. La signed URL reste valide 1 semaine,
# on la garde 5 min côté process — invalidé manuellement à l'upload d'une nouvelle photo.
from backend.perf_cache import TTLCache as _TTLCache

_CV_PHOTO_URL_CACHE = _TTLCache(max_size=2000, ttl_sec=300.0)


def get_cv_photo_public_url_for_user(user_id: str | None) -> str | None:
    if not user_id or not _get_supabase():
        return None
    cached = _CV_PHOTO_URL_CACHE.get(user_id)
    if cached is not None:
        return cached or None
    sb = _get_supabase()
    path = _user_photo_path(user_id)
    url = _signed_url(sb, CV_PHOTOS_BUCKET, path)
    # On stocke même la chaîne vide (cache négatif court : évite de marteler Storage si
    # l'utilisateur n'a pas de photo). _CV_PHOTO_URL_CACHE.invalidate() à l'upload.
    _CV_PHOTO_URL_CACHE.set(user_id, url or "")
    return url or None


def invalidate_cv_photo_url_cache(user_id: str | None) -> None:
    """À appeler après upload/changement de photo pour forcer une nouvelle signed URL."""
    if user_id:
        _CV_PHOTO_URL_CACHE.invalidate(user_id)


# --- Documents candidature (PDF : lettre, CV, fiche) - Supabase Storage ---
APPLICATION_DOCS_BUCKET = "application_docs"
APPLICATION_DOC_TYPES = ("lettre", "cv", "fiche")


def _application_doc_path(user_id: str, application_id: str, doc_type: str) -> str:
    """Chemin Storage pour un document PDF d'une candidature."""
    safe_uid = "".join(c for c in (user_id or "").strip() if c.isalnum() or c in "_-") or "user"
    safe_aid = (
        "".join(c for c in (application_id or "").strip() if c.isalnum() or c in "_-") or "app"
    )
    if doc_type not in APPLICATION_DOC_TYPES:
        doc_type = "fiche"
    return f"{safe_uid}/{safe_aid}/{doc_type}.pdf"


def _ensure_application_docs_bucket(sb) -> None:
    """Crée le bucket application_docs (privé) s'il n'existe pas."""
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
    """Envoie un PDF (lettre, cv ou fiche) dans Supabase Storage. Retourne une URL signée."""
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


def get_application_doc_signed_url(user_id: str, application_id: str, doc_type: str) -> str:
    """URL signée fraîche pour un PDF déjà stocké (les URLs en base expirent)."""
    if doc_type not in APPLICATION_DOC_TYPES:
        return ""
    sb = _get_supabase()
    if not sb:
        return ""
    try:
        path = _application_doc_path(user_id, application_id, doc_type)
        return _signed_url(sb, APPLICATION_DOCS_BUCKET, path) or ""
    except Exception:
        return ""


def download_application_doc_bytes(
    user_id: str, application_id: str, doc_type: str
) -> bytes | None:
    """Télécharge le PDF depuis Storage, ou None si absent / erreur."""
    if doc_type not in APPLICATION_DOC_TYPES:
        return None
    sb = _get_supabase()
    if not sb:
        return None
    try:
        path = _application_doc_path(user_id, application_id, doc_type)
        return sb.storage.from_(APPLICATION_DOCS_BUCKET).download(path)
    except Exception:
        return None


def _legacy_signed_app_doc_url_needs_resign(url: str) -> bool:
    """
    Anciennes candidatures : URL signée Storage enregistrée sans pdf_*_stored — JWT « exp » expiré.
    Les URLs /object/public/ ne passent pas ici (pas de claim exp côté token).
    """
    s = (url or "").strip()
    if not s or APPLICATION_DOCS_BUCKET not in s:
        return False
    if "/object/sign" not in s:
        return False
    return True


def hydrate_application_pdf_urls(payload: dict, user_id: str, application_id: str) -> dict:
    """Met à jour pdf_*_url pour les documents stockés (URLs signées renouvelées).
    Inclut les anciennes entrées : URL signée `application_docs` en base sans `pdf_*_stored`."""
    if not payload:
        return payload
    out = dict(payload)
    uid = (user_id or "default").strip() or "default"
    for doc_type in APPLICATION_DOC_TYPES:
        key_stored = f"pdf_{doc_type}_stored"
        key_url = f"pdf_{doc_type}_url"
        should_refresh = bool(out.get(key_stored))
        if not should_refresh and _legacy_signed_app_doc_url_needs_resign(
            (out.get(key_url) or "").strip()
        ):
            should_refresh = True
        if should_refresh:
            u = get_application_doc_signed_url(uid, application_id, doc_type)
            if u:
                out[key_url] = u
                if not out.get(key_stored) and _legacy_signed_app_doc_url_needs_resign(
                    (payload.get(key_url) or "").strip()
                ):
                    out[key_stored] = True
    return out


def hydrate_application_full_cv_photo(payload: dict, user_id: str | None) -> dict:
    """
    Même logique que GET /api/cv : photo profil en URL signée (JWT) dans full_cv,
    rafraîchie à l’ouverture pour éviter « exp claim » côté Storage.
    """
    if not payload or not user_id or not _get_supabase():
        return payload
    out = dict(payload)
    fc = out.get("full_cv")
    if not isinstance(fc, dict):
        return out
    photo_url = (fc.get("photo_url") or "").strip()
    is_supabase_signed = "supabase.co/storage" in photo_url and "/object/sign" in photo_url
    if not photo_url or is_supabase_signed:
        try:
            u = get_cv_photo_public_url_for_user(user_id)
            if u:
                out["full_cv"] = {**fc, "photo_url": u}
        except Exception:
            pass
    return out


# --- Applications (adaptations) ---


def save_adaptation(adaptation_id: str, payload: dict, user_id: str | None = None) -> None:
    """Sauvegarde une adaptation (Supabase table applications ou fichier adaptations/<id>.json). Filtrée par user_id."""
    payload.setdefault("statut", "candidature_envoyee")
    payload.setdefault("archived", False)
    uid = (user_id or "default").strip() or "default"
    payload["user_id"] = uid
    if "created_at" not in payload:
        payload["created_at"] = datetime.now(timezone.utc).isoformat()
    # Date d'envoi : fixée une seule fois quand la candidature est en "candidature_envoyee" (heure UTC réelle, pas minuit)
    if payload.get("statut") == "candidature_envoyee" and not payload.get("date_envoi"):
        payload["date_envoi"] = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")

    sb = _get_supabase()
    if sb:
        ts = datetime.now(timezone.utc).isoformat()
        if USE_SUPABASE_PG:
            try:
                from backend import supabase_pg as spg

                spg.upsert_application(adaptation_id, uid, payload, ts)
                return
            except Exception as e:
                _warn_pg_fallback("save_adaptation", e)
        try:
            sb.table("applications").upsert(
                {
                    "id": adaptation_id,
                    "user_id": uid,
                    "payload": payload,
                    "updated_at": ts,
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


def list_applications(include_archived: bool = False, user_id: str | None = None) -> list:
    """Liste les candidatures de l'utilisateur (Supabase ou fichiers). Sans user_id en mode Supabase, retourne []."""
    uid = (user_id or "default").strip() or "default"
    sb = _get_supabase()
    if sb:
        if USE_SUPABASE_PG:
            try:
                from backend import supabase_pg as spg

                rows = spg.list_application_rows(uid)
                out = []
                for row in rows:
                    p = row.get("payload") or {}
                    if p.get("archived") and not include_archived:
                        continue
                    out.append(_application_row(row["id"], p, row.get("updated_at")))
                return out
            except Exception as e:
                _warn_pg_fallback("list_applications", e)
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


def _format_application_list_date(data: dict, updated_at: str | None = None) -> str:
    """Date pour liste / export : date_envoi avec heure si dispo ; anciennes entrées jour-seul sans 00:00 fictif."""
    raw = (data.get("date_envoi") or "").strip()
    if raw:
        if "T" in raw:
            try:
                dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                return dt.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M")
            except Exception:
                return raw
        # Déjà "YYYY-MM-DD HH:MM" (nouveau stockage)
        if len(raw) >= 16 and raw[4] == "-" and raw[7] == "-" and raw[10] == " " and raw[13] == ":":
            return raw[:16]
        # Ancien stockage : jour seul → pas d'heure à minuit affichée
        if len(raw) >= 10 and raw[4] == "-" and raw[7] == "-":
            return raw[:10]
        return raw
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
    return date_str


def _application_row(aid: str, data: dict, updated_at: str | None = None) -> dict:
    date_str = _format_application_list_date(data, updated_at)
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
        "pdf_cv_stored": bool(data.get("pdf_cv_stored")),
        "pdf_fiche_stored": bool(data.get("pdf_fiche_stored")),
        "pdf_lettre_stored": bool(data.get("pdf_lettre_stored")),
    }


def _list_applications_files(include_archived: bool, user_id: str = "default") -> list:
    applications = []
    if not ADAPTATIONS_DIR.is_dir():
        return applications
    for path in sorted(
        ADAPTATIONS_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True
    ):
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
            applications[-1]["date"] = datetime.fromtimestamp(path.stat().st_mtime).strftime(
                "%Y-%m-%d %H:%M"
            )
    return applications


def get_adaptation(adaptation_id: str, user_id: str | None = None) -> dict | None:
    """Récupère une adaptation par id si elle appartient à l'utilisateur (Supabase ou fichier)."""
    uid = (user_id or "default").strip() or "default"
    sb = _get_supabase()
    if sb:
        if USE_SUPABASE_PG:
            try:
                from backend import supabase_pg as spg

                row = spg.get_application_row(adaptation_id)
                if row:
                    if row.get("user_id") != uid:
                        return None
                    return row.get("payload")
            except Exception as e:
                _warn_pg_fallback("get_adaptation", e)
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


def count_applications(user_id: str | None = None) -> int:
    """Nombre total de candidatures (adaptations) pour l'utilisateur (toutes, y compris archivées)."""
    uid = (user_id or "default").strip() or "default"
    sb = _get_supabase()
    if sb:
        if USE_SUPABASE_PG:
            try:
                from backend import supabase_pg as spg

                return spg.count_applications_for_user(uid)
            except Exception as e:
                _warn_pg_fallback("count_applications", e)
        try:
            r = sb.table("applications").select("id", count="exact").eq("user_id", uid).execute()
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


def _application_counts_toward_adaptation_quota(adaptation_id: str, payload: dict | None) -> bool:
    """True si la ligne représente une adaptation CV IA (quota free / Pro), hors manuel et archivé."""
    if not adaptation_id or not isinstance(payload, dict):
        return False
    if adaptation_id.startswith("manual_"):
        return False
    if payload.get("archived"):
        return False
    fc = payload.get("full_cv")
    if not isinstance(fc, dict) or len(fc) == 0:
        return False
    return True


def count_quota_adaptations(user_id: str | None = None) -> int:
    """Nombre d'adaptations CV sauvegardées (full_cv), non archivées, hors fiches manuelles « manual_* »."""
    uid = (user_id or "default").strip() or "default"
    sb = _get_supabase()
    if sb:
        if USE_SUPABASE_PG:
            try:
                from backend import supabase_pg as spg

                return spg.count_quota_adaptations_for_user(uid)
            except Exception as e:
                _warn_pg_fallback("count_quota_adaptations_for_user", e)
        try:
            r = sb.table("applications").select("id,payload").eq("user_id", uid).execute()
            rows = r.data or []
            return sum(
                1
                for row in rows
                if _application_counts_toward_adaptation_quota(
                    str(row.get("id") or ""),
                    row.get("payload") if isinstance(row.get("payload"), dict) else {},
                )
            )
        except Exception:
            pass
    if not ADAPTATIONS_DIR.is_dir():
        return 0
    n = 0
    for path in ADAPTATIONS_DIR.glob("*.json"):
        aid = path.stem
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
        except (json.JSONDecodeError, OSError):
            continue
        if data.get("user_id", "default") != uid:
            continue
        if _application_counts_toward_adaptation_quota(aid, data):
            n += 1
    return n


def _application_is_active_non_archived(payload: dict | None) -> bool:
    if not isinstance(payload, dict):
        return True
    return not bool(payload.get("archived"))


def count_active_applications(user_id: str | None = None) -> int:
    """Candidatures non archivées (Kanban actif), pour le plafond FREE_APPLICATIONS_LIMIT."""
    uid = (user_id or "default").strip() or "default"
    sb = _get_supabase()
    if sb:
        if USE_SUPABASE_PG:
            try:
                from backend import supabase_pg as spg

                return spg.count_active_applications_for_user(uid)
            except Exception as e:
                _warn_pg_fallback("count_active_applications_for_user", e)
        try:
            r = sb.table("applications").select("payload").eq("user_id", uid).execute()
            rows = r.data or []
            return sum(
                1
                for row in rows
                if _application_is_active_non_archived(
                    row.get("payload") if isinstance(row.get("payload"), dict) else {}
                )
            )
        except Exception:
            pass
    if not ADAPTATIONS_DIR.is_dir():
        return 0
    n = 0
    for path in ADAPTATIONS_DIR.glob("*.json"):
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
        except (json.JSONDecodeError, OSError):
            continue
        if data.get("user_id", "default") != uid:
            continue
        if _application_is_active_non_archived(data):
            n += 1
    return n


def get_user_plan(user_id: str | None = None) -> str:
    """Retourne 'free' ou 'pro'. Par défaut 'free' si pas de ligne."""
    uid = (user_id or "default").strip() or "default"
    if not _get_supabase():
        return "free"
    plan, _, _, _ = _get_cached_user_plan_state(uid)
    return plan


def get_paywall_disabled(user_id: str | None = None) -> bool:
    """True si le paywall est désactivé pour cet utilisateur (option dans user_plans.paywall_disabled)."""
    uid = (user_id or "default").strip() or "default"
    if not _get_supabase():
        return False
    _, pw, _, _ = _get_cached_user_plan_state(uid)
    return pw


def get_free_adaptation_bonus(user_id: str | None = None) -> int:
    """Crédits gratuits supplémentaires (user_plans.free_adaptation_bonus), 0 si pas de ligne ou sans Supabase."""
    uid = (user_id or "default").strip() or "default"
    if not _get_supabase():
        return 0
    _, _, bonus, _ = _get_cached_user_plan_state(uid)
    return bonus


def get_free_adaptation_count_anchor(user_id: str | None = None) -> int:
    """Ancrage quota / affichage (user_plans.free_adaptation_count_anchor), 0 si absent."""
    uid = (user_id or "default").strip() or "default"
    if not _get_supabase():
        return 0
    _, _, _, anchor = _get_cached_user_plan_state(uid)
    return anchor


def ensure_implicit_free_adaptation_anchor(user_id: str | None = None) -> None:
    """
    Si l'utilisateur a déjà plus de 3 candidatures et que anchor/bonus sont encore à 0,
    fixe free_adaptation_count_anchor sur le count actuel : jauge 0/3 + 3 essais sans SQL manuel.
    Ne s'applique pas au user_id fictif « default », ni pro / paywall_disabled.
    """
    uid = (user_id or "default").strip() or "default"
    if uid == "default":
        return
    sb = _get_supabase()
    if not sb:
        return
    count = count_quota_adaptations(uid)
    if count <= _FREE_ADAPTATIONS_BASE_LIMIT:
        return
    plan, pw, bonus, anchor = _fetch_user_plan_state(uid)
    if plan == "pro" or pw:
        return
    if anchor != 0 or bonus != 0:
        return
    try:
        if USE_SUPABASE_PG:
            try:
                from backend import supabase_pg as spg

                spg.upsert_free_adaptation_count_anchor(uid, count)
                _invalidate_user_plan_cache(uid)
                return
            except Exception as e:
                _warn_pg_fallback("upsert_free_adaptation_count_anchor", e)
        ex = sb.table("user_plans").select("user_id").eq("user_id", uid).limit(1).execute()
        if ex.data:
            sb.table("user_plans").update({"free_adaptation_count_anchor": count}).eq(
                "user_id", uid
            ).execute()
        else:
            sb.table("user_plans").insert(
                {
                    "user_id": uid,
                    "plan": "free",
                    "free_adaptation_count_anchor": count,
                }
            ).execute()
        _invalidate_user_plan_cache(uid)
    except Exception as e:
        logger.warning("ensure_implicit_free_adaptation_anchor %s: %s", uid, e)


def get_user_stripe_ids(user_id: str | None = None) -> tuple[str | None, str | None]:
    """Retourne (stripe_customer_id, stripe_subscription_id) depuis user_plans."""
    uid = (user_id or "default").strip() or "default"
    sb = _get_supabase()
    if not sb:
        return None, None
    if USE_SUPABASE_PG:
        try:
            from backend import supabase_pg as spg

            row = spg.get_user_plan_stripe_fields(uid)
            if row:
                cid = row.get("stripe_customer_id")
                sid = row.get("stripe_subscription_id")
                return (
                    str(cid).strip() if cid else None,
                    str(sid).strip() if sid else None,
                )
            return None, None
        except Exception as e:
            _warn_pg_fallback("get_user_plan_stripe_fields", e)
    try:
        r = (
            sb.table("user_plans")
            .select("stripe_customer_id, stripe_subscription_id")
            .eq("user_id", uid)
            .limit(1)
            .execute()
        )
        if r.data and len(r.data) > 0:
            row = r.data[0]
            cid = row.get("stripe_customer_id")
            sid = row.get("stripe_subscription_id")
            return (
                str(cid).strip() if cid else None,
                str(sid).strip() if sid else None,
            )
    except Exception:
        pass
    return None, None


def find_user_id_by_stripe_subscription_id(subscription_id: str) -> str | None:
    """user_id associé à un abonnement Stripe (pour webhooks)."""
    sid = (subscription_id or "").strip()
    if not sid or not _get_supabase():
        return None
    if USE_SUPABASE_PG:
        try:
            from backend import supabase_pg as spg

            return spg.find_user_id_by_stripe_subscription_id(sid)
        except Exception as e:
            _warn_pg_fallback("find_user_id_by_stripe_subscription_id", e)
    try:
        r = (
            _get_supabase()
            .table("user_plans")
            .select("user_id")
            .eq("stripe_subscription_id", sid)
            .limit(1)
            .execute()
        )
        if r.data and len(r.data) > 0:
            uid = r.data[0].get("user_id")
            return str(uid).strip() if uid else None
    except Exception:
        pass
    return None


def set_user_plan(
    user_id: str,
    plan: str,
    stripe_customer_id: str | None = None,
    stripe_subscription_id: str | None = None,
) -> None:
    """Met à jour le plan utilisateur (free/pro). Créé la ligne si besoin."""
    uid = (user_id or "default").strip() or "default"
    sb = _get_supabase()
    if not sb:
        return
    ts = datetime.now(timezone.utc).isoformat()
    if USE_SUPABASE_PG:
        try:
            from backend import supabase_pg as spg

            spg.upsert_user_plan(
                uid,
                plan,
                ts,
                stripe_customer_id=stripe_customer_id,
                stripe_subscription_id=stripe_subscription_id,
            )
            _invalidate_user_plan_cache(uid)
            return
        except Exception as e:
            _warn_pg_fallback("set_user_plan", e)
    try:
        row = {
            "user_id": uid,
            "plan": plan,
            "updated_at": ts,
        }
        if stripe_customer_id is not None:
            row["stripe_customer_id"] = stripe_customer_id
        if stripe_subscription_id is not None:
            row["stripe_subscription_id"] = stripe_subscription_id
        sb.table("user_plans").upsert(row, on_conflict="user_id").execute()
        _invalidate_user_plan_cache(uid)
    except Exception:
        raise


def update_adaptation(adaptation_id: str, updates: dict, user_id: str | None = None) -> dict | None:
    """Met à jour statut/archived/poste/entreprise et champs quali d'une candidature. Retourne le payload mis à jour."""
    current = get_adaptation(adaptation_id, user_id)
    if not current:
        return None
    statut_prev = current.get("statut", "candidature_envoyee")
    if "statut" in updates:
        current["statut"] = updates["statut"]
        # Ne fixer date_envoi que lors du premier passage en "candidature_envoyee" (pas quand on y revient après un autre statut)
        if updates["statut"] == "candidature_envoyee" and statut_prev != "candidature_envoyee":
            current["date_envoi"] = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")
    if "archived" in updates:
        current["archived"] = bool(updates["archived"])
    if "poste" in updates:
        current["poste"] = (updates["poste"] or "").strip()
    if "entreprise" in updates:
        current["entreprise"] = (updates["entreprise"] or "").strip()
    if "full_cv" in updates and updates["full_cv"] is not None:
        if isinstance(updates["full_cv"], dict):
            current["full_cv"] = updates["full_cv"]
    if "selection_a4" in updates:
        if updates["selection_a4"] is None:
            current.pop("selection_a4", None)
        elif isinstance(updates["selection_a4"], dict):
            current["selection_a4"] = updates["selection_a4"]
    for key in (
        "refus_raison",
        "refus_raison_type",
        "interview_type",
        "interview_feedback",
        "interview_date",
        "source_offre",
    ):
        if key in updates:
            current[key] = (
                (updates[key] or "").strip() if isinstance(updates[key], str) else updates[key]
            )
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
    user_id: str | None,
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
    op = (operation or "unknown")[:64]
    cost_rounded = round(cost_usd, 6)
    if USE_SUPABASE_PG:
        try:
            from backend import supabase_pg as spg

            spg.record_gemini_usage_pg(uid, op, input_tokens, output_tokens, cost_rounded)
            return cost_usd
        except Exception as e:
            _warn_pg_fallback("record_gemini_usage", e)
    try:
        sb.table("gemini_usage_log").insert(
            {
                "user_id": uid,
                "operation": op,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "cost_usd": cost_rounded,
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


def get_gemini_usage(user_id: str | None) -> tuple[int, int, float]:
    """Retourne (total_input_tokens, total_output_tokens, total_cost_usd) pour le compte."""
    uid = (user_id or "default").strip() or "default"
    sb = _get_supabase()
    if not sb:
        return 0, 0, 0.0
    if USE_SUPABASE_PG:
        try:
            from backend import supabase_pg as spg

            totals = spg.get_gemini_usage_totals(uid)
            if totals is not None:
                ti, to = totals
                return ti, to, _gemini_cost_usd(ti, to)
        except Exception as e:
            _warn_pg_fallback("get_gemini_usage", e)
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


def check_gemini_budget(user_id: str | None) -> tuple[bool, float, float]:
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
    return [_norm_uid(str(x)) for x in (allowed if isinstance(allowed, list | tuple) else [])]


def list_custom_templates_for_user(user_id: str | None) -> list[dict]:
    """Liste les templates personnalisés accessibles par l'utilisateur (owner ou dans allowed_user_ids). Exclut les templates __pending__."""
    uid = _norm_uid(user_id)
    if not uid:
        return []
    sb = _get_supabase()
    if not sb:
        return []
    if USE_SUPABASE_PG:
        try:
            from backend import supabase_pg as spg

            rows = spg.list_cv_templates_visible_for_user(uid)
            out = []
            for row in rows:
                owner = (row.get("owner_user_id") or "").strip()
                is_owner = _norm_uid(owner) == uid
                out.append(_custom_template_meta(row, is_owner=is_owner))
            return out
        except Exception as e:
            _warn_pg_fallback("list_custom_templates_for_user", e)
    try:
        r = (
            sb.table("cv_templates")
            .select("id, name, description, options, owner_user_id, allowed_user_ids")
            .execute()
        )
        out = []
        for row in r.data or []:
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
    raw_opts = row.get("options")
    if not isinstance(raw_opts, list):
        raw_opts = []
    try:
        from backend.template_registry import get_default_layout_options_for_custom

        defaults = get_default_layout_options_for_custom()
    except Exception:
        defaults = []
    if len(raw_opts) == 0:
        opts = list(defaults)
    else:
        keys = {o.get("key") for o in raw_opts if isinstance(o, dict) and o.get("key")}
        opts = list(raw_opts)
        for d in defaults:
            if isinstance(d, dict) and d.get("key") and d["key"] not in keys:
                opts.append(d)
    return {
        "id": row.get("id") or "",
        "name": row.get("name") or "Template perso",
        "description": row.get("description") or "",
        "options": opts,
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
    tid = template_id.strip()
    if USE_SUPABASE_PG:
        try:
            from backend import supabase_pg as spg

            row = spg.get_cv_template_full(tid)
            if not row:
                return None
            meta = _custom_template_meta(row)
            meta["_dir"] = None
            meta["_html_content"] = row.get("html_content") or ""
            meta["_css_content"] = row.get("css_content") or ""
            return meta
        except Exception as e:
            _warn_pg_fallback("get_custom_template_by_id", e)
    try:
        r = sb.table("cv_templates").select("*").eq("id", tid).limit(1).execute()
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


def can_user_use_custom_template(template_id: str, user_id: str | None) -> bool:
    """Vérifie si l'utilisateur peut utiliser ce template (owner ou dans allowed_user_ids). Comparaison insensible à la casse (UUID)."""
    uid = _norm_uid(user_id)
    if not uid or not (template_id or "").strip().startswith(CUSTOM_TEMPLATE_ID_PREFIX):
        return False
    sb = _get_supabase()
    if not sb:
        return False
    tid = template_id.strip()
    if USE_SUPABASE_PG:
        try:
            from backend import supabase_pg as spg

            acl = spg.get_cv_template_acl(tid)
            if not acl:
                return False
            owner, allowed_raw = acl
            if _norm_uid(owner) == uid:
                return True
            allowed_norm = _normalize_allowed_ids(allowed_raw)
            return uid in allowed_norm
        except Exception as e:
            _warn_pg_fallback("can_user_use_custom_template", e)
    try:
        r = (
            sb.table("cv_templates")
            .select("owner_user_id, allowed_user_ids")
            .eq("id", tid)
            .limit(1)
            .execute()
        )
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
    if USE_SUPABASE_PG:
        try:
            from backend import supabase_pg as spg

            spg.insert_cv_template(payload)
            row = {**payload, "allowed_user_ids": payload["allowed_user_ids"]}
            return _custom_template_meta(row, is_owner=True)
        except Exception as e:
            _warn_pg_fallback("create_custom_template", e)
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
    Aucun utilisateur ne le voit ; un humain devra mettre à jour owner_user_id et/ou allowed_user_ids dans Supabase.
    """
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
    if USE_SUPABASE_PG:
        try:
            from backend import supabase_pg as spg

            spg.insert_cv_template(payload)
            return {"id": tid, "name": payload["name"], "description": payload["description"]}
        except Exception as e:
            _warn_pg_fallback("create_pending_custom_template", e)
    sb.table("cv_templates").insert(payload).execute()
    return {"id": tid, "name": payload["name"], "description": payload["description"]}


def update_custom_template_content(
    template_id: str, html_content: str, css_content: str | None = None
) -> bool:
    """Met à jour uniquement html_content et css_content d'un template (par id, sans vérifier le owner).
    Utilisé par le script d'import pour remplacer le contenu par une nouvelle génération IA."""
    tid = (template_id or "").strip()
    if not tid.startswith(CUSTOM_TEMPLATE_ID_PREFIX):
        return False
    sb = _get_supabase()
    if not sb:
        raise RuntimeError("Supabase non configuré.")
    ts = datetime.now(timezone.utc).isoformat()
    if USE_SUPABASE_PG:
        try:
            from backend import supabase_pg as spg

            return spg.update_cv_template_content_pg(
                tid, html_content or "", (css_content or "").strip() or None, ts
            )
        except Exception as e:
            _warn_pg_fallback("update_custom_template_content", e)
    try:
        updates = {
            "html_content": html_content or "",
            "css_content": (css_content or "").strip() or None,
            "updated_at": ts,
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
    if USE_SUPABASE_PG:
        try:
            from backend import supabase_pg as spg

            row = spg.update_cv_template_by_owner(tid, uid, updates)
            if row:
                return _custom_template_meta(row, is_owner=True)
            return None
        except Exception as e:
            _warn_pg_fallback("update_custom_template", e)
    try:
        r = (
            sb.table("cv_templates")
            .select("*")
            .eq("id", tid)
            .eq("owner_user_id", uid)
            .limit(1)
            .execute()
        )
        if not r.data or len(r.data) == 0:
            return None
        sb.table("cv_templates").update(updates).eq("id", tid).eq("owner_user_id", uid).execute()
        r2 = (
            sb.table("cv_templates")
            .select("id, name, description, options, owner_user_id, allowed_user_ids")
            .eq("id", tid)
            .limit(1)
            .execute()
        )
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
    if USE_SUPABASE_PG:
        try:
            from backend import supabase_pg as spg

            return spg.delete_cv_template_by_owner(tid, uid)
        except Exception as e:
            _warn_pg_fallback("delete_custom_template", e)
    try:
        r = sb.table("cv_templates").delete().eq("id", tid).eq("owner_user_id", uid).execute()
        return bool(r.data)
    except Exception:
        return False
