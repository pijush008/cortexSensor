"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { useState } from "react";
import { Plus, Server } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { QueryState } from "@/components/ui/query-state";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { SkeletonCard } from "@/components/ui/skeleton";
import { extractFieldErrors } from "@/hooks/use-structures";
import { useCreateGateway, useGateways } from "@/hooks/use-gateways";
import type { Gateway, GatewayConnectivity, GatewayStatus } from "@/types";

/**
 * Edge gateway fleet.
 *
 * This screen previously rendered a hardcoded list with invented connectivity,
 * battery, CPU and buffered-packet counts. Everything here is now a stored
 * fact, and — just as importantly — the absences are shown as absences:
 *
 *   - a gateway that has never sent a heartbeat reads "Never reported", not
 *     "offline 0 minutes ago";
 *   - an unknown buffer depth reads "—", because unknown and empty are
 *     different facts about a store-and-forward queue;
 *   - connectivity is derived from lastSeenAt on every render, so a gateway
 *     that dies quietly stops claiming to be online.
 */

const STATUS_LABEL: Record<GatewayStatus, string> = {
  provisioning: "Provisioning",
  active: "Active",
  degraded: "Degraded",
  offline: "Offline",
  maintenance: "Maintenance",
  decommissioned: "Decommissioned",
};

const STATUS_TONE: Record<GatewayStatus, StatusTone> = {
  provisioning: "blue",
  active: "green",
  degraded: "yellow",
  offline: "red",
  maintenance: "slate",
  decommissioned: "slate",
};

const CONNECTIVITY_LABEL: Record<GatewayConnectivity, string> = {
  never_reported: "Never reported",
  online: "Reporting",
  stale: "Delayed",
  offline: "Not reporting",
};

const CONNECTIVITY_TONE: Record<GatewayConnectivity, StatusTone> = {
  never_reported: "slate",
  online: "green",
  stale: "yellow",
  offline: "red",
};

/** "4 min ago" — or an explicit statement that nothing has ever arrived. */
function lastSeenLabel(gateway: Gateway): string {
  if (gateway.lastSeenAt === null || gateway.secondsSinceLastSeen === null) {
    return "Never";
  }
  const s = gateway.secondsSinceLastSeen;
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export default function GatewaysPage() {
  const router = useRouter();
  const query = useGateways();
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs items={[{ label: "Field Infrastructure" }, { label: "Gateways" }]} />
        <PageHeader
          eyebrow="Edge Fleet"
          title="Gateways"
          subtitle="Edge nodes forwarding field telemetry to the platform."
          actions={
            <Button onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4" /> Register gateway
            </Button>
          }
        />
      </div>

      <QueryState
        query={query}
        errorTitle="Couldn't load the gateway fleet"
        isEmpty={(d) => (d?.items?.length ?? 0) === 0}
        empty={{
          icon: Server,
          title: "No gateways registered",
          description:
            "Register the edge gateways deployed in the field. Each one forwards telemetry from the sensor nodes attached to it.",
          action: (
            <Button onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4" /> Register gateway
            </Button>
          ),
        }}
        skeleton={<SkeletonCard bodyHeight="h-56" />}
      >
        {(data) => (
          <div className="overflow-x-auto rounded-xl border border-slate-200/90 bg-white">
            <table className="w-full min-w-[1040px] border-collapse text-sm">
              <caption className="sr-only">Registered edge gateways</caption>
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <Th>Gateway ID</Th>
                  <Th>Name</Th>
                  <Th>Assignment</Th>
                  <Th>Hardware</Th>
                  <Th>Firmware</Th>
                  <Th className="text-right">Devices</Th>
                  <Th className="text-right">Buffered</Th>
                  <Th className="text-right">Last report</Th>
                  <Th>Reporting</Th>
                  <Th>State</Th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((g) => (
                  <tr
                    key={g.id}
                    // The row is the click target because that is where anyone
                    // aims; the key cell is ALSO a real link so the row can be
                    // reached and opened from the keyboard, which a bare
                    // onClick on a <tr> cannot be.
                    onClick={() => router.push(`/gateways/${g.id}`)}
                    className="cursor-pointer border-b border-slate-100 last:border-0 transition-colors hover:bg-slate-50/70"
                  >
                    <td className="px-4 py-3 font-mono text-[0.75rem] font-semibold text-slate-800">
                      <Link
                        href={`/gateways/${g.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="underline-offset-2 hover:underline"
                      >
                        {g.gatewayKey}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{g.name}</td>
                    <td className="px-4 py-3">
                      {/* Which project holds it, or that none does. "Available"
                          is a fact about the claim, not a guess. */}
                      {g.availability === "assigned" ? (
                        <span className="inline-flex items-center gap-2">
                          <StatusBadge label="Assigned" tone="blue" />
                          {g.projectId !== null ? (
                            <Link
                              href={`/projects/${g.projectId}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-slate-700 underline-offset-2 hover:underline"
                            >
                              {g.projectName ?? `Project ${g.projectId}`}
                            </Link>
                          ) : null}
                        </span>
                      ) : g.availability === "decommissioned" ? (
                        <StatusBadge label="Decommissioned" tone="slate" />
                      ) : (
                        <StatusBadge label="Available" tone="green" />
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {g.hardwareModel ?? "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-[0.75rem] text-slate-500">
                      {g.firmwareVersion ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[0.75rem] tabular-nums text-slate-600">
                      {g.deviceCount}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[0.75rem] tabular-nums text-slate-600">
                      {/* Unknown ≠ empty for a store-and-forward buffer. */}
                      {g.bufferedCount ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[0.75rem] tabular-nums text-slate-500">
                      {lastSeenLabel(g)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        label={CONNECTIVITY_LABEL[g.connectivity]}
                        tone={CONNECTIVITY_TONE[g.connectivity]}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        label={STATUS_LABEL[g.status]}
                        tone={STATUS_TONE[g.status]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </QueryState>

      <RegisterGatewayModal open={showAdd} onClose={() => setShowAdd(false)} />
    </div>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={`px-4 py-2.5 font-mono text-[0.75rem] font-medium text-slate-500 ${className}`}
    >
      {children}
    </th>
  );
}

function RegisterGatewayModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const create = useCreateGateway();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    setFormError(null);

    const form = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = {
      gatewayKey: String(form.get("gatewayKey") ?? "").trim(),
      name: String(form.get("name") ?? "").trim(),
    };
    for (const key of ["hardwareModel", "firmwareVersion", "description"]) {
      const value = String(form.get(key) ?? "").trim();
      if (value) payload[key] = value;
    }

    try {
      await create.mutateAsync(payload);
      onClose();
    } catch (err) {
      const fieldErrors = extractFieldErrors(err);
      setErrors(fieldErrors);
      if (Object.keys(fieldErrors).length === 0) {
        setFormError(
          (err as { response?: { data?: { message?: string } } })?.response?.data
            ?.message ?? "Could not register the gateway. Please try again.",
        );
      }
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Register gateway"
      subtitle="The gateway identifier must match what the hardware reports in its telemetry."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {formError && (
          <p
            role="alert"
            className="rounded-lg border border-shm-red/25 bg-shm-red/5 px-3 py-2 text-[0.8125rem] text-shm-red"
          >
            {formError}
          </p>
        )}

        <Input
          name="gatewayKey"
          label="Gateway identifier"
          placeholder="gw-del-001"
          required
          error={errors.gatewayKey}
        />
        <Input
          name="name"
          label="Name"
          placeholder="Delhi Flyover — Pier cabinet"
          required
          error={errors.name}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            name="hardwareModel"
            label="Hardware (optional)"
            placeholder="Raspberry Pi 4B"
            error={errors.hardwareModel}
          />
          <Input
            name="firmwareVersion"
            label="Firmware (optional)"
            placeholder="1.4.2"
            error={errors.firmwareVersion}
          />
        </div>

        <p className="text-[0.75rem] leading-relaxed text-slate-400">
          A newly registered gateway stays in Provisioning until its first
          heartbeat arrives. Health figures appear only once the gateway
          actually reports them.
        </p>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={create.isPending}>
            {create.isPending ? "Registering…" : "Register gateway"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
