"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  Wifi,
  WifiOff,
  DownloadCloud,
  Eraser,
  FileSpreadsheet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Reveal } from "@/components/ui/reveal";
import { PulseDot } from "@/components/ui/pulse-dot";
import { PageHeader } from "@/components/layout/page-header";
import { useLiveStream } from "@/hooks/use-live-stream";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useDevices } from "@/hooks/use-data";
import { Select } from "@/components/ui/select";

interface MqttMessage {
  id: number;
  topic: string;
  payload: string;
  receivedAt: Date;
}


function parsePayload(payload: string): Record<string, unknown> {
  try {
    const value = JSON.parse(payload);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {}
  return {};
}

/** Extract a human-readable message from an axios error response (possibly a Blob). */
async function extractErrorMessage(data: unknown): Promise<string> {
  try {
    if (data instanceof Blob) {
      const text = await data.text();
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object" && parsed.message) return String(parsed.message);
      return text.slice(0, 300);
    }
    if (typeof data === "string") return data;
    if (data && typeof data === "object") {
      const asRecord = data as { message?: unknown };
      if (asRecord.message) return String(asRecord.message);
    }
  } catch {}
  return "Unknown error";
}

function boundary(
  dateStr: string,
  timeStr: string,
  endOfDay: boolean,
): Date | null {
  if (!dateStr && !timeStr) return null;
  const now = new Date();
  const y = dateStr ? Number(dateStr.slice(0, 4)) : now.getFullYear();
  const m = dateStr ? Number(dateStr.slice(5, 7)) - 1 : now.getMonth();
  const d = dateStr ? Number(dateStr.slice(8, 10)) : now.getDate();
  const parts = timeStr ? timeStr.split(":").map(Number) : endOfDay ? [23, 59, 59] : [0, 0, 0];
  return new Date(y, m, d, parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0);
}

function fmtDate(d: Date): string {
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function fmtTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export default function DataDownloadPage() {
  const [error] = useState<string | null>(null);

  // Live capture comes from the API's authenticated, tenant-filtered SSE
  // stream. This page previously opened its own MQTT connection from the
  // browser using credentials compiled into the client bundle, subscribed to a
  // topic wildcard spanning every tenant (audit finding SEC-1).
  const live = useLiveStream({ limit: 500 });
  const connected = live.state === "open";

  // The capture table is a view over the stream, mapped into the shape the
  // export code already expects. `receivedAt` uses the device's own timestamp
  // rather than arrival time: exporting the moment the browser happened to see
  // a reading would misrepresent when it was measured.
  const messages: MqttMessage[] = useMemo(
    () =>
      live.events.map((e, index) => ({
        id: index,
        topic: `sensor/${e.sensorId}`,
        payload: JSON.stringify({
          sensorId: e.sensorId,
          value: e.value,
          rawValue: e.rawValue,
          qualityFlags: e.qualityFlags,
          ts: e.ts,
        }),
        receivedAt: new Date(e.ts),
      })),
    [live.events],
  );

  const [fromDate, setFromDate] = useState("");
  const [fromTime, setFromTime] = useState("");
  const [toDate, setToDate] = useState("");
  const [toTime, setToTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Cloud historical export (office view of stored field telemetry)
  const devices = useDevices();
  const [cloudDeviceId, setCloudDeviceId] = useState("all");
  const [cloudFrom, setCloudFrom] = useState("");
  const [cloudTo, setCloudTo] = useState("");
  /** Which cloud export is being prepared, so only that button spins. */
  const [cloudBusy, setCloudBusy] = useState<"sensorData" | "nodeData" | null>(null);
  const [cloudNotice, setCloudNotice] = useState<string | null>(null);

  const from = useMemo(
    () => boundary(fromDate, fromTime, false),
    [fromDate, fromTime],
  );
  const to = useMemo(
    () => boundary(toDate, toTime, true),
    [toDate, toTime],
  );

  const filtered = useMemo(
    () =>
      messages.filter(
        (m) =>
          (!from || m.receivedAt >= from) &&
          (!to || m.receivedAt <= to),
      ),
    [messages, from, to],
  );

  const orderAsc = useMemo(
    () => [...filtered].sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime()),
    [filtered],
  );

  const clearCaptured = () => {
    live.clear();
    setNotice(null);
  };

  const exportExcel = async () => {
    if (orderAsc.length === 0) return;
    setBusy(true);
    setNotice(null);
    try {
      // Loaded on click, not at import. xlsx is by far the heaviest dependency
      // on this page, and it is only needed by whoever actually presses Export
      // — a static import made every visitor download and parse it just to look
      // at the table.
      const XLSX = await import("xlsx");
      const dynKeys = new Set<string>();
      const prepared = orderAsc.map((m) => {
        const parsed = parsePayload(m.payload);
        for (const k of Object.keys(parsed)) dynKeys.add(k);
        return { m, parsed };
      });
      const keys = [...dynKeys];

      const header = [
        "Timestamp (UTC)",
        "Timestamp (Local)",
        "Date",
        "Time",
        "Topic",
        "Payload",
        ...keys,
      ];
      const rows = prepared.map(({ m, parsed }) => [
        m.receivedAt.toISOString(),
        m.receivedAt.toLocaleString(),
        fmtDate(m.receivedAt),
        fmtTime(m.receivedAt),
        m.topic,
        m.payload,
        ...keys.map((k) => {
          const v = parsed[k];
          return v === null || v === undefined || typeof v === "object"
            ? ""
            : String(v);
        }),
      ]);

      const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
      ws["!cols"] = [
        { wch: 24 }, { wch: 24 }, { wch: 12 }, { wch: 10 },
        { wch: 24 }, { wch: 60 }, ...keys.map(() => ({ wch: 18 })),
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Sensor Data");
      const stamp = `${fmtDate(new Date())}_${fmtTime(new Date()).replace(/:/g, "-")}`;
      XLSX.writeFile(wb, `shm-sensor-data_${stamp}.xlsx`);
      setNotice(`Exported ${orderAsc.length} records to Excel.`);
    } catch (err) {
      setNotice("Excel export failed: " + ((err as Error).message || "Unknown error"));
    } finally {
      setBusy(false);
    }
  };

  const hasRange = Boolean(from || to);

  const deviceOptions = [
    { value: "all", label: "All devices" },
    ...(devices.data || []).map((d) => ({
      value: String(d.id),
      label: `${d.deviceName} (${d.deviceId ?? `id:${d.id}`})`,
    })),
  ];

  const downloadCloud = async (kind: "sensorData" | "nodeData") => {
    setCloudBusy(kind);
    setCloudNotice(null);
    try {
      const body: Record<string, unknown> = {};
      if (cloudDeviceId && cloudDeviceId !== "all") {
        const device = (devices.data || []).find((d) => String(d.id) === cloudDeviceId);
        // sensor_data / node_data store the telemetry DeviceId string (e.g. "fb8d"),
        // so send the device's deviceId string; fall back to the row id.
        body.deviceId = device?.deviceId || cloudDeviceId;
      }
      if (cloudFrom) body.startDate = new Date(cloudFrom).toISOString();
      if (cloudTo) body.endDate = new Date(cloudTo).toISOString();

      const url = kind === "sensorData" ? "/download/sensorData" : "/download/nodeData";
      const res = await api.post(url, body, {
        responseType: "blob",
        timeout: 120000,
      });

      const disposition = res.headers["content-disposition"] || "";
      const match = disposition.match(/filename=([^;]+)/);
      const filename = match ? match[1].replace(/"/g, "") : `${kind}.csv`;

      const downloadUrl = URL.createObjectURL(new Blob([res.data as BlobPart]));
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(downloadUrl);
      setCloudNotice(`Downloaded ${filename}`);
    } catch (err) {
      const e = err as { response?: { data?: unknown }; message?: string };
      setCloudNotice(
        `Download failed: ${(await extractErrorMessage(e.response?.data))}`,
      );
    } finally {
      setCloudBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Data Download"
        subtitle="Capture live telemetry, filter by date & time, and export to Excel."
        actions={
          <Button onClick={clearCaptured} variant="outline">
            {connected ? (
              <><WifiOff className="h-4 w-4" /> Disconnect</>
            ) : (
              <><Wifi className="h-4 w-4" /> Connect</>
            )}
          </Button>
        }
      />

      {error && (
        <div className="anim-tick-in rounded-lg border border-shm-red/20 bg-shm-red/5 px-3.5 py-2.5 text-sm text-shm-red">
          {error}
        </div>
      )}

      <Reveal>
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-white/10 bg-shm-navy-900">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CardTitle className="flex items-center gap-2 font-mono text-sm font-medium text-white">
                  <Activity className="h-4 w-4 text-shm-teal" />
                  Live Stream
                </CardTitle>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-2 font-mono text-[0.6875rem] text-shm-navy-300">
                  <PulseDot tone={connected ? "green" : "slate"} />
                  {connected ? "Connected" : "Disconnected"}
                </span>
                <span className="font-mono text-[0.6875rem] text-shm-navy-300">
                  captured={messages.length}
                </span>
              </div>
            </div>
          </CardHeader>

          <CardContent className="bg-shm-navy-900 p-0">
            <div className="flex items-center gap-2 overflow-x-auto border-b border-white/10 px-4 py-2">
              <span className="shrink-0 font-mono text-[0.75rem] font-medium text-shm-navy-600">
                Listening
              </span>
              <code className="shrink-0 rounded bg-white/[0.06] px-2 py-1 font-mono text-[0.6875rem] text-shm-teal">
                your organization&apos;s measurements
              </code>
              <span className="truncate font-mono text-[0.6875rem] text-shm-navy-300">
                via authenticated stream
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto shrink-0 text-shm-navy-300 hover:bg-white/[0.06] hover:text-white"
                onClick={clearCaptured}
              >
                <Eraser className="h-3.5 w-3.5" />
                Clear
              </Button>
            </div>

            {messages.length === 0 ? (
              <div className="flex h-52 flex-col items-center justify-center gap-2">
                <Activity className="h-8 w-8 text-shm-navy-600" strokeWidth={1.25} />
                <p className="font-mono text-xs text-shm-navy-400">
                  {connected
                    ? "waiting for telemetry…_"
                    : "connect to broker to start capturing"}
                </p>
              </div>
            ) : (
              <div className="max-h-[440px] overflow-auto">
                <table className="w-full min-w-[720px] border-collapse font-mono text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-[0.75rem] font-medium text-shm-navy-600">
                      <th className="sticky top-0 bg-shm-navy-900 px-4 py-2.5 font-medium">Received</th>
                      <th className="sticky top-0 bg-shm-navy-900 px-4 py-2.5 font-medium">Topic</th>
                      <th className="sticky top-0 bg-shm-navy-900 px-4 py-2.5 font-medium">Payload</th>
                    </tr>
                  </thead>
                  <tbody>
                    {messages.map((m) => (
                      <tr
                        key={m.id}
                        className="anim-tick-in border-b border-white/[0.04] align-top transition-colors hover:bg-white/[0.05]"
                      >
                        <td className="whitespace-nowrap px-4 py-2 text-shm-navy-300">
                          {m.receivedAt.toLocaleTimeString()}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 text-shm-teal">{m.topic}</td>
                        <td className="break-all px-4 py-2 text-slate-300">{m.payload}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </Reveal>

      {notice && (
        <div
          className={cn(
            "anim-tick-in rounded-lg border px-3.5 py-2.5 text-sm",
            notice.startsWith("Exported")
              ? "border-shm-sky-200 bg-shm-sky-50 text-shm-navy-700"
              : "border-shm-red/20 bg-shm-red/5 text-shm-red"
          )}
        >
          {notice}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Reveal delay={60}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DownloadCloud className="h-5 w-5 text-shm-navy-700" strokeWidth={1.75} />
                Select Range (HH:MM:SS)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-[0.8125rem] font-medium text-slate-700">From</label>
                  <Input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    aria-label="From date"
                  />
                  <Input
                    type="time"
                    step={1}
                    value={fromTime}
                    onChange={(e) => setFromTime(e.target.value)}
                    aria-label="From time"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[0.8125rem] font-medium text-slate-700">To</label>
                  <Input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    aria-label="To date"
                  />
                  <Input
                    type="time"
                    step={1}
                    value={toTime}
                    onChange={(e) => setToTime(e.target.value)}
                    aria-label="To time"
                  />
                </div>
              </div>

              <div className="rounded-lg bg-slate-50 px-3.5 py-3 font-mono text-xs text-slate-500">
                {hasRange ? (
                  <span className="tracking-wide">
                    {from ? from.toLocaleString() : "…"} → {to ? to.toLocaleString() : "now"}
                  </span>
                ) : (
                  <span className="italic">No filter — exporting everything captured.</span>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
                <div className="flex gap-5 font-mono text-xs">
                  <span className="text-slate-500">
                    captured <span className="font-semibold text-shm-navy-700">{messages.length}</span>
                  </span>
                  <span className="text-slate-500">
                    filtered{" "}
                    <span className={cn("font-semibold", hasRange ? "text-shm-navy-400" : "text-shm-navy-700")}>
                      {filtered.length}
                    </span>
                  </span>
                </div>
                <Button onClick={clearCaptured} variant="ghost" size="sm" className="text-slate-500">
                  <Eraser className="h-3.5 w-3.5" />
                  Clear captured
                </Button>
              </div>
            </CardContent>
          </Card>
        </Reveal>

        <Reveal delay={120}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-shm-navy-700" strokeWidth={1.75} />
                Download as Excel
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm leading-relaxed text-slate-600">
                Generates an <span className="font-medium text-slate-800">.xlsx</span> workbook
                with one row per captured message. JSON payloads are flattened into extra columns
                alongside the receive time and topic.
              </p>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 font-mono text-[0.6875rem] leading-relaxed text-slate-500">
                <p>shm-sensor-data_YYYY-MM-DD_HH-MM-SS.xlsx</p>
                <p className="mt-1 text-slate-400">
                  Header: Timestamp (UTC) · Timestamp (Local) · Date · Time · Topic · Payload · …
                </p>
              </div>
              <Button
                className="w-full"
                size="lg"
                loading={busy}
                disabled={orderAsc.length === 0}
                onClick={exportExcel}
              >
                <FileSpreadsheet className="h-4 w-4" />
                {busy
                  ? "Building workbook…"
                  : orderAsc.length === 0
                    ? "No data to export"
                    : `Export ${orderAsc.length} ${orderAsc.length === 1 ? "record" : "records"} to Excel`}
              </Button>
              {hasRange && orderAsc.length < messages.length && (
                <p className="text-xs text-slate-500">
                  Showing {filtered.length} of {messages.length} captured records in the
                  selected date/time range.
                </p>
              )}
            </CardContent>
          </Card>
        </Reveal>
      </div>

      <Reveal delay={200}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DownloadCloud className="h-5 w-5 text-shm-navy-700" strokeWidth={1.75} />
              Export historical field data (CSV)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm leading-relaxed text-slate-600">
              Pull the telemetry that ESP32 nodes / Raspberry Pi gateways already sent to
              the cloud out of <span className="font-medium text-slate-800">PostgreSQL</span>.
              Readings were stored via{" "}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.6875rem] text-slate-500">
                POST /api/beamDeviceData
              </code>
              .
            </p>

            {cloudNotice && (
              <div
                className={cn(
                  "anim-tick-in rounded-lg border px-3.5 py-2.5 text-sm",
                  cloudNotice.startsWith("Downloaded")
                    ? "border-shm-sky-200 bg-shm-sky-50 text-shm-navy-700"
                    : "border-shm-red/20 bg-shm-red/5 text-shm-red",
                )}
              >
                {cloudNotice}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-3">
              <Select
                label="Device"
                value={cloudDeviceId}
                onChange={(e) => setCloudDeviceId(e.target.value)}
                options={deviceOptions}
              />
              <Input
                label="From"
                type="datetime-local"
                value={cloudFrom}
                onChange={(e) => setCloudFrom(e.target.value)}
              />
              <Input
                label="To"
                type="datetime-local"
                value={cloudTo}
                onChange={(e) => setCloudTo(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                loading={cloudBusy === "sensorData"}
                disabled={cloudBusy !== null}
                onClick={() => downloadCloud("sensorData")}
              >
                <FileSpreadsheet className="h-4 w-4" />
                {cloudBusy === "sensorData" ? "Preparing…" : "Sensor readings (CSV)"}
              </Button>
              <Button
                variant="outline"
                loading={cloudBusy === "nodeData"}
                disabled={cloudBusy !== null}
                onClick={() => downloadCloud("nodeData")}
              >
                <DownloadCloud className="h-4 w-4" />
                {cloudBusy === "nodeData" ? "Preparing…" : "Node health (CSV)"}
              </Button>
            </div>
            <p className="text-xs text-slate-500">
              Leave device on “All devices” and the range empty to export the most recent
              100,000 stored records. Larger exports are capped server-side by
              <code className="font-mono text-[0.6875rem]">TELEMETRY_EXPORT_ROW_LIMIT</code>.
            </p>
          </CardContent>
        </Card>
      </Reveal>
    </div>
  );
}