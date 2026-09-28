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

from app import db, main as main_module
from app.llm import LLMError, MockProvider
from app.main import app

SESSION_A = "header-session-aaaa"
SESSION_B = "header-session-bbbb"

MESSAGE = "No puedo iniciar sesion, me sale un error 500 con mis credenciales correctas."


@pytest.fixture(autouse=True)
def clean_db():
    db.reset()
    yield
    db.reset()


@pytest.fixture
def stub_provider(monkeypatch):
    """Swap the provider factory so no test spends quota."""
    monkeypatch.setattr(main_module, "get_llm", lambda: MockProvider(fail_times=0))


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


class TestProviderUnavailable:
    """A missing API key must not become a bare 500.

    This is what the production deployment did: no GEMINI_API_KEY on the Vercel
    project, so building the provider raised and the request 500ed with an opaque
    "Internal Server Error" while GET endpoints kept working.
    """

    async def test_missing_key_returns_a_typed_state(self, client, monkeypatch):
        def boom():
            raise LLMError("GEMINI_API_KEY no está definida")

        monkeypatch.setattr(main_module, "get_llm", boom)

        response = await client.post("/api/triage", json=PAYLOAD)

        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "unavailable"
        assert body["unavailable"] is True
        assert "GEMINI_API_KEY" in body["error"]

    async def test_missing_key_does_not_burn_budget(self, client, monkeypatch):
        """A misconfigured service is not an execution the visitor spent."""
        def boom():
            raise LLMError("GEMINI_API_KEY no está definida")

        monkeypatch.setattr(main_module, "get_llm", boom)

        await client.post("/api/triage", json=PAYLOAD)

        quota = (await client.get("/api/quota")).json()
        assert quota["used"] == 0


class TestCors:
    async def test_allows_the_production_frontend_origin(self, client):
        """The deployed dashboard is cross-origin, so this must be allowed."""
        response = await client.get(
            "/api/quota",
            headers={"Origin": "https://triage-front.vercel.app"},
        )
        assert response.headers.get("access-control-allow-origin") == (
            "https://triage-front.vercel.app"
        )

    async def test_allows_the_session_header_on_preflight(self, client):
        """X-Session-Id triggers a preflight, which failed with a 400 before."""
        response = await client.options(
            "/api/quota",
            headers={
                "Origin": "https://triage-front.vercel.app",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "x-session-id",
            },
        )
        assert response.status_code == 200
        assert response.headers.get("access-control-allow-origin") is not None

    async def test_still_allows_local_development(self, client):
        response = await client.get(
            "/api/quota", headers={"Origin": "http://localhost:3000"}
        )
        assert response.headers.get("access-control-allow-origin") == (
            "http://localhost:3000"
        )

    async def test_rejects_an_unknown_origin(self, client):
        response = await client.get(
            "/api/quota", headers={"Origin": "https://evil.example.com"}
        )
        assert response.headers.get("access-control-allow-origin") is None


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
