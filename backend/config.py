"""Configuration backend : chemins, env, Supabase."""
import os
from pathlib import Path
from urllib.parse import urlparse

BASE_DIR = Path(__file__).resolve().parent.parent

def _env(key: str, default: str = "") -> str:
    return os.environ.get(key, default).strip()

ENVIRONMENT = _env("ENVIRONMENT", "development")
IS_PRODUCTION = ENVIRONMENT == "production"

SUPABASE_URL = _env("SUPABASE_URL")
SUPABASE_SERVICE_KEY = _env("SUPABASE_SERVICE_KEY")
# URI Postgres (Dashboard > Project Settings > Database) - accès direct, plus rapide que PostgREST
SUPABASE_DATABASE_URL = _env("SUPABASE_DATABASE_URL")

USE_SUPABASE = bool(SUPABASE_URL and SUPABASE_SERVICE_KEY)
USE_SUPABASE_PG = bool(USE_SUPABASE and SUPABASE_DATABASE_URL)


def _pg_pool_max() -> int:
    try:
        return max(1, min(32, int(os.environ.get("SUPABASE_PG_POOL_MAX", "8"))))
    except ValueError:
        return 8


def supabase_pg_pool_max() -> int:
    """Taille max du pool PG (partagée config / supabase_pg / health)."""
    return _pg_pool_max()


# Cache mémoire processus pour user_plans (plan + paywall) - 0 = désactivé
def _user_plan_cache_ttl() -> float:
    try:
        return max(0.0, float(os.environ.get("USER_PLAN_CACHE_TTL_SEC", "30")))
    except ValueError:
        return 30.0


USER_PLAN_CACHE_TTL_SEC = _user_plan_cache_ttl()

# ThreadPool asyncio (tâches CPU / WeasyPrint) - réduire sur petit VPS
def thread_pool_max_workers() -> int:
    try:
        return max(1, min(32, int(os.environ.get("THREAD_POOL_MAX_WORKERS", "4"))))
    except ValueError:
        return 4


def supabase_data_mode_info() -> dict:
    """
    Résumé pour logs /health (sans secrets).
    backend: pg_direct | rest_api | disabled
    """
    if not USE_SUPABASE:
        return {
            "backend": "disabled",
            "hint": "cv_base.json et adaptations/ en local",
        }
    if USE_SUPABASE_PG:
        return {
            "backend": "pg_direct",
            "fallback": "rest_api",
            "pg_pool_max": supabase_pg_pool_max(),
        }
    return {
        "backend": "rest_api",
        "hint": "PostgREST via supabase-py",
    }

API_BASE_URL = _env("CV_BOT_API_BASE_URL")

SUPABASE_JWT_SECRET = _env("SUPABASE_JWT_SECRET")
# Tolérance iat/exp (secondes) : évite « token is not yet valid (iat) » si l’horloge du serveur est
# légèrement en retard vs Supabase (Windows / VM sans NTP). PyJWT : leeway.
def _jwt_leeway_seconds() -> float:
    try:
        return max(0.0, float(os.environ.get("JWT_LEEWAY_SECONDS", "120")))
    except ValueError:
        return 120.0


JWT_LEEWAY_SECONDS = _jwt_leeway_seconds()

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


def _float_env(key: str, default: float) -> float:
    try:
        return float(os.environ.get(key, str(default)).strip())
    except ValueError:
        return default


def _int_env(key: str, default: int) -> int:
    try:
        return int(os.environ.get(key, str(default)).strip())
    except ValueError:
        return default


def _truthy_env(key: str) -> bool:
    return os.environ.get(key, "").strip().lower() in ("1", "true", "yes", "on")


# --- Monitoring / alertes (Resend) ---
MONITORING_ALERT_ENABLED = _truthy_env("MONITORING_ALERT_ENABLED")
MONITORING_ALERT_EMAILS = [e.strip() for e in _env("MONITORING_ALERT_EMAILS", "").split(",") if e.strip()]
MONITORING_ALERT_CPU_PCT = _float_env("MONITORING_ALERT_CPU_PCT", 85.0)
MONITORING_ALERT_MEM_PCT = _float_env("MONITORING_ALERT_MEM_PCT", 88.0)
MONITORING_ALERT_MIN_INTERVAL_SEC = _float_env("MONITORING_ALERT_MIN_INTERVAL_SEC", 900.0)
MONITORING_ALERT_5XX_WINDOW_SEC = _float_env("MONITORING_ALERT_5XX_WINDOW_SEC", 300.0)
MONITORING_ALERT_5XX_THRESHOLD = _int_env("MONITORING_ALERT_5XX_THRESHOLD", 15)
MONITORING_ALERT_SLOW_REQUEST_SEC = _float_env("MONITORING_ALERT_SLOW_REQUEST_SEC", 8.0)
MONITORING_ALERT_SLOW_COUNT_THRESHOLD = _int_env("MONITORING_ALERT_SLOW_COUNT_THRESHOLD", 25)
MONITORING_ALERT_SPIKE_CPU_RATIO = _float_env("MONITORING_ALERT_SPIKE_CPU_RATIO", 1.45)
MONITORING_ALERT_SPIKE_MIN_CPU = _float_env("MONITORING_ALERT_SPIKE_MIN_CPU", 70.0)
MONITORING_ACTIVE_USER_TTL_SEC = _float_env("MONITORING_ACTIVE_USER_TTL_SEC", 600.0)
MONITORING_CAPACITY_TARGET_CPU_PCT = _float_env("MONITORING_CAPACITY_TARGET_CPU_PCT", 70.0)
# Plateau CPU (OS + VM + processus au repos) retiré avant extrapolation — ex. ~2 % sur DO sans trafic
MONITORING_CAPACITY_IDLE_CPU_BASELINE_PCT = _float_env("MONITORING_CAPACITY_IDLE_CPU_BASELINE_PCT", 2.0)
# CPU marginal minimal (mesuré − baseline) pour enregistrer un point — évite division / bruit près du idle
MONITORING_CAPACITY_MIN_MARGINAL_CPU_SAMPLE_PCT = _float_env(
    "MONITORING_CAPACITY_MIN_MARGINAL_CPU_SAMPLE_PCT", 1.0
)
# Capacité indicative : lissage (0.05–0.5, défaut 0.14 ≈ demi-vie ~5 ticks à 45 s)
MONITORING_CAPACITY_EMA_ALPHA = _float_env("MONITORING_CAPACITY_EMA_ALPHA", 0.14)
# N’enregistre un échantillon que si CPU système ≥ ce % (évite extrapolation folle à l’idle)
MONITORING_CAPACITY_MIN_CPU_SAMPLE_PCT = _float_env("MONITORING_CAPACITY_MIN_CPU_SAMPLE_PCT", 4.0)
# Taille max de la fenêtre glissante d’estimations ponctuelles (~1 h20 à un tick / 45 s)
MONITORING_CAPACITY_SAMPLE_MAX = _int_env("MONITORING_CAPACITY_SAMPLE_MAX", 96)


# En production, sans Supabase, refuser le démarrage sauf opt-in explicite (données locales partagées = risque)
ALLOW_LOCAL_DATA_IN_PRODUCTION = _truthy_env("ALLOW_LOCAL_DATA_IN_PRODUCTION")


def _hostname_from_public_url(url: str) -> str | None:
    """Extrait le hostname d’une URL (ou d’un domaine seul) pour TrustedHost."""
    u = (url or "").strip()
    if not u:
        return None
    if "://" not in u:
        u = "https://" + u
    try:
        h = (urlparse(u).hostname or "").strip().lower()
        return h or None
    except ValueError:
        return None


def _normalize_trusted_host_token(token: str) -> str | None:
    """Hostname seul, host:port ou URL complète → hostname (Starlette compare sans port)."""
    t = token.strip().lower()
    if not t:
        return None
    if "://" in t or t.startswith("//"):
        return _hostname_from_public_url(t)
    if t.startswith("["):
        if "]:" in t:
            return t[: t.index("]") + 1]
        return t
    if ":" in t:
        host, _, maybe_port = t.rpartition(":")
        if maybe_port.isdigit() and host:
            return host
    return t


def trusted_host_names() -> list[str]:
    """Hôtes HTTP autorisés (Host / X-Forwarded-Host). Vide = pas de filtre TrustedHost."""
    raw = _env("TRUSTED_HOSTS")
    if not raw:
        return []
    hosts: list[str] = []
    seen: set[str] = set()

    def add(name: str | None) -> None:
        if not name or name in seen:
            return
        seen.add(name)
        hosts.append(name)

    for part in raw.split(","):
        norm = _normalize_trusted_host_token(part)
        if norm:
            add(norm)
    # Même origine : le proxy envoie souvent Host = domaine du front, pas le sous-domaine « api » seul
    for segment in (FRONTEND_URL or "").split(","):
        add(_hostname_from_public_url(segment.strip()))
    add(_hostname_from_public_url(API_BASE_URL))
    # Healthcheck Docker et outils locaux
    for loopback in ("localhost", "127.0.0.1", "[::1]"):
        add(loopback)
    return hosts

# Budget Gemini par compte (€) - dépassement = blocage soft (pas affiché à l'utilisateur)
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
