"""Pydantic models for the triage harness.

`ExtractedTicket` is the contract the LLM must satisfy. Every violation raises
`ValidationError`, which the graph turns into a retry (CA 2.2, CA 3.1).
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field, field_validator


class Category(str, Enum):
    FACTURACION = "Facturación"
    TECNICO = "Técnico"
    CUENTA = "Cuenta"
    SUGERENCIA = "Sugerencia"


class Urgency(str, Enum):
    BAJA = "Baja"
    MEDIA = "Media"
    ALTA = "Alta"
    CRITICA = "Crítica"


class ExtractionState(str, Enum):
    """Terminal states of a single run.

    QUOTA_EXCEEDED is not in spec section 12. It was added during development
    because the Gemini free tier runs out, and retrying a 429 is pointless: the
    quota stays exhausted for every retry. Reported as a successful HTTP call
    with a clear message, not as a harness failure.
    """

    SUCCESS = "success"
    NEEDS_MANUAL_REVIEW = "needs_manual_review"
    QUOTA_EXCEEDED = "quota_exceeded"


class ExtractedTicket(BaseModel):
    """Strict schema for the agent output (CA 2.1).

    Pydantic rejects unknown enum values, so a category like "Finanzas" or an
    urgency like "Urgente" raises ValidationError on its own (CA 2.2).
    """

    summary: str = Field(min_length=5)
    category: Category
    urgency: Urgency
    requires_human_escalation: bool
    extracted_amount: float | None = None

    # model_config forbids extra keys so the LLM cannot smuggle in fields that
    # would never reach the database.
    model_config = {"extra": "forbid"}


# CA 2.3: for billing or critical tickets the summary must be specific enough to
# act on. A phrase that only restates the category carries no information.
GENERIC_SUMMARIES: frozenset[str] = frozenset(
    {
        "problema con la factura",
        "problema de facturacion",
        "problema de facturación",
        "error en la cuenta",
        "problema técnico",
        "problema tecnico",
        "solicitud del cliente",
        "necesita ayuda",
        "urgente",
        "problema general",
        "consulta",
    }
)

# Anything shorter than this is treated as a placeholder rather than a summary.
MIN_SPECIFIC_SUMMARY_LENGTH = 15


def _is_generic(summary: str) -> bool:
    """True when the summary adds no information beyond the category itself."""
    normalized = summary.strip().lower()
    if normalized in GENERIC_SUMMARIES:
        return True
    if len(normalized) < MIN_SPECIFIC_SUMMARY_LENGTH:
        return True
    # A summary that is just the category name is not a summary.
    return normalized in {"facturación", "facturacion", "técnico", "tecnico", "cuenta", "sugerencia"}


def validate_business_rules(ticket: ExtractedTicket) -> None:
    """Enforce CA 2.3.

    Raises `ValueError` when the ticket is billing or critical but the summary
    is generic. The graph treats this the same as a schema failure.
    """
    if ticket.category is Category.FACTURACION or ticket.urgency is Urgency.CRITICA:
        if _is_generic(ticket.summary):
            raise ValueError(
                "Regla de negocio CA 2.3: para categoría 'Facturación' o "
                "urgencia 'Crítica', el summary debe ser específico y no puede "
                f"ser genérico. Recibido: {ticket.summary!r}"
            )


class AttemptLog(BaseModel):
    """One entry in the audit trail (CA 4.2)."""

    attempt: int
    succeeded: bool
    error: str | None = None
    ticket: ExtractedTicket | None = None


class RunResult(BaseModel):
    """What the API returns to the dashboard."""

    status: ExtractionState
    attempts: list[AttemptLog] = Field(default_factory=list)
    ticket: ExtractedTicket | None = None
    customer_message: str
    channel: str
    max_retries: int
    needs_manual_review: bool = False
    quota_exceeded: bool = False
    error: str | None = None
    total_ms: int | None = None
    # How many daily executions the caller has left after this one.
    runs_remaining: int | None = None


class ChatRequest(BaseModel):
    """Request body from the dashboard."""

    customer_message: str = Field(min_length=15, max_length=1000)
    channel: str
    max_retries: int = Field(default=3, ge=1, le=5)


__all__ = [
    "AttemptLog",
    "Category",
    "ChatRequest",
    "ExtractionState",
    "ExtractedTicket",
    "RunResult",
    "Urgency",
    "validate_business_rules",
]
