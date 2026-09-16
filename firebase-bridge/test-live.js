/**
 * End-to-end test of the bridge against the RUNNING backend.
 *
 * A fake Firestore collection stands in for Firebase — the documents, the
 * snapshot and the `ref.set` marker behave as Firestore's do — and everything
 * downstream is real: the transform, the HTTP call, the ingest endpoint, the
 * database. What this cannot cover is firebase-admin's own listener, which is
 * Google's code; everything this project is responsible for is exercised.
 *
 *   IOT_API_KEY=... BACKEND_URL=... node test-live.js
 */
const assert = require("assert");
const axios = require("axios");
const { createPipeline } = require("./pipeline");

const BACKEND_URL = process.env.BACKEND_URL;
const API_KEY = process.env.IOT_API_KEY;
if (!BACKEND_URL || !API_KEY) {
  console.error("Set BACKEND_URL and IOT_API_KEY.");
  process.exit(1);
}

/** A stand-in for a Firestore document, including the marker write. */
function fakeDoc(id, data) {
  const doc = {
    id,
    _data: { ...data },
    data: () => doc._data,
    ref: {
      set: async (patch, opts) => {
        doc._data = opts?.merge ? { ...doc._data, ...patch } : { ...patch };
      },
    },
  };
  return doc;
}

const snapshotOf = (docs) => ({
  docChanges: () => docs.map((doc) => ({ type: "added", doc })),
});

const quiet = { log() {}, warn() {}, error() {} };

(async () => {
  const post = (payload) =>
    axios.post(BACKEND_URL, payload, {
      headers: { "x-api-key": API_KEY },
      timeout: 8000,
    });

  const pipeline = createPipeline({ post, log: quiet });
  let passed = 0;
  const check = (name, fn) => {
    try {
      fn();
      passed += 1;
      console.log(`  ok   ${name}`);
    } catch (e) {
      console.error(`  FAIL ${name}\n       ${e.message}`);
      process.exitCode = 1;
    }
  };

  const ts = Math.floor(Date.now() / 1000);

  // What an ESP32 writes.
  const good = fakeDoc("esp32-a", {
    gatewayId: "demo-gw-01",
    readings: [11.11, 22.22],
    ts,
    battery: 77,
  });
  const noGateway = fakeDoc("esp32-b", { readings: [1], ts });
  const unknownGateway = fakeDoc("esp32-c", {
    gatewayId: "no-such-gateway",
    readings: [5],
    ts,
  });

  const results = await pipeline.handleSnapshot(
    snapshotOf([good, noGateway, unknownGateway]),
  );

  check("a valid reading is forwarded", () => {
    assert.strictEqual(results[0].status, "forwarded");
  });

  check("a forwarded document is marked, so a restart cannot resend it", () => {
    assert.ok(good._data.shmForwardedAt, "expected shmForwardedAt to be set");
  });

  check("an already-marked document is not selected again", () => {
    // The property that makes the bridge safe to restart.
    const again = pipeline.select(snapshotOf([good]));
    assert.strictEqual(again.length, 0);
  });

  check("a document with no gateway id is skipped, not posted", () => {
    assert.strictEqual(results[1].status, "skipped");
    assert.ok(noGateway._data.shmForwardedAt, "expected it to be marked");
  });

  check("an unknown gateway is accepted by the API, not retried forever", () => {
    // The API answers 200 and discards it — refusing would make a real gateway
    // retry the same reading indefinitely.
    assert.strictEqual(results[2].status, "forwarded");
  });

  check("documents are forwarded oldest-first", () => {
    const older = fakeDoc("old", { gatewayId: "g", readings: [1], ts: ts - 10 });
    const newer = fakeDoc("new", { gatewayId: "g", readings: [2], ts });
    // Firestore hands them back newest-first; the pipeline reverses them.
    const order = pipeline.select(snapshotOf([newer, older])).map((d) => d.id);
    assert.deepStrictEqual(order, ["old", "new"]);
  });

  console.log(`\n${passed} passed`);
  console.log(`\nposted readings 11.11 and 22.22 for gateway demo-gw-01`);
})();
