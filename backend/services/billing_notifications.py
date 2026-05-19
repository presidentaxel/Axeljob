"""Billing helper services (emails and frontend URL resolution)."""

from __future__ import annotations

import html


def primary_frontend_base_url(frontend_url: str | None) -> str:
    raw = (frontend_url or "").strip()
    if not raw:
        return "https://job.axelproject.fr"
    first = raw.split(",")[0].strip().rstrip("/")
    return first or "https://job.axelproject.fr"


def send_subscription_cancelled_email(
    to_email: str,
    period_end_label: str,
    resend_api_key: str | None,
    resend_from_email: str | None,
) -> bool:
    if not resend_api_key or not to_email:
        return False
    try:
        import resend

        resend.api_key = resend_api_key
        safe_end = html.escape(period_end_label or "la fin de ta période payée")
        html_content = (
            "<p>Bonjour,</p>"
            "<p>Nous confirmons la <strong>résiliation de ton abonnement AxeL Job Pro</strong>. "
            "Elle prend effet à la <strong>fin de la période déjà payée</strong> (au plus tard le "
            f"<strong>{safe_end}</strong>).</p>"
            "<p>Jusqu'à cette date, tu conserves l'accès à ton compte et à tes données comme d'habitude.</p>"
            "<p>Si tu as une question, réponds à ce message ou écris-nous à "
            '<a href="mailto:contact@axelproject.fr">contact@axelproject.fr</a>.</p>'
            "<p>À bientôt,<br>L’équipe AxeL Job</p>"
        )
        resend.Emails.send(
            {
                "from": resend_from_email,
                "to": [to_email],
                "subject": "Confirmation de résiliation - AxeL Job Pro",
                "html": html_content,
            }
        )
        return True
    except Exception:
        return False


def stripe_client(stripe_secret_key: str):
    import stripe

    return stripe.StripeClient(stripe_secret_key)
