"use client";

import { useState } from "react";
import {
  Activity,
  Brain,
  FileDown,
  LineChart,
  Settings2,
  TrendingUp,
  Waves,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Reveal } from "@/components/ui/reveal";
import { Select } from "@/components/ui/select";
import { SectionLabel } from "@/components/ui/section-label";
import { PageHeader } from "@/components/layout/page-header";

interface StructureSelect {
  id: string;
  name: string;
  status: string;
}

const STRUCTURES: StructureSelect[] = [
  { id: "BRIDGE-001", name: "Flyover Bridge, Delhi", status: "green" },
  { id: "BUILDING-003", name: "Building 3, Bangalore", status: "green" },
  { id: "DAM-001", name: "Dam Wall, Uttarakhand", status: "yellow" },
  { id: "TUNNEL-002", name: "Tunnel, Jaipur", status: "green" },
];

const MODAL_FREQUENCIES = [
  { mode: "Mode 1", frequency: 3.42, damping: 2.1, change: -3.8, status: "warning" },
  { mode: "Mode 2", frequency: 8.76, damping: 1.4, change: -0.2, status: "normal" },
  { mode: "Mode 3", frequency: 15.23, damping: 0.9, change: +0.1, status: "normal" },
  { mode: "Mode 4", frequency: 22.68, damping: 0.7, change: -0.5, status: "normal" },
];

const FFT_PEAKS = [
  { freq: 3.42, magnitude: 0.82, label: "f₁ (Fundamental)" },
  { freq: 8.76, magnitude: 0.55, label: "f₂" },
  { freq: 15.23, magnitude: 0.38, label: "f₃" },
  { freq: 22.68, magnitude: 0.25, label: "f₄" },
];

const WAVEFORM: number[] = [
  30, 48, 42, 65, 55, 78, 62, 88, 70, 95, 75, 82, 60, 90, 72, 80, 58, 72, 50, 65,
  45, 58, 38, 52, 40, 48, 35, 45, 38, 42, 30, 40, 28, 38, 32, 35, 28, 32, 22, 30,
];

export default function AnalyticsPage() {
  const [selectedStructure, setSelectedStructure] = useState("BRIDGE-001");
  const [activeTab, setActiveTab] = useState<
    "overview" | "fft" | "modal" | "strain"
  >("overview");

  return (
    <div className="space-y-6">
      <PageHeader
        title="SHM Analytics"
        subtitle="FFT, spectral analysis, modal tracking, and structural intelligence."
        actions={
          <>
            <Button variant="outline">
              <Settings2 className="h-4 w-4" /> Analysis Settings
            </Button>
            <Button variant="outline">
              <FileDown className="h-4 w-4" /> Export FFT Data
            </Button>
          </>
        }
      />

      {/* Structure Selector */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="w-full sm:w-72">
          <Select
            label="Analyzed structure"
            value={selectedStructure}
            onChange={(e) => setSelectedStructure(e.target.value)}
            options={STRUCTURES.map((s) => ({ value: s.id, label: s.name }))}
          />
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-shm-green/20 bg-shm-green/5 px-3 py-2 text-xs font-medium text-shm-green">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-shm-green opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-shm-green" />
          </span>
          Telemetry streaming · 200 Hz
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-[0_1px_2px_rgba(17,17,17,0.04)]">
        {[
          { id: "overview", label: "Overview", icon: Activity },
          { id: "fft", label: "FFT / Spectrum", icon: LineChart },
          { id: "modal", label: "Modal Analysis", icon: Waves },
          { id: "strain", label: "Strain & Tilt", icon: TrendingUp },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`group flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ${
              activeTab === tab.id
                ? "bg-shm-navy-800 text-white shadow-sm"
                : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
            }`}
          >
            <tab.icon
              className={`h-4 w-4 transition-transform duration-200 group-hover:scale-110 ${
                activeTab === tab.id ? "text-shm-navy-200" : "text-slate-400"
              }`}
            />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Reveal className="lg:col-span-2">
            <Card className="lg:col-span-2">
              <CardHeader>
                <SectionLabel index="01" label="Time domain" />
                <CardTitle>Time-Domain Signal — {selectedStructure}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
                  <span className="font-mono">Acceleration (m/s²)</span>
                  <span className="font-mono">Sampling rate: 200 Hz</span>
                </div>
                <div className="flex h-44 items-center gap-[2px] rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                  {WAVEFORM.map((h, i) => (
                    <div
                      key={i}
                      className="anim-rise flex-1 rounded-t-sm bg-gradient-to-t from-shm-navy-500/70 to-shm-navy-300/70"
                      style={{ height: `${h}%`, animationDelay: `${i * 18}ms` }}
                    />
                  ))}
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3">
                  {[
                    { label: "RMS", value: "0.086 g", color: "text-shm-navy-700" },
                    { label: "Peak", value: "0.145 g", color: "text-amber-600" },
                    { label: "Kurtosis", value: "3.12", color: "text-shm-green" },
                  ].map((m) => (
                    <div key={m.label} className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-center transition-colors hover:border-slate-200">
                      <p className="text-[10px] uppercase tracking-wide text-slate-400">{m.label}</p>
                      <p className={`mt-0.5 text-lg font-bold ${m.color}`}>{m.value}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </Reveal>

          <Reveal delay={80}>
            <Card>
              <CardHeader>
                <SectionLabel index="02" label="Quality" />
                <CardTitle>Signal Quality</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { label: "Data Availability", value: 98, color: "bg-shm-green" },
                  { label: "Noise Level", value: 12, color: "bg-blue-500" },
                  { label: "Packet Quality", value: 99, color: "bg-shm-navy-500" },
                  { label: "Clock Sync Error", value: 4, color: "bg-amber-400" },
                ].map((q, qi) => (
                  <div key={q.label}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="text-slate-500">{q.label}</span>
                      <span className="font-mono font-medium text-slate-700">{q.value}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`anim-rise h-full rounded-full ${q.color}`}
                        style={{ width: `${q.value}%`, animationDelay: `${120 + qi * 90}ms` }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </Reveal>
        </div>
      )}

      {activeTab === "fft" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Reveal className="lg:col-span-2">
            <Card className="lg:col-span-2">
              <CardHeader>
                <SectionLabel index="03" label="Spectrum" />
                <CardTitle>FFT Spectrum (Welch PSD)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
                  <span className="font-mono">Frequency (Hz)</span>
                  <span className="font-mono">Window: Hann · 2048 pts · 50% overlap</span>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
                  <div className="flex h-48 items-end gap-[3px]">
                    {Array.from({ length: 60 }).map((_, i) => {
                      const base = Math.max(4, 100 - i * 1.6);
                      const spike = FFT_PEAKS.some(
                        (p) => Math.abs((i / 20) * 12 - p.freq) < 1.2
                      )
                        ? 35
                        : 0;
                      const height = Math.min(100, base + spike);
                      const isPeak = spike > 0;
                      return (
                        <div
                          key={i}
                          className={`anim-rise flex-1 rounded-t-sm ${
                            isPeak
                              ? "bg-gradient-to-t from-shm-navy-500 to-shm-navy-300 shadow-[0_0_12px_rgba(17,17,17,0.2)]"
                              : "bg-blue-100/80"
                          }`}
                          style={{ height: `${height}%`, animationDelay: `${i * 14}ms` }}
                          title={`${((i / 20) * 12).toFixed(2)} Hz`}
                        />
                      );
                    })}
                  </div>
                </div>

                <div className="mt-4">
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Detected Frequency Peaks
                  </h4>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {FFT_PEAKS.map((peak) => (
                      <div key={peak.freq} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 p-3 transition-colors hover:border-slate-200">
                        <div>
                          <p className="text-xs font-medium text-slate-500">{peak.label}</p>
                          <p className="font-mono text-lg font-bold text-shm-navy-800">{peak.freq} Hz</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-slate-400">Magnitude</p>
                          <p className="font-mono text-sm font-semibold text-slate-700">{peak.magnitude}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </Reveal>

          <Reveal delay={80}>
            <Card>
              <CardHeader>
                <SectionLabel index="04" label="Tracking" />
                <CardTitle>Frequency Tracking</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs font-semibold text-slate-500">f₁ (Fundamental) — 30 Day Trend</p>
                  <div className="mt-3 flex h-24 items-end gap-1">
                    {[3.52, 3.51, 3.50, 3.49, 3.50, 3.48, 3.47, 3.46, 3.45, 3.44, 3.43, 3.42, 3.41, 3.40, 3.39, 3.38, 3.37, 3.36, 3.35, 3.34, 3.33, 3.32, 3.31, 3.30].map((f, i) => (
                      <div key={i} className="anim-rise flex-1 rounded-t-sm bg-gradient-to-t from-amber-300 to-orange-400" style={{ height: `${((f - 3.25) / 0.3) * 100}%`, animationDelay: `${i * 30}ms` }} title={`${f} Hz`} />
                    ))}
                  </div>
                  <div className="mt-2 flex justify-between text-[10px] text-slate-400">
                    <span>Start</span>
                    <span className="font-mono font-medium text-amber-600">↓ 3.8% shift</span>
                    <span>Now</span>
                  </div>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                  <p className="mb-1 font-semibold">⚠ Attention Required</p>
                  <p>
                    Structural frequency f₁ has decreased 3.8% from baseline. Validate against
                    environmental conditions (temperature, humidity, traffic) before action.
                  </p>
                </div>
                <Button variant="outline" className="w-full">
                  <Brain className="h-4 w-4" /> Run AI Anomaly Check
                </Button>
              </CardContent>
            </Card>
          </Reveal>
        </div>
      )}

      {activeTab === "modal" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Reveal className="lg:col-span-2">
            <Card className="lg:col-span-2">
              <CardHeader>
                <SectionLabel index="05" label="Modal parameters" />
                <CardTitle>Modal Parameters — {selectedStructure}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-[0.14em] text-slate-500">
                        <th className="pb-3 pr-4 font-medium">Mode</th>
                        <th className="pb-3 pr-4 font-medium">Frequency (Hz)</th>
                        <th className="pb-3 pr-4 font-medium">Damping (%)</th>
                        <th className="pb-3 pr-4 font-medium">Δ vs Baseline</th>
                        <th className="pb-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {MODAL_FREQUENCIES.map((m) => (
                        <tr key={m.mode} className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50">
                          <td className="py-3 pr-4 font-medium text-slate-800">{m.mode}</td>
                          <td className="py-3 pr-4 font-mono text-slate-700">{m.frequency.toFixed(2)}</td>
                          <td className="py-3 pr-4 font-mono text-slate-700">{m.damping.toFixed(1)}</td>
                          <td className={`py-3 pr-4 font-mono ${m.change < -2 ? "font-bold text-amber-600" : "text-slate-700"}`}>
                            {m.change > 0 ? "+" : ""}{m.change}%
                          </td>
                          <td className="py-3">
                            {m.change < -2 ? (
                              <StatusBadge label="DRIFT DETECTED" tone="yellow" />
                            ) : (
                              <StatusBadge label="STABLE" tone="green" />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-500">
                  <p className="mb-1 font-semibold text-slate-600">⚠ Engineering Note</p>
                  <p>
                    Modal frequency changes can be caused by temperature, mass, or damage. Do not interpret
                    a single frequency shift as proof of damage. Validate against environmental data and FEM comparison.
                  </p>
                </div>
              </CardContent>
            </Card>
          </Reveal>

          <Reveal delay={80}>
            <Card>
              <CardHeader>
                <SectionLabel index="06" label="Correlation" />
                <CardTitle>Mode Shape Comparison</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex h-36 items-end justify-center gap-1 rounded-lg border border-slate-100 bg-slate-50/50 p-3">
                  {[15, 25, 40, 60, 80, 60, 40, 25, 15].map((h, i) => (
                    <div key={i} className="anim-rise flex-1 rounded-t-sm bg-gradient-to-t from-shm-navy-500 to-shm-navy-300" style={{ height: `${h}%`, animationDelay: `${i * 40}ms` }} />
                  ))}
                </div>
                <p className="mt-3 text-center text-xs text-slate-500">Mode Shape 1 — Current</p>
                <div className="mt-3 rounded-lg border border-slate-200 p-3">
                  <div className="mb-2 text-xs font-semibold text-slate-500">MAC Values</div>
                  <div className="space-y-2">
                    {[
                      { mode: "Mode 1", mac: 0.98, status: "Excellent correlation" },
                      { mode: "Mode 2", mac: 0.95, status: "Good correlation" },
                      { mode: "Mode 3", mac: 0.87, status: "Acceptable" },
                    ].map((m) => (
                      <div key={m.mode}>
                        <div className="mb-1 flex justify-between text-[10px]">
                          <span className="text-slate-500">{m.mode} · {m.status}</span>
                          <span className="font-mono font-medium text-slate-700">{m.mac.toFixed(2)}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                          <div className="anim-rise h-full rounded-full bg-shm-navy-500" style={{ width: `${m.mac * 100}%`, animationDelay: "200ms" }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </Reveal>
        </div>
      )}

      {activeTab === "strain" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Reveal className="lg:col-span-2">
            <Card className="lg:col-span-2">
              <CardHeader>
                <SectionLabel index="07" label="Strain timeline" />
                <CardTitle>Strain Timeline — {selectedStructure}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
                  <span className="font-mono">Micro-strain (με)</span>
                  <span className="font-mono">Environmental compensated ✓</span>
                </div>
                <div className="flex h-44 items-end gap-1 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                  {[40, 45, 42, 48, 50, 46, 52, 48, 44, 58, 60, 55, 62, 58, 66, 62, 70, 68, 74, 80, 78, 82, 76, 88, 85, 90, 84, 92, 88, 95].map((v, i) => (
                    <div
                      key={i}
                      className={`anim-rise flex-1 rounded-t-sm ${
                        v > 85
                          ? "bg-gradient-to-t from-shm-red/70 to-red-400/80"
                          : v > 60
                            ? "bg-gradient-to-t from-amber-400 to-orange-400"
                            : "bg-gradient-to-t from-shm-navy-500 to-shm-navy-300"
                      }`}
                      style={{ height: `${v}%`, animationDelay: `${i * 26}ms` }}
                    />
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-md bg-green-50 p-2 font-medium text-shm-green">Normal range</div>
                  <div className="rounded-md bg-amber-50 p-2 font-medium text-amber-600">Cautious</div>
                  <div className="rounded-md bg-red-50 p-2 font-medium text-shm-red">Warning</div>
                </div>
              </CardContent>
            </Card>
          </Reveal>

          <Reveal delay={80}>
            <Card>
              <CardHeader>
                <SectionLabel index="08" label="Environment" />
                <CardTitle>Environmental Context</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { label: "Temperature", value: "24.5°C", icon: "🌡️", status: "normal" },
                  { label: "Humidity", value: "62%", icon: "💧", status: "normal" },
                  { label: "Wind Speed", value: "12 km/h", icon: "🌬️", status: "normal" },
                  { label: "Traffic Load", value: "Moderate", icon: "🚗", status: "normal" },
                ].map((e) => (
                  <div key={e.label} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 p-3 transition-colors hover:border-slate-200">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{e.icon}</span>
                      <span className="text-sm text-slate-600">{e.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-800">{e.value}</span>
                      <StatusBadge label="OK" tone="green" />
                    </div>
                  </div>
                ))}
                <div className="rounded-lg border border-slate-200 p-3 text-xs text-slate-500">
                  <p className="mb-1 font-semibold text-slate-600">Compensation Model</p>
                  <p className="flex items-center gap-1 font-mono">
                    <Zap className="h-3 w-3 text-shm-yellow" />
                    Residual = Measured − f(T, H, Wind, Load)
                  </p>
                </div>
              </CardContent>
            </Card>
          </Reveal>
        </div>
      )}
    </div>
  );
}