"""
Aide à la libération mémoire après les pics (PDF, imports lourds).

Sous Linux/glibc, `malloc_trim(0)` rend les arenas vides à l'OS : sans ça, Python conserve
des centaines de Mo de heap fragmenté après un export PDF Chromium / WeasyPrint.

No-op sous Windows / macOS et si la libc n'est pas trouvée. Sûr à appeler souvent.
"""

from __future__ import annotations

import logging
import os
import sys
import threading

_log = logging.getLogger("cv_bot.mem")

_lock = threading.Lock()
_malloc_trim_fn = None
_resolved = False


def _resolve_malloc_trim():
    """Charge libc.malloc_trim une seule fois. None si indisponible (Windows, musl, etc.)."""
    global _malloc_trim_fn, _resolved
    if _resolved:
        return _malloc_trim_fn
    _resolved = True
    if sys.platform != "linux":
        return None
    try:
        import ctypes
        import ctypes.util

        libc_path = ctypes.util.find_library("c") or "libc.so.6"
        libc = ctypes.CDLL(libc_path, use_errno=False)
        fn = getattr(libc, "malloc_trim", None)
        if fn is None:
            return None
        fn.argtypes = [ctypes.c_size_t]
        fn.restype = ctypes.c_int
        _malloc_trim_fn = fn
    except Exception as e:
        _log.debug("malloc_trim indisponible (%s)", e)
        _malloc_trim_fn = None
    return _malloc_trim_fn


def release_unused_memory(reason: str = "") -> bool:
    """
    Force glibc à rendre les pages libres au noyau. Retourne True si effectif.

    À appeler après une opération qui a alloué/libéré beaucoup de mémoire (export PDF,
    parsing PDF, gros JSON). Sans coût mesurable hors Linux.
    """
    fn = _resolve_malloc_trim()
    if fn is None:
        return False
    try:
        with _lock:
            ret = fn(0)
        if reason and os.environ.get("CV_BOT_MEM_TRIM_LOG", "").strip().lower() in (
            "1",
            "true",
            "yes",
        ):
            _log.info("malloc_trim(0)=%s reason=%s", ret, reason)
        return True
    except Exception as e:
        _log.debug("malloc_trim call failed: %s", e)
        return False
