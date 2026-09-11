"use client";

import { useMemo, useState } from "react";
import {
  KeyRound,
  Lock,
  Plus,
  RefreshCw,
  ScrollText,
  Settings,
  ShieldCheck,
  Trash2,
  UserCog,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonCard } from "@/components/ui/skeleton";
import { useAuditFacets, useAuditLog } from "@/hooks/use-audit";
import type { AuditEntry } from "@/types";

/**
 * Audit log.
 *
 * This page previously rendered a hardcoded list with fabricated actor email
 * addresses and source IP addresses. Inventing an audit trail is a particularly
 * bad thing to do: it is a security record, and a fake one actively misleads
 * whoever is trying to answer "who changed this?".
 *
 * The records were being captured all along — every user, project, device,
 * sensor, alert, analysis, report and inspection mutation writes one. This is
 * the read side, scoped so an organization sees its own members' actions and
 * nobody else's.
 */

const ACTION_ICON: Record<string, typeof UserCog> = {
  create: Plus,
  update: Settings,
  delete: Trash2,
  verify: ShieldCheck,
  deactivate: Lock,
  assign: UserCog,
  unassign: KeyRound,
};

const ACTION_TONE: Record<string, string> = {
  create: "text-shm-green-text bg-shm-green/10",
  update: "text-shm-navy-700 bg-shm-navy-500/10",
  delete: "text-shm-red bg-shm-red/10",
  verify: "text-shm-green-text bg-shm-green/10",
  deactivate: "text-amber-700 bg-shm-yellow/15",
  assign: "text-shm-navy-700 bg-shm-navy-500/10",
  unassign: "text-amber-700 bg-shm-yellow/15",
};

function summarize(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object") return String(value);
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return null;
  return entries
    .slice(0, 4)
    .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join("  ");
}

export default function AuditPage() {
  const [entity, setEntity] = useState("");
  const [action, setAction] = useState("");

  const facets = useAuditFacets();
  const query = useAuditLog({ entity, action });

  const entries = useMemo(
    () => query.data?.pages.flatMap((p) => p.items) ?? [],
    [query.data],
  );

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs items={[{ label: "Governance" }, { label: "Audit Log" }]} />
        <PageHeader
          eyebrow="Governance"
          title="Audit Log"
          subtitle="Record of security-relevant actions taken by members of this organization."
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={() => query.refetch()}
              disabled={query.isFetching}
            >
              <RefreshCw
                className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          }
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="w-full sm:w-52">
          <Select
            label="Entity"
            value={entity}
            onChange={(e) => setEntity(e.target.value)}
            options={[
              { value: "", label: "All entities" },
              ...(facets.data?.entities ?? []).map((e) => ({ value: e, label: e })),
            ]}
          />
        </div>
        <div className="w-full sm:w-52">
          <Select
            label="Action"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            options={[
              { value: "", label: "All actions" },
              ...(facets.data?.actions ?? []).map((a) => ({ value: a, label: a })),
            ]}
          />
        </div>
      </div>

      {query.isPending ? (
        <SkeletonCard bodyHeight="h-64" />
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          title="Couldn't load the audit log"
          onRetry={() => query.refetch()}
        />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No audit records match"
          description={
            entity || action
              ? "No recorded actions match these filters."
              : "Actions taken by members of this organization will appear here."
          }
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-200/90 bg-white">
            <table className="w-full min-w-[860px] border-collapse text-sm">
              <caption className="sr-only">Audit records</caption>
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <Th>When</Th>
                  <Th>Actor</Th>
                  <Th>Action</Th>
                  <Th>Entity</Th>
                  <Th>Detail</Th>
                  <Th>Source</Th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <Row key={entry.id} entry={entry} />
                ))}
              </tbody>
            </table>
          </div>

          {query.hasNextPage && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                onClick={() => query.fetchNextPage()}
                disabled={query.isFetchingNextPage}
              >
                {query.isFetchingNextPage ? "Loading…" : "Load older records"}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Row({ entry }: { entry: AuditEntry }) {
  const Icon = ACTION_ICON[entry.action] ?? ScrollText;
  const tone = ACTION_TONE[entry.action] ?? "text-slate-600 bg-slate-100";
  const detail = summarize(entry.newValue);
  // An audit entry has no sub-resources, so a detail PAGE would just be this
  // row again. What is actually hidden is the truncated payload and the user
  // agent, so the row expands in place to show them.
  const [open, setOpen] = useState(false);

  return (
    <>
    <tr
      onClick={() => setOpen((v) => !v)}
      aria-expanded={open}
      className="cursor-pointer border-b border-slate-100 align-top last:border-0 hover:bg-slate-50/70"
    >
      <td className="whitespace-nowrap px-4 py-3 font-mono text-[0.71875rem] text-slate-500">
        {new Date(entry.createdAt).toLocaleString()}
      </td>
      <td className="px-4 py-3">
        {entry.actor ? (
          <>
            <span className="block text-[0.8125rem] text-slate-800">
              {entry.actor.name || entry.actor.email}
            </span>
            <span className="block font-mono text-[0.6875rem] text-slate-400">
              {entry.actor.email}
            </span>
          </>
        ) : (
          // Never invented. A row with no actor is shown as unattributed.
          <span className="text-[0.8125rem] italic text-slate-400">Unattributed</span>
        )}
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex items-center gap-1.5 rounded px-2 py-1 font-mono text-[0.65625rem] font-semibold uppercase tracking-wide ${tone}`}
        >
          <Icon className="h-3 w-3" strokeWidth={2} />
          {entry.action}
        </span>
      </td>
      <td className="px-4 py-3 font-mono text-[0.75rem] text-slate-700">
        {entry.entity}
        {entry.entityId !== null && (
          <span className="text-slate-400"> #{entry.entityId}</span>
        )}
      </td>
      <td className="max-w-[280px] px-4 py-3 font-mono text-[0.71875rem] text-slate-500">
        {detail ? (
          <span className="block truncate" title={detail}>
            {detail}
          </span>
        ) : (
          "—"
        )}
      </td>
      <td className="px-4 py-3 font-mono text-[0.71875rem] text-slate-400">
        {entry.ipAddress ?? "—"}
      </td>
    </tr>
    {open && (
      <tr className="border-b border-slate-100 bg-slate-50/60">
        <td colSpan={6} className="px-4 py-4">
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="font-mono text-[0.75rem] font-medium text-slate-500">
                User agent
              </dt>
              <dd className="mt-1 break-words font-mono text-[0.71875rem] text-slate-600">
                {entry.userAgent ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="font-mono text-[0.75rem] font-medium text-slate-500">
                Entity
              </dt>
              <dd className="mt-1 font-mono text-[0.71875rem] text-slate-600">
                {entry.entity}
                {entry.entityId !== null && ` #${entry.entityId}`}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="font-mono text-[0.75rem] font-medium text-slate-500">
                Recorded value
              </dt>
              <dd className="mt-1">
                {entry.newValue === null || entry.newValue === undefined ? (
                  <span className="text-[0.71875rem] text-slate-400">—</span>
                ) : (
                  <pre className="max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white p-3 font-mono text-[0.71875rem] leading-relaxed text-slate-700">
                    {JSON.stringify(entry.newValue, null, 2)}
                  </pre>
                )}
              </dd>
            </div>
          </dl>
        </td>
      </tr>
    )}
    </>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      scope="col"
      className="px-4 py-2.5 font-mono text-[0.75rem] font-medium text-slate-500"
    >
      {children}
    </th>
  );
}
