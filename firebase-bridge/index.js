/**
 * SHM Firestore bridge.
 *
 *   ESP32 ──(write)──▶ Firestore collection ──(this)──▶ POST /api/beamDeviceData
 *
 * The ESP32 writes one document per reading. This process follows that
 * collection and forwards each new document into the same ingest endpoint the
 * MQTT path and the sample gateway already use, so a Firebase reading travels
 * the identical route as one from the broker: device → project lookup,
 * thresholds, storage, live stream.
 *
 * Why a separate process rather than something inside the API: a Firebase
 * outage, a malformed document or an expired service account then fails HERE,
 * next to the thing that caused it, instead of inside the process serving the
 * console.
 */
const admin = require("firebase-admin");
const axios = require("axios");
const fs = require("fs");

const COLLECTION = process.env.FIREBASE_COLLECTION || "telemetry";
const BACKEND_URL =
  process.env.BACKEND_URL || "http://backend:3001/api/beamDeviceData";
const API_KEY = process.env.IOT_API_KEY || "";
const CREDENTIALS = process.env.GOOGLE_APPLICATION_CREDENTIALS || "";
/** Documents older than this on first connect are ignored. */
const BACKFILL_MINUTES = Number(process.env.FIREBASE_BACKFILL_MINUTES || 10);

function fail(message) {
  console.error(`[firebase-bridge] ${message}`);
  process.exit(1);
}

if (!CREDENTIALS) {
  fail(
    "GOOGLE_APPLICATION_CREDENTIALS is not set. Point it at the service-account JSON downloaded from Firebase Console → Project settings → Service accounts.",
  );
}
if (!fs.existsSync(CREDENTIALS)) {
  fail(`Service-account file not found at ${CREDENTIALS}`);
}
if (!API_KEY) {
  fail("IOT_API_KEY is not set; the ingest endpoint would refuse every reading.");
}

admin.initializeApp({
  credential: admin.credential.cert(require(CREDENTIALS)),
});

const db = admin.firestore();

const { toEpochSeconds, toTelemetry } = require("./transform");

const { createPipeline } = require("./pipeline");

const pipeline = createPipeline({
  post: (payload) =>
    axios.post(BACKEND_URL, payload, {
      headers: { "x-api-key": API_KEY },
      timeout: 8000,
    }),
  backfillMinutes: BACKFILL_MINUTES,
});

console.log(
  `[firebase-bridge] watching "${COLLECTION}" → ${BACKEND_URL} (ignoring documents older than ${BACKFILL_MINUTES}m)`,
);

/**
 * A sliding window over the newest documents, filtered in code.
 *
 * NOT `.where("shmForwardedAt", "==", null)`: in Firestore an equality filter
 * on null matches documents where the field IS null, never ones where it is
 * absent — and a device writing a reading has no reason to write that field at
 * all. Such a query matches nothing, and the bridge would sit silent while
 * looking perfectly healthy.
 *
 * Ordering by `ts` and taking the newest WINDOW keeps the listener's cost
 * bounded on a collection that only grows, while new writes still enter the
 * window immediately.
 */
const WINDOW = Number(process.env.FIREBASE_WINDOW || 50);

db.collection(COLLECTION)
  .orderBy("ts", "desc")
  .limit(WINDOW)
  .onSnapshot(
    (snapshot) => {
      pipeline.handleSnapshot(snapshot).catch((err) => {
        console.error(`[firebase-bridge] batch failed: ${err.message}`);
      });
    },
    (err) => {
      console.error(`[firebase-bridge] snapshot listener failed: ${err.message}`);
      // Exit rather than sit silently: the container restarts and reconnects,
      // which is visible, where a dead listener is not.
      process.exit(1);
    },
  );
