"""Tests for the HTTP surface.

`test_sessions_are_bucketed_separately` is the important one. A real bug
shipped where `X-Session-Id` was declared as `Annotated[..., Header()]` inside a
module using `from __future__ import annotations`: FastAPI could not resolve the
header and treated every request as session-less, so all visitors shared one
bucket. The `ratelimit` unit tests passed the entire time. Only a test at the
HTTP level caught it, which is why this file exists.
"""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app import db
from app.llm import MockProvider
from app.main import app, get_llm

SESSION_A = "header-session-aaaa"
SESSION_B = "header-session-bbbb"

MESSAGE = "No puedo iniciar sesion, me sale un error 500 con mis credenciales correctas."


@pytest.fixture(autouse=True)
def clean_db():
    db.reset()
    yield
    db.reset()


@pytest.fixture
def stub_provider():
    """Swap the LLM dependency so no test spends provider quota."""
    app.dependency_overrides[get_llm] = lambda: MockProvider(fail_times=0)
    yield
    app.dependency_overrides.clear()


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as http_client:
        yield http_client


PAYLOAD = {"customer_message": MESSAGE, "channel": "chat", "max_retries": 1}


class TestSessionHeaderIsRead:
    async def test_sessions_are_bucketed_separately(self, client, stub_provider):
        """Regression: the header was ignored and everyone shared a bucket."""
        for _ in range(3):
            response = await client.post(
                "/api/triage", json=PAYLOAD, headers={"X-Session-Id": SESSION_A}
            )
            assert response.status_code == 200, response.text

        # A is exhausted.
        blocked = await client.post(
            "/api/triage", json=PAYLOAD, headers={"X-Session-Id": SESSION_A}
        )
        assert blocked.status_code == 429

        # B never sent anything, so it must be untouched.
        other = await client.get("/api/quota", headers={"X-Session-Id": SESSION_B})
        body = other.json()
        assert body["used"] == 0
        assert body["remaining"] == body["limit"] == 3

        # And B can still run.
        allowed = await client.post(
            "/api/triage", json=PAYLOAD, headers={"X-Session-Id": SESSION_B}
        )
        assert allowed.status_code == 200

    async def test_health_reports_the_remaining_budget(self, client):
        body = (await client.get("/health")).json()
        assert body["runs_remaining"] == 3


class TestQuota:
    async def test_quota_without_a_header_works(self, client):
        response = await client.get("/api/quota")
        assert response.status_code == 200
        assert response.json()["limit"] == 3

    async def test_quota_reports_the_global_backstop(self, client):
        body = (await client.get("/api/quota")).json()
        assert "global_remaining" in body
        assert body["global_remaining"] > 0


class TestValidation:
    async def test_short_message_is_rejected(self, client):
        """CA 1.1: the backend enforces the length even if the client is bypassed."""
        response = await client.post(
            "/api/triage",
            json={"customer_message": "corto", "channel": "chat", "max_retries": 1},
        )
        assert response.status_code == 422

    async def test_max_retries_out_of_range_is_rejected(self, client):
        response = await client.post(
            "/api/triage",
            json={
                "customer_message": MESSAGE,
                "channel": "chat",
                "max_retries": 99,
            },
        )
        assert response.status_code == 422
