"""SQLite persistence, in memory (CA 3.4).

The database is intentionally ephemeral: tickets do not survive a restart, which
is the accepted trade-off of the MVP (spec section 4, "Out of scope"). A single
connection is shared because `:memory:` gives each connection its own private
database.
"""

from __future__ import annotations

import json
import sqlite3
import threading
from typing import Any

from .models import AttemptLog, ExtractedTicket

_LOCK = threading.Lock()
_CONNECTION: sqlite3.Connection | None = None

SCHEMA = """
CREATE TABLE IF NOT EXISTS tickets (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    summary           TEXT    NOT NULL,
    category          TEXT    NOT NULL,
    urgency           TEXT    NOT NULL,
    requires_escalation INTEGER NOT NULL,
    extracted_amount  REAL,
    customer_message  TEXT    NOT NULL,
    channel           TEXT    NOT NULL,
    attempts_count    INTEGER NOT NULL,
    created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS attempt_logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id  INTEGER NOT NULL,
    attempt    INTEGER NOT NULL,
    succeeded  INTEGER NOT NULL,
    error      TEXT,
    FOREIGN KEY (ticket_id) REFERENCES tickets (id)
);
"""


def get_connection() -> sqlite3.Connection:
    global _CONNECTION
    if _CONNECTION is None:
        _CONNECTION = sqlite3.connect(":memory:", check_same_thread=False)
        _CONNECTION.row_factory = sqlite3.Row
        _CONNECTION.executescript(SCHEMA)
    return _CONNECTION


def reset() -> None:
    """Drop the in-memory database. Used between tests."""
    global _CONNECTION
    with _LOCK:
        if _CONNECTION is not None:
            _CONNECTION.close()
        _CONNECTION = None


def save_ticket(
    ticket: ExtractedTicket,
    customer_message: str,
    channel: str,
    attempts: list[AttemptLog],
) -> int:
    """Insert a validated ticket plus its attempt log (CA 3.4, CA 4.2)."""
    conn = get_connection()
    with _LOCK:
        cursor = conn.execute(
            """
            INSERT INTO tickets (
                summary, category, urgency, requires_escalation,
                extracted_amount, customer_message, channel, attempts_count
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                ticket.summary,
                ticket.category.value,
                ticket.urgency.value,
                int(ticket.requires_human_escalation),
                ticket.extracted_amount,
                customer_message,
                channel,
                len(attempts),
            ),
        )
        ticket_id = int(cursor.lastrowid or 0)

        for log in attempts:
            conn.execute(
                """
                INSERT INTO attempt_logs (ticket_id, attempt, succeeded, error)
                VALUES (?, ?, ?, ?)
                """,
                (ticket_id, log.attempt, int(log.succeeded), log.error),
            )

        conn.commit()
    return ticket_id


def list_tickets(limit: int = 50) -> list[dict[str, Any]]:
    conn = get_connection()
    with _LOCK:
        rows = conn.execute(
            "SELECT * FROM tickets ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
    return [dict(row) for row in rows]


def get_ticket(ticket_id: int) -> dict[str, Any] | None:
    conn = get_connection()
    with _LOCK:
        row = conn.execute("SELECT * FROM tickets WHERE id = ?", (ticket_id,)).fetchone()
    if row is None:
        return None
    ticket = dict(row)
    with _LOCK:
        logs = conn.execute(
            "SELECT attempt, succeeded, error FROM attempt_logs "
            "WHERE ticket_id = ? ORDER BY attempt",
            (ticket_id,),
        ).fetchall()
    ticket["attempts"] = [dict(log) for log in logs]
    return ticket


def count() -> int:
    conn = get_connection()
    with _LOCK:
        row = conn.execute("SELECT COUNT(*) AS n FROM tickets").fetchone()
    return int(row["n"] if row else 0)


__all__ = ["count", "get_connection", "get_ticket", "list_tickets", "reset", "save_ticket"]

# `json` is imported for callers that want to serialize attempt logs.
_ = json
