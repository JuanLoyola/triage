"""The LangGraph agent loop (Historia 3).

Nodes:
- `extract_ticket`  call the LLM and parse the output against the schema
- `validate_ticket` apply the CA 2.3 business rule and record the attempt
- `finalize`        persist on success, mark NEEDS_MANUAL_REVIEW otherwise

`max_retries` is the total number of attempts, matching CA 3.2: the graph loops
back while `attempt < max_retries`.

Each attempt produces exactly one `AttemptLog` entry. The entry is written by
`validate_ticket`, because only there is the verdict final: a ticket can pass
the schema and still be rejected by the business rule.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Annotated, Any, Literal, TypedDict

from langgraph.graph import END, StateGraph
from pydantic import ValidationError

from . import db
from .llm import LLMError, LLMProvider, QuotaExceededError
from .models import (
    AttemptLog,
    ExtractedTicket,
    ExtractionState,
    validate_business_rules,
)
from .prompts import BASE_SYSTEM_PROMPT, build_retry_prompt

logger = logging.getLogger(__name__)

# The reducer concatenates attempt lists instead of replacing them, so each node
# can append its own entry without knowing the history.
Attempts = Annotated[list[AttemptLog], lambda a, b: a + b]


class TriageState(TypedDict, total=False):
    """State carried between nodes."""

    customer_message: str
    channel: str
    max_retries: int
    attempt: int
    attempts: Attempts
    ticket: ExtractedTicket | None
    raw_output: str
    last_error: str | None
    status: ExtractionState
    started_at: float
    total_ms: int | None
    error: str | None
    quota_exhausted: bool


def _parse(raw: str) -> ExtractedTicket:
    """Parse and validate the LLM output against the schema.

    Raises `ValueError` for malformed JSON and `ValidationError` for schema
    violations, so the retry loop handles both identically (EC-4, CA 2.2).
    """
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(
            f"La respuesta del modelo no es JSON válido: {exc}. "
            "Respondé únicamente con el objeto JSON, sin texto alrededor."
        ) from exc

    if not isinstance(payload, dict):
        raise ValueError(
            "La respuesta del modelo debe ser un objeto JSON, "
            f"recibí {type(payload).__name__}."
        )

    # ExtractedTicket raises ValidationError on bad enums, short summaries,
    # wrong types, or extra keys.
    return ExtractedTicket(**payload)


def _has_attempts_left(state: TriageState) -> bool:
    """CA 3.2: loop back only while the budget remains."""
    return state.get("attempt", 0) < state["max_retries"]


def build_graph(provider: LLMProvider):
    """Build the graph with a given LLM provider. Injected, not global."""

    def extract_ticket(state: TriageState) -> dict[str, Any]:
        """Call the LLM. Schema failures are recorded, not thrown."""
        attempt = state.get("attempt", 0) + 1
        last_error = state.get("last_error")

        if last_error:
            # CA 3.1: inject the exact validation error.
            user_prompt = build_retry_prompt(state["customer_message"], last_error)
        else:
            user_prompt = state["customer_message"]

        try:
            raw = provider.complete(BASE_SYSTEM_PROMPT, user_prompt)
        except QuotaExceededError as exc:
            # Not a harness failure and not recoverable by retrying: the quota
            # stays exhausted for every subsequent attempt. Log the attempt so
            # the timeline is honest, and flag the run so finalize short-circuits.
            logger.warning("Intento %s: cuota del proveedor agotada", attempt)
            return {
                "attempt": attempt,
                "raw_output": "",
                "ticket": None,
                "last_error": str(exc),
                "quota_exhausted": True,
                "attempts": [
                    AttemptLog(attempt=attempt, succeeded=False, error=str(exc))
                ],
            }
        except LLMError as exc:
            logger.warning("Intento %s: el proveedor falló: %s", attempt, exc)
            error = f"Error del proveedor: {exc}"
            return {
                "attempt": attempt,
                "raw_output": "",
                "ticket": None,
                "last_error": error,
                "attempts": [AttemptLog(attempt=attempt, succeeded=False, error=error)],
            }

        try:
            ticket = _parse(raw)
        except (ValidationError, ValueError) as exc:
            logger.info("Intento %s: validación falló: %s", attempt, exc)
            return {
                "attempt": attempt,
                "raw_output": raw,
                "ticket": None,
                "last_error": str(exc),
                "attempts": [
                    AttemptLog(attempt=attempt, succeeded=False, error=str(exc))
                ],
            }

        # The schema passed. The business rule still has to run, so no attempt
        # is logged here: validate_ticket owns the verdict.
        return {"attempt": attempt, "raw_output": raw, "ticket": ticket, "last_error": None}

    def validate_ticket(state: TriageState) -> dict[str, Any]:
        """Run the CA 2.3 business rule and record the attempt verdict."""
        ticket = state.get("ticket")
        attempt = state.get("attempt", 1)

        if ticket is None:  # pragma: no cover - guarded by the router
            return {"last_error": "No hay ticket para validar"}

        try:
            validate_business_rules(ticket)
        except ValueError as exc:
            logger.info("Intento %s: regla de negocio falló: %s", attempt, exc)
            return {
                "ticket": None,
                "last_error": str(exc),
                "attempts": [
                    AttemptLog(
                        attempt=attempt, succeeded=False, error=str(exc), ticket=ticket
                    )
                ],
            }

        return {
            "attempts": [
                AttemptLog(attempt=attempt, succeeded=True, ticket=ticket)
            ]
        }

    def route_after_extract(
        state: TriageState,
    ) -> Literal["validate_ticket", "extract_ticket", "finalize"]:
        """A parsed ticket must still clear the business rule.

        Going straight to finalize here would skip CA 2.3, so this router always
        hands a parsed ticket to `validate_ticket`.
        """
        if state.get("quota_exhausted"):
            return "finalize"
        if state.get("ticket") is not None:
            return "validate_ticket"
        if _has_attempts_left(state):
            return "extract_ticket"
        return "finalize"

    def route_after_validate(
        state: TriageState,
    ) -> Literal["extract_ticket", "finalize"]:
        """CA 3.2: retry while the budget remains, otherwise finish."""
        if state.get("ticket") is not None and state.get("last_error") is None:
            return "finalize"
        if _has_attempts_left(state):
            return "extract_ticket"
        return "finalize"

    def finalize(state: TriageState) -> dict[str, Any]:
        """Persist on success, otherwise mark for manual review (CA 3.3)."""
        total_ms = int((time.monotonic() - state["started_at"]) * 1000)
        ticket = state.get("ticket")
        attempts = state.get("attempts", [])

        if ticket is not None:
            db.save_ticket(ticket, state["customer_message"], state["channel"], attempts)
            logger.info("Guardado ticket tras %s intentos", len(attempts))
            return {
                "status": ExtractionState.SUCCESS,
                "total_ms": total_ms,
                "last_error": None,
                "error": None,
            }

        last_error = state.get("last_error") or "Error desconocido"

        if state.get("quota_exhausted"):
            # Reported as its own state, not as a manual-review failure: nothing
            # about the ticket or the harness failed.
            logger.warning("Cuota del proveedor agotada tras %s intentos", len(attempts))
            return {
                "status": ExtractionState.QUOTA_EXCEEDED,
                "total_ms": total_ms,
                "error": last_error,
            }

        logger.warning(
            "NEEDS_MANUAL_REVIEW tras %s intentos: %s", len(attempts), last_error
        )
        return {
            "status": ExtractionState.NEEDS_MANUAL_REVIEW,
            "total_ms": total_ms,
            "error": last_error,
        }

    graph = StateGraph(TriageState)
    graph.add_node("extract_ticket", extract_ticket)
    graph.add_node("validate_ticket", validate_ticket)
    graph.add_node("finalize", finalize)

    graph.set_entry_point("extract_ticket")
    graph.add_conditional_edges(
        "extract_ticket",
        route_after_extract,
        {
            "validate_ticket": "validate_ticket",
            "extract_ticket": "extract_ticket",
            "finalize": "finalize",
        },
    )
    graph.add_conditional_edges(
        "validate_ticket",
        route_after_validate,
        {"extract_ticket": "extract_ticket", "finalize": "finalize"},
    )
    graph.add_edge("finalize", END)

    return graph.compile()


async def run_triage(
    provider: LLMProvider,
    customer_message: str,
    channel: str,
    max_retries: int,
) -> TriageState:
    """Run one triage execution end to end."""
    app = build_graph(provider)
    initial: TriageState = {
        "customer_message": customer_message,
        "channel": channel,
        "max_retries": max_retries,
        "attempt": 0,
        "attempts": [],
        "ticket": None,
        "raw_output": "",
        "last_error": None,
        "status": ExtractionState.NEEDS_MANUAL_REVIEW,
        "started_at": time.monotonic(),
        "total_ms": None,
        "error": None,
        "quota_exhausted": False,
    }
    return await app.ainvoke(initial)
