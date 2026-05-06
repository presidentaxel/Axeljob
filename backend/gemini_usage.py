"""
Suivi des tokens Gemini par requête et par compte (Supabase).
Limite par compte = GEMINI_BUDGET_EUR (défaut 10 €) ; dépassement = blocage soft (message générique, pas "tokens").
"""

from __future__ import annotations

from typing import Any

from backend.db import check_gemini_budget, record_gemini_usage


def usage_from_response(response: Any) -> tuple[int, int]:
    """Extrait (input_tokens, output_tokens) depuis la réponse Gemini (usage_metadata)."""
    usage = getattr(response, "usage_metadata", None)
    if not usage:
        return 0, 0
    inp = (
        getattr(usage, "prompt_token_count", None) or getattr(usage, "input_token_count", None) or 0
    )
    out = (
        getattr(usage, "candidates_token_count", None)
        or getattr(usage, "output_token_count", None)
        or getattr(usage, "total_token_count", None)
        or 0
    )
    if hasattr(inp, "__int__"):
        inp = int(inp)
    if hasattr(out, "__int__"):
        out = int(out)
    return inp, out


def record_and_check(
    user_id: str | None,
    operation: str,
    response: Any,
) -> None:
    """Enregistre l'usage de la réponse et ne fait rien d'autre (check fait côté appelant avant l'appel)."""
    inp, out = usage_from_response(response)
    if inp or out:
        record_gemini_usage(user_id, operation, inp, out)


class GeminiQuotaExceeded(Exception):
    """Levée quand le compte a dépassé le budget Gemini (limite €). À convertir en 429 côté API."""


def ensure_budget(user_id: str | None) -> None:
    """
    Vérifie que le compte est sous la limite budget Gemini.
    Lève GeminiQuotaExceeded si dépassement (à convertir en HTTP 429 côté FastAPI).
    À appeler avant chaque appel Gemini.
    """
    allowed, _used_usd, _limit_usd = check_gemini_budget(user_id)
    if not allowed:
        raise GeminiQuotaExceeded()
