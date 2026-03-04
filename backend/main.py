"""
Backend FastAPI : API CV Bot (adapter CV, PDF, export, candidatures).
Sert les métriques Prometheus sur /metrics.
Données : Supabase (cv_base, applications) ou fallback fichiers.
"""
import logging
import sys
import html as html_module
import hashlib

logger = logging.getLogger("cv_bot")
if not logger.handlers:
    h = logging.StreamHandler()
    h.setFormatter(logging.Formatter("%(levelname)s [cv_bot] %(message)s"))
    logger.addHandler(h)
logger.setLevel(logging.INFO)
from datetime import datetime
from io import BytesIO
from pathlib import Path

# Charger .env depuis la racine cv-bot
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

# Importer les modules métier depuis la racine cv-bot
BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST

from backend.config import BASE_DIR as CONFIG_BASE_DIR, API_BASE_URL, SUPABASE_JWT_SECRET, USE_SUPABASE
from backend.db import (
    load_cv_base,
    save_cv_base,
    save_adaptation,
    list_applications,
    get_adaptation,
    update_adaptation,
    upload_photo_to_storage,
)

# Réexporter BASE_DIR pour cohérence (templates, assets)
BASE_DIR = CONFIG_BASE_DIR

app = FastAPI(title="CV Bot API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Prometheus ---
REQUEST_COUNT = Counter("cv_bot_http_requests_total", "Total HTTP requests", ["method", "endpoint"])
REQUEST_LATENCY = Histogram("cv_bot_http_request_duration_seconds", "Request latency", ["endpoint"])
ADAPT_COUNT = Counter("cv_bot_adaptations_total", "Total CV adaptations")
PDF_COUNT = Counter("cv_bot_pdfs_generated_total", "Total PDFs generated")


# --- Modèles request body ---
class AdaptBody(BaseModel):
    description: str = ""

class RenderHtmlBody(BaseModel):
    cv: dict
    base_cv: dict | None = None
    highlight_changes: bool = False

class PdfBody(BaseModel):
    cv: dict
    titre: str = ""
    entreprise: str = ""

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

class ApplicationUpdateBody(BaseModel):
    statut: str | None = None
    archived: bool | None = None
    poste: str | None = None
    entreprise: str | None = None


class FetchLinkedInBody(BaseModel):
    linkedin_access_token: str = ""


class LinkedInChangeItem(BaseModel):
    field: str
    linkedin_value: str | None = None


class ApplyLinkedInBody(BaseModel):
    changes: list[LinkedInChangeItem] = []


STATUTS_CANDIDATURE = ("candidature_envoyee", "reponse_recue", "interview", "refus")


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


def _render_cv_html(cv: dict, base_cv: dict | None = None, highlight_changes: bool = False, for_preview: bool = False) -> str:
    from jinja2 import Environment, FileSystemLoader, select_autoescape
    from photo_assets import ensure_compressed_photo, get_photo_url_for_cv

    if not cv.get("__example__"):
        ensure_compressed_photo(BASE_DIR, cv.get("photo_url"), cv.get("prenom"), cv.get("nom"))
        photo_url = get_photo_url_for_cv(BASE_DIR, cv.get("photo_url"), cv.get("prenom"), cv.get("nom"))
        if photo_url:
            cv = {**cv, "photo_url": photo_url}

    ctx = dict(cv)
    ctx["for_preview"] = for_preview
    base = base_cv or {}
    if highlight_changes and base_cv:
        ctx["titre_professionnel_display"] = _diff_highlight_html(
            (base.get("titre_professionnel") or "").strip(),
            (cv.get("titre_professionnel") or "").strip(),
        )
        ctx["resume_display"] = _diff_highlight_html(
            (base.get("resume") or "").strip(),
            (cv.get("resume") or "").strip(),
        )
    else:
        ctx["titre_professionnel_display"] = html_module.escape((cv.get("titre_professionnel") or "").strip())
        ctx["resume_display"] = html_module.escape((cv.get("resume") or "").strip())

    by_id = {e.get("id"): e for e in (base.get("experiences") or []) if e.get("id")}
    experiences_for_display = []
    for exp in (cv.get("experiences") or [])[:6]:
        bullets_raw = (exp.get("bullet_points") or [])[:2]
        base_bullets = (by_id.get(exp.get("id")) or {}).get("bullet_points") or []
        bullets_with_hl = []
        for j, b in enumerate(bullets_raw):
            base_b = base_bullets[j] if j < len(base_bullets) else ""
            bullets_with_hl.append({
                "text": b,
                "html": _diff_highlight_html(base_b, b) if highlight_changes and base_cv else html_module.escape(b),
            })
        experiences_for_display.append({**exp, "bullet_points": bullets_with_hl})
    ctx["experiences_for_display"] = experiences_for_display

    env = Environment(
        loader=FileSystemLoader(str(BASE_DIR)),
        autoescape=select_autoescape(("html", "xml")),
    )
    template = env.get_template("template.html")
    html_str = template.render(**ctx)
    # URLs relatives → chemins API backend
    html_str = html_str.replace('href="template.css"', 'href="/api/template.css"')
    if 'src="assets/' in html_str:
        html_str = html_str.replace('src="assets/', 'src="/api/assets/')
    # Pour iframe en srcdoc (front sur autre origine) : forcer la base des URLs vers le backend
    base = (API_BASE_URL or "").strip().rstrip("/") or "http://localhost:8000"
    html_str = html_str.replace("<head>", f'<head><base href="{base}/">', 1)
    return html_str


def _offre_from_description(description: str, titre: str = "", entreprise: str = "") -> dict:
    from mots_cles import offre_from_description
    return offre_from_description(description or "", titre=titre, entreprise=entreprise)


def _adaptation_id_from_description(description: str) -> str:
    h = hashlib.sha256(description.strip().encode("utf-8")).hexdigest()[:12]
    ts = datetime.utcnow().strftime("%Y%m%d%H%M")
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
    except Exception:
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
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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
        raise HTTPException(status_code=502, detail=f"Erreur LinkedIn : {e}")
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
        raise HTTPException(status_code=502, detail=f"Erreur LinkedIn : {e}")
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
        raise HTTPException(status_code=502, detail=f"Erreur LinkedIn : {e}")
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
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Image invalide ou illisible : {e}")

    if USE_SUPABASE:
        try:
            photo_url = upload_photo_to_storage(safe_id, image_bytes)
            return {"photo_url": photo_url}
        except Exception as e:
            raise HTTPException(
                status_code=502,
                detail=f"Erreur Supabase Storage : {e}. Crée un bucket public « cv_photos » dans le Dashboard Supabase (Storage).",
            )

    uploads_dir = BASE_DIR / "assets" / UPLOADS_SUBDIR
    uploads_dir.mkdir(parents=True, exist_ok=True)
    dest = uploads_dir / f"{safe_id}.jpg"
    with open(dest, "wb") as f:
        f.write(image_bytes)
    return {"photo_url": f"assets/{UPLOADS_SUBDIR}/{safe_id}.jpg"}


def _render_empty_preview_html() -> str:
    """Aperçu vide pour un utilisateur connecté qui n'a pas encore enregistré de CV dans Supabase."""
    base = (API_BASE_URL or "").strip().rstrip("/") or "http://localhost:8000"
    return f"""<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"/><base href="{base}/"/>
<link rel="stylesheet" href="/api/template.css"/></head>
<body class="cv-preview" style="display:flex;align-items:center;justify-content:center;min-height:200px;padding:2rem;">
<p style="color:var(--muted, #666);text-align:center;">Complète ton profil (onglet Profil) pour voir l'aperçu de ton CV ici.</p>
</body></html>"""


@app.get("/api/cv/preview", response_class=HTMLResponse)
def api_cv_preview(request: Request):
    """Aperçu du CV : exclusivement les données Supabase du compte connecté. Si aucun CV enregistré, message invitant à compléter le profil."""
    REQUEST_COUNT.labels(method="GET", endpoint="/api/cv/preview").inc()
    user_id = _get_user_id(request)
    try:
        cv = load_cv_base(user_id)
        # Utilisateur connecté sans CV enregistré : ne pas afficher le CV d'exemple, uniquement un message
        if user_id and cv.get("__example__"):
            return HTMLResponse(_render_empty_preview_html())
        html = _render_cv_html(cv, for_preview=True)
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
    )
    return HTMLResponse(html)


@app.post("/api/adapt")
def api_adapt(request: Request, body: AdaptBody):
    REQUEST_COUNT.labels(method="POST", endpoint="/api/adapt").inc()
    user_id = _get_user_id(request)
    with REQUEST_LATENCY.labels(endpoint="adapt").time():
        description = (body.description or "").strip()
        if not description:
            raise HTTPException(status_code=400, detail="Collez l'annonce dans le champ 'description'")

        try:
            cv_base = load_cv_base(user_id)
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e))

        offre = _offre_from_description(description)
        from rules import appliquer_regles
        cv_enrichi = appliquer_regles(cv_base, offre)
        rapport = cv_enrichi.get("rapport", {})

        from adapter import adapter_cv
        try:
            tweaks = adapter_cv(cv_base, offre, rapport=rapport)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Adaptation Gemini : {e}")

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
        })
        ADAPT_COUNT.inc()
        return {
            "cv": merged,
            "rapport": rapport,
            "tweaks": tweaks,
            "adaptation_id": adaptation_id,
        }


@app.post("/api/pdf")
def api_pdf(body: PdfBody):
    REQUEST_COUNT.labels(method="POST", endpoint="/api/pdf").inc()
    offre = {"titre": body.titre, "entreprise": body.entreprise}
    try:
        from generator import generer_pdf_bytes
        pdf_bytes, filename = generer_pdf_bytes(body.cv, offre)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    PDF_COUNT.inc()
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
def api_export_dossier(body: ExportDossierBody):
    if not (body.titre or "").strip():
        raise HTTPException(status_code=400, detail="Indiquez l'intitulé du poste")
    try:
        from export_package import export_dossier
        result = export_dossier(body.cv, body.titre, body.entreprise, body.description, output_base=body.dossier or None)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/export-dossier-zip")
def api_export_dossier_zip(body: ExportDossierZipBody):
    if not (body.titre or "").strip():
        raise HTTPException(status_code=400, detail="Indiquez l'intitulé du poste")
    try:
        from export_package import export_dossier_as_zip
        zip_bytes, folder_name, files_created = export_dossier_as_zip(
            body.cv, body.titre, body.entreprise, body.description
        )
        return Response(
            content=zip_bytes,
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{folder_name}.zip"'},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/applications")
def api_applications_list(archived: str = ""):
    include_archived = archived == "1"
    return list_applications(include_archived=include_archived)


@app.patch("/api/applications/{adaptation_id}")
def api_application_update(adaptation_id: str, body: ApplicationUpdateBody):
    if not _safe_adaptation_id(adaptation_id):
        raise HTTPException(status_code=400, detail="Id invalide")
    if body.statut is not None and body.statut not in STATUTS_CANDIDATURE:
        raise HTTPException(status_code=400, detail="Statut invalide")
    payload = update_adaptation(adaptation_id, body.model_dump(exclude_none=True))
    if not payload:
        raise HTTPException(status_code=404, detail="Candidature introuvable")
    return {"id": adaptation_id, "statut": payload.get("statut"), "archived": payload.get("archived")}


@app.get("/api/applications/{adaptation_id}")
def api_application_get(adaptation_id: str):
    """Retourne le payload complet d'une candidature (CV, fiche, lettre si générée)."""
    if not _safe_adaptation_id(adaptation_id):
        raise HTTPException(status_code=400, detail="Id invalide")
    payload = get_adaptation(adaptation_id)
    if not payload:
        raise HTTPException(status_code=404, detail="Candidature introuvable")
    return payload


@app.post("/api/applications/{adaptation_id}/generate-letter")
def api_application_generate_letter(adaptation_id: str):
    """Génère la lettre de motivation (Gemini), la sauvegarde dans la candidature, retourne corps + HTML."""
    if not _safe_adaptation_id(adaptation_id):
        raise HTTPException(status_code=400, detail="Id invalide")
    payload = get_adaptation(adaptation_id)
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
            raise HTTPException(status_code=500, detail=f"Génération lettre : {e}")
        payload["lettre_corps"] = lettre_corps
        save_adaptation(adaptation_id, payload)
    from letter_generator import corps_lettre_to_html
    lettre_html = corps_lettre_to_html(lettre_corps)
    return {"lettre_corps": lettre_corps, "lettre_html": lettre_html}


@app.get("/api/applications/{adaptation_id}/download/cv")
def api_application_download_cv(adaptation_id: str):
    """Télécharge le CV adapté en PDF."""
    if not _safe_adaptation_id(adaptation_id):
        raise HTTPException(status_code=400, detail="Id invalide")
    payload = get_adaptation(adaptation_id)
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
def api_application_download_lettre(adaptation_id: str):
    """Télécharge la lettre de motivation en PDF (génère la lettre si pas encore stockée)."""
    if not _safe_adaptation_id(adaptation_id):
        raise HTTPException(status_code=400, detail="Id invalide")
    payload = get_adaptation(adaptation_id)
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
            raise HTTPException(status_code=500, detail=f"Génération lettre : {e}")
        payload["lettre_corps"] = lettre_corps
        save_adaptation(adaptation_id, payload)
    pdf_bytes, filename = generer_lettre_pdf_bytes_from_corps(full_cv, lettre_corps, poste, entreprise, base_dir=BASE_DIR)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/applications/{adaptation_id}/download/fiche")
def api_application_download_fiche(adaptation_id: str):
    """Télécharge la fiche de poste en PDF."""
    if not _safe_adaptation_id(adaptation_id):
        raise HTTPException(status_code=400, detail="Id invalide")
    payload = get_adaptation(adaptation_id)
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


# --- Logo entreprise (Logo.dev prioritaire, Clearbit en fallback) ---
# Logo.dev : https://www.logo.dev/ — lookup par nom ou domaine, LOGO_DEV_TOKEN dans .env
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
    """Proxy logo entreprise : Logo.dev (par nom si token) puis domaine, puis Clearbit."""
    import os
    from urllib.parse import quote

    company_clean = (company or "").strip()
    if not company_clean:
        raise HTTPException(status_code=400, detail="Paramètre company requis")

    logo_token = (os.environ.get("LOGO_DEV_TOKEN") or os.environ.get("LOGO_DEV_PUBLISHABLE_KEY") or "").strip()
    token_masked = "***" if logo_token else "(absent)"

    logger.info("[company-logo] company=%r LOGO_DEV_TOKEN=%s", company_clean, "set" if logo_token else "absent")

    # 1) Logo.dev lookup par nom (recommandé : Michelin, BPCE Infogérance...)
    if logo_token:
        name_encoded = quote(company_clean, safe="")
        url_name = f"https://img.logo.dev/name/{name_encoded}?token={logo_token}&size=128&format=webp"
        url_log = url_name.replace(logo_token, token_masked)
        content, ct, status = _fetch_logo_from_url(url_name)
        logger.info("[company-logo] Logo.dev name url=%s -> status=%s len=%s", url_log, status, len(content) if content else 0)
        if status == 401:
            logger.warning("[company-logo] Logo.dev 401: utilise la clé PUBLISHABLE (pk_...) pas la secret (sk_). Voir https://www.logo.dev/dashboard")
        if content:
            return Response(content=content, media_type=ct or "image/webp")

    # 2) Logo.dev puis Clearbit par domaine deviné (.com, .fr)
    domain_slug = _company_to_domain(company_clean)
    if domain_slug:
        for ext in (".com", ".fr"):
            full_domain = f"{domain_slug}{ext}"
            if logo_token:
                url_domain = f"https://img.logo.dev/{full_domain}?token={logo_token}&size=128&format=webp"
                url_log = url_domain.replace(logo_token, token_masked)
                content, ct, status = _fetch_logo_from_url(url_domain)
                logger.info("[company-logo] Logo.dev domain url=%s -> status=%s len=%s", url_log, status, len(content) if content else 0)
                if status == 401:
                    logger.warning("[company-logo] Logo.dev 401: utilise la clé PUBLISHABLE (pk_...) pas la secret (sk_). Voir https://www.logo.dev/dashboard")
                if content:
                    return Response(content=content, media_type=ct or "image/webp")
            url_clearbit = f"https://logo.clearbit.com/{full_domain}"
            content, ct, status = _fetch_logo_from_url(url_clearbit)
            logger.info("[company-logo] Clearbit url=%s -> status=%s len=%s", url_clearbit, status, len(content) if content else 0)
            if content:
                return Response(content=content, media_type=ct or "image/png")

    logger.warning("[company-logo] 404 company=%r (toutes tentatives échouées)", company_clean)
    raise HTTPException(status_code=404, detail="Logo non trouvé")


# --- Fichiers statiques (template CSS, assets) pour le preview HTML ---
@app.get("/api/template.css")
def serve_template_css():
    path = BASE_DIR / "template.css"
    if not path.is_file():
        raise HTTPException(status_code=404)
    return FileResponse(path, media_type="text/css")


@app.get("/api/assets/{filename:path}")
def serve_assets(filename: str):
    path = BASE_DIR / "assets" / filename
    if not path.is_file():
        raise HTTPException(status_code=404)
    return FileResponse(path)


# --- Prometheus /metrics ---
@app.get("/metrics")
def metrics():
    REQUEST_COUNT.labels(method="GET", endpoint="/metrics").inc()
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
