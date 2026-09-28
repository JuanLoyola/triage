"""Supabase JWT verification.

The dashboard is open to anyone with a Google account, so the backend cannot
trust who it is talking to. Every execution is verified against Supabase before
it reaches the LLM, which is what makes the per-user rate limit meaningful.

The token is validated by asking Supabase, not by decoding it locally: that
needs no JWT secret on this side, so there is no secret to leak.
"""

from __future__ import annotations

import logging
import os

import httpx
from fastapi import HTTPException, status

logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")

# Allow auth-free local development without a running Supabase.
ALLOW_ANONYMOUS = os.getenv("ALLOW_ANONYMOUS", "false").lower() == "true"

ANONYMOUS_USER = "anonymous-local"


class AuthError(HTTPException):
    def __init__(self, detail: str) -> None:
        super().__init__(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)


async def resolve_user_id(authorization: str | None) -> str:
    """Return the authenticated user's id, or 401.

    With `ALLOW_ANONYMOUS=true` any request is accepted as a single shared
    local user. That is a development shortcut only: it makes the rate limit
    global instead of per-person, and it is off by default.
    """
    if ALLOW_ANONYMOUS:
        return ANONYMOUS_USER

    if not authorization or not authorization.lower().startswith("bearer "):
        raise AuthError("Falta el token de autenticación.")

    token = authorization.split(" ", 1)[1].strip()

    if not SUPABASE_URL or not SUPABASE_KEY:
        raise AuthError("El backend no tiene configurado Supabase.")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{SUPABASE_URL}/auth/v1/user",
                headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {token}"},
            )
    except httpx.HTTPError as exc:
        # A Supabase outage must not read as "not authenticated".
        logger.error("No se pudo verificar el token: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No pudimos verificar tu sesión. Probá de nuevo en un momento.",
        ) from exc

    if response.status_code == 401:
        raise AuthError("Tu sesión expiró. Volvé a iniciar sesión.")

    if response.status_code >= 500:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="El servicio de autenticación no responde. Probá de nuevo.",
        )

    if response.status_code != 200:
        raise AuthError("No pudimos verificar tu sesión.")

    user_id = response.json().get("id")
    if not user_id:
        raise AuthError("Token inválido.")
    return str(user_id)
