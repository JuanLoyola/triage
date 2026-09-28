"""FastAPI application.

Exposes the triage endpoint the dashboard calls, plus read endpoints for the
audit trail. CORS is open because the dashboard is public and unauthenticated.

There is no auth. That is a deliberate MVP decision: the demo has to work from a
link with no signup. The cost is that the daily run cap is global rather than
per person, since there is no identity to separate.
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
from .graph import run_triage
from .llm import LLMProvider, get_provider
from .models import ChatRequest, ExtractionState, RunResult

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.get_connection()  # create the schema on startup
    logger.info(
        "Backend listo. MOCK_LLM=%s  DAILY_RUN_LIMIT=%s",
        os.getenv("MOCK_LLM", "false"),
        ratelimit.DAILY_LIMIT,
    )
    yield
    db.reset()


app = FastAPI(title="Triage API", version="0.2.0", lifespan=lifespan)

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
    return {
        "status": "ok",
        "tickets": db.count(),
        "runs_remaining": ratelimit.remaining_today(),
        "mock_llm": os.getenv("MOCK_LLM", "false"),
    }


@app.get("/api/quota")
async def quota(x_session_id: str | None = Header(default=None, alias="X-Session-Id")) -> dict[str, Any]:
    """How many executions this browser session has left today.

    The Header is declared with an explicit default rather than `Annotated`.
    This module uses `from __future__ import annotations`, which defers
    annotation evaluation, and FastAPI then failed to resolve the header and
    silently treated every request as session-less.
    """
    session_id = ratelimit.sanitize_session_id(x_session_id)
    used = ratelimit.used_today(session_id)
    return {
        "limit": ratelimit.DAILY_LIMIT,
        "used": used,
        "remaining": max(ratelimit.DAILY_LIMIT - used, 0),
        # The backstop, exposed so the demo cannot be a total surprise.
        "global_remaining": max(
            ratelimit.GLOBAL_DAILY_LIMIT - ratelimit.used_global(), 0
        ),
    }


@app.post("/api/triage", response_model=RunResult)
async def triage(
    request: ChatRequest,
    llm: LLM,
    x_session_id: str | None = Header(default=None, alias="X-Session-Id"),
) -> RunResult:
    """Run one triage execution with the self-correcting loop (CA 3.2, 3.3).

    Always answers 200 for a run that reached the agent, including
    `quota_exceeded`: that is provider exhaustion, not a harness failure.
    """
    session_id = ratelimit.sanitize_session_id(x_session_id)

    try:
        # One row per execution. The outcome is stamped on later.
        ratelimit.consume(session_id)
    except ratelimit.RateLimitError as exc:
        if exc.scope == "sesión":
            detail = (
                f"Usaste las {exc.limit} ejecuciones de esta sesión. Se reinician "
                "a medianoche. Podés abrir otra pestaña para seguir probando."
            )
        else:
            detail = (
                f"Se agotaron las {exc.limit} ejecuciones diarias de la demo completa. "
                "Se reinician a medianoche. La cuota del free tier de Gemini es "
                "compartida y finita."
            )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=detail
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
    ratelimit.mark_finished(run_status.value, session_id)

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
        runs_remaining=ratelimit.remaining_today(session_id),
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
