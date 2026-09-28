"""LLM provider layer.

Two implementations behind one interface:

- `GeminiProvider`   real calls to Gemini's free tier
- `MockProvider`     deterministic, used by tests and by `MOCK_LLM=true`

Both return raw text. Parsing and validation happen in the graph, not here, so
the retry loop always sees the same failure surface.
"""

from __future__ import annotations

import json
import logging
import os
import random
from typing import Protocol

logger = logging.getLogger(__name__)


class LLMError(RuntimeError):
    """Raised when the provider itself fails (network, auth, quota)."""

    def __init__(self, message: str, quota_exceeded: bool = False) -> None:
        super().__init__(message)
        self.quota_exceeded = quota_exceeded


class QuotaExceededError(LLMError):
    """The provider's free tier is exhausted.

    This is not a harness failure, so the graph must not spend retries on it.
    Retrying a 429 only burns the same exhausted quota.
    """

    def __init__(self, message: str) -> None:
        super().__init__(message, quota_exceeded=True)


QUOTA_MESSAGE = (
    "Se agotó la cuota del free tier de Gemini. El harness está funcionando "
    "correctamente, pero el proveedor no acepta más requests hasta que se "
    "resetee el límite. Probá de nuevo en unos minutos."
)


def _is_quota_error(exc: Exception) -> bool:
    """Detect quota exhaustion in a provider exception."""
    text = str(exc).lower()
    return "429" in text or "resource_exhausted" in text or "quota" in text


class LLMProvider(Protocol):
    def complete(self, system_prompt: str, user_prompt: str) -> str: ...


class GeminiProvider:
    """Gemini free tier via the google-genai SDK.

    Uses a response schema so Gemini constrains the output shape. The graph
    still validates, because the schema is a hint, not a guarantee.
    """

    def __init__(self, model: str = "gemini-3.8-flash", api_key: str | None = None) -> None:
        self._model = model
        self._api_key = api_key or os.getenv("GEMINI_API_KEY", "")
        if not self._api_key:
            raise LLMError("GEMINI_API_KEY no está definida")
        self._client = None

    def _ensure_client(self):
        if self._client is None:
            try:
                from google import genai
            except ImportError as exc:  # pragma: no cover - install-time issue
                raise LLMError("Falta la dependencia google-genai") from exc
            self._client = genai.Client(api_key=self._api_key)
        return self._client

    def complete(self, system_prompt: str, user_prompt: str) -> str:
        client = self._ensure_client()
        try:
            response = client.models.generate_content(
                model=self._model,
                contents=user_prompt,
                config={
                    "system_instruction": system_prompt,
                    "temperature": 0.1,
                    "response_mime_type": "application/json",
                },
            )
        except Exception as exc:  # noqa: BLE001 - surface any SDK failure
            if _is_quota_error(exc):
                raise QuotaExceededError(QUOTA_MESSAGE) from exc
            raise LLMError(f"Gemini falló: {exc}") from exc

        text = getattr(response, "text", None)
        if not text:
            raise LLMError("Gemini devolvió una respuesta vacía")
        return text


class MockProvider:
    """Deterministic mock for tests and offline development.

    `fail_times` makes the first N calls return invalid output so the retry loop
    (CA 3.2) can be exercised deterministically without an API key.
    """

    VALID_TICKET = {
        "summary": "Se le cobraron dos veces el mismo importe por la suscripción de marzo",
        "category": "Facturación",
        "urgency": "Alta",
        "requires_human_escalation": True,
        "extracted_amount": 4999.0,
    }

    def __init__(self, fail_times: int = 0, seed: int = 0) -> None:
        self.fail_times = fail_times
        self.calls = 0
        self._random = random.Random(seed)

    def complete(self, system_prompt: str, user_prompt: str) -> str:
        self.calls += 1
        if self.calls <= self.fail_times:
            return self._invalid_output()
        return json.dumps(self.VALID_TICKET, ensure_ascii=False)

    def _invalid_output(self) -> str:
        """Cycle through the failure modes the harness must recover from."""
        modes = [
            # Wrong enum value for category (CA 2.2).
            json.dumps(
                {
                    "summary": "El cliente no puede iniciar sesión",
                    "category": "Finanzas",
                    "urgency": "Alta",
                    "requires_human_escalation": False,
                    "extracted_amount": None,
                },
                ensure_ascii=False,
            ),
            # Wrong enum value for urgency (CA 2.2).
            json.dumps(
                {
                    "summary": "El cliente no puede iniciar sesión",
                    "category": "Técnico",
                    "urgency": "Urgente",
                    "requires_human_escalation": False,
                    "extracted_amount": None,
                },
                ensure_ascii=False,
            ),
            # Valid enums but generic summary on a Facturación ticket (CA 2.3).
            json.dumps(
                {
                    "summary": "problema con la factura",
                    "category": "Facturación",
                    "urgency": "Baja",
                    "requires_human_escalation": False,
                    "extracted_amount": None,
                },
                ensure_ascii=False,
            ),
            # Not JSON at all (EC-4).
            "Aquí está el resultado del análisis: el cliente tiene un problema.",
        ]
        return modes[self._random.randrange(len(modes))]


def get_provider() -> LLMProvider:
    """Build the provider from environment configuration."""
    if os.getenv("MOCK_LLM", "false").lower() == "true":
        logger.info("Usando MockProvider (MOCK_LLM=true)")
        return MockProvider()
    return GeminiProvider(
        model=os.getenv("GEMINI_MODEL", "gemini-3.8-flash"),
        api_key=os.getenv("GEMINI_API_KEY"),
    )
