"""
Accès direct PostgreSQL à Supabase (contourne PostgREST / client HTTP).

Plus rapide et moins de surcharge JSON/HTTP par requête. Le Storage et Auth Admin
restent sur le client Supabase (API).

Configurer SUPABASE_DATABASE_URL (URI depuis Dashboard > Project Settings > Database).
En cas d'erreur réseau/DB, db.py retombe sur le client supabase-py (REST).
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any, Optional

logger = logging.getLogger(__name__)

_pool = None


def is_configured() -> bool:
    from backend.config import SUPABASE_DATABASE_URL, USE_SUPABASE

    return bool(USE_SUPABASE and SUPABASE_DATABASE_URL)


def get_pool():
    """Pool psycopg (lazy). Une instance par processus worker."""
    global _pool
    if _pool is not None:
        return _pool
    if not is_configured():
        return None
    from backend.config import SUPABASE_DATABASE_URL, supabase_pg_pool_max
    from psycopg_pool import ConnectionPool

    _pool = ConnectionPool(
        conninfo=SUPABASE_DATABASE_URL,
        min_size=1,
        max_size=supabase_pg_pool_max(),
        kwargs={
            "connect_timeout": int(os.environ.get("SUPABASE_PG_CONNECT_TIMEOUT", "10")),
            "options": "-c statement_timeout=30000",  # 30s max par statement
        },
        open=True,
        name="cv_bot_supabase",
    )
    return _pool


def insert_event_row(
    event_type: str,
    user_id: Optional[str],
    context: dict,
    session_id: Optional[str] = None,
) -> None:
    """Insère une ligne dans public.events (logs analytiques)."""
    from psycopg.types.json import Json

    pool = get_pool()
    if not pool:
        raise RuntimeError("Pool PG indisponible")

    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO public.events (event_type, user_id, session_id, context)
                VALUES (%s, %s, %s, %s::jsonb)
                """,
                (event_type, user_id, session_id, Json(context or {})),
            )


def count_auth_users() -> Optional[int]:
    """Nombre de comptes Supabase Auth (auth.users). None si PG indisponible ou erreur."""
    pool = get_pool()
    if not pool:
        return None
    try:
        with pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT count(*)::bigint FROM auth.users")
                row = cur.fetchone()
        if row is None:
            return None
        return int(row[0])
    except Exception as e:
        logger.warning("count_auth_users failed: %s", e)
        return None


def auth_user_id_exists(uid: str) -> Optional[bool]:
    """
    True si une ligne auth.users existe pour cet id, False sinon.
    None si pool PG indisponible ou erreur (l’appelant peut retenter via REST).
    """
    if not uid or not uid.strip():
        return False
    pool = get_pool()
    if not pool:
        return None
    try:
        with pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1 FROM auth.users WHERE id = %s::uuid LIMIT 1", (uid.strip(),))
                return cur.fetchone() is not None
    except Exception as e:
        logger.warning("auth_user_id_exists failed: %s", e)
        return None


def aggregate_events_recent_days(days: int = 7) -> Optional[dict[str, Any]]:
    """
    Compte les lignes public.events par type sur les N derniers jours (requête admin).
    Retourne None si le pool PG n'est pas configuré ou en cas d'erreur.
    """
    days = max(1, min(int(days), 90))
    pool = get_pool()
    if not pool:
        return None
    from psycopg.rows import dict_row

    try:
        with pool.connection() as conn:
            with conn.cursor(row_factory=dict_row) as cur:
                cur.execute(
                    """
                    SELECT event_type, COUNT(*)::bigint AS n
                    FROM public.events
                    WHERE created_at >= NOW() - (%s * INTERVAL '1 day')
                    GROUP BY event_type
                    ORDER BY n DESC
                    """,
                    (days,),
                )
                rows = cur.fetchall()
                cur.execute(
                    """
                    SELECT COUNT(*)::bigint AS n FROM public.events
                    WHERE created_at >= NOW() - (%s * INTERVAL '1 day')
                    """,
                    (days,),
                )
                total_row = cur.fetchone()
                cur.execute(
                    """
                    SELECT COUNT(DISTINCT user_id)::bigint AS n FROM public.events
                    WHERE created_at >= NOW() - (%s * INTERVAL '1 day')
                      AND user_id IS NOT NULL AND user_id != ''
                    """,
                    (days,),
                )
                distinct_row = cur.fetchone()
    except Exception as e:
        logger.warning("aggregate_events_recent_days failed: %s", e)
        return None

    by_type = {r["event_type"]: int(r["n"]) for r in rows}
    total = int(total_row["n"]) if total_row else 0
    distinct_users = int(distinct_row["n"]) if distinct_row else 0
    return {
        "period_days": days,
        "events_total": total,
        "unique_anon_users": distinct_users,
        "by_type": by_type,
        "truncated": False,
        "source": "supabase_pg",
    }


def close_pool() -> None:
    """Fermeture propre (tests / shutdown)."""
    global _pool
    if _pool is not None:
        try:
            _pool.close()
        except Exception:
            pass
        _pool = None


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# --- cv_base ---


def load_cv_base_data(row_id: str) -> Any:
    """
    Retourne le dict `data` si la ligne existe et data est non vide, sinon None.
    (Le caller db.py gère default vs user comme le chemin REST.)
    """
    pool = get_pool()
    if not pool:
        return None
    from psycopg.rows import dict_row

    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                "SELECT data FROM public.cv_base WHERE id = %s LIMIT 1",
                (row_id,),
            )
            row = cur.fetchone()
    if not row:
        return None
    data = row.get("data")
    if data is None:
        return None
    return data


def upsert_cv_base(row_id: str, data: dict, updated_at_iso: str) -> None:
    from psycopg.types.json import Json

    pool = get_pool()
    if not pool:
        raise RuntimeError("Pool PG indisponible")

    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO public.cv_base (id, data, updated_at)
                VALUES (%s, %s::jsonb, %s::timestamptz)
                ON CONFLICT (id) DO UPDATE SET
                    data = EXCLUDED.data,
                    updated_at = EXCLUDED.updated_at
                """,
                (row_id, Json(data), updated_at_iso),
            )


# --- applications ---


def upsert_application(
    adaptation_id: str, uid: str, payload: dict, updated_at_iso: str
) -> None:
    from psycopg.types.json import Json

    pool = get_pool()
    if not pool:
        raise RuntimeError("Pool PG indisponible")

    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO public.applications (id, user_id, payload, updated_at)
                VALUES (%s, %s, %s::jsonb, %s::timestamptz)
                ON CONFLICT (id) DO UPDATE SET
                    user_id = EXCLUDED.user_id,
                    payload = EXCLUDED.payload,
                    updated_at = EXCLUDED.updated_at
                """,
                (adaptation_id, uid, Json(payload), updated_at_iso),
            )


def list_application_rows(uid: str) -> list[dict]:
    pool = get_pool()
    if not pool:
        return []
    from psycopg.rows import dict_row

    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                SELECT id, payload, updated_at, user_id
                FROM public.applications
                WHERE user_id = %s
                ORDER BY updated_at DESC
                """,
                (uid,),
            )
            return list(cur.fetchall() or [])


def get_application_row(adaptation_id: str) -> Optional[dict]:
    pool = get_pool()
    if not pool:
        return None
    from psycopg.rows import dict_row

    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                SELECT payload, user_id
                FROM public.applications
                WHERE id = %s
                LIMIT 1
                """,
                (adaptation_id,),
            )
            return cur.fetchone()


def count_applications_for_user(uid: str) -> int:
    pool = get_pool()
    if not pool:
        return 0

    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*)::int FROM public.applications WHERE user_id = %s",
                (uid,),
            )
            row = cur.fetchone()
            return int(row[0]) if row else 0


# --- user_plans ---


def get_user_plan_row(uid: str) -> Optional[tuple[str, Optional[bool], int, int]]:
    """Retourne (plan, paywall_disabled, free_adaptation_bonus, free_adaptation_count_anchor) ou None."""
    pool = get_pool()
    if not pool:
        return None
    from psycopg.rows import dict_row

    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                SELECT plan, paywall_disabled, free_adaptation_bonus, free_adaptation_count_anchor
                FROM public.user_plans
                WHERE user_id = %s
                LIMIT 1
                """,
                (uid,),
            )
            row = cur.fetchone()
    if not row:
        return None
    raw_bonus = row.get("free_adaptation_bonus")
    try:
        bonus = max(0, int(raw_bonus or 0))
    except (TypeError, ValueError):
        bonus = 0
    raw_anchor = row.get("free_adaptation_count_anchor")
    try:
        anchor = max(0, int(raw_anchor or 0))
    except (TypeError, ValueError):
        anchor = 0
    return (row.get("plan") or "free", row.get("paywall_disabled"), bonus, anchor)


def get_user_plan_stripe_fields(uid: str) -> Optional[dict]:
    """Stripe IDs enregistrés pour l'utilisateur (ou None si pas de ligne)."""
    pool = get_pool()
    if not pool:
        return None
    from psycopg.rows import dict_row

    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                SELECT stripe_customer_id, stripe_subscription_id
                FROM public.user_plans
                WHERE user_id = %s
                LIMIT 1
                """,
                (uid,),
            )
            row = cur.fetchone()
    return row


def find_user_id_by_stripe_subscription_id(subscription_id: str) -> Optional[str]:
    """Retourne user_id pour un subscription_id Stripe (webhook deleted)."""
    sid = (subscription_id or "").strip()
    if not sid:
        return None
    pool = get_pool()
    if not pool:
        return None
    from psycopg.rows import dict_row

    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                SELECT user_id
                FROM public.user_plans
                WHERE stripe_subscription_id = %s
                LIMIT 1
                """,
                (sid,),
            )
            row = cur.fetchone()
    if not row:
        return None
    uid = row.get("user_id")
    return str(uid).strip() if uid else None


def upsert_user_plan(
    uid: str,
    plan: str,
    updated_at_iso: str,
    stripe_customer_id: Optional[str] = None,
    stripe_subscription_id: Optional[str] = None,
) -> None:
    pool = get_pool()
    if not pool:
        raise RuntimeError("Pool PG indisponible")

    with pool.connection() as conn:
        with conn.cursor() as cur:
            # Comme le client REST : si stripe_* est None, on ne remplace pas les valeurs existantes au conflit
            cur.execute(
                """
                INSERT INTO public.user_plans (
                    user_id, plan, updated_at,
                    stripe_customer_id, stripe_subscription_id
                )
                VALUES (%s, %s, %s::timestamptz, %s, %s)
                ON CONFLICT (user_id) DO UPDATE SET
                    plan = EXCLUDED.plan,
                    updated_at = EXCLUDED.updated_at,
                    stripe_customer_id = CASE
                        WHEN EXCLUDED.stripe_customer_id IS NOT NULL THEN EXCLUDED.stripe_customer_id
                        ELSE public.user_plans.stripe_customer_id
                    END,
                    stripe_subscription_id = CASE
                        WHEN EXCLUDED.stripe_subscription_id IS NOT NULL THEN EXCLUDED.stripe_subscription_id
                        ELSE public.user_plans.stripe_subscription_id
                    END
                """,
                (
                    uid,
                    plan,
                    updated_at_iso,
                    stripe_customer_id,
                    stripe_subscription_id,
                ),
            )


def upsert_free_adaptation_count_anchor(uid: str, anchor: int) -> None:
    """Met à jour l’ancre seule, ou insère une ligne free minimale si absente."""
    pool = get_pool()
    if not pool:
        raise RuntimeError("Pool PG indisponible")
    a = max(0, int(anchor))
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE public.user_plans
                SET free_adaptation_count_anchor = %s, updated_at = now()
                WHERE user_id = %s
                """,
                (a, uid),
            )
            if cur.rowcount == 0:
                cur.execute(
                    """
                    INSERT INTO public.user_plans (user_id, plan, free_adaptation_count_anchor)
                    VALUES (%s, 'free', %s)
                    """,
                    (uid, a),
                )


# --- gemini usage ---


def record_gemini_usage_pg(
    uid: str,
    operation: str,
    input_tokens: int,
    output_tokens: int,
    cost_usd: float,
) -> None:
    """Log + agrégat dans une seule connexion (2 round-trips internes, 1 checkout pool)."""
    pool = get_pool()
    if not pool:
        raise RuntimeError("Pool PG indisponible")
    now_iso = _now_iso()

    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO public.gemini_usage_log
                    (user_id, operation, input_tokens, output_tokens, cost_usd)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (uid, operation[:64], input_tokens, output_tokens, cost_usd),
            )
            cur.execute(
                """
                INSERT INTO public.gemini_usage
                    (user_id, total_input_tokens, total_output_tokens, updated_at)
                VALUES (%s, %s, %s, %s::timestamptz)
                ON CONFLICT (user_id) DO UPDATE SET
                    total_input_tokens = public.gemini_usage.total_input_tokens + EXCLUDED.total_input_tokens,
                    total_output_tokens = public.gemini_usage.total_output_tokens + EXCLUDED.total_output_tokens,
                    updated_at = EXCLUDED.updated_at
                """,
                (uid, input_tokens, output_tokens, now_iso),
            )


def get_gemini_usage_totals(uid: str) -> Optional[tuple[int, int]]:
    pool = get_pool()
    if not pool:
        return None
    from psycopg.rows import dict_row

    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                SELECT total_input_tokens, total_output_tokens
                FROM public.gemini_usage
                WHERE user_id = %s
                LIMIT 1
                """,
                (uid,),
            )
            row = cur.fetchone()
    if not row:
        return None
    return (
        int(row.get("total_input_tokens") or 0),
        int(row.get("total_output_tokens") or 0),
    )


# --- cv_templates ---


def list_cv_templates_visible_for_user(uid_lower: str) -> list[dict]:
    """
    Templates non pending dont l'utilisateur est owner (case-insensitive) ou dans allowed_user_ids.
    uid_lower doit déjà être normalisé (strip + lower) comme dans db._norm_uid.
    """
    pool = get_pool()
    if not pool:
        return []
    from psycopg.rows import dict_row

    pending = "__pending__"
    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                SELECT id, name, description, options, owner_user_id, allowed_user_ids
                FROM public.cv_templates
                WHERE owner_user_id <> %s
                  AND (
                    lower(trim(owner_user_id)) = %s
                    OR EXISTS (
                        SELECT 1
                        FROM unnest(coalesce(allowed_user_ids, '{}'::text[])) AS x(uid)
                        WHERE lower(trim(uid)) = %s
                    )
                  )
                ORDER BY updated_at DESC NULLS LAST
                """,
                (pending, uid_lower, uid_lower),
            )
            return list(cur.fetchall() or [])


def get_cv_template_full(template_id: str) -> Optional[dict]:
    pool = get_pool()
    if not pool:
        return None
    from psycopg.rows import dict_row

    tid = (template_id or "").strip()
    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                "SELECT * FROM public.cv_templates WHERE id = %s LIMIT 1",
                (tid,),
            )
            return cur.fetchone()


def get_cv_template_acl(template_id: str) -> Optional[tuple[str, list]]:
    """(owner_user_id, allowed_user_ids) ou None."""
    pool = get_pool()
    if not pool:
        return None
    from psycopg.rows import dict_row

    tid = (template_id or "").strip()
    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                SELECT owner_user_id, allowed_user_ids
                FROM public.cv_templates
                WHERE id = %s
                LIMIT 1
                """,
                (tid,),
            )
            row = cur.fetchone()
    if not row:
        return None
    allowed = row.get("allowed_user_ids")
    if allowed is None:
        allowed = []
    return ((row.get("owner_user_id") or "").strip(), list(allowed))


def insert_cv_template(payload: dict) -> None:
    from psycopg.types.json import Json

    pool = get_pool()
    if not pool:
        raise RuntimeError("Pool PG indisponible")

    opts = payload.get("options") if payload.get("options") is not None else []
    allowed = payload.get("allowed_user_ids")
    if allowed is None:
        allowed = []

    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO public.cv_templates (
                    id, name, description, html_content, css_content, options,
                    owner_user_id, allowed_user_ids, updated_at
                )
                VALUES (
                    %s, %s, %s, %s, %s, %s::jsonb,
                    %s, %s::text[], %s::timestamptz
                )
                """,
                (
                    payload["id"],
                    payload["name"],
                    payload.get("description") or "",
                    payload.get("html_content") or "",
                    payload.get("css_content"),
                    Json(opts),
                    payload.get("owner_user_id") or "",
                    allowed,
                    payload["updated_at"],
                ),
            )


def update_cv_template_content_pg(
    template_id: str, html_content: str, css_content: Optional[str], updated_at_iso: str
) -> bool:
    pool = get_pool()
    if not pool:
        raise RuntimeError("Pool PG indisponible")
    tid = (template_id or "").strip()

    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE public.cv_templates
                SET html_content = %s,
                    css_content = %s,
                    updated_at = %s::timestamptz
                WHERE id = %s
                """,
                (html_content or "", (css_content or "").strip() or None, updated_at_iso, tid),
            )
            return cur.rowcount > 0


def update_cv_template_by_owner(
    template_id: str,
    owner_uid: str,
    updates: dict,
) -> Optional[dict]:
    """
    Met à jour uniquement les clés présentes dans updates (comme le client REST).
    Clés supportées : name, description, html_content, css_content, options, allowed_user_ids, updated_at.
    """
    from psycopg.rows import dict_row
    from psycopg.types.json import Json

    pool = get_pool()
    if not pool:
        raise RuntimeError("Pool PG indisponible")
    tid = (template_id or "").strip()

    set_parts: list[str] = []
    params: list[Any] = []

    if "name" in updates:
        set_parts.append("name = %s")
        params.append(updates["name"])
    if "description" in updates:
        set_parts.append("description = %s")
        params.append(updates["description"])
    if "html_content" in updates:
        set_parts.append("html_content = %s")
        params.append(updates["html_content"])
    if "css_content" in updates:
        set_parts.append("css_content = %s")
        params.append(updates["css_content"])
    if "options" in updates:
        set_parts.append("options = %s::jsonb")
        params.append(Json(updates["options"]))
    if "allowed_user_ids" in updates:
        set_parts.append("allowed_user_ids = %s::text[]")
        params.append(updates["allowed_user_ids"])
    if "updated_at" in updates:
        set_parts.append("updated_at = %s::timestamptz")
        params.append(updates["updated_at"])

    if not set_parts:
        return None

    sql = f"""
        UPDATE public.cv_templates
        SET {", ".join(set_parts)}
        WHERE id = %s AND owner_user_id = %s
        RETURNING id, name, description, options, owner_user_id, allowed_user_ids
    """
    params.extend([tid, owner_uid])

    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, params)
            row = cur.fetchone()
            return dict(row) if row else None


def delete_cv_template_by_owner(template_id: str, owner_uid: str) -> bool:
    pool = get_pool()
    if not pool:
        raise RuntimeError("Pool PG indisponible")
    tid = (template_id or "").strip()

    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                DELETE FROM public.cv_templates
                WHERE id = %s AND owner_user_id = %s
                RETURNING id
                """,
                (tid, owner_uid),
            )
            return cur.fetchone() is not None
