#!/usr/bin/env python3
"""
Persistent store-and-forward buffer for the SHM edge gateway (§12).

Why this exists
---------------
The gateway previously forwarded every message inline. If the cloud was
unreachable at that instant — a dropped LTE session, a cloud deploy, a cut
fibre — the message was logged and discarded. For a structural monitoring
platform that is the worst possible failure: the readings most likely to be
lost are the ones taken during the storm, the flood, or the seismic event that
knocked connectivity out in the first place.

Design
------
SQLite on the Pi's local disk, because it survives a power cut, needs no
service to be running, and is already present on Raspberry Pi OS. Messages are
enqueued the moment they arrive from the local broker and only deleted once the
cloud has acknowledged them.

Every message carries an `event_id`. The backend deduplicates on it, so
replaying a buffer after a six-hour outage cannot double-count readings — which
matters because a duplicated hour silently corrupts every average computed
from it.

The buffer is bounded. When it reaches capacity the OLDEST unsent messages are
dropped first and the drop is counted and logged, because in structural
monitoring the most recent state of the structure is the most operationally
important, and a buffer that grows without limit eventually fills the SD card
and takes the gateway down entirely.
"""

from __future__ import annotations

import json
import logging
import os
import sqlite3
import threading
import time
import uuid
from dataclasses import dataclass
from typing import Iterable

log = logging.getLogger("shm.spool")

DEFAULT_CAPACITY = 100_000


@dataclass
class SpooledMessage:
    row_id: int
    event_id: str
    payload: bytes
    queued_at: float
    attempts: int


class Spool:
    """A durable FIFO of pending uploads, safe for concurrent access."""

    def __init__(self, path: str, capacity: int = DEFAULT_CAPACITY) -> None:
        self.path = path
        self.capacity = capacity
        self._lock = threading.Lock()

        parent = os.path.dirname(os.path.abspath(path))
        if parent:
            os.makedirs(parent, exist_ok=True)

        # check_same_thread=False: the drain worker and the MQTT callback
        # thread share this connection, serialised by self._lock.
        self._db = sqlite3.connect(path, check_same_thread=False)
        # WAL keeps a reader from blocking the writer, so draining the backlog
        # does not stall ingestion of live messages.
        self._db.execute("PRAGMA journal_mode=WAL")
        # NORMAL rather than FULL: a power cut may cost the last few
        # milliseconds of writes, which is an acceptable trade for not doing an
        # fsync per reading on an SD card that would otherwise wear out.
        self._db.execute("PRAGMA synchronous=NORMAL")
        self._db.execute(
            """
            CREATE TABLE IF NOT EXISTS outbox (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                event_id  TEXT NOT NULL UNIQUE,
                payload   BLOB NOT NULL,
                queued_at REAL NOT NULL,
                attempts  INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        self._db.execute(
            "CREATE INDEX IF NOT EXISTS outbox_queued_at ON outbox(queued_at)"
        )
        self._db.commit()

        self.dropped_total = 0

    # ------------------------------------------------------------------ write

    def enqueue(self, payload: bytes, event_id: str | None = None) -> str:
        """Persists a message and returns its event id."""
        eid = event_id or uuid.uuid4().hex
        with self._lock:
            try:
                self._db.execute(
                    "INSERT INTO outbox (event_id, payload, queued_at) VALUES (?,?,?)",
                    (eid, payload, time.time()),
                )
                self._db.commit()
            except sqlite3.IntegrityError:
                # Same event id already queued — the local broker redelivered.
                # Idempotent by construction, so this is a no-op, not an error.
                return eid
            self._enforce_capacity_locked()
        return eid

    def _enforce_capacity_locked(self) -> None:
        count = self._db.execute("SELECT COUNT(*) FROM outbox").fetchone()[0]
        if count <= self.capacity:
            return
        excess = count - self.capacity
        self._db.execute(
            "DELETE FROM outbox WHERE id IN "
            "(SELECT id FROM outbox ORDER BY queued_at ASC LIMIT ?)",
            (excess,),
        )
        self._db.commit()
        self.dropped_total += excess
        # Loud, because it is real data loss even though it is deliberate.
        log.error(
            "Spool full (%d): dropped %d oldest message(s). Total dropped: %d. "
            "The cloud has been unreachable long enough to exceed local storage.",
            self.capacity,
            excess,
            self.dropped_total,
        )

    # ------------------------------------------------------------------- read

    def peek(self, limit: int = 50) -> list[SpooledMessage]:
        """Oldest-first, so a backlog is replayed in the order it was recorded."""
        with self._lock:
            rows = self._db.execute(
                "SELECT id, event_id, payload, queued_at, attempts "
                "FROM outbox ORDER BY queued_at ASC LIMIT ?",
                (limit,),
            ).fetchall()
        return [SpooledMessage(*row) for row in rows]

    def acknowledge(self, row_ids: Iterable[int]) -> None:
        """Deletes messages the cloud has confirmed. Only called after a 2xx."""
        ids = list(row_ids)
        if not ids:
            return
        with self._lock:
            self._db.executemany("DELETE FROM outbox WHERE id = ?", [(i,) for i in ids])
            self._db.commit()

    def record_failure(self, row_ids: Iterable[int]) -> None:
        ids = list(row_ids)
        if not ids:
            return
        with self._lock:
            self._db.executemany(
                "UPDATE outbox SET attempts = attempts + 1 WHERE id = ?",
                [(i,) for i in ids],
            )
            self._db.commit()

    def depth(self) -> int:
        with self._lock:
            return self._db.execute("SELECT COUNT(*) FROM outbox").fetchone()[0]

    def oldest_age_seconds(self) -> float | None:
        with self._lock:
            row = self._db.execute("SELECT MIN(queued_at) FROM outbox").fetchone()
        if not row or row[0] is None:
            return None
        return time.time() - row[0]

    def close(self) -> None:
        with self._lock:
            self._db.close()


def stamp_event_ids(payload: bytes) -> tuple[bytes, str]:
    """
    Ensures every reading in a payload carries an idempotency key.

    The backend deduplicates on `EventId`, so stamping here — at the edge,
    before anything can be retried — is what makes replay safe. Ids are
    generated once and persisted with the message, never regenerated on retry:
    a fresh id per attempt would defeat the deduplication entirely.
    """
    message_id = uuid.uuid4().hex
    try:
        doc = json.loads(payload.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        # Not JSON we understand; forward untouched rather than dropping it.
        return payload, message_id

    telemetries = doc.get("Telemetries")
    if not isinstance(telemetries, list):
        return payload, message_id

    for t_index, telemetry in enumerate(telemetries):
        if not isinstance(telemetry, dict):
            continue
        sensor = telemetry.get("Sensor")
        if not isinstance(sensor, dict):
            continue
        channels = sensor.get("Channels")
        if not isinstance(channels, list):
            continue
        for c_index, channel in enumerate(channels):
            if isinstance(channel, dict) and "EventId" not in channel:
                channel["EventId"] = f"{message_id}:{t_index}:{c_index}"

    return json.dumps(doc, separators=(",", ":")).encode("utf-8"), message_id
