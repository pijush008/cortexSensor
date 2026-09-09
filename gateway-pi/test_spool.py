#!/usr/bin/env python3
"""
Store-and-forward tests for the edge gateway (§12, §77).

The scenario under test is the one that matters in the field:

    readings arrive → cloud goes down → readings keep arriving →
    cloud comes back → everything is delivered, in order, exactly once

Run:  python3 -m unittest test_spool -v
"""

import json
import os
import tempfile
import unittest

from spool import Spool, stamp_event_ids


def reading(device: str, ts: int, raw: float) -> bytes:
    return json.dumps(
        {
            "Type": "SensorData",
            "Telemetries": [
                {
                    "GatewayDeviceId": "gw-test",
                    "DeviceId": device,
                    "Timestamp": ts,
                    "Sensor": {"SensorType": "Strain", "Channels": [{"RawReading": raw}]},
                }
            ],
        }
    ).encode()


class SpoolTests(unittest.TestCase):
    def setUp(self) -> None:
        self.dir = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.dir.name, "spool.db")
        self.spool = Spool(self.path, capacity=10)

    def tearDown(self) -> None:
        self.spool.close()
        self.dir.cleanup()

    def test_messages_survive_a_restart(self) -> None:
        """A power cut must not lose buffered readings."""
        for i in range(3):
            self.spool.enqueue(reading("d1", 1700000000 + i, i))
        self.assertEqual(self.spool.depth(), 3)

        self.spool.close()
        reopened = Spool(self.path, capacity=10)
        try:
            self.assertEqual(reopened.depth(), 3)
        finally:
            reopened.close()

    def test_outage_then_recovery_delivers_everything_exactly_once(self) -> None:
        """The §77 scenario, end to end."""
        cloud_up = False
        delivered: list[bytes] = []

        def deliver(payload: bytes) -> bool:
            if not cloud_up:
                return False
            delivered.append(payload)
            return True

        def drain() -> None:
            while True:
                batch = self.spool.peek(5)
                if not batch:
                    return
                ok = []
                for message in batch:
                    if deliver(message.payload):
                        ok.append(message.row_id)
                    else:
                        break
                if ok:
                    self.spool.acknowledge(ok)
                if len(ok) < len(batch):
                    return

        # Cloud is down; five readings arrive and are buffered.
        for i in range(5):
            self.spool.enqueue(reading("d1", 1700000000 + i, i))
        drain()
        self.assertEqual(delivered, [], "nothing should be delivered while down")
        self.assertEqual(self.spool.depth(), 5, "everything should be buffered")

        # Link restored.
        cloud_up = True
        drain()

        self.assertEqual(len(delivered), 5)
        self.assertEqual(self.spool.depth(), 0, "buffer should be empty after ack")

        # Draining again must not resend: acknowledged messages are gone.
        drain()
        self.assertEqual(len(delivered), 5, "no duplicates after a second drain")

    def test_delivery_order_is_oldest_first(self) -> None:
        """A replayed backlog must preserve the order it was recorded in."""
        for i in range(5):
            self.spool.enqueue(reading("d1", 1700000000 + i, i))

        batch = self.spool.peek(5)
        timestamps = [
            json.loads(m.payload)["Telemetries"][0]["Timestamp"] for m in batch
        ]
        self.assertEqual(timestamps, sorted(timestamps))

    def test_failed_delivery_is_not_acknowledged(self) -> None:
        """A message is only removed once the cloud confirms it."""
        self.spool.enqueue(reading("d1", 1700000000, 1.0))
        batch = self.spool.peek(1)
        self.spool.record_failure([m.row_id for m in batch])
        self.assertEqual(self.spool.depth(), 1)
        self.assertEqual(self.spool.peek(1)[0].attempts, 1)

    def test_capacity_drops_oldest_and_counts_the_loss(self) -> None:
        """
        A bounded buffer is deliberate: an unbounded one fills the SD card and
        takes the gateway down entirely. The loss must be counted, not silent.
        """
        for i in range(15):
            self.spool.enqueue(reading("d1", 1700000000 + i, i))

        self.assertEqual(self.spool.depth(), 10)
        self.assertEqual(self.spool.dropped_total, 5)

        # The survivors are the NEWEST readings — the current state of the
        # structure is what matters operationally.
        remaining = [
            json.loads(m.payload)["Telemetries"][0]["Timestamp"]
            for m in self.spool.peek(10)
        ]
        self.assertEqual(min(remaining), 1700000005)

    def test_redelivery_from_the_local_broker_does_not_double_queue(self) -> None:
        payload = reading("d1", 1700000000, 1.0)
        eid = self.spool.enqueue(payload, event_id="fixed-id")
        again = self.spool.enqueue(payload, event_id="fixed-id")
        self.assertEqual(eid, again)
        self.assertEqual(self.spool.depth(), 1)


class EventIdTests(unittest.TestCase):
    def test_every_channel_reading_gets_an_idempotency_key(self) -> None:
        payload = json.dumps(
            {
                "Type": "SensorData",
                "Telemetries": [
                    {
                        "GatewayDeviceId": "gw",
                        "DeviceId": "d1",
                        "Timestamp": 1700000000,
                        "Sensor": {
                            "SensorType": "Strain",
                            "Channels": [{"RawReading": 1.0}, {"RawReading": 2.0}],
                        },
                    }
                ],
            }
        ).encode()

        stamped, _ = stamp_event_ids(payload)
        channels = json.loads(stamped)["Telemetries"][0]["Sensor"]["Channels"]
        self.assertIn("EventId", channels[0])
        self.assertIn("EventId", channels[1])
        self.assertNotEqual(channels[0]["EventId"], channels[1]["EventId"])

    def test_existing_event_ids_are_preserved(self) -> None:
        """
        Regenerating an id on retry would defeat deduplication entirely, so an
        id that is already present must never be overwritten.
        """
        payload = json.dumps(
            {
                "Type": "SensorData",
                "Telemetries": [
                    {
                        "DeviceId": "d1",
                        "Timestamp": 1700000000,
                        "Sensor": {"Channels": [{"RawReading": 1.0, "EventId": "keep-me"}]},
                    }
                ],
            }
        ).encode()

        stamped, _ = stamp_event_ids(payload)
        channel = json.loads(stamped)["Telemetries"][0]["Sensor"]["Channels"][0]
        self.assertEqual(channel["EventId"], "keep-me")

    def test_non_json_payloads_pass_through_untouched(self) -> None:
        """Forward what we do not understand rather than dropping it."""
        raw = b"not json at all"
        stamped, _ = stamp_event_ids(raw)
        self.assertEqual(stamped, raw)


if __name__ == "__main__":
    unittest.main()
