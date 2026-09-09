"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock,
  Mail,
  MessageSquare,
  Settings2,
  Shield,
  Search,
  BellRing,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Reveal } from "@/components/ui/reveal";
import { Select } from "@/components/ui/select";
import { SectionLabel } from "@/components/ui/section-label";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/layout/page-header";

const SEVERITY_BAR: Record<string, string> = {
  CRITICAL: "bg-shm-red",
  HIGH: "bg-orange-500",
  MEDIUM: "bg-shm-yellow",
  LOW: "bg-shm-navy-500",
  INFORMATION: "bg-slate-300",
};

interface AlertItem {
  id: string;
  title: string;
  structure: string;
  location: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFORMATION";
  status: "OPEN" | "ACKNOWLEDGED" | "INVESTIGATING" | "RESOLVED" | "CLOSED";
  timestamp: string;
  source: string;
  evidence: string;
  channels: ("email" | "sms" | "push")[];
  confidence: number;
}

const ALERTS: AlertItem[] = [
  {
    id: "ALT-2026-001",
    title: "Natural Frequency Decreased 3.8%",
    structure: "BRIDGE-001",
    location: "Span 2 / Bearing Region",
    severity: "HIGH",
    status: "ACKNOWLEDGED",
    timestamp: "12 min ago",
    source: "FFT / Modal Analysis",
    evidence: "Natural frequency 3.42→3.29 Hz. Temperature-adjusted residual increased.",
    channels: ["email", "sms", "push"],
    confidence: 0.91,
  },
  {
    id: "ALT-2026-002",
    title: "Excessive Sensor Vibration",
    structure: "BRIDGE-001",
    location: "Span 1 / Sensor Cluster A",
    severity: "MEDIUM",
    status: "OPEN",
    timestamp: "48 min ago",
    source: "Vibration Analysis",
    evidence: "RMS acceleration 0.12g exceeds threshold 0.10g for 10 consecutive samples.",
    channels: ["email", "push"],
    confidence: 0.78,
  },
  {
    id: "ALT-2026-003",
    title: "Sensor S-103 Unreliable",
    structure: "BUILDING-003",
    location: "Level 5 / Column C",
    severity: "LOW",
    status: "INVESTIGATING",
    timestamp: "1 day ago",
    source: "Sensor Health Monitor",
    evidence: "Excessive noise detected. Signal quality degraded. Recommend sensor inspection.",
    channels: ["email"],
    confidence: 0.85,
  },
  {
    id: "ALT-2026-004",
    title: "Gateway Offline — Data Gap",
    structure: "DAM-001",
    location: "Gateway GW-ABC-00004",
    severity: "CRITICAL",
    status: "OPEN",
    timestamp: "3 hours ago",
    source: "Connection Monitor",
    evidence: "No MQTT heartbeat received for 180 seconds. 400 records buffered locally.",
    channels: ["email", "sms", "push"],
    confidence: 0.99,
  },
  {
    id: "ALT-2026-005",
    title: "Strain Pattern Deviation",
    structure: "TUNNEL-002",
    location: "Ring 37",
    severity: "MEDIUM",
    status: "RESOLVED",
    timestamp: "2 days ago",
    source: "Strain Analysis",
    evidence: "Strain residual increased 12% from baseline. Resolved after environmental compensation.",
    channels: ["email", "push"],
    confidence: 0.72,
  },
  {
    id: "ALT-2026-006",
    title: "Battery Low Warning",
    structure: "BRIDGE-001",
    location: "ESP32-003",
    severity: "LOW",
    status: "CLOSED",
    timestamp: "3 days ago",
    source: "Device Health",
    evidence: "Battery dropped below 30%. Device recharged and confirmed healthy.",
    channels: ["email"],
    confidence: 1.0,
  },
];

const SEVERITY_TONE: Record<string, StatusTone> = {
  CRITICAL: "red",
  HIGH: "red",
  MEDIUM: "yellow",
  LOW: "blue",
  INFORMATION: "slate",
};

const STATUS_TONE: Record<string, StatusTone> = {
  OPEN: "red",
  ACKNOWLEDGED: "yellow",
  INVESTIGATING: "blue",
  RESOLVED: "green",
  CLOSED: "slate",
};

export default function AlertsPage() {
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = ALERTS.filter((a) => {
    const matchesSearch =
      !search ||
      a.title.toLowerCase().includes(search.toLowerCase()) ||
      a.structure.toLowerCase().includes(search.toLowerCase()) ||
      a.id.toLowerCase().includes(search.toLowerCase());
    const matchesSeverity =
      severityFilter === "all" || a.severity === severityFilter;
    const matchesStatus =
      statusFilter === "all" || a.status === statusFilter;
    return matchesSearch && matchesSeverity && matchesStatus;
  });

  const openCount = ALERTS.filter(
    (a) => a.status === "OPEN" || a.status === "ACKNOWLEDGED"
  ).length;
  const criticalCount = ALERTS.filter(
    (a) => a.severity === "CRITICAL" || a.severity === "HIGH"
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alert Center"
        subtitle="Monitor anomalies, review evidence, and manage notification lifecycle."
        actions={
          <Button variant="outline">
            <Settings2 className="h-4 w-4" /> Alert Rules
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Active alerts"
          value={openCount}
          icon={AlertTriangle}
          accent="red"
          delta={openCount > 0 ? `${openCount} require attention` : "All clear"}
          className="anim-fade-up"
        />
        <StatCard
          title="Critical / high"
          value={criticalCount}
          icon={BellRing}
          accent="yellow"
          delta="severity ≥ high"
          className="anim-fade-up [animation-delay:80ms]"
        />
        <StatCard
          title="Resolved (30d)"
          value={18}
          icon={CheckCircle2}
          accent="green"
          delta="closed in window"
          className="anim-fade-up [animation-delay:160ms]"
        />
        <StatCard
          title="Avg response"
          value={4.5}
          suffix=" min"
          icon={Clock}
          accent="navy"
          delta="Acknowledge → resolve"
          className="anim-fade-up [animation-delay:240ms]"
        />
      </div>

      {/* Alert List */}
      <Reveal>
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <SectionLabel index="10" label="Incident queue" className="mb-2" />
                <CardTitle>Alerts</CardTitle>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    placeholder="Search alerts..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 sm:w-56"
                  />
                </div>
                <div className="w-full sm:w-40">
                  <Select
                    value={severityFilter}
                    onChange={(e) => setSeverityFilter(e.target.value)}
                    options={[
                      { value: "all", label: "All severities" },
                      ...Object.keys(SEVERITY_TONE).map((s) => ({ value: s, label: s })),
                    ]}
                  />
                </div>
                <div className="w-full sm:w-44">
                  <Select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    options={[
                      { value: "all", label: "All statuses" },
                      ...["OPEN", "ACKNOWLEDGED", "INVESTIGATING", "RESOLVED", "CLOSED"].map((s) => ({ value: s, label: s })),
                    ]}
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {filtered.map((alert) => (
              <div
                key={alert.id}
                className="group relative overflow-hidden rounded-lg border border-slate-200 p-4 pl-5 transition-all duration-200 hover:border-slate-300 hover:shadow-[0_10px_28px_-16px_rgba(17,17,17,0.25)]"
              >
                <span className={`absolute inset-y-0 left-0 w-[3px] ${SEVERITY_BAR[alert.severity] ?? "bg-slate-300"}`} />
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <StatusBadge
                      label={alert.severity}
                      tone={SEVERITY_TONE[alert.severity] ?? "slate"}
                    />
                    <StatusBadge
                      label={alert.status}
                      tone={STATUS_TONE[alert.status] ?? "slate"}
                    />
                    <span className="font-mono text-xs text-slate-400">{alert.id}</span>
                  </div>
                  <h3 className="mb-0.5 font-semibold text-slate-900">{alert.title}</h3>
                  <p className="mb-1 text-xs text-slate-500">
                    <span className="font-mono font-medium text-shm-navy-700">{alert.structure}</span>
                    {" · "}
                    {alert.location}
                    {" · "}
                    {alert.source}
                  </p>
                  <p className="mb-2 text-sm text-slate-600">{alert.evidence}</p>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {alert.timestamp}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <MessageSquare className="h-3 w-3" />
                      {alert.channels.map((c) => (
                        <span key={c} className="rounded bg-slate-100 px-1.5 py-0.5 font-medium uppercase text-slate-600">
                          {c}
                        </span>
                      ))}
                    </div>
                    <span className="flex items-center gap-1">
                      <Shield className="h-3 w-3" />
                      Confidence: {(alert.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  {alert.status === "OPEN" && (
                    <Button size="sm">Acknowledge</Button>
                  )}
                  {alert.status === "ACKNOWLEDGED" && (
                    <Button size="sm" variant="secondary">Mark Investigating</Button>
                  )}
                  {(alert.status === "OPEN" || alert.status === "ACKNOWLEDGED" || alert.status === "INVESTIGATING") && (
                    <Button size="sm" variant="outline">
                      <Mail className="h-3.5 w-3.5" /> Details
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      </Reveal>

      {/* Alert Rules Info */}
      <Reveal>
        <Card>
          <CardHeader>
            <SectionLabel index="11" label="Delivery routes" className="mb-2" />
            <CardTitle>Notification Channels</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                {
                  icon: Mail,
                  title: "Email",
                  desc: "Detailed alerts with evidence, location, and recommended actions. Delivered to all subscribed engineers.",
                  color: "bg-shm-navy-50 text-shm-navy-600",
                },
                {
                  icon: MessageSquare,
                  title: "SMS",
                  desc: "Critical alerts only. Short-form notifications for on-call engineers. Configurable quiet hours.",
                  color: "bg-amber-50 text-amber-600",
                },
                {
                  icon: Bell,
                  title: "Push / In-App",
                  desc: "Realtime notifications in the dashboard. Persistent until acknowledged with full audit trail.",
                  color: "bg-shm-navy-400/10 text-shm-navy-400",
                },
              ].map((c) => (
                <div
                  key={c.title}
                  className="group rounded-lg border border-slate-200 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm"
                >
                  <div className={`mb-2 inline-flex rounded-lg p-2 transition-transform duration-200 group-hover:scale-110 ${c.color}`}>
                    <c.icon className="h-5 w-5" strokeWidth={1.75} />
                  </div>
                  <h4 className="mb-1 text-sm font-bold text-slate-800">{c.title}</h4>
                  <p className="text-xs leading-relaxed text-slate-500">{c.desc}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </Reveal>
    </div>
  );
}