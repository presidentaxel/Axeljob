"""Métriques Prometheus liées à Supabase (repli PG → REST)."""

from prometheus_client import Counter

SUPABASE_PG_FALLBACK_TOTAL = Counter(
    "cv_bot_supabase_pg_fallback_total",
    "Nombre de replis PostgreSQL → client REST (erreur PG ou pool)",
    ["operation"],
)


def inc_pg_fallback(operation: str) -> None:
    try:
        SUPABASE_PG_FALLBACK_TOTAL.labels(operation=operation or "unknown").inc()
    except Exception:
        pass
