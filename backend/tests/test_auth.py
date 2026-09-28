"""Tests for the auth gate.

Without these, the rate limit is meaningless: an anonymous caller could claim
any user id they liked.
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from app import auth


class TestMissingToken:
    async def test_no_header_is_401(self):
        with pytest.raises(HTTPException) as info:
            await auth.resolve_user_id(None)
        assert info.value.status_code == 401

    async def test_wrong_scheme_is_401(self):
        with pytest.raises(HTTPException) as info:
            await auth.resolve_user_id("Basic abc123")
        assert info.value.status_code == 401

    async def test_empty_bearer_is_401(self):
        with pytest.raises(HTTPException) as info:
            await auth.resolve_user_id("Bearer ")
        assert info.value.status_code == 401


class TestAnonymousMode:
    async def test_allows_any_request_when_enabled(self, monkeypatch):
        """The local dev shortcut still works."""
        monkeypatch.setattr(auth, "ALLOW_ANONYMOUS", True)
        assert await auth.resolve_user_id(None) == auth.ANONYMOUS_USER

    async def test_everyone_shares_one_bucket(self, monkeypatch):
        """Documented consequence: the cap becomes global, not per person."""
        monkeypatch.setattr(auth, "ALLOW_ANONYMOUS", True)
        first = await auth.resolve_user_id(None)
        second = await auth.resolve_user_id("Bearer whatever")
        assert first == second
