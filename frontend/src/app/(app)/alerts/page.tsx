import { Bell } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PendingCapability } from "@/components/ui/pending-capability";

export const metadata = { title: "Alerts" };

/**
 * Alert inbox.
 *
 * This page previously rendered a hardcoded alert list, including entries such
 * as "Natural Frequency Decreased 3.8%" with a stated confidence of 0.91 and
 * supporting evidence text — an engineering claim about a structure, invented
 * wholesale.
 *
 * The backend today has a `Notification` row of `{sensorDataId, min, max}`
 * produced by a static per-channel threshold. It carries no severity, no
 * status, no assignee and no lifecycle, so there is nothing to render an
 * inbox from. The alert model in the target architecture adds detection
 * context, severity rules, deduplication and the
 * OPEN → ACKNOWLEDGED → INVESTIGATING → RESOLVED → CLOSED lifecycle.
 */
export default function AlertsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Alerts"
        subtitle="Detected anomalies awaiting engineering review."
      />

      <PendingCapability
        icon={Bell}
        summary="Alerts raised by the monitoring pipeline, with severity, supporting evidence, detection confidence, assignment, and an acknowledge-to-resolve workflow."
        requires={[
          "Alert (severity, status, assignee, evidence)",
          "Structure + Location (to place an alert)",
          "Anomaly detection rules",
          "Alert deduplication window",
          "Notification delivery + preferences",
        ]}
        plannedIn="Alerting depends on the anomaly engine, which in turn depends on the analysis pipeline."
      />
    </div>
  );
}
