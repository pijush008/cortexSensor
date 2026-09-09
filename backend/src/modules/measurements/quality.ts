/**
 * Data-quality assessment, applied at ingest (§30).
 *
 * The governing rule: a suspect reading is FLAGGED, never dropped. Discarding
 * bad data hides the failure that produced it — a saturating sensor, a drifting
 * amplifier, a gateway with a broken clock — and those are exactly the
 * conditions an operator needs to see. A measurement with `OUT_OF_RANGE` on it
 * is evidence; a measurement that was silently discarded is a gap nobody can
 * explain.
 *
 * These flags are also what keeps sensor health separate from structural
 * health (§31): a flatlined channel is a sensor fault, not a finding about the
 * bridge.
 */

export const QUALITY_FLAGS = {
  /** Outside the physically plausible range configured for the sensor type. */
  OUT_OF_RANGE: "OUT_OF_RANGE",
  /** At or beyond the ADC/transducer limit — the true value may be higher. */
  SATURATED: "SATURATED",
  /** Identical to the recent history: a disconnected or frozen channel. */
  FLATLINE: "FLATLINE",
  /** Timestamp precedes a reading already stored for this sensor. */
  OUT_OF_ORDER: "OUT_OF_ORDER",
  /** Sequence counter jumped: packets were lost in transit. */
  SEQUENCE_GAP: "SEQUENCE_GAP",
  /** Timestamp is in the future — almost always an unsynchronised device clock. */
  FUTURE_TIMESTAMP: "FUTURE_TIMESTAMP",
  /** NaN or Infinity arrived from the device. */
  NOT_FINITE: "NOT_FINITE",
  /** No calibration record was in force when this reading was taken. */
  UNCALIBRATED: "UNCALIBRATED",
  /** The applicable calibration certificate had expired. */
  STALE_CALIBRATION: "STALE_CALIBRATION",
  /** Delivered long after it was measured — replayed from an edge buffer. */
  DELAYED_DELIVERY: "DELAYED_DELIVERY",
} as const;

export type QualityFlag = (typeof QUALITY_FLAGS)[keyof typeof QUALITY_FLAGS];

/**
 * A device clock may legitimately run a little ahead. Beyond this the
 * timestamp is not trustworthy and is flagged rather than silently corrected —
 * rewriting a device's own timestamp destroys the evidence of the clock fault.
 */
export const MAX_CLOCK_SKEW_SECONDS = 120;

/** Beyond this, a reading was almost certainly replayed from an edge buffer. */
export const DELAYED_DELIVERY_SECONDS = 15 * 60;

/** Consecutive identical readings before a channel is treated as flatlined. */
export const FLATLINE_SAMPLE_COUNT = 5;

export interface QualityContext {
  /** Calibrated value about to be stored. */
  value: number;
  rawValue: number | null;
  /** Device-reported measurement time. */
  ts: Date;
  /** When the platform received it. */
  receivedAt: Date;
  /** Most recent stored readings for this sensor, newest first. */
  recentValues: number[];
  /** Timestamp of the newest stored reading, if any. */
  latestStoredTs: Date | null;
  /** Previous sequence number for this sensor, if known. */
  previousSequence: bigint | null;
  sequenceNumber: bigint | null;
  /** Plausible range for this sensor type, when configured. */
  rangeMin: number | null;
  rangeMax: number | null;
  /** Whether a calibration record was in force at `ts`. */
  hasCalibration: boolean;
  /** Expiry of that calibration, when recorded. */
  calibrationValidUntil: Date | null;
}

/**
 * Returns the quality findings for a single reading.
 *
 * Deliberately pure and synchronous: it takes already-fetched context rather
 * than querying, so a batch of readings can be assessed without a database
 * round trip per sample.
 */
export function assessQuality(ctx: QualityContext): QualityFlag[] {
  const flags: QualityFlag[] = [];

  if (!Number.isFinite(ctx.value)) {
    flags.push(QUALITY_FLAGS.NOT_FINITE);
    // Nothing else can be judged about a non-finite value; range and flatline
    // comparisons against NaN are meaningless.
    return flags;
  }

  if (ctx.rangeMin !== null && ctx.value < ctx.rangeMin) {
    flags.push(QUALITY_FLAGS.OUT_OF_RANGE);
  } else if (ctx.rangeMax !== null && ctx.value > ctx.rangeMax) {
    flags.push(QUALITY_FLAGS.OUT_OF_RANGE);
  }

  // Sitting exactly on a configured limit is the signature of a saturating
  // channel: the true value is at least this, and probably more.
  if (
    (ctx.rangeMax !== null && ctx.value === ctx.rangeMax) ||
    (ctx.rangeMin !== null && ctx.value === ctx.rangeMin)
  ) {
    flags.push(QUALITY_FLAGS.SATURATED);
  }

  if (
    ctx.recentValues.length >= FLATLINE_SAMPLE_COUNT &&
    ctx.recentValues
      .slice(0, FLATLINE_SAMPLE_COUNT)
      .every((v) => v === ctx.value)
  ) {
    flags.push(QUALITY_FLAGS.FLATLINE);
  }

  if (ctx.latestStoredTs && ctx.ts.getTime() < ctx.latestStoredTs.getTime()) {
    // Not an error on its own — buffered data legitimately arrives late — but
    // it must be visible, because analysis windows assume ordering.
    flags.push(QUALITY_FLAGS.OUT_OF_ORDER);
  }

  const skewSeconds = (ctx.ts.getTime() - ctx.receivedAt.getTime()) / 1000;
  if (skewSeconds > MAX_CLOCK_SKEW_SECONDS) {
    flags.push(QUALITY_FLAGS.FUTURE_TIMESTAMP);
  }

  const lagSeconds = (ctx.receivedAt.getTime() - ctx.ts.getTime()) / 1000;
  if (lagSeconds > DELAYED_DELIVERY_SECONDS) {
    flags.push(QUALITY_FLAGS.DELAYED_DELIVERY);
  }

  if (
    ctx.sequenceNumber !== null &&
    ctx.previousSequence !== null &&
    ctx.sequenceNumber > ctx.previousSequence + 1n
  ) {
    flags.push(QUALITY_FLAGS.SEQUENCE_GAP);
  }

  if (!ctx.hasCalibration) {
    flags.push(QUALITY_FLAGS.UNCALIBRATED);
  } else if (
    ctx.calibrationValidUntil &&
    ctx.calibrationValidUntil.getTime() < ctx.ts.getTime()
  ) {
    flags.push(QUALITY_FLAGS.STALE_CALIBRATION);
  }

  return flags;
}

/**
 * Flags meaning the NUMBER ITSELF cannot be trusted, so the reading must not
 * feed a statistic.
 *
 * Note what is deliberately absent. UNCALIBRATED and STALE_CALIBRATION are
 * traceability problems, not numeric ones: the value is still a real
 * measurement, it just cannot be traced to a certificate. Excluding those from
 * aggregates would blank the chart for every sensor whose calibration
 * paperwork is not yet on file — hiding data the operator has, to punish an
 * administrative gap. They are surfaced as a separate count instead, so the UI
 * can mark the series as traceability-incomplete while still drawing it.
 *
 * Likewise OUT_OF_ORDER and DELAYED_DELIVERY describe when a reading arrived,
 * not whether it is correct; buffered data replayed after an outage is valid.
 */
export const NON_NUMERIC_FLAGS: string[] = [
  QUALITY_FLAGS.NOT_FINITE,
  QUALITY_FLAGS.OUT_OF_RANGE,
  QUALITY_FLAGS.FLATLINE,
];

/** Flags meaning the value is real but not traceable to a certificate. */
export const TRACEABILITY_FLAGS: string[] = [
  QUALITY_FLAGS.UNCALIBRATED,
  QUALITY_FLAGS.STALE_CALIBRATION,
];

/**
 * Whether a reading may feed a statistic. It is stored and visible either way —
 * this only decides whether it contributes to a trend line.
 */
export function isAnalysisGrade(flags: readonly string[]): boolean {
  return !flags.some((f) => NON_NUMERIC_FLAGS.includes(f));
}
