"""Tests for the per-user daily cap and the auth gate.

The dashboard is open to anyone with a Google account, so these are the
controls that keep one visitor from draining the shared Gemini quota.
"""

from __future__ import annotations

import pytest

from app import db, ratelimit


@pytest.fixture(autouse=True)
def clean_db():
    db.reset()
    yield
    db.reset()


class TestDailyLimit:
    def test_new_user_has_the_full_limit(self):
        assert ratelimit.used_today("user-a") == 0
        assert ratelimit.remaining_today("user-a") == ratelimit.DAILY_LIMIT

    def test_counts_each_run(self):
        ratelimit.record_run("user-a", "success")
        ratelimit.record_run("user-a", "success")
        assert ratelimit.used_today("user-a") == 2

    def test_users_are_counted_separately(self):
        """The cap is per person, not global."""
        for _ in range(ratelimit.DAILY_LIMIT):
            ratelimit.record_run("user-a", "success")

        assert ratelimit.used_today("user-a") == ratelimit.DAILY_LIMIT
        assert ratelimit.used_today("user-b") == 0

    def test_raises_when_exhausted(self):
        for _ in range(ratelimit.DAILY_LIMIT):
            ratelimit.record_run("user-a", "success")

        with pytest.raises(ratelimit.RateLimitError):
            ratelimit.check_and_consume("user-a")

    def test_allows_exactly_the_limit(self):
        for _ in range(ratelimit.DAILY_LIMIT - 1):
            ratelimit.record_run("user-a", "success")

        ratelimit.check_and_consume("user-a")  # the last one, no raise
        assert ratelimit.used_today("user-a") == ratelimit.DAILY_LIMIT

    def test_consume_counts_exactly_one_row(self):
        """Regression: a run used to be counted twice, halving the real cap."""
        for _ in range(ratelimit.DAILY_LIMIT):
            ratelimit.consume("user-a")
        assert ratelimit.used_today("user-a") == ratelimit.DAILY_LIMIT

        with pytest.raises(ratelimit.RateLimitError):
            ratelimit.consume("user-a")

    def test_mark_finished_does_not_add_a_row(self):
        """The outcome must be stamped on the existing row, not appended."""
        ratelimit.consume("user-a")
        ratelimit.mark_finished("user-a", "success")
        assert ratelimit.used_today("user-a") == 1

    def test_full_cycle_consumes_one_execution(self):
        """What the endpoint actually does: consume, then mark_finished."""
        for _ in range(ratelimit.DAILY_LIMIT):
            ratelimit.consume("user-a")
            ratelimit.mark_finished("user-a", "success")

        assert ratelimit.used_today("user-a") == ratelimit.DAILY_LIMIT
        assert ratelimit.remaining_today("user-a") == 0
        with pytest.raises(ratelimit.RateLimitError):
            ratelimit.consume("user-a")

    def test_remaining_never_goes_negative(self):
        for _ in range(ratelimit.DAILY_LIMIT + 5):
            ratelimit.record_run("user-a", "success")
        assert ratelimit.remaining_today("user-a") == 0

    def test_counts_failed_runs_too(self):
        """A caller must not drain the quota by forcing invalid output."""
        ratelimit.record_run("user-a", "quota_exceeded")
        ratelimit.record_run("user-a", "needs_manual_review")
        assert ratelimit.used_today("user-a") == 2

    def test_error_carries_the_numbers(self):
        for _ in range(ratelimit.DAILY_LIMIT):
            ratelimit.record_run("user-a", "success")
        with pytest.raises(ratelimit.RateLimitError) as info:
            ratelimit.check_and_consume("user-a")
        assert info.value.limit == ratelimit.DAILY_LIMIT
        assert info.value.used == ratelimit.DAILY_LIMIT
