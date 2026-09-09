"use client";

import { useState } from "react";
import {
  FileText,
  KeyRound,
  Lock,
  LogIn,
  Search,
  Settings,
  ShieldCheck,
  UserCog,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Reveal } from "@/components/ui/reveal";
import { SectionLabel } from "@/components/ui/section-label";
import { Select } from "@/components/ui/select";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/layout/page-header";

interface AuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  role: string;
  action: string;
  resourceType: string;
  resourceId: string;
  outcome: "SUCCESS" | "FAILED" | "DENIED";
  ip: string;
  icon: typeof FileText;
  color: string;
}

const AUDIT_LOGS: AuditEntry[] = [
  {
    id: "AUD-0002041",
    timestamp: "2026-09-07T09:45:23Z",
    actor: "rahul@arctano.com",
    role: "superadmin",
    action: "USER_CREATE",
    resourceType: "User",
    resourceId: "USR-0042",
    outcome: "SUCCESS",
    ip: "103.42.17.91",
    icon: UserCog,
    color: "text-blue-600 bg-blue-50",
  },
  {
    id: "AUD-0002040",
    timestamp: "2026-09-07T09:21:47Z",
    actor: "system",
    role: "system",
    action: "AUTH_LOGIN",
    resourceType: "Session",
    resourceId: "SESS-8812",
    outcome: "SUCCESS",
    ip: "103.42.17.91",
    icon: LogIn,
    color: "text-shm-green bg-green-50",
  },
  {
    id: "AUD-0002039",
    timestamp: "2026-09-07T08:56:02Z",
    actor: "priya@struct.com",
    role: "admin",
    action: "DEVICE_UPDATE",
    resourceType: "Device",
    resourceId: "DEV-102",
    outcome: "SUCCESS",
    ip: "182.71.104.33",
    icon: Settings,
    color: "text-shm-navy-400 bg-shm-navy-400/10",
  },
  {
    id: "AUD-0002038",
    timestamp: "2026-09-07T08:34:18Z",
    actor: "unknown",
    role: "unauth",
    action: "AUTH_LOGIN",
    resourceType: "Session",
    resourceId: "—",
    outcome: "FAILED",
    ip: "91.204.15.77",
    icon: Lock,
    color: "text-shm-red bg-red-50",
  },
  {
    id: "AUD-0002037",
    timestamp: "2026-09-07T07:58:31Z",
    actor: "amit@engineer.com",
    role: "contractor",
    action: "SENSOR_CONFIGURE",
    resourceType: "Sensor",
    resourceId: "SEN-55",
    outcome: "SUCCESS",
    ip: "49.207.87.120",
    icon: Settings,
    color: "text-amber-600 bg-amber-50",
  },
  {
    id: "AUD-0002036",
    timestamp: "2026-09-07T07:12:09Z",
    actor: "viewer@dept.com",
    role: "authority",
    action: "REPORT_GENERATE",
    resourceType: "Report",
    resourceId: "RPT-908",
    outcome: "SUCCESS",
    ip: "120.60.208.55",
    icon: FileText,
    color: "text-purple-600 bg-purple-50",
  },
  {
    id: "AUD-0002035",
    timestamp: "2026-09-07T06:44:52Z",
    actor: "viewer@dept.com",
    role: "authority",
    action: "STRUCTURE_DELETE",
    resourceType: "Structure",
    resourceId: "STR-003",
    outcome: "DENIED",
    ip: "120.60.208.55",
    icon: Lock,
    color: "text-red-600 bg-red-50",
  },
  {
    id: "AUD-0002034",
    timestamp: "2026-09-07T05:31:26Z",
    actor: "priya@struct.com",
    role: "admin",
    action: "SENSOR_VIEW",
    resourceType: "Sensor",
    resourceId: "SEN-55",
    outcome: "SUCCESS",
    ip: "182.71.104.33",
    icon: KeyRound,
    color: "text-slate-600 bg-slate-50",
  },
  {
    id: "AUD-0002033",
    timestamp: "2026-09-07T04:20:15Z",
    actor: "system",
    role: "system",
    action: "SUBSCRIPTION_STATUS",
    resourceType: "Subscription",
    resourceId: "SUB-001",
    outcome: "SUCCESS",
    ip: "internal",
    icon: ShieldCheck,
    color: "text-shm-navy-700 bg-shm-navy-50",
  },
];

const OUTCOME_TONE: Record<string, StatusTone> = {
  SUCCESS: "green",
  FAILED: "red",
  DENIED: "red",
};

export default function AuditLogsPage() {
  const [search, setSearch] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState("all");

  const filtered = AUDIT_LOGS.filter((a) => {
    const matchesSearch =
      !search ||
      a.actor.toLowerCase().includes(search.toLowerCase()) ||
      a.action.toLowerCase().includes(search.toLowerCase()) ||
      a.resourceType.toLowerCase().includes(search.toLowerCase());
    const matchesOutcome =
      outcomeFilter === "all" || a.outcome === outcomeFilter;
    return matchesSearch && matchesOutcome;
  });

  const successCount = AUDIT_LOGS.filter((a) => a.outcome === "SUCCESS").length;
  const failedCount = AUDIT_LOGS.filter((a) => a.outcome !== "SUCCESS").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Logs"
        subtitle="Complete traceability of every action taken across the platform."
        actions={
          <Button variant="outline">
            <ShieldCheck className="h-4 w-4" /> Export Logs
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          title="Events (24h)"
          value={AUDIT_LOGS.length + 184}
          icon={ShieldCheck}
          accent="navy"
          delta="logged actions"
          className="anim-fade-up"
        />
        <StatCard
          title="Successful"
          value={successCount + 172}
          icon={ShieldCheck}
          accent="green"
          delta="completed cleanly"
          className="anim-fade-up [animation-delay:80ms]"
        />
        <StatCard
          title="Failed / denied"
          value={failedCount + 7}
          icon={Lock}
          accent="red"
          delta="investigate"
          className="anim-fade-up [animation-delay:160ms]"
        />
      </div>

      {/* Log Table */}
      <Reveal>
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <SectionLabel index="22" label="Forensic trail" className="mb-2" />
                <CardTitle>Event Log</CardTitle>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    placeholder="Search actor, action..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 sm:w-64"
                  />
                </div>
                <div className="w-full sm:w-44">
                  <Select
                    value={outcomeFilter}
                    onChange={(e) => setOutcomeFilter(e.target.value)}
                    options={[
                      { value: "all", label: "All outcomes" },
                      { value: "SUCCESS", label: "Success" },
                      { value: "FAILED", label: "Failed" },
                      { value: "DENIED", label: "Denied" },
                    ]}
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-[0.14em] text-slate-500">
                    <th className="pb-3 pr-4 font-medium">Timestamp</th>
                    <th className="pb-3 pr-4 font-medium">Actor</th>
                    <th className="pb-3 pr-4 font-medium">Action</th>
                    <th className="pb-3 pr-4 font-medium">Resource</th>
                    <th className="pb-3 pr-4 font-medium">Outcome</th>
                    <th className="pb-3 font-medium">IP Address</th>
                  </tr>
                </thead>
              <tbody>
                {filtered.map((entry) => (
                  <tr key={entry.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="py-3 pr-4">
                      <p className="font-mono text-xs text-slate-700">{entry.id}</p>
                      <p className="text-xs text-slate-400">{entry.timestamp}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <p className="font-medium text-slate-800">{entry.actor}</p>
                      <p className="text-xs text-slate-400 capitalize">{entry.role}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-md p-1 ${entry.color}`}>
                          <entry.icon className="h-3.5 w-3.5" />
                        </span>
                        <span className="font-mono font-medium text-slate-700">
                          {entry.action}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <p className="text-slate-600">{entry.resourceType}</p>
                      <p className="font-mono text-xs text-slate-400">{entry.resourceId}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <StatusBadge
                        label={entry.outcome}
                        tone={OUTCOME_TONE[entry.outcome] ?? "slate"}
                      />
                    </td>
                    <td className="py-3 font-mono text-xs text-slate-500">{entry.ip}</td>
                  </tr>
                ))}
</tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </Reveal>
    </div>
  );
}