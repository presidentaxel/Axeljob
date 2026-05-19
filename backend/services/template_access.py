"""Template access helpers.

Service entièrement gratuit : il n'y a plus de paywall premium.
Seule la vérification d'ownership pour les templates personnalisés
(`custom_*`) reste en place.
"""

from __future__ import annotations

from fastapi import HTTPException


def effective_template_id_for_user(
    user_id: str | None,
    template_id: str | None,
    default_template_id: str,
) -> str:
    """Renvoie l'id de template demandé (fallback sur le défaut si vide)."""
    return (template_id or "").strip() or default_template_id


def check_premium_template_access(
    user_id: str | None,
    template_id: str | None,
) -> None:
    """No-op : tous les templates sont gratuits."""
    return None


def check_custom_template_access(
    user_id: str | None,
    template_id: str | None,
    can_user_use_custom_template,
) -> None:
    if not template_id or not (template_id or "").strip().startswith("custom_"):
        return
    if not can_user_use_custom_template(template_id, user_id):
        raise HTTPException(status_code=403, detail="Tu n'as pas accès à ce template personnalisé.")
