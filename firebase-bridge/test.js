/**
 * Transform tests for the Firestore bridge.
 *
 * Run with `node test.js` — no Firebase, no network, no test runner. The
 * mapping is the part with edge cases worth pinning down; the listener around
 * it is thin.
 */
const assert = require("assert");
const { toEpochSeconds, toTelemetry } = require("./transform");

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}\n       ${err.message}`);
    process.exitCode = 1;
  }
}

console.log("timestamps");

test("seconds pass through unchanged", () => {
  assert.strictEqual(toEpochSeconds(1789380000), 1789380000);
});

test("milliseconds are converted, not trusted", () => {
  // The common firmware mistake: millis() where seconds were meant. Taken at
  // face value it dates the reading to the year 58,000 and the project's date
  // window silently discards it.
  assert.strictEqual(toEpochSeconds(1789380000000), 1789380000);
});

test("an ISO string is accepted", () => {
  assert.strictEqual(
    toEpochSeconds("2026-09-15T00:00:00.000Z"),
    Math.floor(Date.parse("2026-09-15T00:00:00.000Z") / 1000),
  );
});

test("a Firestore Timestamp is accepted", () => {
  assert.strictEqual(toEpochSeconds({ toMillis: () => 1789380000000 }), 1789380000);
});

test("nonsense falls back to now rather than to 1970", () => {
  // A reading stamped 1970 lands outside every project window and vanishes
  // without explanation; stamping it "now" at least keeps it visible.
  const out = toEpochSeconds("not a date");
  assert.ok(Math.abs(out - Math.floor(Date.now() / 1000)) < 5, `got ${out}`);
});

console.log("document shapes");

test("the short ESP32 shape becomes SensorData", () => {
  const out = toTelemetry({
    gatewayId: "demo-gw-01",
    readings: [12.5, 7.25],
    ts: 1789380000,
  });
  assert.strictEqual(out.Type, "SensorData");
  const t = out.Telemetries[0];
  assert.strictEqual(t.GatewayDeviceId, "demo-gw-01");
  assert.strictEqual(t.Timestamp, 1789380000);
  assert.deepStrictEqual(
    t.Sensor.Channels.map((c) => c.RawReading),
    [12.5, 7.25],
  );
  // Channel order is the array order: reading 0 is channel 1.
  assert.deepStrictEqual(
    t.Sensor.Channels.map((c) => c.SequenceNumber),
    [1, 2],
  );
});

test("no readings makes it a node-health report", () => {
  const out = toTelemetry({ gatewayId: "demo-gw-01", battery: 91, temperature: 28.5 });
  assert.strictEqual(out.Type, "NodeData");
  assert.strictEqual(out.Telemetries[0].Battery, 91);
  assert.strictEqual(out.Telemetries[0].Temperature, 28.5);
  assert.strictEqual(out.Telemetries[0].Sensor, undefined);
});

test("a document already in the contract passes straight through", () => {
  const native = { Type: "SensorData", Telemetries: [{ GatewayDeviceId: "x", Timestamp: 1 }] };
  assert.strictEqual(toTelemetry(native), native);
});

test("objects with a value field are accepted as readings", () => {
  const out = toTelemetry({ gatewayId: "g", readings: [{ value: 3.5 }, { RawReading: 4.5 }] });
  assert.deepStrictEqual(
    out.Telemetries[0].Sensor.Channels.map((c) => c.RawReading),
    [3.5, 4.5],
  );
});

test("a non-numeric reading is dropped, not sent as NaN", () => {
  // NaN fails contract validation for the WHOLE payload, so one bad channel
  // would discard its healthy siblings.
  const out = toTelemetry({ gatewayId: "g", readings: [1.5, "oops", 2.5] });
  assert.deepStrictEqual(
    out.Telemetries[0].Sensor.Channels.map((c) => c.RawReading),
    [1.5, 2.5],
  );
});

test("a document with no gateway id is refused", () => {
  // Without it the backend cannot find the device, so forwarding is pointless.
  assert.strictEqual(toTelemetry({ readings: [1] }), null);
});

test("readings that are all unusable are refused", () => {
  assert.strictEqual(toTelemetry({ gatewayId: "g", readings: ["a", "b"] }), null);
});

console.log(`\n${passed} passed`);
