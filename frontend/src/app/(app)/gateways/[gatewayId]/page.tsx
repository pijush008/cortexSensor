"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Check, Copy, KeyRound, Loader2, Radio } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FieldGrid } from "@/components/ui/field-grid";
import { PulseDot } from "@/components/ui/pulse-dot";
import { QueryState } from "@/components/ui/query-state";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { useGateways } from "@/hooks/use-gateways";
import { useGatewayTelemetry, useIssueIngestToken } from "@/hooks/use-gateway-telemetry";
import { useLiveStream, type LiveMeasurement } from "@/hooks/use-live-stream";
import { useMe } from "@/hooks/use-me";
import { describeError } from "@/lib/errors";
import { formatDateTime, relativeTime } from "@/lib/format-detail";
import type { GatewayChannelSnapshot, GatewayConnectivity, GatewayNodeSnapshot, IssuedIngestToken } from "@/types";

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

// ─── Gateway health ──────────────────────────────────────────────────────────

function GatewayHealthCard({ telemetry }: { telemetry: ReturnType<typeof useGatewayTelemetry> }) {
  const hb = telemetry.data?.heartbeat;
  if (!hb) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Gateway health</CardTitle>
        <p className="mt-1 text-[0.8125rem] text-slate-500">
          Reported by the gateway at {formatDateTime(hb.ts)}.
        </p>
      </CardHeader>
      <CardContent>
        <FieldGrid
          fields={[
            { label: "Power", value: num(hb.powerInVolts, "V") },
            { label: "Current draw", value: num(hb.powerInCurrent, "mA") },
            { label: "Internet", value: hb.internetMode },
            { label: "Internal temperature", value: num(hb.temperature, "°C") },
            { label: "Humidity", value: num(hb.humidity, "%") },
            { label: "Pressure", value: num(hb.pressure, "Pa") },
            {
              label: "Storage",
              value:
                hb.disk ??
                (hb.diskUsed !== null && hb.diskSpace !== null
                  ? `${hb.diskUsed} GB used of ${hb.diskSpace} GB`
                  : null),
            },
            { label: "Data this month", value: num(hb.dataUsage, "kB") },
          ]}
        />
      </CardContent>
    </Card>
  );
}

// ─── Nodes ───────────────────────────────────────────────────────────────────

function NodesSection({ telemetry }: { telemetry: ReturnType<typeof useGatewayTelemetry> }) {
  // The whole tenant's feed, filtered per channel below. 600 is enough for
  // every channel on a busy gateway to keep its newest reading between polls.
  const live = useLiveStream({ limit: 600 });

  // Newest live reading per sensor, so each row looks up one value.
  const latestLive = useMemo(() => {
    const map = new Map<number, LiveMeasurement>();
    for (const e of live.events) {
      if (!map.has(e.sensorId)) map.set(e.sensorId, e);
    }
    return map;
  }, [live.events]);

  if (telemetry.isLoading) {
    return <Card className="h-40 animate-pulse bg-slate-100" />;
  }
  if (telemetry.isError) {
    return (
      <Card className="p-5">
        <p className="text-sm text-shm-red">
          Couldn&rsquo;t load node telemetry: {describeError(telemetry.error).description}
        </p>
      </Card>
    );
  }
  const nodes = telemetry.data?.nodes ?? [];
  if (nodes.length === 0) {
    return (
      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-900">Nodes</h2>
        <p className="mt-2 text-sm text-slate-600">
          No node has reported through this gateway yet. Nodes and their sensors appear here on
          their first push; nothing has to be registered by hand.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">
          Nodes <span className="ml-1 text-sm font-normal text-slate-500">{nodes.length}</span>
        </h2>
        <span className="flex items-center gap-2 text-[0.75rem] text-slate-500">
          {live.state === "open" ? (
            <>
              <PulseDot tone="green" /> Live
            </>
          ) : live.state === "error" ? (
            "Polled every 30 s"
          ) : (
            "Connecting to live feed…"
          )}
        </span>
      </div>
      {nodes.map((node) => (
        <NodeCard key={node.device.id} node={node} latestLive={latestLive} />
      ))}
    </div>
  );
}

function NodeCard({
  node,
  latestLive,
}: {
  node: GatewayNodeSnapshot;
  latestLive: Map<number, LiveMeasurement>;
}) {
  const { device, health, link, channels } = node;
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle>
            <Link
              href={`/devices/${device.id}`}
              className="underline-offset-2 hover:underline"
            >
              {device.name}
            </Link>
          </CardTitle>
          <p className="mt-0.5 font-mono text-[0.75rem] text-slate-500">
            {device.nodeKey ?? `#${device.id}`}
            {device.type ? <span className="font-sans"> · {device.type}</span> : null}
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-[0.75rem] sm:grid-cols-4">
          <Stat label="Last seen" value={device.lastSeenAt ? formatDateTime(device.lastSeenAt) : "Never"} />
          <Stat
            label="Battery"
            value={
              health
                ? health.batteryMillivolts !== null
                  ? `${health.batteryMillivolts} mV`
                  : health.batteryPercent !== null
                    ? `${health.batteryPercent}%`
                    : "—"
                : "Not reported"
            }
          />
          <Stat
            label="Environment"
            value={health ? `${fmt(health.temperature)} °C · ${fmt(health.humidity)} %` : "Not reported"}
          />
          <Stat
            label="Link"
            value={
              link
                ? `${link.rssi !== null ? `${link.rssi} dBm` : "—"} · ETX ${link.etx ?? "—"}${link.parentKey ? ` via ${link.parentKey}` : ""}`
                : "Not reported"
            }
          />
        </dl>
      </CardHeader>
      <CardContent>
        {channels.length === 0 ? (
          <p className="text-sm text-slate-600">
            This node has sent health reports but no sensor readings yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <caption className="sr-only">Latest reading per channel on {device.name}</caption>
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <Th>Ch</Th>
                  <Th>Sensor</Th>
                  <Th>Channel</Th>
                  <Th>Type</Th>
                  <Th className="text-right">Reading</Th>
                  <Th className="text-right">Raw</Th>
                  <Th>Gateway verdict</Th>
                  <Th className="text-right">At</Th>
                </tr>
              </thead>
              <tbody>
                {channels.map((c) => (
                  <ChannelRow
                    key={c.channelNumber}
                    channel={c}
                    live={c.sensorId !== null ? latestLive.get(c.sensorId) : undefined}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ChannelRow({ channel: c, live }: { channel: GatewayChannelSnapshot; live?: LiveMeasurement }) {
  // The live event wins when it is newer than the polled row; the poll wins
  // otherwise (a stream that reconnected may replay nothing, and must not
  // roll a value back).
  const liveIsNewer = live !== undefined && new Date(live.ts).getTime() > new Date(c.ts).getTime();
  const reading = liveIsNewer ? live!.value : c.reading;
  const raw = liveIsNewer ? live!.rawValue : c.rawReading;
  const at = liveIsNewer ? live!.ts : c.ts;
  const verdict = liveIsNewer
    ? live!.qualityFlags.includes("OUT_OF_RANGE")
      ? "error"
      : "valid"
    : (c.description ?? (c.isError ? "error" : "valid"));
  const bad = verdict.toLowerCase() !== "valid";

  return (
    <tr className="border-b border-slate-100 last:border-0">
      <td className="px-4 py-2 font-mono text-[0.75rem] text-slate-500">{c.channelNumber}</td>
      <td className="px-4 py-2">
        {c.sensorId !== null ? (
          <Link href={`/sensors/${c.sensorId}`} className="font-medium text-shm-navy-700 underline-offset-2 hover:underline">
            {c.sensorName ?? c.code ?? "—"}
          </Link>
        ) : (
          c.code ?? "—"
        )}
        {c.group ? <span className="ml-2 text-[0.75rem] text-slate-500">{c.group}</span> : null}
      </td>
      <td className="px-4 py-2 text-slate-700">{c.channelType ?? "—"}</td>
      <td className="px-4 py-2 text-slate-700">
        {c.platformType ?? c.sensorType ?? "—"}
        {c.address ? <span className="ml-2 font-mono text-[0.75rem] text-slate-500">@{c.address}</span> : null}
      </td>
      <td className={`px-4 py-2 text-right font-mono tabular-nums ${bad ? "text-shm-red" : "text-slate-900"}`}>
        {reading === null ? "—" : `${fmt(reading)}${c.unit ? ` ${c.unit}` : ""}`}
        {liveIsNewer && <PulseDot tone="green" className="ml-2 align-middle" />}
      </td>
      <td className="px-4 py-2 text-right font-mono tabular-nums text-slate-500">
        {raw === null ? "—" : `${fmt(raw)}${c.rawUnit ? ` ${c.rawUnit}` : ""}`}
      </td>
      <td className="px-4 py-2">
        <StatusBadge label={verdict} tone={bad ? "red" : "green"} />
      </td>
      <td className="px-4 py-2 text-right text-[0.75rem] text-slate-500">{formatDateTime(at)}</td>
    </tr>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-800">{value}</dd>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th scope="col" className={`px-4 py-2.5 font-mono text-[0.75rem] font-medium text-slate-500 ${className}`}>
      {children}
    </th>
  );
}

function fmt(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function num(value: number | null, unit: string): string | null {
  return value === null ? null : `${fmt(value)} ${unit}`;
}
