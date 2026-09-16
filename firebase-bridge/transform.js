/**
 * Turning a Firestore document into the SHM ingest contract.
 *
 * Kept apart from the listener so the mapping can be exercised without a
 * Firebase project, a service account or a network: this is where the awkward
 * cases live — timestamps in the wrong unit, readings that are not numbers, a
 * device that already speaks the contract — and those are exactly the things
 * worth having tests for.
 */
/** Seconds since the epoch, which is what the ingest contract expects. */
function toEpochSeconds(value) {
  if (value == null) return Math.floor(Date.now() / 1000);
  // Firestore Timestamp
  if (typeof value.toMillis === "function") {
    return Math.floor(value.toMillis() / 1000);
  }
  const n = Number(value);
  if (Number.isFinite(n)) {
    // Milliseconds are the common mistake; anything past the year 2300 in
    // seconds is far more likely to be milliseconds.
    return n > 1e11 ? Math.floor(n / 1000) : Math.floor(n);
  }
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed)
    ? Math.floor(Date.now() / 1000)
    : Math.floor(parsed / 1000);
}

/**
 * Turns one Firestore document into the ingest contract.
 *
 * Two shapes are accepted deliberately. A document that already IS a
 * BeamDeviceDataInput is passed through, so a device that speaks the contract
 * natively needs no translation. Otherwise a short, ESP32-friendly shape is
 * mapped:
 *
 *   { gatewayId: "demo-gw-01", readings: [12.3, 45.6], ts: 1789... }
 *
 * The short shape exists because writing the full nested contract from an ESP32
 * costs flash and stack for no benefit — the gateway id and the channel values
 * are the only things the device actually knows.
 */
function toTelemetry(data) {
  if (data && data.Type && Array.isArray(data.Telemetries)) {
    return data;
  }

  const gatewayId = data.gatewayId || data.GatewayDeviceId || data.deviceId;
  if (!gatewayId) return null;

  const timestamp = toEpochSeconds(data.ts ?? data.timestamp ?? data.Timestamp);

  // A reading list makes a SensorData payload; its absence makes the document a
  // node-health report, which is what fills the gateway panel.
  const readings = Array.isArray(data.readings)
    ? data.readings
    : Array.isArray(data.channels)
      ? data.channels
      : null;

  const telemetry = {
    GatewayDeviceId: String(gatewayId),
    DeviceId: String(data.deviceId || gatewayId),
    Timestamp: timestamp,
  };
  for (const [from, to] of [
    ["battery", "Battery"],
    ["temperature", "Temperature"],
    ["humidity", "Humidity"],
    ["pressure", "Pressure"],
  ]) {
    if (typeof data[from] === "number") telemetry[to] = data[from];
  }

  if (!readings || readings.length === 0) {
    return { Type: "NodeData", Telemetries: [telemetry] };
  }

  telemetry.Sensor = {
    SensorType: String(data.sensorType || "Strain"),
    Channels: readings
      .map((r, i) => ({
        SequenceNumber: i + 1,
        RawReading: Number(typeof r === "object" ? r.value ?? r.RawReading : r),
      }))
      // A non-numeric channel is dropped rather than sent as NaN, which the
      // ingest contract rejects for the whole payload.
      .filter((c) => Number.isFinite(c.RawReading)),
  };

  if (telemetry.Sensor.Channels.length === 0) return null;
  return { Type: "SensorData", Telemetries: [telemetry] };
}


module.exports = { toEpochSeconds, toTelemetry };
