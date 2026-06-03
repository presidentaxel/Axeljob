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
from typing import Any

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
    from psycopg_pool import ConnectionPool

    from backend.config import SUPABASE_DATABASE_URL, supabase_pg_pool_max

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
    user_id: str | None,
    context: dict,
    session_id: str | None = None,
) -> None:
    """Insère une ligne dans public.events (logs analytiques)."""
    from psycopg.types.json import Json

    pool = get_pool()
    if not pool:
        raise RuntimeError("Pool PG indisponible")

    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
                INSERT INTO public.events (event_type, user_id, session_id, context)
                VALUES (%s, %s, %s, %s::jsonb)
                """,
            (event_type, user_id, session_id, Json(context or {})),
        )


def count_auth_users() -> int | None:
    """Nombre de comptes Supabase Auth (auth.users). None si PG indisponible ou erreur."""
    pool = get_pool()
    if not pool:
        return None
    try:
        with pool.connection() as conn, conn.cursor() as cur:
            cur.execute("SELECT count(*)::bigint FROM auth.users")
            row = cur.fetchone()
        if row is None:
            return None
        return int(row[0])
    except Exception as e:
        logger.warning("count_auth_users failed: %s", e)
        return None


def auth_user_id_exists(uid: str) -> bool | None:
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
        with pool.connection() as conn, conn.cursor() as cur:
            cur.execute("SELECT 1 FROM auth.users WHERE id = %s::uuid LIMIT 1", (uid.strip(),))
            return cur.fetchone() is not None
    except Exception as e:
        logger.warning("auth_user_id_exists failed: %s", e)
        return None


def aggregate_events_recent_days(days: int = 7) -> dict[str, Any] | None:
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
        with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
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


def insert_user_referral_once(
    user_id: str,
    partner_code: str,
    utm_source: str | None = None,
    utm_medium: str | None = None,
    utm_campaign: str | None = None,
    landing_path: str | None = None,
) -> bool:
    """
    Insère une attribution partenaire pour un user uniquement si absente.
    Retourne True si une ligne a été créée.
    """
    pool = get_pool()
    if not pool:
        raise RuntimeError("Pool PG indisponible")
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
                INSERT INTO public.user_referrals (
                    user_id, partner_code, utm_source, utm_medium, utm_campaign, landing_path, captured_at, updated_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, now(), now())
                ON CONFLICT (user_id) DO NOTHING
                """,
            (user_id, partner_code, utm_source, utm_medium, utm_campaign, landing_path),
        )
        return cur.rowcount > 0


def aggregate_bde_cashback_recent_days(
    days: int,
    cashback_by_code: dict[str, float] | None = None,
    default_cashback_eur: float = 0.0,
) -> dict[str, Any] | None:
    """
    Agrège les utilisateurs attribués par code partenaire (BDE) sur une période,
    puis calcule le montant cashback dû sur les utilisateurs actuellement en plan Pro.
    """
    days = max(1, min(int(days), 365))
    pool = get_pool()
    if not pool:
        return None
    from psycopg.rows import dict_row

    normalized_rates: dict[str, float] = {}
    for k, v in (cashback_by_code or {}).items():
        kk = str(k or "").strip().lower()
        if not kk:
            continue
        try:
            normalized_rates[kk] = max(0.0, float(v))
        except (TypeError, ValueError):
            continue
    try:
        default_rate = max(0.0, float(default_cashback_eur))
    except (TypeError, ValueError):
        default_rate = 0.0

    try:
        with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                SELECT
                    r.partner_code AS partner_code,
                    COUNT(*)::bigint AS referred_users,
                    COUNT(*) FILTER (
                        WHERE p.plan = 'pro' AND COALESCE(p.paywall_disabled, false) = false
                    )::bigint AS pro_users
                FROM public.user_referrals r
                LEFT JOIN public.user_plans p ON p.user_id = r.user_id
                WHERE r.captured_at >= NOW() - (%s * INTERVAL '1 day')
                GROUP BY r.partner_code
                ORDER BY referred_users DESC, partner_code ASC
                """,
                (days,),
            )
            rows = list(cur.fetchall() or [])
    except Exception as e:
        logger.warning("aggregate_bde_cashback_recent_days failed: %s", e)
        return None

    per_code: list[dict[str, Any]] = []
    total_referred = 0
    total_pro = 0
    total_amount = 0.0
    for row in rows:
        code = str(row.get("partner_code") or "").strip()
        if not code:
            continue
        referred = int(row.get("referred_users") or 0)
        pro_users = int(row.get("pro_users") or 0)
        rate = normalized_rates.get(code.lower(), default_rate)
        amount = round(pro_users * rate, 2)
        per_code.append(
            {
                "partner_code": code,
                "referred_users": referred,
                "pro_users": pro_users,
                "cashback_rate_eur": round(rate, 2),
                "amount_due_eur": amount,
            }
        )
        total_referred += referred
        total_pro += pro_users
        total_amount += amount
    return {
        "period_days": days,
        "total_referred_users": total_referred,
        "total_pro_users": total_pro,
        "total_amount_due_eur": round(total_amount, 2),
        "rows": per_code,
        "source": "supabase_pg",
    }


def redeem_promo_code_pg(user_id: str, code_normalized: str) -> dict[str, Any]:
    """
    Applique un code promo en transaction (verrouillage ligne promo_codes).
    """
    from backend.promo_codes import _is_in_validity_window

    pool = get_pool()
    if not pool:
        raise RuntimeError("Pool PG indisponible")
    from datetime import datetime, timezone

    from psycopg.rows import dict_row

    uid = (user_id or "").strip()
    code = (code_normalized or "").strip().upper()
    if not uid or not code:
        raise ValueError("Code invalide.")

    now = datetime.now(timezone.utc)

    with pool.connection() as conn:
        conn.autocommit = False
        try:
            with conn.cursor(row_factory=dict_row) as cur:
                cur.execute(
                    """
                    SELECT *
                    FROM public.promo_codes
                    WHERE code_normalized = %s AND active = true
                    FOR UPDATE
                    """,
                    (code,),
                )
                row = cur.fetchone()
                if not row:
                    raise ValueError("Code inconnu ou expiré.")
                if not _is_in_validity_window(dict(row), now):
                    raise ValueError("Ce code n'est plus valide.")

                promo_id = row["id"]
                max_total = row.get("max_redemptions")
                if max_total is not None:
                    cur.execute(
                        """
                        SELECT COUNT(*)::int AS n
                        FROM public.promo_redemptions
                        WHERE promo_code_id = %s
                        """,
                        (promo_id,),
                    )
                    n_total = int((cur.fetchone() or {}).get("n") or 0)
                    if n_total >= int(max_total):
                        raise ValueError("Ce code a atteint sa limite d'utilisation.")

                max_per_user = max(1, int(row.get("max_per_user") or 1))
                cur.execute(
                    """
                    SELECT COUNT(*)::int AS n
                    FROM public.promo_redemptions
                    WHERE promo_code_id = %s AND user_id = %s
                    """,
                    (promo_id, uid),
                )
                n_user = int((cur.fetchone() or {}).get("n") or 0)
                if n_user >= max_per_user:
                    raise ValueError("Tu as déjà utilisé ce code.")

                cur.execute(
                    """
                    INSERT INTO public.promo_redemptions (promo_code_id, user_id)
                    VALUES (%s, %s)
                    """,
                    (promo_id, uid),
                )

                kind = row.get("kind") or "bonus_adaptations"
                label = (row.get("label") or "").strip() or row.get("code") or "Code"
                bonus = max(0, int(row.get("bonus_adaptations") or 0))
                partner = (row.get("partner_code") or "").strip() or None

                out: dict[str, Any] = {
                    "ok": True,
                    "kind": kind,
                    "label": label,
                    "bonus_added": 0,
                    "contest_registered": False,
                }

                if kind == "bde_partner" and partner:
                    cur.execute(
                        """
                        INSERT INTO public.user_referrals (
                            user_id, partner_code, captured_at, updated_at
                        )
                        VALUES (%s, %s, now(), now())
                        ON CONFLICT (user_id) DO NOTHING
                        """,
                        (uid, partner),
                    )
                    out["message"] = f"Code partenaire enregistré ({label})."
                elif kind == "contest_entry":
                    out["contest_registered"] = True
                    out["message"] = f"Inscription au concours enregistrée : {label}."
                elif bonus > 0:
                    cur.execute(
                        """
                        INSERT INTO public.user_plans (user_id, plan, free_adaptation_bonus, updated_at)
                        VALUES (%s, 'free', %s, now())
                        ON CONFLICT (user_id) DO UPDATE SET
                            free_adaptation_bonus = public.user_plans.free_adaptation_bonus + EXCLUDED.free_adaptation_bonus,
                            updated_at = now()
                        """,
                        (uid, bonus),
                    )
                    out["bonus_added"] = bonus
                    out["message"] = f"+{bonus} adaptation(s) offerte(s) : {label}."
                else:
                    out["message"] = f"Code appliqué : {label}."

            conn.commit()
            return out
        except Exception:
            conn.rollback()
            raise


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

    with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
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

    with pool.connection() as conn, conn.cursor() as cur:
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


def upsert_application(adaptation_id: str, uid: str, payload: dict, updated_at_iso: str) -> None:
    from psycopg.types.json import Json

    pool = get_pool()
    if not pool:
        raise RuntimeError("Pool PG indisponible")

    with pool.connection() as conn, conn.cursor() as cur:
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

    with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
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


def get_application_row(adaptation_id: str) -> dict | None:
    pool = get_pool()
    if not pool:
        return None
    from psycopg.rows import dict_row

    with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
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

    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT COUNT(*)::int FROM public.applications WHERE user_id = %s",
            (uid,),
        )
        row = cur.fetchone()
        return int(row[0]) if row else 0


def count_quota_adaptations_for_user(uid: str) -> int:
    """Candidatures IA (payload.full_cv) non archivées, hors suivi manuel (id manual_*)."""
    pool = get_pool()
    if not pool:
        return 0

    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT COUNT(*)::int FROM public.applications
            WHERE user_id = %s
              AND left(id, 7) <> 'manual_'
              AND COALESCE((payload->>'archived')::boolean, false) = false
              AND jsonb_typeof(payload->'full_cv') = 'object'
              AND payload->'full_cv' != '{}'::jsonb
            """,
            (uid,),
        )
        row = cur.fetchone()
        return int(row[0]) if row else 0


def count_active_applications_for_user(uid: str) -> int:
    """Candidatures non archivées (manuel + IA), pour le plafond FREE_APPLICATIONS_LIMIT."""
    pool = get_pool()
    if not pool:
        return 0

    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT COUNT(*)::int FROM public.applications
            WHERE user_id = %s
              AND COALESCE((payload->>'archived')::boolean, false) = false
            """,
            (uid,),
        )
        row = cur.fetchone()
        return int(row[0]) if row else 0


# --- user_plans ---


def get_user_plan_row(uid: str) -> tuple[str, bool | None, int, int] | None:
    """Retourne (plan, paywall_disabled, free_adaptation_bonus, free_adaptation_count_anchor) ou None."""
    pool = get_pool()
    if not pool:
        return None
    from psycopg.rows import dict_row

    with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
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


def get_user_plan_stripe_fields(uid: str) -> dict | None:
    """Stripe IDs enregistrés pour l'utilisateur (ou None si pas de ligne)."""
    pool = get_pool()
    if not pool:
        return None
    from psycopg.rows import dict_row

    with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
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


def find_user_id_by_stripe_subscription_id(subscription_id: str) -> str | None:
    """Retourne user_id pour un subscription_id Stripe (webhook deleted)."""
    sid = (subscription_id or "").strip()
    if not sid:
        return None
    pool = get_pool()
    if not pool:
        return None
    from psycopg.rows import dict_row

    with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
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
    stripe_customer_id: str | None = None,
    stripe_subscription_id: str | None = None,
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
    with pool.connection() as conn, conn.cursor() as cur:
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


def get_gemini_usage_totals(uid: str) -> tuple[int, int] | None:
    pool = get_pool()
    if not pool:
        return None
    from psycopg.rows import dict_row

    with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
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
    with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
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


def get_cv_template_full(template_id: str) -> dict | None:
    pool = get_pool()
    if not pool:
        return None
    from psycopg.rows import dict_row

    tid = (template_id or "").strip()
    with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            "SELECT * FROM public.cv_templates WHERE id = %s LIMIT 1",
            (tid,),
        )
        return cur.fetchone()


def get_cv_template_acl(template_id: str) -> tuple[str, list] | None:
    """(owner_user_id, allowed_user_ids) ou None."""
    pool = get_pool()
    if not pool:
        return None
    from psycopg.rows import dict_row

    tid = (template_id or "").strip()
    with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
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

    with pool.connection() as conn, conn.cursor() as cur:
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
    template_id: str, html_content: str, css_content: str | None, updated_at_iso: str
) -> bool:
    pool = get_pool()
    if not pool:
        raise RuntimeError("Pool PG indisponible")
    tid = (template_id or "").strip()

    with pool.connection() as conn, conn.cursor() as cur:
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
) -> dict | None:
    """
    Met à jour uniquement les clés présentes dans updates (comme le client REST).
    Clés supportées : name, description, html_content, css_content, options, allowed_user_ids, updated_at.
    """
    from psycopg.rows import dict_row
    from psycopg.sql import SQL
    from psycopg.types.json import Json

    pool = get_pool()
    if not pool:
        raise RuntimeError("Pool PG indisponible")
    tid = (template_id or "").strip()

    set_parts: list[SQL] = []
    params: list[Any] = []

    if "name" in updates:
        set_parts.append(SQL("name = %s"))
        params.append(updates["name"])
    if "description" in updates:
        set_parts.append(SQL("description = %s"))
        params.append(updates["description"])
    if "html_content" in updates:
        set_parts.append(SQL("html_content = %s"))
        params.append(updates["html_content"])
    if "css_content" in updates:
        set_parts.append(SQL("css_content = %s"))
        params.append(updates["css_content"])
    if "options" in updates:
        set_parts.append(SQL("options = %s::jsonb"))
        params.append(Json(updates["options"]))
    if "allowed_user_ids" in updates:
        set_parts.append(SQL("allowed_user_ids = %s::text[]"))
        params.append(updates["allowed_user_ids"])
    if "updated_at" in updates:
        set_parts.append(SQL("updated_at = %s::timestamptz"))
        params.append(updates["updated_at"])

    if not set_parts:
        return None

    sql = SQL(
        """
        UPDATE public.cv_templates
        SET {set_clause}
        WHERE id = %s AND owner_user_id = %s
        RETURNING id, name, description, options, owner_user_id, allowed_user_ids
    """
    ).format(set_clause=SQL(", ").join(set_parts))
    params.extend([tid, owner_uid])

    with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(sql, params)
        row = cur.fetchone()
        return dict(row) if row else None


def delete_cv_template_by_owner(template_id: str, owner_uid: str) -> bool:
    pool = get_pool()
    if not pool:
        raise RuntimeError("Pool PG indisponible")
    tid = (template_id or "").strip()

    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
                DELETE FROM public.cv_templates
                WHERE id = %s AND owner_user_id = %s
                RETURNING id
                """,
            (tid, owner_uid),
        )
        return cur.fetchone() is not None
