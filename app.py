#!/usr/bin/env python3
"""
Backend Flask : affiche le CV (toujours à partir de cv_base.json), reçoit l'annonce,
applique les tweaks (resume + bullet_points + mots_cles_cache) via Gemini.
Les tweaks sont stockés dans adaptations/ ; cv_base.json n'est jamais modifié.
"""

import json
import hashlib
import os
from pathlib import Path
from datetime import datetime

from flask import Flask, request, jsonify, send_file, send_from_directory
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

# Windows + WeasyPrint : mettre les DLL Pango/GTK dans le PATH avant tout import
if os.name == "nt":
    dll_dirs = os.environ.get("WEASYPRINT_DLL_DIRECTORIES", "").strip()
    if dll_dirs:
        for dir_path in dll_dirs.replace(",", ";").split(";"):
            dir_path = os.path.abspath(dir_path.strip())
            if dir_path and os.path.isdir(dir_path):
                os.environ["PATH"] = dir_path + os.pathsep + os.environ.get("PATH", "")

BASE_DIR = Path(__file__).resolve().parent
CV_BASE_PATH = BASE_DIR / "cv_base.json"
ADAPTATIONS_DIR = BASE_DIR / "adaptations"

app = Flask(__name__, static_folder="static", static_url_path="")


def _load_cv_base() -> dict:
    if not CV_BASE_PATH.exists():
        raise FileNotFoundError("cv_base.json introuvable. Lance d'abord : python main.py --setup")
    with open(CV_BASE_PATH, encoding="utf-8") as f:
        return json.load(f)


def _apply_tweaks(cv_base: dict, tweaks: dict) -> dict:
    """Fusionne cv_base avec les tweaks. Ne modifie pas cv_base."""
    from adapter import apply_tweaks_to_cv
    return apply_tweaks_to_cv(cv_base, tweaks)


STATUTS_CANDIDATURE = (
    "candidature_envoyee",
    "reponse_recue",
    "interview",
    "refus",
)


def _save_adaptation(adaptation_id: str, payload: dict) -> Path:
    """Sauvegarde une adaptation dans adaptations/<id>.json. Ne touche jamais cv_base.json."""
    ADAPTATIONS_DIR.mkdir(parents=True, exist_ok=True)
    path = ADAPTATIONS_DIR / f"{adaptation_id}.json"
    payload.setdefault("statut", "candidature_envoyee")
    payload.setdefault("archived", False)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    return path


def _adaptation_id_from_description(description: str) -> str:
    """Identifiant unique pour une adaptation (hash du texte + timestamp court)."""
    h = hashlib.sha256(description.strip().encode("utf-8")).hexdigest()[:12]
    ts = datetime.utcnow().strftime("%Y%m%d%H%M")
    return f"{ts}_{h}"


def _diff_highlight_html(base: str, current: str) -> str:
    """Retourne le texte 'current' en HTML : seules les parties différentes de 'base' sont dans <span class="cv-changed"> (diff par mot)."""
    import html
    from difflib import SequenceMatcher
    base = (base or "").strip()
    current = (current or "").strip()
    if base == current:
        return html.escape(current)
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
        escaped = html.escape(text)
        if tag == "equal":
            out.append(escaped)
        else:
            out.append(f'<span class="cv-changed">{escaped}</span>')
    return " ".join(out)


def _render_cv_html(cv: dict, base_cv: dict | None = None, highlight_changes: bool = False, for_preview: bool = False) -> str:
    """Rend le template avec les données CV. Si base_cv + highlight_changes, surligne uniquement les différences exactes (diff caractère). for_preview=True affiche les mots-clés ATS en noir dans l'aperçu."""
    import html
    from jinja2 import Environment, FileSystemLoader, select_autoescape
    from photo_assets import ensure_compressed_photo, get_photo_url_for_cv

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
        ctx["titre_professionnel_display"] = html.escape((cv.get("titre_professionnel") or "").strip())
        ctx["resume_display"] = html.escape((cv.get("resume") or "").strip())

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
                "html": _diff_highlight_html(base_b, b) if highlight_changes and base_cv else html.escape(b),
            })
        experiences_for_display.append({**exp, "bullet_points": bullets_with_hl})
    ctx["experiences_for_display"] = experiences_for_display

    env = Environment(
        loader=FileSystemLoader(str(BASE_DIR)),
        autoescape=select_autoescape(("html", "xml")),
    )
    template = env.get_template("template.html")
    html = template.render(**ctx)
    html = html.replace('href="template.css"', 'href="/template.css"')
    if 'src="assets/' in html:
        html = html.replace('src="assets/', 'src="/assets/')
    return html


def _offre_from_description(description: str, titre: str = "", entreprise: str = "") -> dict:
    """Construit un dict offre à partir du texte de la fiche de poste (dépôt manuel, pas de scraping)."""
    from mots_cles import offre_from_description
    return offre_from_description(description or "", titre=titre, entreprise=entreprise)


@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/template.css")
def serve_css():
    return send_from_directory(BASE_DIR, "template.css", mimetype="text/css")


@app.route("/assets/<path:filename>")
def serve_assets(filename):
    return send_from_directory(BASE_DIR / "assets", filename)


@app.route("/api/cv", methods=["GET"])
def api_cv():
    """Retourne le CV de base (cv_base.json)."""
    try:
        cv = _load_cv_base()
        return jsonify(cv)
    except FileNotFoundError as e:
        return jsonify({"error": str(e)}), 404


@app.route("/api/cv/preview", methods=["GET"])
def api_cv_preview():
    """Retourne le HTML du CV actuel pour affichage dans l'iframe. Crée photo_cv.jpg si besoin."""
    try:
        cv = _load_cv_base()
        from photo_assets import ensure_compressed_photo
        ensure_compressed_photo(BASE_DIR, cv.get("photo_url"), cv.get("prenom"), cv.get("nom"))
        html = _render_cv_html(cv)
        return html
    except FileNotFoundError as e:
        return str(e), 404


@app.route("/api/render-html", methods=["POST"])
def api_render_html():
    """Rend un CV (JSON en body) en HTML. Body : { "cv": { ... }, "base_cv": { ... }, "highlight_changes": true }.
    Si base_cv et highlight_changes=true, surligne en vert clair les parties modifiées (aperçu uniquement)."""
    data = request.get_json() or {}
    cv = data.get("cv")
    if not cv:
        return jsonify({"error": "Clé 'cv' manquante"}), 400
    base_cv = data.get("base_cv")
    highlight_changes = data.get("highlight_changes") is True
    html = _render_cv_html(cv, base_cv=base_cv, highlight_changes=highlight_changes, for_preview=True)
    return html


@app.route("/api/adapt", methods=["POST"])
def api_adapt():
    """
    Reçoit l'annonce en texte. Part toujours de cv_base (jamais modifié).
    Gemini retourne uniquement les tweaks (resume, bullet_points, mots_cles_cache).
    On fusionne tweaks + cv_base pour l'affichage/PDF, et on sauvegarde les tweaks dans adaptations/.
    Body : { "description": "texte de l'annonce" }
    """
    data = request.get_json() or {}
    description = data.get("description", "").strip()
    if not description:
        return jsonify({"error": "Collez l'annonce dans le champ 'description'"}), 400

    try:
        cv_base = _load_cv_base()
    except FileNotFoundError as e:
        return jsonify({"error": str(e)}), 404

    offre = _offre_from_description(description)

    from rules import appliquer_regles
    cv_enrichi = appliquer_regles(cv_base, offre)
    rapport = cv_enrichi.get("rapport", {})

    from adapter import adapter_cv
    try:
        tweaks = adapter_cv(cv_base, offre, rapport=rapport)
    except Exception as e:
        return jsonify({"error": f"Adaptation Gemini : {e}"}), 500

    merged = _apply_tweaks(cv_base, tweaks)
    adaptation_id = _adaptation_id_from_description(description)
    _save_adaptation(adaptation_id, {
        "resume": tweaks.get("resume"),
        "experiences": tweaks.get("experiences", []),
        "mots_cles_cache": tweaks.get("mots_cles_cache", ""),
        "poste_offre": tweaks.get("poste_offre", ""),
        "rapport": rapport,
        "description_preview": description[:200] + "..." if len(description) > 200 else description,
        "statut": "candidature_envoyee",
        "archived": False,
    })

    return jsonify({
        "cv": merged,
        "rapport": rapport,
        "tweaks": tweaks,
        "adaptation_id": adaptation_id,
    })


@app.route("/api/pdf", methods=["POST"])
def api_pdf():
    """
    Génère le PDF du CV envoyé en body et le renvoie en téléchargement.
    Body : { "cv": { ... }, "titre": "...", "entreprise": "..." } (titre/entreprise optionnels pour le nom du fichier)
    """
    data = request.get_json() or {}
    cv = data.get("cv")
    if not cv:
        return jsonify({"error": "Clé 'cv' manquante"}), 400

    offre = {
        "titre": data.get("titre", ""),
        "entreprise": data.get("entreprise", ""),
    }

    try:
        from generator import generer_pdf_bytes
        pdf_bytes, filename = generer_pdf_bytes(cv, offre)
    except ImportError as e:
        return jsonify({"error": str(e)}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    from io import BytesIO
    return send_file(
        BytesIO(pdf_bytes),
        mimetype="application/pdf",
        as_attachment=True,
        download_name=filename,
    )


@app.route("/api/export-default-dir", methods=["GET"])
def api_export_default_dir():
    """Retourne le dossier d'export par défaut (pour pré-remplir le champ)."""
    try:
        from export_package import get_export_base_path
        return jsonify({"path": str(get_export_base_path())})
    except Exception:
        return jsonify({"path": ""})


@app.route("/api/export-dossier", methods=["POST"])
def api_export_dossier():
    """
    Crée le dossier 'Entreprise - Poste' dans le dossier fourni (ou défaut env),
    y enregistre : CV PDF, Lettre de motivation PDF, Fiche de poste PDF.
    Body : { "cv", "titre", "entreprise", "description", "dossier": "chemin optionnel" }
    """
    data = request.get_json() or {}
    cv = data.get("cv")
    titre = (data.get("titre") or "").strip()
    entreprise = (data.get("entreprise") or "").strip()
    description = (data.get("description") or "").strip()
    dossier = (data.get("dossier") or "").strip() or None

    if not cv:
        return jsonify({"error": "Clé 'cv' manquante"}), 400
    if not titre:
        return jsonify({"error": "Indiquez l'intitulé du poste"}), 400

    try:
        from export_package import export_dossier
        result = export_dossier(cv, titre, entreprise, description, output_base=dossier)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/export-dossier-zip", methods=["POST"])
def api_export_dossier_zip():
    """
    Génère le dossier candidature (CV + lettre + fiche de poste) en mémoire et renvoie un ZIP.
    Pour usage avec "Parcourir" (File System Access) : le client dézippe dans le dossier choisi.
    Body : { "cv", "titre", "entreprise", "description" }
    """
    data = request.get_json() or {}
    cv = data.get("cv")
    titre = (data.get("titre") or "").strip()
    entreprise = (data.get("entreprise") or "").strip()
    description = (data.get("description") or "").strip()

    if not cv:
        return jsonify({"error": "Clé 'cv' manquante"}), 400
    if not titre:
        return jsonify({"error": "Indiquez l'intitulé du poste"}), 400

    try:
        from export_package import export_dossier_as_zip
        zip_bytes, folder_name, files_created = export_dossier_as_zip(
            cv, titre, entreprise, description
        )
        from io import BytesIO
        return send_file(
            BytesIO(zip_bytes),
            mimetype="application/zip",
            as_attachment=True,
            download_name=f"{folder_name}.zip",
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


def _safe_adaptation_id(adaptation_id: str) -> bool:
    """Vérifie que l'id ne contient que des caractères sûrs (pas de path traversal)."""
    if not adaptation_id or len(adaptation_id) > 80:
        return False
    return all(c.isalnum() or c in "_-" for c in adaptation_id)


@app.route("/api/applications", methods=["GET"])
def api_applications_list():
    """
    Liste toutes les candidatures (fichiers adaptations/*.json).
    Query : ?archived=1 pour inclure les archivées (par défaut masquées).
    """
    include_archived = request.args.get("archived") == "1"
    applications = []
    if not ADAPTATIONS_DIR.is_dir():
        return jsonify(applications)
    for path in sorted(ADAPTATIONS_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
        except (json.JSONDecodeError, OSError):
            continue
        aid = path.stem
        archived = data.get("archived", False)
        if archived and not include_archived:
            continue
        applications.append({
            "id": aid,
            "poste_offre": data.get("poste_offre", ""),
            "poste": data.get("poste", ""),
            "entreprise": data.get("entreprise", ""),
            "description_preview": data.get("description_preview", ""),
            "statut": data.get("statut", "candidature_envoyee"),
            "archived": archived,
            "date": datetime.fromtimestamp(path.stat().st_mtime).strftime("%Y-%m-%d %H:%M"),
        })
    return jsonify(applications)


@app.route("/api/applications/<adaptation_id>", methods=["PATCH"])
def api_application_update(adaptation_id: str):
    """
    Met à jour le statut / archivage / poste / entreprise d'une candidature.
    Body : { "statut"?, "archived"?, "poste"?, "entreprise"? }
    """
    if not _safe_adaptation_id(adaptation_id):
        return jsonify({"error": "Id invalide"}), 400
    path = ADAPTATIONS_DIR / f"{adaptation_id}.json"
    if not path.is_file():
        return jsonify({"error": "Candidature introuvable"}), 404
    data = request.get_json() or {}
    statut = data.get("statut")
    if statut is not None and statut not in STATUTS_CANDIDATURE:
        return jsonify({"error": "Statut invalide"}), 400
    try:
        with open(path, encoding="utf-8") as f:
            payload = json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        return jsonify({"error": str(e)}), 500
    if statut is not None:
        payload["statut"] = statut
    if "archived" in data:
        payload["archived"] = bool(data["archived"])
    if "poste" in data:
        payload["poste"] = (data["poste"] or "").strip()
    if "entreprise" in data:
        payload["entreprise"] = (data["entreprise"] or "").strip()
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
    except OSError as e:
        return jsonify({"error": str(e)}), 500
    return jsonify({"id": adaptation_id, "statut": payload.get("statut"), "archived": payload.get("archived")})


if __name__ == "__main__":
    # use_reloader=False : évite que le serveur redémarre pendant un appel long (ex. /api/adapt + Gemini)
    # sinon watchdog peut détecter des changements (ex. dans site-packages) et couper la requête → ERR_CONNECTION_RESET
    app.run(debug=True, port=5000, use_reloader=False)
