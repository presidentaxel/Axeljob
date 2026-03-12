"""
Backend FastAPI : API CV Bot (adapter CV, PDF, export, candidatures).
Sert les métriques Prometheus sur /metrics.
Données : Supabase (cv_base, applications) ou fallback fichiers.
"""
import json
import logging
import sys
import time as _time
import uuid as uuid_module
import html as html_module
import hashlib
from collections import defaultdict
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import HTMLResponse, FileResponse, Response
from pydantic import BaseModel
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST

from backend.config import (
    BASE_DIR as CONFIG_BASE_DIR,
    API_BASE_URL,
    SUPABASE_JWT_SECRET,
    USE_SUPABASE,
    STRIPE_SECRET_KEY,
    STRIPE_PRICE_ID_PRO_MONTHLY,
    STRIPE_WEBHOOK_SECRET,
    FRONTEND_URL,
    IS_PRODUCTION,
    METRICS_AUTH_TOKEN,
)
from backend.db import (
    load_cv_base,
    save_cv_base,
    save_adaptation,
    list_applications,
    get_adaptation,
    update_adaptation,
    upload_photo_to_storage,
    upload_application_doc,
    APPLICATION_DOC_TYPES,
    count_applications,
    get_user_plan,
    get_paywall_disabled,
    set_user_plan,
)
from backend import event_log
from backend.cv_analytics import profile_metrics, cv_content_metrics, adaptation_metrics

# --- Structured logging ---
class _JsonFormatter(logging.Formatter):
    def format(self, record):
        log = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        if record.exc_info and record.exc_info[1]:
            log["exc"] = self.formatException(record.exc_info)
        return json.dumps(log, ensure_ascii=False)

logger = logging.getLogger("cv_bot")
if not logger.handlers:
    h = logging.StreamHandler()
    h.setFormatter(_JsonFormatter() if IS_PRODUCTION else logging.Formatter("%(levelname)s [cv_bot] %(message)s"))
    logger.addHandler(h)
logger.setLevel(logging.INFO)

BASE_DIR = CONFIG_BASE_DIR

app = FastAPI(
    title="CV Bot API",
    version="1.0.0",
    docs_url=None if IS_PRODUCTION else "/docs",
    redoc_url=None if IS_PRODUCTION else "/redoc",
)

# --- Middlewares ---
app.add_middleware(GZipMiddleware, minimum_size=1000)

_allowed_origins = [
    o.strip() for o in (FRONTEND_URL or "").split(",") if o.strip()
]
if API_BASE_URL and API_BASE_URL not in _allowed_origins:
    _allowed_origins.append(API_BASE_URL)
if not _allowed_origins:
    _allowed_origins = ["http://localhost:5173"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "Stripe-Signature"],
)

# --- Request body size limit middleware ---
_MAX_BODY_SIZE = 20 * 1024 * 1024  # 20 MB

@app.middleware("http")
async def limit_request_body(request: Request, call_next):
    cl = request.headers.get("content-length")
    if cl and int(cl) > _MAX_BODY_SIZE:
        return Response(
            content=json.dumps({"detail": "Corps de requête trop volumineux."}),
            status_code=413,
            media_type="application/json",
        )
    return await call_next(request)

# --- Prometheus ---
REQUEST_COUNT = Counter("cv_bot_http_requests_total", "Total HTTP requests", ["method", "endpoint"])
REQUEST_LATENCY = Histogram("cv_bot_http_request_duration_seconds", "Request latency", ["endpoint"])
ADAPT_COUNT = Counter("cv_bot_adaptations_total", "Total CV adaptations")
PDF_COUNT = Counter("cv_bot_pdfs_generated_total", "Total PDFs generated")


# --- Rate limiting (in-memory, per user) ---
_rate_limit_buckets: dict[str, list[float]] = {}
_RATE_LIMIT_WINDOW = 60
_RATE_LIMIT_MAX_ADAPT = 5
_RATE_LIMIT_MAX_DEFAULT = 30
_RATE_LIMIT_MAX_KEYS = 5000


def _check_rate_limit(user_id: str | None, max_requests: int = _RATE_LIMIT_MAX_DEFAULT) -> None:
    key = (user_id or "anon").strip() or "anon"
    now = _time.time()
    if key not in _rate_limit_buckets:
        if len(_rate_limit_buckets) >= _RATE_LIMIT_MAX_KEYS:
            oldest_key = min(_rate_limit_buckets, key=lambda k: _rate_limit_buckets[k][-1] if _rate_limit_buckets[k] else 0)
            del _rate_limit_buckets[oldest_key]
        _rate_limit_buckets[key] = []
    bucket = _rate_limit_buckets[key]
    _rate_limit_buckets[key] = [t for t in bucket if now - t < _RATE_LIMIT_WINDOW]
    if len(_rate_limit_buckets[key]) >= max_requests:
        raise HTTPException(status_code=429, detail="Trop de requêtes. Réessaie dans quelques secondes.")
    _rate_limit_buckets[key].append(now)


# --- Modèles request body ---
class AdaptBody(BaseModel):
    description: str = ""
    titre: str = ""  # intitulé du poste (améliore le score ATS si renseigné)
    entreprise: str = ""


class AdaptRefineBody(BaseModel):
    cv: dict
    instruction: str = ""

class RenderHtmlBody(BaseModel):
    cv: dict
    base_cv: dict | None = None
    highlight_changes: bool = False
    template_id: str | None = None
    template_options: dict | None = None

class PdfBody(BaseModel):
    cv: dict
    titre: str = ""
    entreprise: str = ""
    template_id: str | None = None
    template_options: dict | None = None

class ExportDossierBody(BaseModel):
    cv: dict
    titre: str = ""
    entreprise: str = ""
    description: str = ""
    dossier: str | None = None

class ExportDossierZipBody(BaseModel):
    cv: dict
    titre: str = ""
    entreprise: str = ""
    description: str = ""
    adaptation_id: str | None = None

class ApplicationCreateBody(BaseModel):
    """Création d'une candidature manuelle (hors app, sans CV adapté)."""
    poste: str = ""
    entreprise: str = ""
    statut: str = "candidature_envoyee"
    source_offre: str = ""


class ApplicationUpdateBody(BaseModel):
    statut: str | None = None
    archived: bool | None = None
    poste: str | None = None
    entreprise: str | None = None
    # Questionnaires quali (mémoire)
    refus_raison: str | None = None
    refus_raison_type: str | None = None
    interview_type: str | None = None
    interview_feedback: str | None = None
    interview_date: str | None = None
    source_offre: str | None = None


class FetchLinkedInBody(BaseModel):
    linkedin_access_token: str = ""


class LinkedInChangeItem(BaseModel):
    field: str
    linkedin_value: str | None = None


class ApplyLinkedInBody(BaseModel):
    changes: list[LinkedInChangeItem] = []


STATUTS_CANDIDATURE = ("a_postuler", "candidature_envoyee", "reponse_recue", "interview", "refus", "offre")


def _apply_tweaks(cv_base: dict, tweaks: dict) -> dict:
    from adapter import apply_tweaks_to_cv
    return apply_tweaks_to_cv(cv_base, tweaks)


def _diff_highlight_html(base: str, current: str) -> str:
    from difflib import SequenceMatcher
    base = (base or "").strip()
    current = (current or "").strip()
    if base == current:
        return html_module.escape(current)
    base_words = base.split()
    current_words = current.split()
    if not current_words:
        return ""
    matcher = SequenceMatcher(None, base_words, current_words)
    out = []
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        segment = current_words[j1:j2]
        if not segment:
            continue
        text = " ".join(segment)
        escaped = html_module.escape(text)
        if tag == "equal":
            out.append(escaped)
        else:
            out.append(f'<span class="cv-changed">{escaped}</span>')
    return " ".join(out)


def _render_cv_html(cv: dict, base_cv: dict | None = None, highlight_changes: bool = False, for_preview: bool = False, template_id: str | None = None, template_options: dict | None = None) -> str:
    from jinja2 import Environment, FileSystemLoader, select_autoescape
    from photo_assets import ensure_compressed_photo, get_photo_url_for_cv
    from adapter import _strip_h_f
    from backend.template_registry import get_template, get_template_dir, resolve_options, options_to_css_vars

    tmpl_dir = get_template_dir(template_id)
    tmpl_meta = get_template(template_id)
    resolved_opts = resolve_options(template_id, template_options)
    show_photo = resolved_opts.get("show_photo", True)

    if not cv.get("__example__"):
        ensure_compressed_photo(BASE_DIR, cv.get("photo_url"), cv.get("prenom"), cv.get("nom"))
        photo_url = get_photo_url_for_cv(BASE_DIR, cv.get("photo_url"), cv.get("prenom"), cv.get("nom"))
        if photo_url:
            cv = {**cv, "photo_url": photo_url}

    if not show_photo:
        cv = {**cv, "photo_url": None}

    ctx = dict(cv)
    ctx["for_preview"] = for_preview
    base = base_cv or {}
    titre_cv = _strip_h_f((cv.get("titre_professionnel") or "").strip())
    titre_base = _strip_h_f((base.get("titre_professionnel") or "").strip())
    if highlight_changes and base_cv:
        ctx["titre_professionnel_display"] = _diff_highlight_html(titre_base, titre_cv)
        ctx["resume_display"] = _diff_highlight_html(
            (base.get("resume") or "").strip(),
            (cv.get("resume") or "").strip(),
        )
    else:
        ctx["titre_professionnel_display"] = html_module.escape(titre_cv)
        ctx["resume_display"] = html_module.escape((cv.get("resume") or "").strip())

    by_id = {e.get("id"): e for e in (base.get("experiences") or []) if e.get("id")}
    experiences_raw = (cv.get("experiences") or [])[:6]
    experiences_with_content = [
        exp for exp in experiences_raw
        if (exp.get("poste") or exp.get("entreprise") or any((exp.get("bullet_points") or [])))
    ]
    experiences_for_display = []
    for exp in experiences_with_content:
        base_exp = by_id.get(exp.get("id")) or {}
        do_hl = highlight_changes and base_cv

        def _hl(field: str) -> str:
            b_val = (base_exp.get(field) or "").strip()
            c_val = (exp.get(field) or "").strip()
            if do_hl:
                return _diff_highlight_html(b_val, c_val)
            return html_module.escape(c_val)

        bullets_raw = (exp.get("bullet_points") or [])[:2]
        base_bullets = base_exp.get("bullet_points") or []
        bullets_with_hl = []
        for j, b in enumerate(bullets_raw):
            base_b = base_bullets[j] if j < len(base_bullets) else ""
            bullets_with_hl.append({
                "text": b,
                "html": _diff_highlight_html(base_b, b) if do_hl else html_module.escape(b),
            })
        exp_display = {
            **exp,
            "bullet_points": bullets_with_hl,
            "entreprise_display": _hl("entreprise"),
            "poste_display": _hl("poste"),
            "date_debut_display": _hl("date_debut"),
            "date_fin_display": _hl("date_fin"),
            "lieu_display": _hl("lieu"),
            "secteur_display": _hl("secteur"),
            "clients_display": _hl("clients"),
        }
        experiences_for_display.append(exp_display)
    ctx["experiences_for_display"] = experiences_for_display

    formations_all = cv.get("formations") or []
    ctx["formations_for_display"] = [
        f for f in formations_all[:5]
        if (f.get("diplome") or f.get("etablissement") or f.get("date") or f.get("mention"))
    ]

    certs_all = cv.get("certifications") or []
    ctx["certifications_for_display"] = [
        c for c in certs_all
        if (c.get("nom") or c.get("organisme") or c.get("date"))
    ]

    projs_all = cv.get("projets") or []
    ctx["projets_for_display"] = [
        p for p in projs_all[:5]
        if (p.get("nom") or p.get("description"))
    ]

    comp = cv.get("competences") or {}
    langues_all = comp.get("langues") or []
    ctx["langues_for_display"] = [
        l for l in langues_all
        if (l.get("langue") if isinstance(l, dict) else None) or (l.get("niveau") if isinstance(l, dict) else None)
    ]

    ctx["show_mots_cles_ats"] = resolved_opts.get("show_mots_cles_ats", True)

    env = Environment(
        loader=FileSystemLoader(str(tmpl_dir)),
        autoescape=select_autoescape(("html", "xml")),
    )
    template = env.get_template("template.html")
    html_str = template.render(**ctx)

    actual_tid = tmpl_meta.get("id") or "classic"
    html_str = html_str.replace('href="template.css"', f'href="/api/templates/{actual_tid}/template.css"')
    if 'src="assets/' in html_str:
        html_str = html_str.replace('src="assets/', 'src="/api/assets/')

    base = (API_BASE_URL or "").strip().rstrip("/")
    if base:
        html_str = html_str.replace("<head>", f'<head><base href="{base}/">', 1)

    css_vars_style = options_to_css_vars(resolved_opts)
    if css_vars_style:
        html_str = html_str.replace("</head>", css_vars_style + "</head>", 1)

    if highlight_changes and base_cv:
        highlight_styles = (
            "<style>.cv-changed{background-color:#b8d4be;padding:0 1px;border-radius:1px}"
            ".cv-header .cv-changed,.cv-sidebar .cv-changed{background-color:#3d6b4a;color:#b8e0c0}"
            "@media print{.cv-changed,.cv-header .cv-changed,.cv-sidebar .cv-changed{background-color:transparent;color:inherit;padding:0}}</style>"
        )
        html_str = html_str.replace("</head>", highlight_styles + "</head>", 1)
    if for_preview:
        scrollbar_style = (
            "html,body{scrollbar-width:thin;scrollbar-color:rgba(107,70,193,0.45) transparent}"
            "html::-webkit-scrollbar,body::-webkit-scrollbar{width:2px;height:2px}"
            "html::-webkit-scrollbar-track,body::-webkit-scrollbar-track{background:transparent}"
            "html::-webkit-scrollbar-thumb,body::-webkit-scrollbar-thumb{background:rgba(107,70,193,0.45);border-radius:1px}"
            "html::-webkit-scrollbar-thumb:hover,body::-webkit-scrollbar-thumb:hover{background:rgba(107,70,193,0.7)}"
        )
        preview_responsive = (
            "<style>.cv-preview .cv{width:100%!important;max-width:100%!important;min-height:auto!important;height:auto!important;max-height:none!important;overflow:visible!important}"
            ".cv-preview body{overflow-x:hidden}"
            + scrollbar_style + "</style>"
        )
        html_str = html_str.replace("</head>", preview_responsive + "</head>", 1)
    return html_str


def _offre_from_description(description: str, titre: str = "", entreprise: str = "") -> dict:
    from mots_cles import offre_from_description
    return offre_from_description(description or "", titre=titre, entreprise=entreprise)


def _adaptation_id_from_description(description: str) -> str:
    h = hashlib.sha256(description.strip().encode("utf-8")).hexdigest()[:12]
    ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M")
    return f"{ts}_{h}"


def _safe_adaptation_id(adaptation_id: str) -> bool:
    if not adaptation_id or len(adaptation_id) > 80:
        return False
    return all(c.isalnum() or c in "_-" for c in adaptation_id)


def _get_user_id(request: Request) -> str | None:
    """Extrait user_id du JWT Supabase (Authorization: Bearer <token>). Retourne None si pas de token ou invalide."""
    auth = request.headers.get("Authorization") or ""
    if not auth.startswith("Bearer "):
        return None
    token = auth[7:].strip()
    if not token or not SUPABASE_JWT_SECRET:
        return None
    try:
        import jwt
        payload = jwt.decode(token, SUPABASE_JWT_SECRET, algorithms=["HS256"], audience="authenticated")
        return (payload.get("sub") or "").strip() or None
    except Exception as e:
        logger.warning("JWT decode failed: %s (token prefix: %s…)", e, token[:20] if token else "empty")
        return None


def _require_user_id(request: Request) -> str:
    """En mode full Supabase : exige un user_id valide, sinon 401."""
    user_id = _get_user_id(request)
    if USE_SUPABASE and user_id is None:
        raise HTTPException(status_code=401, detail="Authentification requise. Connecte-toi pour continuer.")
    return user_id or "default"


def _fetch_linkedin_profile(access_token: str) -> dict:
    """Appelle l'API LinkedIn v2 pour récupérer le profil (nom, prénom, photo si dispo)."""
    import requests
    headers = {"Authorization": f"Bearer {access_token}"}
    out = {}
    # Profil de base
    r = requests.get(
        "https://api.linkedin.com/v2/me",
        headers=headers,
        timeout=10,
    )
    if r.status_code != 200:
        raise HTTPException(status_code=400, detail="Token LinkedIn invalide ou expiré. Reconnecte-toi avec LinkedIn.")
    data = r.json()
    out["prenom"] = (data.get("localizedFirstName") or "").strip()
    out["nom"] = (data.get("localizedLastName") or "").strip()
    # Photo de profil (sous-ressource)
    r2 = requests.get(
        "https://api.linkedin.com/v2/me?projection=(profilePicture(displayImage~:playableStreams))",
        headers=headers,
        timeout=10,
    )
    if r2.status_code == 200:
        pic = r2.json().get("profilePicture", {}) or {}
        display = (pic.get("displayImage~") or {}).get("elements") or []
        if display and isinstance(display[0], dict):
            ids = (display[0].get("identifiers") or [])
            if ids and ids[0].get("identifier"):
                out["photo_url"] = ids[0]["identifier"]
    return out


def _build_linkedin_proposed_changes(cv: dict, linkedin_data: dict) -> list[dict]:
    """Construit la liste des changements proposés (CV actuel vs LinkedIn)."""
    changes = []
    if linkedin_data.get("prenom") and (linkedin_data["prenom"] or "").strip() != (cv.get("prenom") or "").strip():
        changes.append({
            "id": "prenom",
            "field": "prenom",
            "label": "Prénom",
            "current_value": (cv.get("prenom") or "").strip(),
            "linkedin_value": (linkedin_data.get("prenom") or "").strip(),
        })
    if linkedin_data.get("nom") and (linkedin_data["nom"] or "").strip() != (cv.get("nom") or "").strip():
        changes.append({
            "id": "nom",
            "field": "nom",
            "label": "Nom",
            "current_value": (cv.get("nom") or "").strip(),
            "linkedin_value": (linkedin_data.get("nom") or "").strip(),
        })
    if linkedin_data.get("photo_url") and (linkedin_data.get("photo_url") or "").strip() != (cv.get("photo_url") or "").strip():
        changes.append({
            "id": "photo_url",
            "field": "photo_url",
            "label": "Photo de profil",
            "current_value": "(photo actuelle)" if (cv.get("photo_url") or "").strip() else "(aucune)",
            "linkedin_value": (linkedin_data.get("photo_url") or "").strip(),
        })
    return changes


def _apply_linkedin_changes_with_ai(cv: dict, changes: list[dict], user_id: str | None) -> dict:
    """Applique les changements validés : champs simples en direct, textes longs passés par IA pour adapter au style CV."""
    import os
    cv = dict(cv)
    for c in changes:
        field = c.get("field")
        linkedin_val = (c.get("linkedin_value") or "").strip()
        if not field:
            continue
        if field in ("prenom", "nom", "photo_url"):
            cv[field] = linkedin_val
            continue
        # Pour les champs texte (résumé, titre, etc.) on pourrait appeler l'IA pour adapter ; pour l'instant on applique tel quel si présent
        if field in ("resume", "titre_professionnel") and linkedin_val:
            api_key = os.environ.get("GEMINI_API_KEY")
            if api_key:
                try:
                    from google import genai
                    from google.genai import types
                    client = genai.Client(api_key=api_key)
                    prompt = (
                        "Tu adaptes un texte issu de LinkedIn pour qu'il convienne à un CV français professionnel. "
                        "Garde le sens, enlève le ton réseau social, rends-le concis et percutant. "
                        "Retourne uniquement le texte adapté, rien d'autre.\n\nTexte LinkedIn:\n" + linkedin_val[:2000]
                    )
                    r = client.models.generate_content(
                        model="gemini-2.0-flash",
                        contents=prompt,
                        config=types.GenerateContentConfig(temperature=0.3),
                    )
                    if r and r.text:
                        linkedin_val = r.text.strip()
                except Exception:
                    pass
            cv[field] = linkedin_val
    save_cv_base(cv, user_id)
    return cv


# --- Routes API (même contrat que Flask) ---

@app.get("/api/cv")
def api_cv(request: Request, profile: bool = False):
    """GET /api/cv : CV de l'utilisateur (Supabase).
    Si profile=1 (requête depuis l'onglet Profil) et qu'aucun CV n'est enregistré, on renvoie {} pour
    afficher un formulaire vide (données Supabase = rien), pas le CV d'exemple."""
    REQUEST_COUNT.labels(method="GET", endpoint="/api/cv").inc()
    user_id = _get_user_id(request)
    try:
        cv = load_cv_base(user_id)
        if profile and cv.get("__example__"):
            return {}
        cv_out = {k: v for k, v in cv.items() if k != "__example__"}
        # Sync : si pas de photo_url en base mais qu’on utilise Supabase Storage, utiliser l’URL publique du bucket (photo déjà uploadée = 409 avant fix)
        if USE_SUPABASE and not (cv_out.get("photo_url") or "").strip() and user_id:
            try:
                from backend.db import get_cv_photo_public_url_for_user
                url = get_cv_photo_public_url_for_user(user_id)
                if url:
                    cv_out["photo_url"] = url
            except Exception:
                pass
        return cv_out
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.put("/api/cv")
def api_cv_put(request: Request, body: dict):
    """Enregistre le CV de base (JSON). Utilisé par la section Profil. Avec auth : stocké par user_id ; sans : id 'default'."""
    REQUEST_COUNT.labels(method="PUT", endpoint="/api/cv").inc()
    user_id = _get_user_id(request)
    try:
        save_cv_base(body, user_id)
        try:
            p_metrics = profile_metrics(body)
            c_metrics = cv_content_metrics(body)
            event_log.log_event(event_log.EVENT_PROFILE_SAVED, user_id, {**p_metrics, **c_metrics})
        except Exception:
            event_log.log_event(event_log.EVENT_PROFILE_SAVED, user_id, {})
        return {"ok": True}
    except Exception as e:
        logger.exception(e)
        raise HTTPException(status_code=500, detail="Erreur interne. Réessaie ou contacte le support.")


@app.post("/api/cv/fetch-linkedin")
def api_cv_fetch_linkedin(request: Request, body: FetchLinkedInBody):
    """Récupère le profil LinkedIn (nom, prénom, photo) et propose les différences avec le CV actuel."""
    REQUEST_COUNT.labels(method="POST", endpoint="/api/cv/fetch-linkedin").inc()
    user_id = _get_user_id(request)
    token = (body.linkedin_access_token or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="Token LinkedIn requis. Connecte-toi avec LinkedIn puis réessaie.")
    try:
        linkedin_data = _fetch_linkedin_profile(token)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(e)
        raise HTTPException(status_code=502, detail="Erreur de connexion LinkedIn. Réessaie.")
    try:
        cv = load_cv_base(user_id)
    except FileNotFoundError:
        cv = {}
    proposed = _build_linkedin_proposed_changes(cv, linkedin_data)
    return {"linkedin_profile": linkedin_data, "proposed_changes": proposed}


@app.post("/api/cv/apply-linkedin-updates")
def api_cv_apply_linkedin(request: Request, body: ApplyLinkedInBody):
    """Applique les changements validés depuis LinkedIn (IA adapte les textes au style CV)."""
    REQUEST_COUNT.labels(method="POST", endpoint="/api/cv/apply-linkedin-updates").inc()
    user_id = _get_user_id(request)
    if not body.changes:
        return {"ok": True}
    try:
        cv = load_cv_base(user_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Aucun CV à mettre à jour.")
    changes = [{"field": c.field, "linkedin_value": c.linkedin_value} for c in body.changes]
    _apply_linkedin_changes_with_ai(cv, changes, user_id)
    return {"ok": True}


@app.post("/api/cv/linkedin-photo")
def api_cv_linkedin_photo(request: Request, body: FetchLinkedInBody):
    """Récupère la photo (et nom/prénom) LinkedIn. Retourne les infos sans sauvegarder."""
    token = (body.linkedin_access_token or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="Token LinkedIn requis.")
    try:
        linkedin_data = _fetch_linkedin_profile(token)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(e)
        raise HTTPException(status_code=502, detail="Erreur de connexion LinkedIn. Réessaie.")
    return {
        "photo_url": linkedin_data.get("photo_url") or "",
        "prenom": linkedin_data.get("prenom") or "",
        "nom": linkedin_data.get("nom") or "",
    }


@app.post("/api/cv/import-linkedin-photo")
def api_cv_import_linkedin_photo(request: Request, body: FetchLinkedInBody):
    """Récupère la photo LinkedIn et l'enregistre dans le CV (optionnellement prénom/nom)."""
    REQUEST_COUNT.labels(method="POST", endpoint="/api/cv/import-linkedin-photo").inc()
    user_id = _get_user_id(request)
    token = (body.linkedin_access_token or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="Token LinkedIn requis. Connecte-toi avec LinkedIn.")
    try:
        linkedin_data = _fetch_linkedin_profile(token)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(e)
        raise HTTPException(status_code=502, detail="Erreur de connexion LinkedIn. Réessaie.")
    photo_url = (linkedin_data.get("photo_url") or "").strip()
    if not photo_url:
        raise HTTPException(status_code=404, detail="Aucune photo de profil sur ton compte LinkedIn.")
    try:
        cv = load_cv_base(user_id)
    except FileNotFoundError:
        cv = {}
    cv["photo_url"] = photo_url
    if (linkedin_data.get("prenom") or "").strip():
        cv["prenom"] = (linkedin_data["prenom"] or "").strip()
    if (linkedin_data.get("nom") or "").strip():
        cv["nom"] = (linkedin_data["nom"] or "").strip()
    save_cv_base(cv, user_id)
    return {"ok": True, "photo_url": photo_url, "prenom": cv.get("prenom", ""), "nom": cv.get("nom", "")}


ALLOWED_PHOTO_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
UPLOADS_SUBDIR = "uploads"


@app.post("/api/cv/upload-photo")
def api_cv_upload_photo(request: Request, file: UploadFile = File(...)):
    """Importe une photo depuis le PC. Avec Supabase : stockage exclusif dans Supabase Storage (bucket cv_photos). Sinon : assets/uploads/ (fallback)."""
    REQUEST_COUNT.labels(method="POST", endpoint="/api/cv/upload-photo").inc()
    user_id = _require_user_id(request)
    content_type = (file.content_type or "").strip().lower()
    if content_type not in ALLOWED_PHOTO_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Format d'image non accepté. Utilisez JPEG, PNG, WebP ou GIF.",
        )
    safe_id = "".join(c for c in user_id if c.isalnum() or c in "_-") or "user"
    try:
        from PIL import Image
        contents = file.file.read()
        if len(contents) > 5 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Image trop volumineuse (max 5 Mo).")
        img = Image.open(BytesIO(contents)).convert("RGB")
        w, h = img.size
        max_side = 400
        if w > max_side or h > max_side:
            ratio = min(max_side / w, max_side / h)
            new_size = (int(w * ratio), int(h * ratio))
            resample = getattr(Image, "Resampling", Image).LANCZOS
            img = img.resize(new_size, resample)
        buffer = BytesIO()
        img.save(buffer, "JPEG", quality=88, optimize=True)
        buffer.seek(0)
        image_bytes = buffer.getvalue()
    except HTTPException:
        raise
    except Exception as e:
        logger.warning("Photo upload processing error: %s", e)
        raise HTTPException(status_code=400, detail="Image invalide ou illisible.")

    if USE_SUPABASE:
        try:
            photo_url = upload_photo_to_storage(safe_id, image_bytes)
            return {"photo_url": photo_url}
        except Exception as e:
            logger.exception(e)
            raise HTTPException(
                status_code=502,
                detail="Erreur de stockage. Réessaie.",
            )

    uploads_dir = BASE_DIR / "assets" / UPLOADS_SUBDIR
    uploads_dir.mkdir(parents=True, exist_ok=True)
    dest = uploads_dir / f"{safe_id}.jpg"
    with open(dest, "wb") as f:
        f.write(image_bytes)
    return {"photo_url": f"assets/{UPLOADS_SUBDIR}/{safe_id}.jpg"}


# --- Import CV (PDF / texte brut → profil structuré via Gemini) ---

_CV_IMPORT_SYSTEM_PROMPT = """Tu es un expert en extraction de données de CV.
On te fournit le texte brut d'un CV. Tu dois extraire TOUTES les informations et les structurer en JSON.

Retourne UNIQUEMENT un objet JSON valide avec cette structure exacte (pas de markdown, pas de commentaire) :
{
  "prenom": "",
  "nom": "",
  "email": "",
  "telephone": "",
  "linkedin": "",
  "ville": "",
  "titre_professionnel": "",
  "resume": "",
  "experiences": [
    {
      "id": "exp_1",
      "poste": "",
      "entreprise": "",
      "secteur": "",
      "date_debut": "",
      "date_fin": "",
      "lieu": "",
      "contexte": "",
      "bullet_points": ["", ""],
      "mots_cles": [],
      "clients": ""
    }
  ],
  "formations": [
    {
      "id": "form_1",
      "diplome": "",
      "etablissement": "",
      "date": "",
      "mention": ""
    }
  ],
  "competences": {
    "techniques": [],
    "logiciels": [],
    "langues": [{"langue": "", "niveau": ""}],
    "autres": []
  },
  "projets": [
    {
      "id": "proj_1",
      "nom": "",
      "description": "",
      "mots_cles": []
    }
  ]
}

Règles :
- Numérote les ids : exp_1, exp_2… / form_1, form_2… / proj_1, proj_2…
- Extrais TOUT ce qui est dans le CV, ne saute rien
- Pour les dates : garde le format d'origine (ex. "01/2024", "2023", "Aujourd'hui")
- Si une info n'est pas trouvée, laisse une chaîne vide ""
- Les bullet_points : chaque réalisation/responsabilité = 1 bullet point
- Les compétences techniques = hard skills, logiciels = outils/software, langues avec niveau, autres = permis, loisirs, etc.
- Texte brut uniquement, pas de formatage markdown
"""


class ImportTextBody(BaseModel):
    text: str = ""


def _extract_text_from_pdf(file_bytes: bytes) -> str:
    try:
        import pdfplumber
        pdf = pdfplumber.open(BytesIO(file_bytes))
        pages = []
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                pages.append(text)
        pdf.close()
        return "\n\n".join(pages)
    except Exception as e:
        logger.warning("PDF extraction error: %s", e)
        raise HTTPException(status_code=400, detail="Impossible de lire le PDF.")


def _extract_text_from_docx(file_bytes: bytes) -> str:
    try:
        from docx import Document
        doc = Document(BytesIO(file_bytes))
        return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    except Exception as e:
        logger.warning("DOCX extraction error: %s", e)
        raise HTTPException(status_code=400, detail="Impossible de lire le fichier Word.")


def _parse_cv_text_with_ai(text: str) -> dict:
    import os
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY manquante.")

    from google import genai
    from google.genai import types
    from adapter import _extract_json

    client = genai.Client(api_key=api_key)
    prompt = _CV_IMPORT_SYSTEM_PROMPT.strip() + "\n\n---\n\nTexte du CV :\n\n" + text[:8000]
    r = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
        config=types.GenerateContentConfig(temperature=0.1),
    )
    if not r or not getattr(r, "text", None):
        raise HTTPException(status_code=502, detail="Réponse Gemini vide.")
    parsed = _extract_json(r.text)
    if not parsed:
        raise HTTPException(status_code=502, detail="Impossible d'extraire un CV structuré de la réponse IA.")
    return parsed


@app.post("/api/cv/import")
def api_cv_import_file(request: Request, file: UploadFile = File(...)):
    """Importe un CV depuis un fichier PDF ou Word, parse via IA, retourne le CV structuré."""
    REQUEST_COUNT.labels(method="POST", endpoint="/api/cv/import").inc()
    _require_user_id(request)
    _check_rate_limit(_get_user_id(request), _RATE_LIMIT_MAX_ADAPT)
    content_type = (file.content_type or "").strip().lower()
    file_bytes = file.file.read()
    if len(file_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Fichier trop volumineux (max 10 Mo).")
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Fichier vide.")

    if content_type == "application/pdf" or (file.filename or "").lower().endswith(".pdf"):
        text = _extract_text_from_pdf(file_bytes)
    elif content_type in (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
    ) or (file.filename or "").lower().endswith((".docx", ".doc")):
        text = _extract_text_from_docx(file_bytes)
    else:
        try:
            text = file_bytes.decode("utf-8")
        except UnicodeDecodeError:
            raise HTTPException(status_code=400, detail="Format non reconnu. Envoie un PDF, Word ou fichier texte.")

    if len(text.strip()) < 50:
        raise HTTPException(status_code=400, detail="Le fichier ne contient pas assez de texte pour un CV.")

    cv = _parse_cv_text_with_ai(text)
    user_id = _get_user_id(request)
    file_ext = (file.filename or "").rsplit(".", 1)[-1].lower() if file.filename else "unknown"
    event_log.log_event(event_log.EVENT_CV_IMPORT, user_id, {"method": "file", "file_type": file_ext, "text_length": len(text)})
    return {"cv": cv}


@app.post("/api/cv/import-text")
def api_cv_import_text(request: Request, body: ImportTextBody):
    """Importe un CV depuis du texte brut (copier-coller), parse via IA, retourne le CV structuré."""
    REQUEST_COUNT.labels(method="POST", endpoint="/api/cv/import-text").inc()
    _require_user_id(request)
    text = (body.text or "").strip()
    if len(text) < 50:
        raise HTTPException(status_code=400, detail="Texte trop court. Colle le contenu complet de ton CV.")

    cv = _parse_cv_text_with_ai(text)
    user_id = _get_user_id(request)
    event_log.log_event(event_log.EVENT_CV_IMPORT, user_id, {"method": "text_paste", "text_length": len(text)})
    return {"cv": cv}


def _render_empty_preview_html() -> str:
    """Aperçu vide pour un utilisateur connecté qui n'a pas encore enregistré de CV dans Supabase."""
    base = (API_BASE_URL or "").strip().rstrip("/")
    base_tag = f'<base href="{base}/"/>' if base else ""
    return f"""<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"/>{base_tag}
<link rel="stylesheet" href="/api/template.css"/></head>
<body class="cv-preview" style="display:flex;align-items:center;justify-content:center;min-height:200px;padding:2rem;">
<p style="color:var(--muted, #666);text-align:center;">Complète ton profil (onglet Profil) pour voir l'aperçu de ton CV ici.</p>
</body></html>"""


@app.get("/api/cv/preview", response_class=HTMLResponse)
def api_cv_preview(request: Request):
    """Aperçu du CV : exclusivement les données Supabase du compte connecté. Si aucun CV enregistré, message invitant à compléter le profil."""
    REQUEST_COUNT.labels(method="GET", endpoint="/api/cv/preview").inc()
    user_id = _get_user_id(request)
    template_id = request.query_params.get("template_id")
    try:
        cv = load_cv_base(user_id)
        if user_id and cv.get("__example__"):
            return HTMLResponse(_render_empty_preview_html())
        html = _render_cv_html(cv, for_preview=True, template_id=template_id)
        return HTMLResponse(html)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.post("/api/render-html", response_class=HTMLResponse)
def api_render_html(body: RenderHtmlBody):
    REQUEST_COUNT.labels(method="POST", endpoint="/api/render-html").inc()
    html = _render_cv_html(
        body.cv,
        base_cv=body.base_cv,
        highlight_changes=body.highlight_changes,
        for_preview=True,
        template_id=body.template_id,
        template_options=body.template_options,
    )
    return HTMLResponse(html)


FREE_ADAPTATIONS_LIMIT = 3
FREE_APPLICATIONS_LIMIT = 5


@app.post("/api/create-checkout-session")
def api_create_checkout_session(request: Request):
    """Crée une session Stripe Checkout pour le plan Pro. Redirection vers Stripe."""
    user_id = _require_user_id(request)
    if not STRIPE_SECRET_KEY or not STRIPE_PRICE_ID_PRO_MONTHLY:
        raise HTTPException(status_code=503, detail="Paiement non configuré.")
    try:
        import stripe
        client = stripe.StripeClient(STRIPE_SECRET_KEY)
        base = (FRONTEND_URL or "").rstrip("/")
        session = client.checkout.sessions.create(params={
            "mode": "subscription",
            "client_reference_id": user_id,
            "line_items": [{"price": STRIPE_PRICE_ID_PRO_MONTHLY, "quantity": 1}],
            "success_url": f"{base}/?success=pro",
            "cancel_url": f"{base}/?cancel=checkout",
        })
        return {"url": session.url}
    except Exception as e:
        logger.exception(e)
        raise HTTPException(status_code=500, detail="Erreur interne. Réessaie ou contacte le support.")


@app.post("/api/stripe-webhook")
async def api_stripe_webhook(request: Request):
    """Webhook Stripe : checkout.session.completed → passer l'utilisateur en Pro."""
    if not STRIPE_SECRET_KEY or not STRIPE_WEBHOOK_SECRET:
        raise HTTPException(status_code=503, detail="Webhook non configuré.")
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        import stripe
        client = stripe.StripeClient(STRIPE_SECRET_KEY)
        event = client.webhooks.construct_event(payload, sig, STRIPE_WEBHOOK_SECRET)
    except ValueError:
        raise HTTPException(status_code=400, detail="Payload invalide.")
    except Exception as e:
        if "signature" in str(e).lower():
            raise HTTPException(status_code=400, detail="Signature invalide.")
        raise
    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        user_id = (session.get("client_reference_id") or "").strip()
        if user_id:
            set_user_plan(user_id, "pro")
            logger.info("User %s set to pro after Stripe checkout", user_id)
    return {"received": True}


@app.get("/api/usage")
def api_usage(request: Request):
    """Retourne les quotas (adaptations, candidatures) et le plan (free/pro)."""
    REQUEST_COUNT.labels(method="GET", endpoint="/api/usage").inc()
    user_id = _get_user_id(request)
    uid = user_id or "default"
    plan = get_user_plan(uid)
    no_paywall = get_paywall_disabled(uid)
    count = count_applications(uid)
    adaptations_limit = 999999 if (plan == "pro" or no_paywall) else FREE_ADAPTATIONS_LIMIT
    applications_limit = 999999 if (plan == "pro" or no_paywall) else FREE_APPLICATIONS_LIMIT
    return {
        "plan": plan,
        "adaptations_used": count,
        "adaptations_limit": adaptations_limit,
        "applications_count": count,
        "applications_limit": applications_limit,
    }


@app.post("/api/adapt")
def api_adapt(request: Request, body: AdaptBody):
    REQUEST_COUNT.labels(method="POST", endpoint="/api/adapt").inc()
    user_id = _get_user_id(request)
    _check_rate_limit(user_id, _RATE_LIMIT_MAX_ADAPT)
    description = (body.description or "").strip()
    if not description:
        raise HTTPException(status_code=400, detail="Collez l'annonce dans le champ 'description'")
    uid = user_id or "default"
    plan = get_user_plan(uid)
    no_paywall = get_paywall_disabled(uid)
    if plan == "free" and not no_paywall:
        count = count_applications(uid)
        if count >= FREE_ADAPTATIONS_LIMIT:
            raise HTTPException(
                status_code=402,
                detail="Vous avez épuisé vos 3 adaptations gratuites. Passez en Pro pour des adaptations illimitées.",
            )
    event_log.log_event(event_log.EVENT_ADAPTATION_STARTED, user_id, {"description_length": len(description)})
    with REQUEST_LATENCY.labels(endpoint="adapt").time():
        try:
            cv_base = load_cv_base(user_id)
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e))

        offre = _offre_from_description(
            description,
            titre=(body.titre or "").strip(),
            entreprise=(body.entreprise or "").strip(),
        )
        from rules import appliquer_regles
        cv_enrichi = appliquer_regles(cv_base, offre)
        rapport = cv_enrichi.get("rapport", {})

        from adapter import adapter_cv
        try:
            tweaks = adapter_cv(cv_base, offre, rapport=rapport)
        except Exception as e:
            logger.exception(e)
            event_log.log_event(event_log.EVENT_ADAPTATION_FAILED, user_id, {"error": str(e)})
            raise HTTPException(status_code=500, detail="Erreur lors de l'adaptation. Réessaie.")

        merged = _apply_tweaks(cv_base, tweaks)
        adaptation_id = _adaptation_id_from_description(description)
        poste_offre = (tweaks.get("poste_offre") or "").strip()
        entreprise_offre = (offre.get("entreprise") or "").strip()
        save_adaptation(adaptation_id, {
            "resume": tweaks.get("resume"),
            "experiences": tweaks.get("experiences", []),
            "mots_cles_cache": tweaks.get("mots_cles_cache", ""),
            "poste_offre": poste_offre,
            "poste": poste_offre,
            "entreprise": entreprise_offre,
            "rapport": rapport,
            "description_preview": description[:200] + "..." if len(description) > 200 else description,
            "description_full": description,
            "full_cv": merged,
            "statut": "candidature_envoyee",
            "archived": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }, user_id=user_id)
        ADAPT_COUNT.inc()
        try:
            rapport_after_cv = appliquer_regles(merged, offre)
            rapport_after = rapport_after_cv.get("rapport", {})
        except Exception:
            rapport_after = None
        try:
            a_metrics = adaptation_metrics(cv_base, merged, offre, rapport, rapport_after)
            a_metrics["adaptation_id"] = adaptation_id
            content_before = cv_content_metrics(cv_base)
            content_after = cv_content_metrics(merged)
            a_metrics["content_before"] = content_before
            a_metrics["content_after"] = content_after
            event_log.log_event(event_log.EVENT_ADAPTATION_COMPLETED, user_id, a_metrics)
        except Exception:
            event_log.log_event(event_log.EVENT_ADAPTATION_COMPLETED, user_id, {"adaptation_id": adaptation_id})
        return {
            "cv": merged,
            "rapport": rapport_after or rapport,
            "tweaks": tweaks,
            "adaptation_id": adaptation_id,
        }


@app.post("/api/adapt-refine")
def api_adapt_refine(request: Request, body: AdaptRefineBody):
    """Affine le CV selon une instruction utilisateur (chat)."""
    REQUEST_COUNT.labels(method="POST", endpoint="/api/adapt-refine").inc()
    user_id = _get_user_id(request)
    _check_rate_limit(user_id, _RATE_LIMIT_MAX_ADAPT)
    instruction = (body.instruction or "").strip()
    if not instruction:
        raise HTTPException(status_code=400, detail="Instruction requise.")
    cv_current = body.cv or {}
    if not cv_current.get("experiences"):
        raise HTTPException(status_code=400, detail="CV invalide (experiences manquantes).")
    try:
        from adapter import refine_cv, apply_tweaks_to_cv
        tweaks = refine_cv(cv_current, instruction)
        merged = apply_tweaks_to_cv(cv_current, tweaks)
        return {"cv": merged, "tweaks": tweaks}
    except Exception as e:
        logger.exception(e)
        raise HTTPException(status_code=500, detail="Erreur interne. Réessaie ou contacte le support.")


@app.post("/api/pdf")
def api_pdf(request: Request, body: PdfBody):
    REQUEST_COUNT.labels(method="POST", endpoint="/api/pdf").inc()
    user_id = _get_user_id(request)
    _check_rate_limit(user_id, 10)
    offre = {"titre": body.titre, "entreprise": body.entreprise}
    try:
        from generator import generer_pdf_bytes
        pdf_bytes, filename = generer_pdf_bytes(body.cv, offre, template_id=body.template_id, template_options=body.template_options)
    except Exception as e:
        logger.exception(e)
        raise HTTPException(status_code=500, detail="Erreur interne. Réessaie ou contacte le support.")
    PDF_COUNT.inc()
    event_log.log_event(event_log.EVENT_PDF_GENERATED, user_id, {"titre": body.titre or "", "entreprise": body.entreprise or "", "template_id": body.template_id or "classic"})
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/export-default-dir")
def api_export_default_dir():
    try:
        from export_package import get_export_base_path
        return {"path": str(get_export_base_path())}
    except Exception:
        return {"path": ""}


@app.post("/api/export-dossier")
def api_export_dossier(request: Request, body: ExportDossierBody):
    if not (body.titre or "").strip():
        raise HTTPException(status_code=400, detail="Indiquez l'intitulé du poste")
    user_id = _get_user_id(request)
    try:
        from export_package import export_dossier
        result = export_dossier(body.cv, body.titre, body.entreprise, body.description, output_base=body.dossier or None)
        event_log.log_event(event_log.EVENT_EXPORT_DOSSIER, user_id, {"titre": body.titre or "", "entreprise": body.entreprise or ""})
        return result
    except Exception as e:
        logger.exception(e)
        raise HTTPException(status_code=500, detail="Erreur interne. Réessaie ou contacte le support.")


@app.post("/api/export-dossier-zip")
def api_export_dossier_zip(request: Request, body: ExportDossierZipBody):
    if not (body.titre or "").strip():
        raise HTTPException(status_code=400, detail="Indiquez l'intitulé du poste")
    user_id = _get_user_id(request)
    _check_rate_limit(user_id, 10)
    try:
        from export_package import export_dossier_as_zip
        lettre_corps_existant = None
        if body.adaptation_id and _safe_adaptation_id(body.adaptation_id):
            payload = get_adaptation(body.adaptation_id, user_id=user_id or "default")
            if payload:
                lettre_corps_existant = payload.get("lettre_corps")
        zip_bytes, folder_name, files_created, lettre_corps = export_dossier_as_zip(
            body.cv, body.titre, body.entreprise, body.description, lettre_corps=lettre_corps_existant
        )
        if body.adaptation_id and _safe_adaptation_id(body.adaptation_id) and lettre_corps:
            payload = get_adaptation(body.adaptation_id, user_id=user_id or "default")
            if payload:
                payload["lettre_corps"] = lettre_corps
                save_adaptation(body.adaptation_id, payload, user_id=user_id)
        event_log.log_event(event_log.EVENT_EXPORT_DOSSIER, user_id, {"titre": body.titre or "", "entreprise": body.entreprise or ""})
        return Response(
            content=zip_bytes,
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{folder_name}.zip"'},
        )
    except Exception as e:
        logger.exception(e)
        raise HTTPException(status_code=500, detail="Erreur interne. Réessaie ou contacte le support.")


@app.get("/api/applications")
def api_applications_list(request: Request, archived: str = ""):
    include_archived = archived == "1"
    user_id = _get_user_id(request)
    return list_applications(include_archived=include_archived, user_id=user_id or "default")


@app.post("/api/applications")
def api_application_create(request: Request, body: ApplicationCreateBody):
    """Crée une candidature manuelle (postulé hors app) : poste, entreprise, statut. Pas de CV adapté."""
    REQUEST_COUNT.labels(method="POST", endpoint="/api/applications").inc()
    user_id = _get_user_id(request)
    uid = user_id or "default"
    poste = (body.poste or "").strip()
    entreprise = (body.entreprise or "").strip()
    if not poste and not entreprise:
        raise HTTPException(status_code=400, detail="Renseigne au moins le poste ou l'entreprise.")
    if body.statut not in STATUTS_CANDIDATURE:
        raise HTTPException(status_code=400, detail="Statut invalide")
    application_id = "manual_" + uuid_module.uuid4().hex[:12]
    now_iso = datetime.now(timezone.utc).isoformat()
    payload = {
        "poste": poste,
        "poste_offre": poste,
        "entreprise": entreprise,
        "statut": body.statut,
        "archived": False,
        "source_offre": (body.source_offre or "").strip(),
        "created_at": now_iso,
    }
    save_adaptation(application_id, payload, user_id=uid)
    try:
        ts = datetime.fromisoformat(now_iso.replace("Z", "+00:00")).timestamp()
        date_str = datetime.fromtimestamp(ts).strftime("%Y-%m-%d %H:%M")
    except Exception:
        date_str = ""
    return {
        "id": application_id,
        "poste": poste,
        "poste_offre": poste,
        "entreprise": entreprise,
        "statut": body.statut,
        "archived": False,
        "date": date_str,
        "created_at": now_iso,
    }


@app.get("/api/applications/export")
def api_applications_export(request: Request, format: str = "json"):
    """Export des candidatures de l'utilisateur (JSON ou CSV) pour mémoire / analyse."""
    REQUEST_COUNT.labels(method="GET", endpoint="/api/applications/export").inc()
    user_id = _get_user_id(request)
    applications = list_applications(include_archived=True, user_id=user_id or "default")
    if format == "csv":
        import csv
        from io import StringIO
        out = StringIO()
        if not applications:
            return Response(content="id;poste;entreprise;statut;date;created_at;refus_raison_type;refus_raison;interview_type;interview_feedback;interview_date;source_offre\n", media_type="text/csv", headers={"Content-Disposition": "attachment; filename=candidatures_export.csv"})
        w = csv.DictWriter(out, fieldnames=["id", "poste", "entreprise", "statut", "date", "created_at", "refus_raison_type", "refus_raison", "interview_type", "interview_feedback", "interview_date", "source_offre"], delimiter=";", extrasaction="ignore")
        w.writeheader()
        for row in applications:
            w.writerow(row)
        return Response(content=out.getvalue(), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=candidatures_export.csv"})
    return applications


@app.get("/api/events/export")
def api_events_export(request: Request, date_from: str = "", date_to: str = "", format: str = "json"):
    """Export des événements (logs) de l'utilisateur pour mémoire / analyse. Filtre par user_id anonymisé."""
    REQUEST_COUNT.labels(method="GET", endpoint="/api/events/export").inc()
    user_id = _get_user_id(request)
    anon_id = event_log.get_anon_user_id(user_id)
    events = event_log.read_events_from_files(date_from=date_from or None, date_to=date_to or None)
    events = [e for e in events if e.get("user_id") == anon_id]
    if format == "csv":
        import csv
        from io import StringIO
        out = StringIO()
        if not events:
            return Response(content="timestamp;event_type;user_id;context\n", media_type="text/csv", headers={"Content-Disposition": "attachment; filename=events_export.csv"})
        w = csv.DictWriter(out, fieldnames=["timestamp", "event_type", "user_id", "context"], delimiter=";", extrasaction="ignore")
        w.writeheader()
        for row in events:
            row = row.copy()
            row["context"] = json.dumps(row.get("context") or {}, ensure_ascii=False)
            w.writerow(row)
        return Response(content=out.getvalue(), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=events_export.csv"})
    return events


# --- Frontend event tracking (fire-and-forget, 0 friction) ---

_ALLOWED_FRONTEND_EVENTS = {
    event_log.EVENT_ONBOARDING_METHOD,
    event_log.EVENT_ONBOARDING_COMPLETED,
    event_log.EVENT_ONBOARDING_SKIPPED,
    event_log.EVENT_PAGE_VIEW,
    event_log.EVENT_JOB_DESCRIPTION_PASTED,
    event_log.EVENT_CV_MANUALLY_EDITED,
    event_log.EVENT_ATS_DETAILS_OPENED,
    event_log.EVENT_ADAPTATION_RATED,
    event_log.EVENT_CV_IMPORT,
    event_log.EVENT_TEMPLATE_CHANGED,
}


class TrackEventBody(BaseModel):
    event_type: str
    context: dict = {}


@app.post("/api/events/track")
def api_events_track(request: Request, body: TrackEventBody):
    """Reçoit un événement frontend (léger, fire-and-forget). Whitelist d'events autorisés."""
    if body.event_type not in _ALLOWED_FRONTEND_EVENTS:
        raise HTTPException(status_code=400, detail="Event type non autorisé")
    user_id = _get_user_id(request)
    ctx = body.context or {}
    if len(json.dumps(ctx, ensure_ascii=False)) > 4000:
        ctx = {"_truncated": True}
    event_log.log_event(body.event_type, user_id, ctx)
    return {"ok": True}


@app.patch("/api/applications/{adaptation_id}")
def api_application_update(request: Request, adaptation_id: str, body: ApplicationUpdateBody):
    if not _safe_adaptation_id(adaptation_id):
        raise HTTPException(status_code=400, detail="Id invalide")
    if body.statut is not None and body.statut not in STATUTS_CANDIDATURE:
        raise HTTPException(status_code=400, detail="Statut invalide")
    user_id = _get_user_id(request)
    current = get_adaptation(adaptation_id, user_id or "default")
    if not current:
        raise HTTPException(status_code=404, detail="Candidature introuvable")
    statut_prev = current.get("statut")
    updates = body.model_dump(exclude_none=True)
    payload = update_adaptation(adaptation_id, updates, user_id=user_id or "default")
    if not payload:
        raise HTTPException(status_code=404, detail="Candidature introuvable")
    # Logs structurés pour mémoire
    if updates.get("statut") is not None and updates["statut"] != statut_prev:
        delay_days = None
        created_at = current.get("created_at")
        if created_at:
            try:
                created = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                delay_days = (datetime.now(timezone.utc) - created).days
            except Exception:
                pass
        event_log.log_event(event_log.EVENT_STATUT_CHANGED, user_id, {
            "adaptation_id": adaptation_id,
            "statut_prev": statut_prev,
            "statut_new": updates["statut"],
            "delay_days": delay_days,
        })
    if updates.get("refus_raison") or updates.get("refus_raison_type"):
        event_log.log_event(event_log.EVENT_REFUS_REASON_SUBMITTED, user_id, {
            "adaptation_id": adaptation_id,
            "refus_raison_type": updates.get("refus_raison_type"),
        })
    if updates.get("interview_type") or updates.get("interview_feedback") or updates.get("interview_date"):
        event_log.log_event(event_log.EVENT_INTERVIEW_FEEDBACK_SUBMITTED, user_id, {
            "adaptation_id": adaptation_id,
            "interview_type": updates.get("interview_type"),
        })
    if updates.get("source_offre"):
        event_log.log_event(event_log.EVENT_SOURCE_OFFRE_SUBMITTED, user_id, {
            "adaptation_id": adaptation_id,
            "source_offre": updates["source_offre"],
        })
    return {"id": adaptation_id, "statut": payload.get("statut"), "archived": payload.get("archived")}


@app.get("/api/applications/{adaptation_id}")
def api_application_get(request: Request, adaptation_id: str):
    """Retourne le payload complet d'une candidature (CV, fiche, lettre_html si lettre_corps sauvegardé)."""
    if not _safe_adaptation_id(adaptation_id):
        raise HTTPException(status_code=400, detail="Id invalide")
    user_id = _get_user_id(request)
    payload = get_adaptation(adaptation_id, user_id=user_id or "default")
    if not payload:
        raise HTTPException(status_code=404, detail="Candidature introuvable")
    if payload.get("lettre_corps"):
        from letter_generator import corps_lettre_to_html
        payload = dict(payload)
        payload["lettre_html"] = corps_lettre_to_html(payload["lettre_corps"])
    return payload


@app.post("/api/applications/{adaptation_id}/generate-letter")
def api_application_generate_letter(request: Request, adaptation_id: str):
    """Génère la lettre de motivation (Gemini), la sauvegarde dans la candidature, retourne corps + HTML."""
    if not _safe_adaptation_id(adaptation_id):
        raise HTTPException(status_code=400, detail="Id invalide")
    user_id = _get_user_id(request)
    _check_rate_limit(user_id, _RATE_LIMIT_MAX_ADAPT)
    payload = get_adaptation(adaptation_id, user_id=user_id or "default")
    if not payload:
        raise HTTPException(status_code=404, detail="Candidature introuvable")
    full_cv = payload.get("full_cv")
    description_full = payload.get("description_full") or ""
    poste = (payload.get("poste") or "").strip()
    entreprise = (payload.get("entreprise") or "").strip()
    if not full_cv:
        raise HTTPException(status_code=400, detail="CV adapté absent pour cette candidature")
    lettre_corps = payload.get("lettre_corps")
    if not lettre_corps:
        from letter_generator import generer_corps_lettre
        try:
            lettre_corps = generer_corps_lettre(full_cv, description_full, poste, entreprise)
        except Exception as e:
            logger.exception(e)
            raise HTTPException(status_code=500, detail="Erreur lors de la génération de la lettre. Réessaie.")
        payload["lettre_corps"] = lettre_corps
        save_adaptation(adaptation_id, payload, user_id=user_id)
    from letter_generator import corps_lettre_to_html
    lettre_html = corps_lettre_to_html(lettre_corps)
    return {"lettre_corps": lettre_corps, "lettre_html": lettre_html}


@app.get("/api/applications/{adaptation_id}/download/cv")
def api_application_download_cv(request: Request, adaptation_id: str):
    """Télécharge le CV adapté en PDF."""
    if not _safe_adaptation_id(adaptation_id):
        raise HTTPException(status_code=400, detail="Id invalide")
    user_id = _get_user_id(request)
    payload = get_adaptation(adaptation_id, user_id=user_id or "default")
    if not payload:
        raise HTTPException(status_code=404, detail="Candidature introuvable")
    full_cv = payload.get("full_cv")
    if not full_cv:
        raise HTTPException(status_code=400, detail="CV adapté absent")
    poste = (payload.get("poste") or "").strip()
    entreprise = (payload.get("entreprise") or "").strip()
    from generator import generer_pdf_bytes
    pdf_bytes, filename = generer_pdf_bytes(full_cv, {"titre": poste, "entreprise": entreprise}, base_dir=BASE_DIR)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/applications/{adaptation_id}/download/lettre")
def api_application_download_lettre(request: Request, adaptation_id: str):
    """Télécharge la lettre de motivation en PDF (génère la lettre si pas encore stockée)."""
    if not _safe_adaptation_id(adaptation_id):
        raise HTTPException(status_code=400, detail="Id invalide")
    user_id = _get_user_id(request)
    payload = get_adaptation(adaptation_id, user_id=user_id or "default")
    if not payload:
        raise HTTPException(status_code=404, detail="Candidature introuvable")
    full_cv = payload.get("full_cv")
    description_full = payload.get("description_full") or ""
    poste = (payload.get("poste") or "").strip()
    entreprise = (payload.get("entreprise") or "").strip()
    if not full_cv:
        raise HTTPException(status_code=400, detail="CV adapté absent")
    from letter_generator import generer_corps_lettre, generer_lettre_pdf_bytes_from_corps
    lettre_corps = payload.get("lettre_corps")
    if not lettre_corps:
        try:
            lettre_corps = generer_corps_lettre(full_cv, description_full, poste, entreprise)
        except Exception as e:
            logger.exception(e)
            raise HTTPException(status_code=500, detail="Erreur lors de la génération de la lettre. Réessaie.")
        payload["lettre_corps"] = lettre_corps
        save_adaptation(adaptation_id, payload, user_id=user_id)
    pdf_bytes, filename = generer_lettre_pdf_bytes_from_corps(full_cv, lettre_corps, poste, entreprise, base_dir=BASE_DIR)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/applications/{adaptation_id}/download/fiche")
def api_application_download_fiche(request: Request, adaptation_id: str):
    """Télécharge la fiche de poste en PDF."""
    if not _safe_adaptation_id(adaptation_id):
        raise HTTPException(status_code=400, detail="Id invalide")
    user_id = _get_user_id(request)
    payload = get_adaptation(adaptation_id, user_id=user_id or "default")
    if not payload:
        raise HTTPException(status_code=404, detail="Candidature introuvable")
    description_full = payload.get("description_full") or ""
    poste = (payload.get("poste") or "").strip()
    entreprise = (payload.get("entreprise") or "").strip()
    from export_package import generer_fiche_pdf_bytes
    pdf_bytes, filename = generer_fiche_pdf_bytes(description_full, poste, entreprise, base_dir=BASE_DIR)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/api/applications/{adaptation_id}/upload-doc")
async def api_application_upload_doc(request: Request, adaptation_id: str):
    """Joint un PDF à la candidature (lettre, cv ou fiche). FormData : type=lettre|cv|fiche, file=PDF."""
    if not _safe_adaptation_id(adaptation_id):
        raise HTTPException(status_code=400, detail="Id invalide")
    form = await request.form()
    doc_type = (form.get("type") or "").strip().lower()
    if doc_type not in APPLICATION_DOC_TYPES:
        raise HTTPException(status_code=400, detail="type doit être lettre, cv ou fiche")
    file = form.get("file")
    if not file or not hasattr(file, "read"):
        raise HTTPException(status_code=400, detail="Fichier PDF requis")
    user_id = _get_user_id(request)
    uid = user_id or "default"
    payload = get_adaptation(adaptation_id, user_id=uid)
    if not payload:
        raise HTTPException(status_code=404, detail="Candidature introuvable")
    filename = getattr(file, "filename", "") or ""
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Le fichier doit être un PDF")
    file_bytes = await file.read()
    if len(file_bytes) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Fichier trop volumineux (max 20 Mo)")
    try:
        url = upload_application_doc(uid, adaptation_id, doc_type, file_bytes)
    except Exception as e:
        logger.exception(e)
        raise HTTPException(status_code=500, detail="Erreur de stockage. Réessaie.")
    key = f"pdf_{doc_type}_url"
    payload[key] = url
    save_adaptation(adaptation_id, payload, user_id=uid)
    return {key: url}


# --- Logo entreprise (Logo.dev prioritaire, Clearbit en fallback) ---

_logo_cache: dict[str, tuple[bytes, str, float]] = {}
_LOGO_CACHE_TTL = 3600  # 1 heure
_LOGO_CACHE_MAX = 200
_LOGO_NOT_FOUND: set[str] = set()

def _company_to_domain(company_name: str) -> str | None:
    """Convertit un nom d'entreprise en slug pour domaine (.com / .fr)."""
    if not company_name or not isinstance(company_name, str):
        return None
    slug = (
        company_name.strip()
        .lower()
        .encode("ascii", "ignore")
        .decode()
        .replace(" ", "")
        .replace("-", "")
    )
    slug = "".join(c for c in slug if c.isalnum())
    return slug if slug else None


def _fetch_logo_from_url(url: str, timeout: int = 5) -> tuple[bytes | None, str | None, int]:
    """Récupère une image depuis une URL. Retourne (content, content_type, status_code). -1 = erreur réseau."""
    import requests
    try:
        r = requests.get(url, timeout=timeout, stream=True)
        if r.status_code == 200 and r.content:
            return r.content, r.headers.get("Content-Type") or "image/png", r.status_code
        return None, None, r.status_code
    except Exception as e:
        logger.debug("[company-logo] fetch error url=%s: %s", url[:80], e)
        return None, None, -1


@app.get("/api/company-logo")
def api_company_logo(company: str = ""):
    """Proxy logo entreprise avec cache mémoire (1h TTL)."""
    import os
    from urllib.parse import quote

    company_clean = (company or "").strip()
    if not company_clean:
        raise HTTPException(status_code=400, detail="Paramètre company requis")

    cache_key = company_clean.lower()
    now = _time.time()

    if cache_key in _logo_cache:
        content, ct, cached_at = _logo_cache[cache_key]
        if now - cached_at < _LOGO_CACHE_TTL:
            return Response(content=content, media_type=ct, headers={"Cache-Control": "public, max-age=3600"})
        else:
            del _logo_cache[cache_key]

    if cache_key in _LOGO_NOT_FOUND and len(_LOGO_NOT_FOUND) < 500:
        raise HTTPException(status_code=404, detail="Logo non trouvé")

    logo_token = (os.environ.get("LOGO_DEV_TOKEN") or os.environ.get("LOGO_DEV_PUBLISHABLE_KEY") or "").strip()
    token_masked = "***" if logo_token else "(absent)"

    logger.info("[company-logo] company=%r LOGO_DEV_TOKEN=%s", company_clean, "set" if logo_token else "absent")

    def _cache_and_respond(content: bytes, ct: str) -> Response:
        if len(_logo_cache) >= _LOGO_CACHE_MAX:
            oldest = min(_logo_cache, key=lambda k: _logo_cache[k][2])
            del _logo_cache[oldest]
        _logo_cache[cache_key] = (content, ct, now)
        return Response(content=content, media_type=ct, headers={"Cache-Control": "public, max-age=3600"})

    if logo_token:
        name_encoded = quote(company_clean, safe="")
        url_name = f"https://img.logo.dev/name/{name_encoded}?token={logo_token}&size=128&format=webp"
        content, ct, status = _fetch_logo_from_url(url_name)
        if content:
            return _cache_and_respond(content, ct or "image/webp")

    domain_slug = _company_to_domain(company_clean)
    if domain_slug:
        for ext in (".com", ".fr"):
            full_domain = f"{domain_slug}{ext}"
            if logo_token:
                url_domain = f"https://img.logo.dev/{full_domain}?token={logo_token}&size=128&format=webp"
                content, ct, status = _fetch_logo_from_url(url_domain)
                if content:
                    return _cache_and_respond(content, ct or "image/webp")
            url_clearbit = f"https://logo.clearbit.com/{full_domain}"
            content, ct, status = _fetch_logo_from_url(url_clearbit)
            if content:
                return _cache_and_respond(content, ct or "image/png")

    _LOGO_NOT_FOUND.add(cache_key)
    raise HTTPException(status_code=404, detail="Logo non trouvé")


# --- Templates API ---

@app.get("/api/templates")
def api_templates_list():
    """Liste tous les templates CV disponibles (id, nom, description, options, tags)."""
    from backend.template_registry import list_templates
    return list_templates()


# --- Fichiers statiques (template CSS, assets) pour le preview HTML ---

@app.get("/api/templates/{template_id}/template.css")
def serve_template_css_by_id(template_id: str):
    """Sert le CSS d'un template spécifique."""
    from backend.template_registry import get_template_dir
    path = get_template_dir(template_id) / "template.css"
    if not path.is_file():
        raise HTTPException(status_code=404)
    return FileResponse(path, media_type="text/css")


@app.get("/api/template.css")
def serve_template_css():
    path = BASE_DIR / "template.css"
    if not path.is_file():
        raise HTTPException(status_code=404)
    return FileResponse(path, media_type="text/css")


@app.get("/api/assets/{filename:path}")
def serve_assets(filename: str):
    assets_dir = (BASE_DIR / "assets").resolve()
    path = (assets_dir / filename).resolve()
    if not str(path).startswith(str(assets_dir)) or not path.is_file():
        raise HTTPException(status_code=404)
    return FileResponse(path)


# --- Prometheus /metrics (protected) ---
@app.get("/metrics")
def metrics(request: Request):
    if METRICS_AUTH_TOKEN:
        token = (request.headers.get("Authorization") or "").removeprefix("Bearer ").strip()
        if token != METRICS_AUTH_TOKEN:
            raise HTTPException(status_code=403, detail="Forbidden")
    REQUEST_COUNT.labels(method="GET", endpoint="/metrics").inc()
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
