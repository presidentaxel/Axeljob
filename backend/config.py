"""Configuration backend : chemins, env, Supabase."""
import os
from pathlib import Path

# Racine du projet cv-bot (parent du dossier backend)
BASE_DIR = Path(__file__).resolve().parent.parent

# Variables d'environnement (chargées depuis cv-bot/.env ou backend/.env)
def _env(key: str, default: str = "") -> str:
    return os.environ.get(key, default).strip()

# Supabase (optionnel : si non défini, fallback fichier cv_base.json + adaptations/)
SUPABASE_URL = _env("SUPABASE_URL")
SUPABASE_SERVICE_KEY = _env("SUPABASE_SERVICE_KEY")  # service_role pour backend

USE_SUPABASE = bool(SUPABASE_URL and SUPABASE_SERVICE_KEY)

# URL publique du backend (pour que l’iframe preview charge CSS/assets depuis le bon serveur)
# En dev front sur 5173 + back sur 8000 : http://localhost:8000
API_BASE_URL = _env("CV_BOT_API_BASE_URL") or "http://localhost:8000"

# Secret JWT Supabase pour vérifier le token et récupérer user_id (Dashboard > API > JWT Secret)
SUPABASE_JWT_SECRET = _env("SUPABASE_JWT_SECRET")

# WeasyPrint (Windows)
if os.name == "nt":
    dll_dirs = _env("WEASYPRINT_DLL_DIRECTORIES")
    if dll_dirs:
        for dir_path in dll_dirs.replace(",", ";").split(";"):
            dir_path = os.path.abspath(dir_path.strip())
            if dir_path and os.path.isdir(dir_path):
                os.environ["PATH"] = dir_path + os.pathsep + os.environ.get("PATH", "")
