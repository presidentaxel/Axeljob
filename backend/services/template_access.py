"""Template access policy helpers (premium and custom ownership checks)."""

from __future__ import annotations

from fastapi import HTTPException


def effective_template_id_for_user(
    user_id: str | None,
    template_id: str | None,
    default_template_id: str,
    get_template,
    get_user_plan,
    get_paywall_disabled,
) -> str:
    """Compte gratuit: remplace un template premium par le template par défaut."""
    tid = (template_id or "").strip() or default_template_id
    meta = get_template(tid)
    if not meta.get("premium"):
        return tid
    uid = (user_id or "default").strip() or "default"
    if get_user_plan(uid) == "pro" or get_paywall_disabled(uid):
        return tid
    return default_template_id


def check_premium_template_access(
    user_id: str | None,
    template_id: str | None,
    get_template,
    get_user_plan,
    get_paywall_disabled,
) -> None:
    if not template_id:
        return
    meta = get_template(template_id)
    if not meta.get("premium"):
        return
    uid = (user_id or "default").strip() or "default"
    plan = get_user_plan(uid)
    if plan == "pro" or get_paywall_disabled(uid):
        return
    raise HTTPException(status_code=402, detail="Ce template est réservé aux abonnés Pro.")


def check_custom_template_access(
    user_id: str | None,
    template_id: str | None,
    can_user_use_custom_template,
) -> None:
    if not template_id or not (template_id or "").strip().startswith("custom_"):
        return
    if not can_user_use_custom_template(template_id, user_id):
        raise HTTPException(status_code=403, detail="Tu n'as pas accès à ce template personnalisé.")
