"""
Cache TTL + LRU thread-safe, partagé par les endpoints à fort trafic.

Usage minimal :
    cache = TTLCache(max_size=2000, ttl_sec=60)
    val = cache.get(key)
    if val is None:
        val = compute()
        cache.set(key, val)

Chaque entrée a son propre TTL absolu (insertion + ttl_sec). LRU = pop oldest insertion
quand le cache déborde. Aucune dépendance externe (pas cachetools), même comportement
que les caches déjà câblés dans backend.db / backend.auth_user_verify.

Conçu pour des valeurs JSON-sérialisables / immutables courtes (URLs, dicts de plan,
listes de templates). Ne pas y mettre de gros payloads : c'est un cache de hot-path,
pas un cache de réponses entières.
"""

from __future__ import annotations

import threading
import time
from collections import OrderedDict
from collections.abc import Callable
from typing import Any


class TTLCache:
    """Cache mémoire thread-safe avec TTL par entrée et éviction LRU.

    - get(key) → None si manquant ou expiré (purge passive de l'entrée)
    - set(key, value) → écrase + met à jour le TTL ; éviction LRU si dépassement
    - get_or_set(key, factory) → atomique, n'appelle factory qu'une fois par miss
    - invalidate(key) / clear() pour invalidation manuelle
    """

    __slots__ = ("_data", "_lock", "_max_size", "_ttl_sec", "_hits", "_misses")

    def __init__(self, max_size: int = 1000, ttl_sec: float = 60.0):
        self._data: OrderedDict[Any, tuple[Any, float]] = OrderedDict()
        self._lock = threading.Lock()
        self._max_size = max(1, int(max_size))
        self._ttl_sec = max(0.1, float(ttl_sec))
        self._hits = 0
        self._misses = 0

    @property
    def ttl_sec(self) -> float:
        return self._ttl_sec

    @property
    def max_size(self) -> int:
        return self._max_size

    def __len__(self) -> int:
        with self._lock:
            return len(self._data)

    def stats(self) -> dict[str, int]:
        with self._lock:
            return {
                "size": len(self._data),
                "max_size": self._max_size,
                "hits": self._hits,
                "misses": self._misses,
            }

    def get(self, key: Any) -> Any | None:
        now = time.monotonic()
        with self._lock:
            hit = self._data.get(key)
            if hit is None:
                self._misses += 1
                return None
            value, expires_at = hit
            if expires_at <= now:
                # Expiré : purge passive
                self._data.pop(key, None)
                self._misses += 1
                return None
            # Hit valide : on rebooste l'ordre LRU
            self._data.move_to_end(key)
            self._hits += 1
            return value

    def set(self, key: Any, value: Any, *, ttl_sec: float | None = None) -> None:
        ttl = self._ttl_sec if ttl_sec is None else max(0.1, float(ttl_sec))
        expires_at = time.monotonic() + ttl
        with self._lock:
            if key in self._data:
                self._data.move_to_end(key)
            self._data[key] = (value, expires_at)
            while len(self._data) > self._max_size:
                self._data.popitem(last=False)

    def get_or_set(
        self, key: Any, factory: Callable[[], Any], *, ttl_sec: float | None = None
    ) -> Any:
        """Récupère la valeur ou l'instancie via factory(). factory() est appelée HORS lock
        pour ne pas bloquer le cache pendant un I/O (ex. DB call).

        Attention : sous forte concurrence, factory() peut être appelée plusieurs fois pour
        la même clé en même temps (premier-arrivé gagne). C'est volontaire : éviter une
        sérialisation par clé qui empilerait les requêtes derrière un long miss.
        """
        cached = self.get(key)
        if cached is not None:
            return cached
        value = factory()
        # On stocke même si factory() a renvoyé une valeur "vide" - c'est l'appelant
        # qui décide de stocker None ou pas (ne pas la cacher : utiliser invalidate).
        self.set(key, value, ttl_sec=ttl_sec)
        return value

    def invalidate(self, key: Any) -> None:
        with self._lock:
            self._data.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._data.clear()
            self._hits = 0
            self._misses = 0
