"""FastAPI application.

Exposes the triage endpoint the dashboard calls, plus read endpoints for the
audit trail. CORS is open for local development against the Next.js dev server.
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from typing import Annotated, Any

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError

# Must come before anything reads configuration.
from .env import load_env  # noqa: F401  (import side effect: loads .env)

from . import db
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


@app.post("/api/triage", response_model=RunResult)
async def triage(request: ChatRequest, llm: LLM) -> RunResult:
    """Run one triage execution with the self-correcting loop (CA 3.2, 3.3).

    Always answers 200. A run that ends in `quota_exceeded` is not a harness
    failure, so the dashboard renders it as an informational state rather than
    an error. Only malformed requests are rejected with 4xx.
    """
    try:
        state = await run_triage(
            provider=llm,
            customer_message=request.customer_message,
            channel=request.channel,
            max_retries=request.max_retries,
        )
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors()) from exc

    status = state["status"]
    return RunResult(
        status=status,
        attempts=state.get("attempts", []),
        ticket=state.get("ticket"),
        customer_message=request.customer_message,
        channel=request.channel,
        max_retries=request.max_retries,
        needs_manual_review=status is ExtractionState.NEEDS_MANUAL_REVIEW,
        quota_exceeded=status is ExtractionState.QUOTA_EXCEEDED,
        error=state.get("error"),
        total_ms=state.get("total_ms"),
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
