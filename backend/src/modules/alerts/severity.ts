import { AlertCategory, AlertSeverity } from "@prisma/client";

/**
 * Severity rules (§41).
 *
 * Severity must be derived from stated criteria, never chosen ad hoc. If two
 * engineers cannot look at the same evidence and agree what severity it
 * warrants, the field is decoration — and an inbox of decorative severities is
 * one nobody triages.
 *
 * Two inputs decide it:
 *
 *   EXCEEDANCE — how far past the limit the reading is, expressed as a fraction
 *   of the limit itself so it is comparable across sensors with different
 *   units and ranges. 0.1 means "10% beyond the configured bound".
 *
 *   PERSISTENCE — how many consecutive samples have breached, relative to what
 *   the rule requires. A brief excursion is usually electrical noise; a
 *   sustained one is a condition.
 *
 * A single sample slightly past a limit is LOW. A sustained, large exceedance
 * is CRITICAL. Nothing in between is a judgement call at runtime.
 */

export const EXCEEDANCE_BANDS = {
  /** Past the limit, but within measurement noise of it. */
  marginal: 0.05,
  /** Clearly past the limit. */
  clear: 0.25,
  /** Far past the limit — the structure or the instrument is doing something unusual. */
  severe: 1.0,
} as const;

export interface SeverityInputs {
  category: AlertCategory;
  /** (value - limit) / |limit|, always >= 0. */
  exceedanceRatio: number;
  /** Consecutive breaching samples observed. */
  consecutiveSamples: number;
  /** Consecutive samples the rule requires before raising. */
  requiredSamples: number;
  /** Whether the breaching readings carried data-quality flags. */
  dataQualitySuspect: boolean;
}

export interface SeverityVerdict {
  severity: AlertSeverity;
  confidence: number;
  /** Human-readable derivation, stored with the alert so it can be audited. */
  rationale: string;
}

/**
 * Confidence is about the DETECTION, not about the structure.
 *
 * It says "how sure are we that this reading really breached", which is a
 * function of persistence and data quality — not "how sure are we that the
 * bridge is damaged", which this system does not claim to know (§88).
 */
function computeConfidence(inputs: SeverityInputs): number {
  const persistence = Math.min(
    1,
    inputs.consecutiveSamples / Math.max(1, inputs.requiredSamples),
  );
  // More consecutive samples than required raises confidence further, with
  // diminishing returns — the tenth confirming sample adds less than the third.
  const surplus = Math.max(
    0,
    inputs.consecutiveSamples - inputs.requiredSamples,
  );
  const surplusBoost = Math.min(0.2, surplus * 0.02);

  let confidence = 0.5 + 0.3 * persistence + surplusBoost;

  // A breach detected from readings that were themselves flagged is a weaker
  // claim: the instrument may be reporting the fault, not the structure.
  if (inputs.dataQualitySuspect) confidence -= 0.25;

  return Math.max(0.05, Math.min(0.99, Number(confidence.toFixed(2))));
}

export function deriveSeverity(inputs: SeverityInputs): SeverityVerdict {
  const { exceedanceRatio, consecutiveSamples, requiredSamples } = inputs;
  const sustained = consecutiveSamples >= requiredSamples;
  const wellSustained = consecutiveSamples >= requiredSamples * 2;

  let severity: AlertSeverity;
  let band: string;

  if (exceedanceRatio >= EXCEEDANCE_BANDS.severe) {
    band = "severe (>=100% beyond limit)";
    severity = sustained ? AlertSeverity.critical : AlertSeverity.high;
  } else if (exceedanceRatio >= EXCEEDANCE_BANDS.clear) {
    band = "clear (>=25% beyond limit)";
    severity = wellSustained
      ? AlertSeverity.critical
      : sustained
        ? AlertSeverity.high
        : AlertSeverity.medium;
  } else if (exceedanceRatio >= EXCEEDANCE_BANDS.marginal) {
    band = "marginal (>=5% beyond limit)";
    severity = sustained ? AlertSeverity.medium : AlertSeverity.low;
  } else {
    band = "at limit (<5% beyond)";
    severity = sustained ? AlertSeverity.low : AlertSeverity.info;
  }

  // A sensor-health or data-quality problem is capped below the structural
  // scale. A flatlined channel is urgent maintenance, but it is not evidence
  // about the structure, and letting it render as CRITICAL beside a genuine
  // structural finding is how an inbox stops being trusted (§31).
  if (
    inputs.category === AlertCategory.sensor_health ||
    inputs.category === AlertCategory.data_quality
  ) {
    if (severity === AlertSeverity.critical) severity = AlertSeverity.high;
  }

  // A breach seen only in suspect readings is downgraded: the instrument is
  // the more likely explanation.
  if (inputs.dataQualitySuspect) {
    severity = downgrade(severity);
  }

  const rationale =
    `exceedance ${(exceedanceRatio * 100).toFixed(1)}% (${band}); ` +
    `${consecutiveSamples}/${requiredSamples} consecutive samples` +
    (inputs.dataQualitySuspect
      ? "; downgraded because the breaching readings carry data-quality flags"
      : "") +
    (inputs.category === AlertCategory.sensor_health
      ? "; capped below critical because this is an instrument fault, not a structural finding"
      : "");

  return { severity, confidence: computeConfidence(inputs), rationale };
}

function downgrade(severity: AlertSeverity): AlertSeverity {
  switch (severity) {
    case AlertSeverity.critical:
      return AlertSeverity.high;
    case AlertSeverity.high:
      return AlertSeverity.medium;
    case AlertSeverity.medium:
      return AlertSeverity.low;
    default:
      return AlertSeverity.info;
  }
}

/** Exceedance as a fraction of the limit, comparable across units. */
export function exceedanceRatio(
  value: number,
  min: number | null,
  max: number | null,
): number {
  if (max !== null && value > max) {
    // Guard the degenerate case of a zero limit, where a ratio is undefined.
    const scale = Math.abs(max) > 1e-9 ? Math.abs(max) : 1;
    return (value - max) / scale;
  }
  if (min !== null && value < min) {
    const scale = Math.abs(min) > 1e-9 ? Math.abs(min) : 1;
    return (min - value) / scale;
  }
  return 0;
}

export const SEVERITY_ORDER: Record<AlertSeverity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

/** True when `next` is more urgent than `current`. */
export function isEscalation(
  current: AlertSeverity,
  next: AlertSeverity,
): boolean {
  return SEVERITY_ORDER[next] > SEVERITY_ORDER[current];
}
