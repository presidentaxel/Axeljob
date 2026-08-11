"""Billing helper services (emails and frontend URL resolution)."""

from __future__ import annotations

import html
from urllib.parse import quote as url_quote


def primary_frontend_base_url(frontend_url: str | None) -> str:
    raw = (frontend_url or "").strip()
    if not raw:
        return "https://job.axelproject.fr"
    first = raw.split(",")[0].strip().rstrip("/")
    return first or "https://job.axelproject.fr"


def html_email_template_perso_confirmation(
    frontend_url: str | None, support_email: str | None
) -> str:
    base = primary_frontend_base_url(frontend_url).rstrip("/")
    contact = (support_email or "contact@axelproject.fr").strip()
    app_href = html.escape(f"{base}/app?open=template-perso", quote=True)
    site_href = html.escape(base, quote=True)
    mailto_href = html.escape(
        f"mailto:{contact}?subject={url_quote('Template perso - ')}",
        quote=True,
    )
    contact_esc = html.escape(contact)
    ff = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif"
    return f"""<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="x-ua-compatible" content="ie=edge"><title>AxeL Job - Template personnalisé</title></head>
<body style="margin:0;padding:0;background-color:#f8fafc;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-collapse:collapse;"><tr><td align="center" style="padding:32px 16px 48px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;border-collapse:collapse;">
<tr><td align="center" style="padding-bottom:20px;"><span style="font-family:{ff};font-size:22px;font-weight:700;color:#0f172a;letter-spacing:-0.03em;">AxeL Job</span></td></tr>
<tr><td style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.08),0 4px 12px rgba(15,23,42,0.04);"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
<tr><td style="height:4px;line-height:4px;background-color:#4f46e5;font-size:0;">&nbsp;</td></tr>
<tr><td style="padding:28px 28px 8px;font-family:{ff};"><h1 style="margin:0;font-size:20px;font-weight:700;color:#0f172a;line-height:1.3;">Paiement bien reçu - merci !</h1><p style="margin:14px 0 0;font-size:15px;line-height:1.6;color:#334155;">Ta commande de <strong style="color:#0f172a;">template personnalisé</strong> est enregistrée. Voici la suite pour qu’on intègre ton design dans AxeL Job.</p></td></tr>
<tr><td style="padding:8px 28px 20px;font-family:{ff};"><p style="margin:0;font-size:15px;line-height:1.6;color:#334155;">Envoie-nous ton design (PDF ou maquette) en répondant à cet e-mail, ou via <a href="{mailto_href}" style="color:#4f46e5;font-weight:600;text-decoration:none;">{contact_esc}</a>.</p></td></tr>
<tr><td align="center" style="padding:4px 28px 24px;font-family:{ff};"><a href="{app_href}" style="display:inline-block;background-color:#4f46e5;color:#ffffff !important;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:8px;box-shadow:0 1px 2px rgba(79,70,229,0.35);">Ouvrir AxeL Job</a></td></tr>
<tr><td style="padding:0 28px 28px;font-family:{ff};font-size:14px;line-height:1.6;color:#64748b;border-top:1px solid #e2e8f0;"><p style="margin:20px 0 0;">Des questions ? Réponds simplement à ce message.</p><p style="margin:18px 0 0;font-size:14px;color:#0f172a;">À bientôt,<br><strong style="color:#334155;">L’équipe AxeL Job</strong></p></td></tr>
</table></td></tr>
<tr><td align="center" style="padding:8px 12px 0;font-family:{ff};font-size:12px;line-height:1.55;color:#94a3b8;"><p style="margin:0;">CV sur-mesure pour chaque annonce · Score ATS · IA</p><p style="margin:10px 0 0;"><a href="{site_href}" style="color:#64748b;text-decoration:underline;">{html.escape(base, quote=False)}</a></p></td></tr>
</table></td></tr></table></body></html>"""


def send_template_perso_email(
    to_email: str,
    resend_api_key: str | None,
    resend_from_email: str | None,
    frontend_url: str | None,
    support_email: str | None,
) -> bool:
    if not resend_api_key or not to_email:
        return False
    try:
        import resend

        resend.api_key = resend_api_key
        html_content = html_email_template_perso_confirmation(frontend_url, support_email)
        resend.Emails.send(
            {
                "from": resend_from_email,
                "to": [to_email],
                "subject": "Template personnalisé AxeL Job - prochaine étape",
                "html": html_content,
            }
        )
        return True
    except Exception:
        return False


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
