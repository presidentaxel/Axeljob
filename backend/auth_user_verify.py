"""
Vérifie que l’utilisateur Auth existe encore dans Supabase (compte non supprimé).

Le JWT peut rester valide un court moment après suppression : on contrôle auth.users
(PG direct si dispo, sinon API Admin) avec un cache TTL pour limiter la charge.
"""
from __future__ import annotations

import logging
import os
import threading
import time

from fastapi import HTTPException

from backend.config import USE_SUPABASE, USE_SUPABASE_PG

logger = logging.getLogger(__name__)

_lock = threading.Lock()
# uid -> monotonic time until which we trust "user exists"
_positive_cache: dict[str, float] = {}


def _cache_ttl_sec() -> float:
    try:
        return max(0.0, float(os.environ.get("AUTH_USER_EXIST_CACHE_TTL_SEC", "45")))
    except ValueError:
        return 45.0


def _exists_via_pg(uid: str) -> bool | None:
    if not USE_SUPABASE_PG:
        return None
    try:
        from backend import supabase_pg as spg

        return spg.auth_user_id_exists(uid)
    except Exception as e:
        logger.warning("auth_user verify PG failed: %s", e)
        return None


def _exists_via_rest(uid: str) -> bool:
    from backend.db import _get_supabase

    sb = _get_supabase()
    if not sb:
        return True
    try:
        from gotrue.errors import AuthApiError

        resp = sb.auth.admin.get_user_by_id(uid)
        user = getattr(resp, "user", None) if resp is not None else None
        return user is not None
    except AuthApiError as e:
        st = getattr(e, "status", None)
        if st == 404:
            return False
        logger.warning("auth admin get_user_by_id: status=%s %s", st, e)
        return True
    except Exception as e:
        logger.warning("auth admin get_user_by_id failed: %s", e)
        return True


def auth_user_still_exists(uid: str) -> bool:
    """True si le compte existe (ou si la vérif est temporairement impossible, on laisse passer)."""
    pg = _exists_via_pg(uid)
    if pg is not None:
        return pg
    return _exists_via_rest(uid)


def ensure_supabase_user_still_exists(user_id: str) -> None:
    """Lève 401 si le compte a été supprimé côté Supabase Auth."""
    if not USE_SUPABASE or not user_id:
        return
    ttl = _cache_ttl_sec()
    now = time.monotonic()
    with _lock:
        exp = _positive_cache.get(user_id)
        if ttl > 0 and exp is not None and exp > now:
            return
    if not auth_user_still_exists(user_id):
        with _lock:
            _positive_cache.pop(user_id, None)
        raise HTTPException(
            status_code=401,
            detail="Ce compte n’existe plus. Déconnecte-toi ou crée un nouveau compte.",
        )
    if ttl > 0:
        with _lock:
            _positive_cache[user_id] = now + ttl
