import { Waves } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PendingCapability } from "@/components/ui/pending-capability";

export const metadata = { title: "SHM Analysis" };

/**
 * SHM analysis (FFT / PSD / modal tracking).
 *
 * This page previously rendered a hardcoded modal table — natural frequencies
 * of 3.42 / 8.76 / 15.23 / 22.68 Hz, damping ratios, and a "-3.8% change"
 * flagged as a warning — alongside invented FFT peaks and a static waveform
 * array. None of it came from a measurement. An engineer reading that screen
 * would have had no way to know.
 *
 * Real spectral analysis needs the measurement pipeline underneath it:
 * a sampling rate to resolve frequency bins, windowing and detrending before
 * the transform, a stored baseline to compare against, and environmental
 * context to separate a temperature effect from a structural one. None of
 * those exist in the schema today, so this screen reports that honestly.
 */
export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Structural Analysis"
        title="SHM Analysis"
        subtitle="Spectral analysis, modal parameter tracking, and baseline comparison."
      />

      <PendingCapability
        icon={Waves}
        summary="Frequency-domain analysis of sensor measurements — FFT and PSD with windowing and detrending, natural frequency and damping tracking, and comparison against a stored structural baseline."
        requires={[
          "Measurement (time-series, with sampling rate)",
          "Sensor calibration + orientation records",
          "Baseline version per structure",
          "Environmental context (temperature, load)",
          "Analysis worker + job queue",
        ]}
        plannedIn="Analysis pipeline lands after the measurement model and ingestion path are in place."
      />
    </div>
  );
}
