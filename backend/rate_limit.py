"""
Rate limiting HTTP par utilisateur (mémoire processus).

Limite les abus sur les endpoints coûteux (adaptation IA, import CV, etc.).

Important pour la prod multi-instances : chaque worker maintient son propre compteur.
Pour une limite globale partagée, utiliser un store commun (ex. Redis) ou un reverse proxy
(nginx limit_req, Cloudflare, etc.).
"""

from __future__ import annotations

import time

from fastapi import HTTPException

_RATE_LIMIT_BUCKETS: dict[str, list[float]] = {}
_RATE_LIMIT_WINDOW = 60
_RATE_LIMIT_MAX_ADAPT = 5
_RATE_LIMIT_MAX_DEFAULT = 30
_RATE_LIMIT_MAX_KEYS = 5000


def check_rate_limit(
    user_id: str | None,
    max_requests: int = _RATE_LIMIT_MAX_DEFAULT,
    *,
    scope: str = "default",
) -> None:
    """Lève HTTP 429 si la fenêtre glissante est dépassée pour cette clé (user + scope)."""
    base = (user_id or "anon").strip() or "anon"
    key = f"{base}\0{scope}"
    now = time.time()
    if key not in _RATE_LIMIT_BUCKETS:
        if len(_RATE_LIMIT_BUCKETS) >= _RATE_LIMIT_MAX_KEYS:
            oldest_key = min(
                _RATE_LIMIT_BUCKETS,
                key=lambda k: _RATE_LIMIT_BUCKETS[k][-1] if _RATE_LIMIT_BUCKETS[k] else 0,
            )
            del _RATE_LIMIT_BUCKETS[oldest_key]
        _RATE_LIMIT_BUCKETS[key] = []
    bucket = _RATE_LIMIT_BUCKETS[key]
    _RATE_LIMIT_BUCKETS[key] = [t for t in bucket if now - t < _RATE_LIMIT_WINDOW]
    if len(_RATE_LIMIT_BUCKETS[key]) >= max_requests:
        raise HTTPException(
            status_code=429, detail="Trop de requêtes. Réessaie dans quelques secondes."
        )
    _RATE_LIMIT_BUCKETS[key].append(now)


def rate_limit_max_adapt() -> int:
    return _RATE_LIMIT_MAX_ADAPT


def rate_limit_max_default() -> int:
    return _RATE_LIMIT_MAX_DEFAULT
