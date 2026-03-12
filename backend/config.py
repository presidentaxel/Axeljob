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
STRIPE_WEBHOOK_SECRET = _env("STRIPE_WEBHOOK_SECRET")
FRONTEND_URL = _env("CV_BOT_FRONTEND_URL") or _env("VITE_APP_URL")

METRICS_AUTH_TOKEN = _env("METRICS_AUTH_TOKEN")

if os.name == "nt":
    dll_dirs = _env("WEASYPRINT_DLL_DIRECTORIES")
    if dll_dirs:
        for dir_path in dll_dirs.replace(",", ";").split(";"):
            dir_path = os.path.abspath(dir_path.strip())
            if dir_path and os.path.isdir(dir_path):
                os.environ["PATH"] = dir_path + os.pathsep + os.environ.get("PATH", "")
