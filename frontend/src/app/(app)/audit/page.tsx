import { ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PendingCapability } from "@/components/ui/pending-capability";

export const metadata = { title: "Audit Log" };

/**
 * Audit trail viewer.
 *
 * This page previously rendered a hardcoded log with fabricated actor email
 * addresses and source IP addresses. That is a particularly bad thing to
 * invent: an audit trail is a security record, and a fake one actively
 * misleads anyone using it to answer "who changed this?".
 *
 * Note the distinction this page draws: audit *capture* works. The `AuditLog`
 * table exists and `utils/audit.ts` writes to it on user, project, device and
 * sensor mutations. What is missing is the authenticated, tenant-scoped read
 * path — and building that scoping against the current `parentId` model would
 * mean writing a rule that is replaced as soon as the Tenant entity lands.
 * So the trail is being recorded; it is not yet viewable here.
 */
export default function AuditPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Governance"
        title="Audit Log"
        subtitle="Immutable record of security-relevant actions across the organization."
      />

      <PendingCapability
        icon={ShieldCheck}
        summary="Searchable audit trail of authentication events, role changes, device provisioning, calibration edits and billing changes — with actor, target, outcome and source address. Audit records are already being captured; this viewer is what is missing."
        requires={[
          "Tenant-scoped audit read endpoint",
          "AUDIT_VIEW permission",
          "Actor resolution across tenants",
          "Retention + pagination policy",
        ]}
        plannedIn="The viewer follows the Tenant model, so audit access is scoped correctly from the outset rather than retrofitted."
      />
    </div>
  );
}
