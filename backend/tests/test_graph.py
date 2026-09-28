"""Tests for the graph: the retry loop and its terminal states.

These are the behaviours the spec calls out explicitly (CA 3.1, 3.2, 3.3).
"""

from __future__ import annotations

import pytest

from app import db
from app.graph import run_triage
from app.llm import LLMProvider, MockProvider
from app.models import ExtractionState

MESSAGE = "Me cobraron dos veces la suscripción de marzo, son 4999 pesos cada cobro"


@pytest.fixture(autouse=True)
def clean_db():
    db.reset()
    yield
    db.reset()


class TestSuccessPath:
    async def test_succeeds_on_first_attempt(self):
        provider = MockProvider(fail_times=0)
        state = await run_triage(provider, MESSAGE, "email", 3)

        assert state["status"] is ExtractionState.SUCCESS
        assert state["ticket"] is not None
        assert len(state["attempts"]) == 1
        assert state["attempts"][0].succeeded is True
        assert provider.calls == 1

    async def test_persists_the_ticket(self):
        provider = MockProvider(fail_times=0)
        state = await run_triage(provider, MESSAGE, "email", 3)

        assert db.count() == 1
        stored = db.list_tickets()[0]
        assert stored["category"] == "Facturación"
        assert stored["urgency"] == "Alta"
        assert stored["customer_message"] == MESSAGE
        assert stored["channel"] == "email"

    async def test_reports_total_time(self):
        state = await run_triage(MockProvider(), MESSAGE, "email", 3)
        assert state["total_ms"] is not None and state["total_ms"] >= 0


class TestSelfCorrection:
    async def test_recovers_after_one_failure(self):
        """CA 3.1 and 3.2: the error is injected and the loop retries."""
        provider = MockProvider(fail_times=1, seed=1)
        state = await run_triage(provider, MESSAGE, "email", 3)

        assert state["status"] is ExtractionState.SUCCESS
        assert provider.calls == 2
        assert len(state["attempts"]) == 2
        assert state["attempts"][0].succeeded is False
        assert state["attempts"][0].error  # the exact message is kept (CA 4.2)
        assert state["attempts"][1].succeeded is True

    async def test_retry_prompt_includes_the_error(self):
        from app.prompts import build_retry_prompt

        prompt = build_retry_prompt(MESSAGE, "ValidationError: campo category")
        assert "Tu intento anterior falló con:" in prompt
        assert "campo category" in prompt
        assert MESSAGE in prompt

    async def test_stops_at_max_retries(self):
        """CA 3.2: never exceeds the configured limit."""
        provider = MockProvider(fail_times=99, seed=3)
        state = await run_triage(provider, MESSAGE, "email", 2)

        assert provider.calls == 2
        assert len(state["attempts"]) == 2

    async def test_max_retries_of_one_never_retries(self):
        """EC-10: max_retries=1 means a single attempt."""
        provider = MockProvider(fail_times=99, seed=3)
        state = await run_triage(provider, MESSAGE, "email", 1)

        assert provider.calls == 1
        assert state["status"] is ExtractionState.NEEDS_MANUAL_REVIEW


class TestNeedsManualReview:
    async def test_marks_manual_review_after_exhausting_retries(self):
        """CA 3.3."""
        provider = MockProvider(fail_times=99, seed=3)
        state = await run_triage(provider, MESSAGE, "email", 2)

        assert state["status"] is ExtractionState.NEEDS_MANUAL_REVIEW
        assert state["ticket"] is None
        assert state["error"] is not None

    async def test_does_not_persist_invalid_tickets(self):
        """The core promise: nothing invalid reaches the database."""
        await run_triage(MockProvider(fail_times=99, seed=3), MESSAGE, "email", 2)
        assert db.count() == 0

    async def test_keeps_every_failure_log(self):
        state = await run_triage(MockProvider(fail_times=99, seed=3), MESSAGE, "email", 3)

        assert len(state["attempts"]) == 3
        assert all(log.succeeded is False for log in state["attempts"])
        assert all(log.error for log in state["attempts"])

    async def test_attempt_numbers_are_sequential(self):
        state = await run_triage(MockProvider(fail_times=99, seed=3), MESSAGE, "email", 3)
        assert [log.attempt for log in state["attempts"]] == [1, 2, 3]


class TestQuotaExceeded:
    """The Gemini free tier runs out. Retrying a 429 is pointless."""

    async def test_reports_quota_exceeded_without_burning_retries(self):
        from app.llm import QuotaExceededError

        class QuotaProvider(LLMProvider):
            def __init__(self):
                self.calls = 0

            def complete(self, system_prompt: str, user_prompt: str) -> str:
                self.calls += 1
                raise QuotaExceededError("Se agotó la cuota del free tier")

        provider = QuotaProvider()
        state = await run_triage(provider, MESSAGE, "email", 5)

        assert state["status"] is ExtractionState.QUOTA_EXCEEDED
        # One call only: the remaining 4 attempts are never spent.
        assert provider.calls == 1
        assert len(state["attempts"]) == 1
        assert state["ticket"] is None

    async def test_does_not_persist_anything(self):
        from app.llm import QuotaExceededError

        class QuotaProvider(LLMProvider):
            def complete(self, system_prompt: str, user_prompt: str) -> str:
                raise QuotaExceededError("cuota agotada")

        await run_triage(QuotaProvider(), MESSAGE, "email", 3)
        assert db.count() == 0

    async def test_error_message_is_user_facing(self):
        from app.llm import QuotaExceededError

        class QuotaProvider(LLMProvider):
            def complete(self, system_prompt: str, user_prompt: str) -> str:
                raise QuotaExceededError("Se agotó la cuota del free tier")

        state = await run_triage(QuotaProvider(), MESSAGE, "email", 3)
        assert "free tier" in (state["error"] or "")


class TestProviderFailure:
    async def test_provider_error_counts_as_a_failed_attempt(self):
        from app.llm import LLMError

        class BrokenProvider(LLMProvider):
            def complete(self, system_prompt: str, user_prompt: str) -> str:
                raise LLMError("cuota agotada")

        state = await run_triage(BrokenProvider(), MESSAGE, "email", 2)

        assert state["status"] is ExtractionState.NEEDS_MANUAL_REVIEW
        assert "cuota agotada" in (state["attempts"][0].error or "")
