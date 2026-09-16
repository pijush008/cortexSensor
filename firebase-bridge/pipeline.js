/**
 * The forwarding pipeline, separated from the Firebase wiring.
 *
 * Takes its HTTP client and its clock rather than reaching for them, so the
 * whole path — a document arriving, being transformed, posted, and marked —
 * can be driven with a fake collection against the real ingest API. What is
 * left untested is then only firebase-admin's own listener, which is Google's
 * code and not ours to verify.
 */
const { toEpochSeconds, toTelemetry } = require("./transform");

function createPipeline({ post, log = console, backfillMinutes = 10, now = Date.now }) {
  const since = now() - backfillMinutes * 60 * 1000;

  /** Sends one document, and marks it only once the API has accepted it. */
  async function forward(doc) {
    const data = doc.data();
    const payload = toTelemetry(data);

    if (!payload) {
      log.warn(
        `[firebase-bridge] ${doc.id}: no gateway id or no usable readings; skipped`,
      );
      // Marked anyway, or an unusable document is retried on every snapshot.
      await doc.ref.set({ shmForwardedAt: new Date() }, { merge: true });
      return { status: "skipped" };
    }

    try {
      const res = await post(payload);
      log.log(
        `[firebase-bridge] ${doc.id} → ${res.status} ${res.data?.message ?? ""}`.trim(),
      );
      // Written only after the backend accepted it, so a crash mid-flight
      // leaves the document unmarked and it is retried rather than lost.
      await doc.ref.set({ shmForwardedAt: new Date() }, { merge: true });
      return { status: "forwarded" };
    } catch (err) {
      const status = err.response?.status;
      const body = err.response?.data?.message ?? err.message;
      log.error(
        `[firebase-bridge] ${doc.id} failed: ${status ?? ""} ${body}`.trim(),
      );

      // A payload the API will never accept is marked so it stops being
      // retried forever; a transient failure is left for the next snapshot.
      if (status && status >= 400 && status < 500 && status !== 429) {
        await doc.ref.set(
          { shmForwardedAt: new Date(), shmError: String(body).slice(0, 500) },
          { merge: true },
        );
        return { status: "rejected" };
      }
      return { status: "retry" };
    }
  }

  /** Which documents in a snapshot are worth sending, in the order to send them. */
  function select(snapshot) {
    return snapshot
      .docChanges()
      .filter((c) => c.type === "added")
      .map((c) => c.doc)
      // Already sent. The marker, not the snapshot, is what makes this safe
      // across restarts.
      .filter((doc) => !doc.data()?.shmForwardedAt)
      .filter((doc) => {
        const ts = doc.data()?.ts ?? doc.data()?.timestamp;
        if (ts == null) return true;
        return toEpochSeconds(ts) * 1000 >= since;
      })
      // The query is newest-first; forward oldest-first so a device's readings
      // reach the API in the order it produced them.
      .reverse();
  }

  /**
   * Sequentially, not in parallel: readings from one device arrive in order,
   * and firing them at the API at once would let a later one overtake an
   * earlier one.
   */
  async function handleSnapshot(snapshot) {
    const results = [];
    for (const doc of select(snapshot)) {
      results.push(await forward(doc));
    }
    return results;
  }

  return { forward, select, handleSnapshot };
}

module.exports = { createPipeline };
