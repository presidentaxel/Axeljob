"""Configuration backend : chemins, env, Supabase."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

def _env(key: str, default: str = "") -> str:
    return os.environ.get(key, default).strip()

ENVIRONMENT = _env("ENVIRONMENT", "development")
IS_PRODUCTION = ENVIRONMENT == "production"

SUPABASE_URL = _env("SUPABASE_URL")
SUPABASE_SERVICE_KEY = _env("SUPABASE_SERVICE_KEY")

USE_SUPABASE = bool(SUPABASE_URL and SUPABASE_SERVICE_KEY)

API_BASE_URL = _env("CV_BOT_API_BASE_URL")

SUPABASE_JWT_SECRET = _env("SUPABASE_JWT_SECRET")

STRIPE_SECRET_KEY = _env("STRIPE_SECRET_KEY")
STRIPE_PRICE_ID_PRO_MONTHLY = _env("STRIPE_PRICE_ID_PRO_MONTHLY")
STRIPE_PRICE_ID_TEMPLATE_PERSO = _env("STRIPE_PRICE_ID_TEMPLATE_PERSO")
STRIPE_WEBHOOK_SECRET = _env("STRIPE_WEBHOOK_SECRET")
FRONTEND_URL = _env("CV_BOT_FRONTEND_URL") or _env("VITE_APP_URL")

RESEND_API_KEY = _env("RESEND_API_KEY")
RESEND_FROM_EMAIL = _env("RESEND_FROM_EMAIL", "AxeL Job <onboarding@resend.dev>")
SUPPORT_EMAIL = _env("SUPPORT_EMAIL")
# Emails autorisés à envoyer des réponses support (via l'app, template HTML Resend)
SUPPORT_ADMIN_EMAILS = [e.strip().lower() for e in _env("SUPPORT_ADMIN_EMAILS", "").split(",") if e.strip()]

METRICS_AUTH_TOKEN = _env("METRICS_AUTH_TOKEN")

# Budget Gemini par compte (€) — dépassement = blocage soft (pas affiché à l'utilisateur)
GEMINI_BUDGET_EUR = float(os.environ.get("GEMINI_BUDGET_EUR", "10"))
# Taux USD/EUR pour convertir le budget en coût API (USD)
GEMINI_USD_PER_EUR = float(os.environ.get("GEMINI_USD_PER_EUR", "1.08"))

if os.name == "nt":
    dll_dirs = _env("WEASYPRINT_DLL_DIRECTORIES")
    if dll_dirs:
        for dir_path in dll_dirs.replace(",", ";").split(";"):
            dir_path = os.path.abspath(dir_path.strip())
            if dir_path and os.path.isdir(dir_path):
                os.environ["PATH"] = dir_path + os.pathsep + os.environ.get("PATH", "")
