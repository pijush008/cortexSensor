"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGrid } from "@/components/ui/field-grid";
import { PulseDot } from "@/components/ui/pulse-dot";
import { StatusBadge } from "@/components/ui/status-badge";
import { useGatewayTelemetry } from "@/hooks/use-gateway-telemetry";
import { useLiveStream, type LiveMeasurement } from "@/hooks/use-live-stream";
import { describeError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format-detail";
import type { GatewayChannelSnapshot, GatewayNodeSnapshot } from "@/types";

/**
 * What a gateway's nodes are reporting, as panels any page can mount.
 *
 * Shared by the gateway page and the project page, because a project owns
 * exactly one gateway and its "sensor data" IS this: every node behind that
 * gateway, every sensor on each node, the latest reading per channel, plus
 * node health and mesh link. The telemetry is polled and overlaid with the
 * live stream, so a reading that has just arrived shows without waiting for
 * the next poll. Every number here is something the gateway sent; a node
 * that has never reported its battery has no battery figure, not 0.
 */

// ─── Gateway health ──────────────────────────────────────────────────────────

export function GatewayHealthCard({ telemetry }: { telemetry: ReturnType<typeof useGatewayTelemetry> }) {
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

export function NodesSection({ telemetry }: { telemetry: ReturnType<typeof useGatewayTelemetry> }) {
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
