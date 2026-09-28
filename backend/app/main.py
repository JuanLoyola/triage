"""FastAPI application.

Exposes the triage endpoint the dashboard calls, plus read endpoints for the
audit trail. CORS is open for local development against the Next.js dev server.
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from typing import Annotated, Any

from fastapi import Depends, FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError

# Must come before anything reads configuration.
from .env import load_env  # noqa: F401  (import side effect: loads .env)

from . import db, ratelimit
from .auth import resolve_user_id
from .graph import run_triage
from .llm import LLMProvider, get_provider
from .models import ChatRequest, ExtractionState, RunResult

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.get_connection()  # create the schema on startup
    logger.info("Backend listo. MOCK_LLM=%s", os.getenv("MOCK_LLM", "false"))
    yield
    db.reset()


app = FastAPI(title="Triage API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_llm() -> LLMProvider:
    """FastAPI dependency so tests can override the provider."""
    return get_provider()


LLM = Annotated[LLMProvider, Depends(get_llm)]


@app.get("/health")
async def health() -> dict[str, Any]:
    return {"status": "ok", "tickets": db.count(), "mock_llm": os.getenv("MOCK_LLM", "false")}


@app.get("/api/quota")
async def quota(authorization: Annotated[str | None, Header()] = None) -> dict[str, Any]:
    """How many executions the caller has left today.

    The dashboard shows this so visitors understand the cap instead of hitting
    it blind.
    """
    user_id = await resolve_user_id(authorization)
    used = ratelimit.used_today(user_id)
    return {
        "limit": ratelimit.DAILY_LIMIT,
        "used": used,
        "remaining": max(ratelimit.DAILY_LIMIT - used, 0),
    }


@app.post("/api/triage", response_model=RunResult)
async def triage(
    request: ChatRequest,
    llm: LLM,
    authorization: Annotated[str | None, Header()] = None,
) -> RunResult:
    """Run one triage execution with the self-correcting loop (CA 3.2, 3.3).

    Requires a valid Supabase session and counts against the caller's daily cap.
    Always answers 200 for a run that reached the agent, including
    `quota_exceeded`: that is provider exhaustion, not a harness failure.
    """
    user_id = await resolve_user_id(authorization)

    try:
        # One row per execution. The outcome is stamped on later.
        ratelimit.consume(user_id)
    except ratelimit.RateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"Alcanzaste el límite de {exc.limit} ejecuciones por día. "
                "Se reinicia a medianoche. Cada ejecución consume cuota del "
                "free tier de Gemini, que es compartida."
            ),
        ) from exc

    try:
        state = await run_triage(
            provider=llm,
            customer_message=request.customer_message,
            channel=request.channel,
            max_retries=request.max_retries,
        )
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors()) from exc

    run_status = state["status"]
    ratelimit.mark_finished(user_id, run_status.value)

    return RunResult(
        status=run_status,
        attempts=state.get("attempts", []),
        ticket=state.get("ticket"),
        customer_message=request.customer_message,
        channel=request.channel,
        max_retries=request.max_retries,
        needs_manual_review=run_status is ExtractionState.NEEDS_MANUAL_REVIEW,
        quota_exceeded=run_status is ExtractionState.QUOTA_EXCEEDED,
        error=state.get("error"),
        total_ms=state.get("total_ms"),
        runs_remaining=ratelimit.remaining_today(user_id),
    )


@app.get("/api/tickets")
async def list_tickets(limit: int = 50) -> list[dict[str, Any]]:
    return db.list_tickets(limit=limit)


@app.get("/api/tickets/{ticket_id}")
async def get_ticket(ticket_id: int) -> dict[str, Any]:
    ticket = db.get_ticket(ticket_id)
    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")
    return ticket
