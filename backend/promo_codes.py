"""
Validation et application des codes promo / concours.

Flux :
  - Lien UTM + partner_code → user_referrals (attribution BDE, 1× au login)
  - Code saisi menu compte → promo_codes + promo_redemptions (cette module)
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

_CODE_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_-]{2,31}$")


def normalize_promo_code(raw: str | None) -> str:
    """Code normalisé pour lookup (insensible à la casse)."""
    code = (raw or "").strip().upper()
    if not code or len(code) > 32:
        return ""
    if not _CODE_RE.match(code):
        return ""
    return code


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _is_in_validity_window(row: dict[str, Any], now: datetime) -> bool:
    vf = row.get("valid_from")
    vu = row.get("valid_until")
    if vf is not None and now < vf:
        return False
    if vu is not None and now > vu:
        return False
    return True


def redeem_promo_code(user_id: str, raw_code: str) -> dict[str, Any]:
    """
    Tente d'appliquer un code pour l'utilisateur.
    Retourne un dict { ok, message, kind?, bonus_added?, contest_registered? }.
    Lève ValueError avec message utilisateur si refus.
    """
    from backend.config import USE_SUPABASE_PG

    uid = (user_id or "").strip()
    if not uid:
        raise ValueError("Connexion requise.")

    normalized = normalize_promo_code(raw_code)
    if not normalized:
        raise ValueError("Code invalide (lettres, chiffres, tirets, 3 à 32 caractères).")

    if USE_SUPABASE_PG:
        from backend import supabase_pg as spg

        return spg.redeem_promo_code_pg(uid, normalized)

    from backend.db import _get_supabase

    sb = _get_supabase()
    if not sb:
        raise ValueError("Service indisponible.")

    return _redeem_promo_code_rest(sb, uid, normalized)


def _redeem_promo_code_rest(sb, uid: str, normalized: str) -> dict[str, Any]:
    """Repli REST (moins atomique) si PG direct indisponible."""
    now = _now_utc()
    r = (
        sb.table("promo_codes")
        .select("*")
        .eq("code_normalized", normalized)
        .eq("active", True)
        .limit(1)
        .execute()
    )
    if not r.data:
        raise ValueError("Code inconnu ou expiré.")
    row = r.data[0]
    if not _is_in_validity_window(row, now):
        raise ValueError("Ce code n'est plus valide.")

    promo_id = row["id"]
    max_total = row.get("max_redemptions")
    if max_total is not None:
        total_r = (
            sb.table("promo_redemptions")
            .select("id", count="exact")
            .eq("promo_code_id", promo_id)
            .execute()
        )
        if (total_r.count or 0) >= int(max_total):
            raise ValueError("Ce code a atteint sa limite d'utilisation.")

    max_per_user = max(1, int(row.get("max_per_user") or 1))
    user_r = (
        sb.table("promo_redemptions")
        .select("id", count="exact")
        .eq("promo_code_id", promo_id)
        .eq("user_id", uid)
        .execute()
    )
    if (user_r.count or 0) >= max_per_user:
        raise ValueError("Tu as déjà utilisé ce code.")

    sb.table("promo_redemptions").insert({"promo_code_id": promo_id, "user_id": uid}).execute()

    return _apply_promo_benefits_rest(sb, uid, row)


def _apply_promo_benefits_rest(sb, uid: str, row: dict[str, Any]) -> dict[str, Any]:
    from backend.db import save_user_referral_attribution

    kind = row.get("kind") or "bonus_adaptations"
    label = (row.get("label") or "").strip() or row.get("code") or "Code"
    bonus = max(0, int(row.get("bonus_adaptations") or 0))
    partner = (row.get("partner_code") or "").strip()

    out: dict[str, Any] = {
        "ok": True,
        "kind": kind,
        "label": label,
        "bonus_added": 0,
        "contest_registered": False,
    }

    if kind == "bde_partner" and partner:
        save_user_referral_attribution(uid, {"partner_code": partner})
        out["message"] = f"Code partenaire enregistré ({label})."
        return out

    if kind == "contest_entry":
        out["contest_registered"] = True
        out["message"] = f"Inscription au concours enregistrée : {label}."
        return out

    if bonus > 0:
        plan_r = (
            sb.table("user_plans")
            .select("free_adaptation_bonus")
            .eq("user_id", uid)
            .limit(1)
            .execute()
        )
        current = 0
        if plan_r.data:
            current = max(0, int(plan_r.data[0].get("free_adaptation_bonus") or 0))
        new_bonus = current + bonus
        sb.table("user_plans").upsert(
            {
                "user_id": uid,
                "plan": "free",
                "free_adaptation_bonus": new_bonus,
                "updated_at": _now_utc().isoformat(),
            },
            on_conflict="user_id",
        ).execute()
        out["bonus_added"] = bonus
        out["message"] = f"+{bonus} adaptation(s) offerte(s) : {label}."
        return out

    out["message"] = f"Code appliqué : {label}."
    return out
