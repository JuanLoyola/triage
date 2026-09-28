"""Per-user daily rate limiting.

The dashboard is open to anyone with a Google account, and every execution costs
a Gemini call against a shared free tier. Without a cap, one visitor can drain
the quota and leave everyone else with an empty dashboard.

Counts are stored in the same in-memory SQLite as the tickets, so the cap
resets when the backend restarts. That is acceptable for an MVP and it is not
acceptable as a real limit: see the note in the README.
"""

from __future__ import annotations

import logging
import os

from . import db

logger = logging.getLogger(__name__)

# Configurable so the demo can be loosened without a code change.
DAILY_LIMIT = int(os.getenv("DAILY_RUN_LIMIT", "5"))


class RateLimitError(Exception):
    """Raised when a user exhausted their daily executions."""

    def __init__(self, used: int, limit: int) -> None:
        super().__init__(f"Límite diario alcanzado: {used}/{limit}")
        self.used = used
        self.limit = limit


def used_today(user_id: str) -> int:
    """How many executions this user has used since midnight (UTC)."""
    conn = db.get_connection()
    with db._LOCK:
        row = conn.execute(
            "SELECT COUNT(*) AS n FROM runs "
            "WHERE user_id = ? AND date(run_at) = date('now')",
            (user_id,),
        ).fetchone()
    return int(row["n"] if row else 0)


def remaining_today(user_id: str) -> int:
    return max(DAILY_LIMIT - used_today(user_id), 0)


def record_run(user_id: str, status: str) -> None:
    """Insert a run row directly. Used by tests."""
    conn = db.get_connection()
    with db._LOCK:
        conn.execute(
            "INSERT INTO runs (user_id, status) VALUES (?, ?)",
            (user_id, status),
        )
        conn.commit()


def mark_finished(user_id: str, status: str) -> None:
    """Stamp the outcome onto the row that `consume` already inserted.

    There must be exactly one row per execution, otherwise the daily count
    doubles and the cap is effectively half of what it says.
    """
    conn = db.get_connection()
    with db._LOCK:
        conn.execute(
            "UPDATE runs SET status = ? "
            "WHERE id = (SELECT id FROM runs "
            "            WHERE user_id = ? AND status = 'started' "
            "            ORDER BY id DESC LIMIT 1)",
            (status, user_id),
        )
        conn.commit()


def consume(user_id: str) -> None:
    """Atomically check the cap and count one execution.

    Check and insert share the same lock so two simultaneous requests cannot
    both slip past the last remaining slot.
    """
    conn = db.get_connection()
    with db._LOCK:
        row = conn.execute(
            "SELECT COUNT(*) AS n FROM runs "
            "WHERE user_id = ? AND date(run_at) = date('now')",
            (user_id,),
        ).fetchone()
        used = int(row["n"] if row else 0)

        if used >= DAILY_LIMIT:
            logger.info("Límite diario alcanzado para %s (%s)", user_id, used)
            raise RateLimitError(used, DAILY_LIMIT)

        conn.execute(
            "INSERT INTO runs (user_id, status) VALUES (?, 'started')",
            (user_id,),
        )
        conn.commit()


# Kept for callers that only need the check.
check_and_consume = consume
