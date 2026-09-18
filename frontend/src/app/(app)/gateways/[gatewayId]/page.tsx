"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Check, Copy, KeyRound, Loader2, Radio } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FieldGrid } from "@/components/ui/field-grid";
import { QueryState } from "@/components/ui/query-state";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { useGateways } from "@/hooks/use-gateways";
import { useGatewayTelemetry, useIssueIngestToken } from "@/hooks/use-gateway-telemetry";
import { useMe } from "@/hooks/use-me";
import { describeError } from "@/lib/errors";
import { formatDateTime, relativeTime } from "@/lib/format-detail";
import type { GatewayConnectivity, IssuedIngestToken } from "@/types";
import { GatewayHealthCard, NodesSection } from "@/components/gateway-telemetry";

/**
 * One gateway: its record, the address it pushes to, and what its nodes are
 * reporting right now.
 *
 * The record is read from the list query, as before. The push URL and the
 * node telemetry come from their own endpoints; the telemetry is polled and
 * overlaid with the live stream, so a reading that has just arrived shows up
 * without waiting for the next poll — and a platform operator, whom the
 * tenant stream refuses, still sees the polled figures.
 *
 * Every number here is something the gateway sent. A node that has never
 * reported its battery has no battery figure, rather than 0.
 */

const CONNECTIVITY_TONE: Record<GatewayConnectivity, StatusTone> = {
  never_reported: "slate",
  online: "green",
  stale: "yellow",
  offline: "red",
};

export default function GatewayDetailPage() {
  const params = useParams<{ gatewayId: string }>();
  const router = useRouter();
  const query = useGateways();
  const id = Number(params?.gatewayId);
  const telemetry = useGatewayTelemetry(Number.isFinite(id) ? id : null);
  const me = useMe();
  const canProvision =
    me.data?.isPlatformAdmin === true || (me.data?.permissions ?? []).includes("GATEWAY_PROVISION");

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" onClick={() => router.push("/gateways")}>
        <ArrowLeft className="mr-1.5 h-4 w-4" />
        Back to gateways
      </Button>

      <QueryState
        query={query}
        errorTitle="Couldn't load this gateway"
        skeleton={<Card className="h-64 animate-pulse bg-slate-100" />}
      >
        {(list) => {
          const g = list.items.find((x) => x.id === id);
          if (!g) {
            return (
              <EmptyState
                icon={Radio}
                title="Gateway not found"
                description="It may have been removed, or the link may be out of date."
              />
            );
          }

          return (
            <>
              <Card className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h1 className="text-xl font-semibold text-slate-900">{g.name}</h1>
                    <p className="mt-0.5 font-mono text-[0.8125rem] text-slate-500">
                      {g.gatewayKey}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      label={g.status}
                      tone={g.status === "active" ? "green" : "slate"}
                    />
                    <StatusBadge
                      label={g.connectivity.replace("_", " ")}
                      tone={CONNECTIVITY_TONE[g.connectivity] ?? "slate"}
                    />
                  </div>
                </div>

                <FieldGrid
                  className="mt-5 border-t border-slate-100 pt-5"
                  fields={[
                    { label: "Public ID", value: g.publicId, mono: true },
                    { label: "Hardware", value: g.hardwareModel },
                    { label: "Firmware", value: g.firmwareVersion, mono: true },
                    { label: "Devices", value: g.deviceCount },
                    {
                      label: "Buffered",
                      // Null is "we do not know", which is not the same claim as
                      // an empty buffer — so it stays an em dash, not a zero.
                      value: g.bufferedCount ?? null,
                    },
                    {
                      label: "Last seen",
                      value: g.lastSeenAt
                        ? `${formatDateTime(g.lastSeenAt)} (${relativeTime(g.secondsSinceLastSeen)})`
                        : "Never reported",
                    },
                    { label: "Registered", value: formatDateTime(g.createdAt) },
                    { label: "Project", value: g.projectId },
                    { label: "Structure", value: g.structureId },
                    { label: "Description", value: g.description, wide: true },
                  ]}
                />
              </Card>

              <PushUrlCard
                gatewayId={g.id}
                gatewayKey={g.gatewayKey}
                hasToken={g.hasIngestToken}
                issuedAt={g.ingestTokenIssuedAt}
                lastUsedAt={g.ingestTokenLastUsedAt}
                canProvision={canProvision}
              />

              <GatewayHealthCard telemetry={telemetry} />

              <NodesSection telemetry={telemetry} />
            </>
          );
        }}
      </QueryState>
    </div>
  );
}

// ─── Push URL ────────────────────────────────────────────────────────────────

function PushUrlCard({
  gatewayId,
  gatewayKey,
  hasToken,
  issuedAt,
  lastUsedAt,
  canProvision,
}: {
  gatewayId: number;
  gatewayKey: string;
  hasToken: boolean;
  issuedAt: string | null;
  lastUsedAt: string | null;
  canProvision: boolean;
}) {
  const issue = useIssueIngestToken(gatewayId);
  const [issued, setIssued] = useState<IssuedIngestToken | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onIssue = () => {
    // Re-issuing revokes the URL the gateway currently holds; worth a question
    // when one exists, since the unit stops reporting until it is reconfigured.
    if (
      hasToken &&
      !window.confirm(
        "Issue a new push URL? The current one stops working immediately, and the gateway will not report again until it is configured with the new address.",
      )
    ) {
      return;
    }
    setError(null);
    issue.mutate(undefined, {
      onSuccess: (data) => setIssued(data),
      onError: (e) => setError(describeError(e).description),
    });
  };

  const copy = async () => {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // The URL is on screen to select by hand; nothing else to do.
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Data push</CardTitle>
          <p className="mt-1 text-[0.8125rem] text-slate-500">
            The address this gateway is configured to POST to. Set it under HTTP(S) API Push in
            the gateway&rsquo;s own dashboard, with GatewayDeviceId{" "}
            <span className="font-mono">{gatewayKey}</span>.
          </p>
        </div>
        {canProvision && (
          <Button size="sm" variant={hasToken ? "secondary" : "default"} onClick={onIssue} disabled={issue.isPending}>
            {issue.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <KeyRound className="h-4 w-4" />
            )}
            {hasToken ? "Issue new URL" : "Issue push URL"}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {issued ? (
          <div className="rounded-lg border border-shm-green/40 bg-shm-green/5 p-4">
            <p className="text-sm font-medium text-slate-900">
              Copy this address now. It is shown once and cannot be retrieved again.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-md bg-white px-3 py-2 font-mono text-[0.8125rem] text-slate-800 ring-1 ring-slate-200">
                {issued.url}
              </code>
              <Button size="sm" variant="secondary" onClick={copy}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
        ) : (
          <FieldGrid
            fields={[
              {
                label: "Push URL",
                value: hasToken ? "Issued" : "Not issued",
              },
              { label: "Issued", value: issuedAt ? formatDateTime(issuedAt) : null },
              {
                label: "Last push authenticated",
                value: lastUsedAt ? formatDateTime(lastUsedAt) : hasToken ? "Never" : null,
              },
            ]}
          />
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-shm-red">
            {error}
          </p>
        )}
        {!canProvision && !hasToken && (
          <p className="mt-3 text-[0.8125rem] text-slate-500">
            An administrator with gateway provisioning rights issues the push URL.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
