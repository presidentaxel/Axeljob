"""
Logs structurés pour mémoire / analyse : événements en JSON (fichier .jsonl + optionnel Supabase).
Chaque événement : timestamp, event_type, user_id, context.
"""
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from backend.config import (
    BASE_DIR,
    USE_SUPABASE,
    USE_SUPABASE_PG,
    SUPABASE_URL,
    SUPABASE_SERVICE_KEY,
)

LOGS_DIR = BASE_DIR / "logs"

# Types d'événements pour analyse
EVENT_ADAPTATION_STARTED = "adaptation_started"
EVENT_ADAPTATION_COMPLETED = "adaptation_completed"
EVENT_ADAPTATION_FAILED = "adaptation_failed"
EVENT_PDF_GENERATED = "pdf_generated"
EVENT_EXPORT_DOSSIER = "export_dossier"
EVENT_STATUT_CHANGED = "statut_changed"
EVENT_REFUS_REASON_SUBMITTED = "refus_reason_submitted"
EVENT_INTERVIEW_FEEDBACK_SUBMITTED = "interview_feedback_submitted"
EVENT_PROFILE_SAVED = "profile_saved"
EVENT_LOGIN = "login"
EVENT_SOURCE_OFFRE_SUBMITTED = "source_offre_submitted"

# Nouveaux events (mémoire / analyse quantitative)
EVENT_ONBOARDING_METHOD = "onboarding_method_chosen"
EVENT_ONBOARDING_COMPLETED = "onboarding_completed"
EVENT_ONBOARDING_SKIPPED = "onboarding_skipped"
EVENT_PAGE_VIEW = "page_view"
EVENT_JOB_DESCRIPTION_PASTED = "job_description_pasted"
EVENT_CV_MANUALLY_EDITED = "cv_manually_edited"
EVENT_ATS_DETAILS_OPENED = "ats_details_opened"
EVENT_ADAPTATION_RATED = "adaptation_rated"
EVENT_CV_IMPORT = "cv_import"
EVENT_TEMPLATE_CHANGED = "template_changed"


def _anon_user_id(user_id: Optional[str]) -> str:
    """Anonymise user_id pour les logs (hash si besoin pour mémoire)."""
    if not user_id or user_id == "default":
        return "anonymous"
    try:
        import hashlib
        return hashlib.sha256(user_id.encode()).hexdigest()[:16]
    except Exception:
        return "anonymous"


def get_anon_user_id(user_id: Optional[str]) -> str:
    """Même hash que _anon_user_id, pour filtrer les événements à l'export."""
    return _anon_user_id(user_id)


def _ensure_log_dir() -> Path:
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    return LOGS_DIR


def _today_file() -> Path:
    _ensure_log_dir()
    return LOGS_DIR / f"cv_bot_{datetime.now(timezone.utc).strftime('%Y-%m-%d')}.jsonl"


def log_event(
    event_type: str,
    user_id: Optional[str] = None,
    context: Optional[dict[str, Any]] = None,
    session_id: Optional[str] = None,
) -> None:
    """Enregistre un événement en JSON (une ligne) dans logs/cv_bot_YYYY-MM-DD.jsonl."""
    payload = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event_type": event_type,
        "user_id": _anon_user_id(user_id),
        "context": context or {},
    }
    if session_id:
        payload["session_id"] = session_id
    line = json.dumps(payload, ensure_ascii=False) + "\n"
    try:
        with open(_today_file(), "a", encoding="utf-8") as f:
            f.write(line)
    except OSError:
        pass
    # Optionnel : écrire aussi dans Supabase si table events existe
    _log_event_supabase(event_type, user_id, payload.get("context"), session_id)


def _log_event_supabase(
    event_type: str,
    user_id: Optional[str],
    context: Optional[dict],
    session_id: Optional[str],
) -> None:
    if not USE_SUPABASE or not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return
    try:
        from backend.db import _get_supabase
        sb = _get_supabase()
        if not sb:
            return
        row = {
            "event_type": event_type,
            "user_id": _anon_user_id(user_id),
            "context": context or {},
        }
        if session_id:
            row["session_id"] = session_id
        if USE_SUPABASE_PG:
            try:
                from backend import supabase_pg as spg

                spg.insert_event_row(
                    event_type,
                    row["user_id"],
                    row["context"],
                    session_id=session_id,
                )
                return
            except Exception:
                pass
        sb.table("events").insert(row).execute()
    except Exception:
        # Table peut ne pas exister ; on ignore
        pass


def read_events_from_files(date_from: Optional[str] = None, date_to: Optional[str] = None) -> list[dict]:
    """Lit les événements depuis les fichiers .jsonl (pour export). date_from/date_to au format YYYY-MM-DD."""
    events = []
    _ensure_log_dir()
    for path in sorted(LOGS_DIR.glob("cv_bot_*.jsonl")):
        try:
            # cv_bot_2025-03-04.jsonl -> 2025-03-04
            date_str = path.stem.replace("cv_bot_", "")
            if date_from and date_str < date_from:
                continue
            if date_to and date_str > date_to:
                continue
        except Exception:
            continue
        try:
            with open(path, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        events.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue
        except OSError:
            continue
    return events
