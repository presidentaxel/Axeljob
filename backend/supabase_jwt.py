"""
Décode les access tokens Supabase (HS256 avec secret projet, ou ES256/RS256 via JWKS).
Partagé par main (auth API) et monitoring_ops (comptage utilisateurs actifs).
"""

from __future__ import annotations

import jwt
from jwt import PyJWKClient

from backend.config import JWT_LEEWAY_SECONDS, SUPABASE_JWT_SECRET, SUPABASE_URL

_jwks_client: PyJWKClient | None = None


def decode_supabase_access_token(token: str) -> dict:
    if not token:
        raise ValueError("empty token")
    header = jwt.get_unverified_header(token)
    alg = header.get("alg", "HS256")
    leeway = JWT_LEEWAY_SECONDS
    if alg == "HS256":
        if not SUPABASE_JWT_SECRET:
            raise ValueError("SUPABASE_JWT_SECRET manquant pour JWT HS256")
        return jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
            leeway=leeway,
        )
    if not SUPABASE_URL:
        raise ValueError("SUPABASE_URL manquant pour JWKS")
    jwks_url = f"{SUPABASE_URL.rstrip('/')}/auth/v1/.well-known/jwks.json"
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = PyJWKClient(jwks_url, cache_keys=True)
    signing_key = _jwks_client.get_signing_key_from_jwt(token)
    return jwt.decode(
        token,
        signing_key.key,
        algorithms=[alg],
        audience="authenticated",
        leeway=leeway,
    )
