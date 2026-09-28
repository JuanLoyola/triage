"""Tests for the run caps.

There is no login, so the cap is per browser session (a client-generated id in
a header) with a global ceiling behind it. Both are tested here, including the
bypass path: clearing the id must not hand out unlimited budget, because the
global cap is what actually protects the free tier.
"""

from __future__ import annotations

import pytest

from app import db, ratelimit

SESSION_A = "session-aaaaaaaaaaaa"
SESSION_B = "session-bbbbbbbbbbbb"


@pytest.fixture(autouse=True)
def clean_db():
    db.reset()
    yield
    db.reset()


class TestSessionIdSanitizing:
    def test_accepts_a_valid_id(self):
        assert ratelimit.sanitize_session_id(SESSION_A) == SESSION_A

    @pytest.mark.parametrize(
        "raw",
        [
            None,
            "",
            "short",
            "x" * 100,
            "'; DROP TABLE runs; --",
            "../../etc/passwd",
            "sesión con espacios",
        ],
    )
    def test_falls_back_on_bad_input(self, raw):
        """A caller that cannot identify itself shares one strict bucket."""
        assert ratelimit.sanitize_session_id(raw) == ratelimit.FALLBACK_SESSION

    def test_bad_ids_do_not_get_fresh_budgets(self):
        for _ in range(ratelimit.DAILY_LIMIT):
            ratelimit.record_run("success", None)
        assert ratelimit.used_today(None) == ratelimit.DAILY_LIMIT


class TestPerSessionLimit:
    def test_default_limit_is_three(self):
        assert ratelimit.DAILY_LIMIT == 3

    def test_sessions_do_not_share_a_budget(self):
        """The point of the change: one visitor cannot spend another's."""
        for _ in range(ratelimit.DAILY_LIMIT):
            ratelimit.consume(SESSION_A)

        assert ratelimit.used_today(SESSION_A) == ratelimit.DAILY_LIMIT
        assert ratelimit.used_today(SESSION_B) == 0
        assert ratelimit.remaining_today(SESSION_B) == ratelimit.DAILY_LIMIT

    def test_raises_when_exhausted(self):
        for _ in range(ratelimit.DAILY_LIMIT):
            ratelimit.record_run("success", SESSION_A)

        with pytest.raises(ratelimit.RateLimitError) as info:
            ratelimit.consume(SESSION_A)
        assert info.value.scope == "sesión"

    def test_allows_exactly_the_limit(self):
        for _ in range(ratelimit.DAILY_LIMIT - 1):
            ratelimit.record_run("success", SESSION_A)

        ratelimit.consume(SESSION_A)  # the last slot
        assert ratelimit.remaining_today(SESSION_A) == 0

    def test_remaining_never_goes_negative(self):
        for _ in range(ratelimit.DAILY_LIMIT + 5):
            ratelimit.record_run("success", SESSION_A)
        assert ratelimit.remaining_today(SESSION_A) == 0

    def test_counts_failed_runs(self):
        ratelimit.record_run("quota_exceeded", SESSION_A)
        ratelimit.record_run("needs_manual_review", SESSION_A)
        assert ratelimit.used_today(SESSION_A) == 2

    def test_consume_counts_exactly_one_row(self):
        """Regression: runs used to be counted twice, halving the real cap."""
        for _ in range(ratelimit.DAILY_LIMIT):
            ratelimit.consume(SESSION_A)
        assert ratelimit.used_today(SESSION_A) == ratelimit.DAILY_LIMIT

        with pytest.raises(ratelimit.RateLimitError):
            ratelimit.consume(SESSION_A)

    def test_mark_finished_does_not_add_a_row(self):
        ratelimit.consume(SESSION_A)
        ratelimit.mark_finished("success", SESSION_A)
        assert ratelimit.used_today(SESSION_A) == 1

    def test_full_cycle_consumes_one_execution(self):
        for _ in range(ratelimit.DAILY_LIMIT):
            ratelimit.consume(SESSION_A)
            ratelimit.mark_finished("success", SESSION_A)

        assert ratelimit.used_today(SESSION_A) == ratelimit.DAILY_LIMIT
        with pytest.raises(ratelimit.RateLimitError):
            ratelimit.consume(SESSION_A)


class TestGlobalBackstop:
    def test_blocks_minting_new_session_ids(self):
        """Clearing sessionStorage must not grant unlimited executions."""
        total = ratelimit.GLOBAL_DAILY_LIMIT + 5
        for i in range(total):
            try:
                ratelimit.consume(f"fresh-session-{i:08d}")
            except ratelimit.RateLimitError as exc:
                assert exc.scope == "demo"
                break
        else:
            pytest.fail("the global backstop never triggered")

        assert ratelimit.used_global() == ratelimit.GLOBAL_DAILY_LIMIT

    def test_global_ceiling_blocks_an_exhausted_session(self):
        for i in range(ratelimit.GLOBAL_DAILY_LIMIT):
            ratelimit.record_run("success", f"session-{i:08d}")

        with pytest.raises(ratelimit.RateLimitError) as info:
            ratelimit.consume("brand-new-session")
        assert info.value.scope == "demo"

    def test_global_count_includes_every_session(self):
        ratelimit.record_run("success", SESSION_A)
        ratelimit.record_run("success", SESSION_B)
        assert ratelimit.used_global() == 2
