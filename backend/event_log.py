"""
Logs structurés pour mémoire / analyse : événements en JSON (fichier .jsonl + optionnel Supabase).
Chaque événement : timestamp, event_type, user_id, context.

Capacité : log_event() est appelée à chaque page view / adaptation / changement de statut.
Pour ne pas pénaliser les requêtes API qui en émettent, on bufferise dans une queue
mémoire et un thread worker daemon écrit en batch (file append + insert Supabase).
Comportement compatible : la signature et l'ordre d'apparition côté lecteur restent
identiques. En cas de saturation (queue pleine), on drop le plus vieux et on logge
un warning - mieux qu'un crash OOM ou un blocage de l'event loop.
"""

import atexit
import json
import logging
import os
import queue
import threading
import time
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from backend.config import (
    BASE_DIR,
    SUPABASE_SERVICE_KEY,
    SUPABASE_URL,
    USE_SUPABASE,
    USE_SUPABASE_PG,
)

_log = logging.getLogger("cv_bot.events")

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
EVENT_PAGE_ENGAGEMENT = "page_engagement"
EVENT_ADAPT_CTA_CLICKED = "adapt_cta_clicked"
EVENT_PROMO_CODE_REDEEMED = "promo_code_redeemed"
EVENT_BASE_CV_PDF_DOWNLOADED = "base_cv_pdf_downloaded"
EVENT_FIRST_OFFER_NUDGE_CTA = "first_offer_nudge_cta"
EVENT_NEW_CANDIDATURE_WORKSPACE = "new_candidature_workspace"


def _anon_user_id(user_id: str | None) -> str:
    """Anonymise user_id pour les logs (hash si besoin pour mémoire)."""
    if not user_id or user_id == "default":
        return "anonymous"
    try:
        import hashlib

        return hashlib.sha256(user_id.encode()).hexdigest()[:16]
    except Exception:
        return "anonymous"


def get_anon_user_id(user_id: str | None) -> str:
    """Même hash que _anon_user_id, pour filtrer les événements à l'export."""
    return _anon_user_id(user_id)


def _ensure_log_dir() -> Path:
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    return LOGS_DIR


def _today_file() -> Path:
    _ensure_log_dir()
    return LOGS_DIR / f"cv_bot_{datetime.now(timezone.utc).strftime('%Y-%m-%d')}.jsonl"


# --- Background writer (fire-and-forget) -----------------------------------


def _event_log_max_queue() -> int:
    try:
        v = int(os.getenv("EVENT_LOG_QUEUE_MAX", "10000"))
    except ValueError:
        v = 10000
    return max(500, min(100000, v))


def _event_log_batch_size() -> int:
    try:
        v = int(os.getenv("EVENT_LOG_BATCH_SIZE", "50"))
    except ValueError:
        v = 50
    return max(1, min(500, v))


def _event_log_batch_wait_sec() -> float:
    try:
        v = float(os.getenv("EVENT_LOG_BATCH_WAIT_SEC", "0.5"))
    except ValueError:
        v = 0.5
    return max(0.05, min(5.0, v))


def _event_log_disabled_async() -> bool:
    """Permet de revenir au mode synchrone (ex. test/debug) via env var."""
    return (os.getenv("EVENT_LOG_SYNC", "") or "").strip().lower() in ("1", "true", "yes")


_event_queue: "queue.Queue[tuple[dict, str | None, str | None, dict | None]]" = queue.Queue(
    maxsize=_event_log_max_queue()
)
_writer_thread: threading.Thread | None = None
_writer_thread_lock = threading.Lock()
_writer_stop = threading.Event()
_drops_total = 0


def _drain_batch(
    max_items: int, max_wait_sec: float
) -> list[tuple[dict, str | None, str | None, dict | None]]:
    """Bloque jusqu'au premier item, puis collecte rapidement jusqu'à `max_items`."""
    items: list[tuple[dict, str | None, str | None, dict | None]] = []
    try:
        first = _event_queue.get(timeout=1.0)
    except queue.Empty:
        return items
    items.append(first)
    deadline = time.monotonic() + max_wait_sec
    while len(items) < max_items and time.monotonic() < deadline:
        try:
            timeout = max(0.0, deadline - time.monotonic())
            it = _event_queue.get(timeout=timeout)
        except queue.Empty:
            break
        items.append(it)
    return items


def _flush_batch_to_disk(items: list[tuple[dict, str | None, str | None, dict | None]]) -> None:
    """Append toutes les lignes du batch en un seul open(). Groupe par fichier de date au cas où on traverse minuit."""
    if not items:
        return
    # Groupe par chemin de fichier (très rare qu'on en ait plusieurs : seulement à minuit UTC).
    by_path: dict[Path, list[str]] = {}
    for payload, _et, _uid, _ctx in items:
        ts = payload.get("timestamp") or ""
        try:
            day = ts[:10]
        except Exception:
            day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        path = LOGS_DIR / f"cv_bot_{day}.jsonl"
        by_path.setdefault(path, []).append(json.dumps(payload, ensure_ascii=False) + "\n")
    _ensure_log_dir()
    for path, lines in by_path.items():
        try:
            with open(path, "a", encoding="utf-8") as f:
                f.writelines(lines)
        except OSError as e:
            _log.warning("event_log file write failed (%s lines): %s", len(lines), e)


def _flush_batch_to_supabase(items: list[tuple[dict, str | None, str | None, dict | None]]) -> None:
    """Insert en batch côté Supabase (PG client préféré, sinon REST). Tolérant aux erreurs."""
    if not items:
        return
    if not USE_SUPABASE or not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return
    # On insère un par un côté PG (la fonction supabase_pg.insert_event_row existe déjà
    # et gère ses propres connexions ; un vrai bulk insert nécessiterait une nouvelle
    # API. Pour l'instant le gain principal est déjà l'absence de blocage de l'event loop).
    if USE_SUPABASE_PG:
        try:
            from backend import supabase_pg as spg

            for payload, et, uid, ctx in items:
                try:
                    spg.insert_event_row(
                        et,
                        payload.get("user_id"),
                        ctx or {},
                        session_id=payload.get("session_id"),
                    )
                except Exception as e:
                    _log.debug("event_log supabase_pg insert failed: %s", e)
            return
        except Exception as e:
            _log.debug("event_log supabase_pg unavailable, falling back to REST: %s", e)
    try:
        from backend.db import _get_supabase

        sb = _get_supabase()
        if not sb:
            return
        rows = []
        for payload, et, uid, ctx in items:
            row = {
                "event_type": et,
                "user_id": payload.get("user_id"),
                "context": ctx or {},
            }
            if payload.get("session_id"):
                row["session_id"] = payload["session_id"]
            rows.append(row)
        try:
            sb.table("events").insert(rows).execute()
        except Exception as e:
            _log.debug("event_log supabase REST batch insert failed: %s", e)
    except Exception:
        pass


def _writer_loop() -> None:
    batch_size = _event_log_batch_size()
    batch_wait = _event_log_batch_wait_sec()
    while not _writer_stop.is_set():
        items = _drain_batch(batch_size, batch_wait)
        if not items:
            continue
        try:
            _flush_batch_to_disk(items)
        except Exception as e:
            _log.warning("event_log flush_to_disk failed: %s", e)
        try:
            _flush_batch_to_supabase(items)
        except Exception as e:
            _log.debug("event_log flush_to_supabase failed: %s", e)


def _ensure_writer_started() -> None:
    global _writer_thread
    if _writer_thread is not None and _writer_thread.is_alive():
        return
    with _writer_thread_lock:
        if _writer_thread is not None and _writer_thread.is_alive():
            return
        _writer_thread = threading.Thread(target=_writer_loop, name="event-log-writer", daemon=True)
        _writer_thread.start()


def _shutdown_writer(timeout_sec: float = 3.0) -> None:
    """Vide la queue et joint le worker. Appelé via atexit + on_event('shutdown')."""
    _writer_stop.set()
    # Drain ce qu'il reste de façon synchrone pour ne pas perdre d'événements.
    items: list[tuple[dict, str | None, str | None, dict | None]] = []
    while True:
        try:
            items.append(_event_queue.get_nowait())
        except queue.Empty:
            break
        if len(items) >= 2000:
            try:
                _flush_batch_to_disk(items)
                _flush_batch_to_supabase(items)
            except Exception:
                pass
            items = []
    if items:
        try:
            _flush_batch_to_disk(items)
            _flush_batch_to_supabase(items)
        except Exception:
            pass
    if _writer_thread is not None and _writer_thread.is_alive():
        try:
            _writer_thread.join(timeout=timeout_sec)
        except Exception:
            pass


atexit.register(_shutdown_writer)


def event_log_stats() -> dict[str, int]:
    return {
        "queue_size": _event_queue.qsize(),
        "queue_max": _event_queue.maxsize,
        "drops_total": _drops_total,
        "writer_alive": int(bool(_writer_thread and _writer_thread.is_alive())),
    }


def log_event(
    event_type: str,
    user_id: str | None = None,
    context: dict[str, Any] | None = None,
    session_id: str | None = None,
) -> None:
    """Enregistre un événement en JSON (fichier .jsonl + Supabase si dispo).

    Asynchrone par défaut : enqueue + worker thread écrit en batch. Tombe en mode
    synchrone si EVENT_LOG_SYNC=1 ou si la queue est saturée et que le drop n'est pas
    acceptable (ici on drop plutôt que de bloquer l'API → le compteur _drops_total
    permet de monitorer si la queue est sous-dimensionnée).
    """
    payload = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event_type": event_type,
        "user_id": _anon_user_id(user_id),
        "context": context or {},
    }
    if session_id:
        payload["session_id"] = session_id

    if _event_log_disabled_async():
        # Mode legacy/synchrone : utile en debug si on veut vérifier l'écriture immédiate.
        line = json.dumps(payload, ensure_ascii=False) + "\n"
        try:
            with open(_today_file(), "a", encoding="utf-8") as f:
                f.write(line)
        except OSError:
            pass
        _log_event_supabase(event_type, user_id, payload.get("context"), session_id)
        return

    _ensure_writer_started()
    item = (payload, event_type, user_id, payload.get("context"))
    try:
        _event_queue.put_nowait(item)
    except queue.Full:
        # Stratégie : drop le plus vieux (moins critique que les nouveaux events) puis push.
        global _drops_total
        try:
            _event_queue.get_nowait()
            _drops_total += 1
            _event_queue.put_nowait(item)
            if _drops_total in (1, 10, 100, 1000) or _drops_total % 1000 == 0:
                _log.warning(
                    "event_log queue full, dropped %s events total (qsize=%s, max=%s)",
                    _drops_total,
                    _event_queue.qsize(),
                    _event_queue.maxsize,
                )
        except Exception:
            pass


def _log_event_supabase(
    event_type: str,
    user_id: str | None,
    context: dict | None,
    session_id: str | None,
) -> None:
    """Conservé pour le mode synchrone EVENT_LOG_SYNC=1 et pour compat externe."""
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
        pass


def read_events_from_files(date_from: str | None = None, date_to: str | None = None) -> list[dict]:
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


def aggregate_events_from_files(days: int = 7, max_lines: int = 50000) -> dict[str, Any]:
    """
    Agrège les événements des fichiers .jsonl sur les N derniers jours (tous utilisateurs).
    Utilisé par le tableau de bord admin ; limite le volume lu pour éviter les pics mémoire.
    """
    days = max(1, min(int(days), 90))
    max_lines = max(100, min(int(max_lines), 200000))
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
    counts: Counter[str] = Counter()
    unique_users: set[str] = set()
    total = 0
    truncated = False
    _ensure_log_dir()
    for path in sorted(LOGS_DIR.glob("cv_bot_*.jsonl")):
        try:
            date_str = path.stem.replace("cv_bot_", "")
            if date_str < cutoff:
                continue
        except Exception:
            continue
        try:
            with open(path, encoding="utf-8") as f:
                for line in f:
                    if total >= max_lines:
                        truncated = True
                        break
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        row = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    et = row.get("event_type") or "unknown"
                    counts[et] += 1
                    uid = row.get("user_id")
                    if uid:
                        unique_users.add(uid)
                    total += 1
        except OSError:
            continue
        if truncated:
            break
    by_type = dict(counts.most_common(80))
    return {
        "period_days": days,
        "events_total": total,
        "unique_anon_users": len(unique_users),
        "by_type": by_type,
        "truncated": truncated,
        "source": "jsonl_files",
    }
