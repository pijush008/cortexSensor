"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Building2, MapPin, Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { QueryState } from "@/components/ui/query-state";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { SkeletonCard } from "@/components/ui/skeleton";
import {
  extractFieldErrors,
  useCreateStructure,
  useStructures,
} from "@/hooks/use-structures";
import { useProjects } from "@/hooks/use-data";
import { useAuthStore } from "@/stores/auth-store";
import type { Structure, StructureStatus, StructureType } from "@/types";

/**
 * Structure register.
 *
 * A table rather than a grid of cards: an operator comparing assets wants to
 * scan a column (how many are paused? which have no instrumentation yet?), and
 * cards make that scan impossible. Everything shown is a stored value — where a
 * field was never surveyed the cell reads as unrecorded rather than as zero.
 */

const TYPE_LABELS: Record<StructureType, string> = {
  bridge: "Bridge",
  flyover: "Flyover",
  building: "Building",
  tower: "Tower",
  dam: "Dam",
  tunnel: "Tunnel",
  railway: "Railway",
  pier: "Pier",
  industrial: "Industrial",
  other: "Other",
};

const STATUS_TONE: Record<StructureStatus, StatusTone> = {
  planned: "slate",
  commissioning: "blue",
  monitoring: "green",
  paused: "yellow",
  decommissioned: "red",
};

const STATUS_LABEL: Record<StructureStatus, string> = {
  planned: "Planned",
  commissioning: "Commissioning",
  monitoring: "Monitoring",
  paused: "Paused",
  decommissioned: "Decommissioned",
};

/** An unrecorded measurement is shown as such — never as 0. */
function metres(value: number | null): string {
  return value == null ? "—" : `${value.toLocaleString()} m`;
}

export default function StructuresPage() {
  const { userId } = useAuthStore();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);

  const query = useStructures();
  const projectsQuery = useProjects(userId ?? 0);

  const filtered = useMemo(() => {
    const items = query.data?.items ?? [];
    const term = search.trim().toLowerCase();
    return items.filter((s) => {
      const matchesTerm =
        !term ||
        s.name.toLowerCase().includes(term) ||
        s.code.toLowerCase().includes(term) ||
        (s.siteAddress ?? "").toLowerCase().includes(term);
      const matchesStatus = statusFilter === "all" || s.status === statusFilter;
      return matchesTerm && matchesStatus;
    });
  }, [query.data, search, statusFilter]);

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs items={[{ label: "Monitoring" }, { label: "Structures" }]} />
        <PageHeader
          eyebrow="Asset Register"
          title="Structures"
          subtitle="Physical assets under monitoring, and the points instrumented on them."
          actions={
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" /> Add structure
            </Button>
          }
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            aria-label="Search structures"
            placeholder="Search name, code or site"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="w-full sm:w-52">
          <Select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: "all", label: "All statuses" },
              ...(Object.keys(STATUS_LABEL) as StructureStatus[]).map((s) => ({
                value: s,
                label: STATUS_LABEL[s],
              })),
            ]}
          />
        </div>
      </div>

      <QueryState
        query={query}
        errorTitle="Couldn't load the structure register"
        isEmpty={(d) => (d?.items?.length ?? 0) === 0}
        empty={{
          icon: Building2,
          title: "No structures registered",
          description:
            "Add the bridges, buildings or other assets this organization monitors. Each structure holds the locations where instruments are installed.",
          action: (
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" /> Add structure
            </Button>
          ),
        }}
        skeleton={<SkeletonCard bodyHeight="h-64" />}
      >
        {() =>
          filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-12 text-center">
              <p className="text-sm font-medium text-slate-600">
                No structures match these filters
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {query.data?.total ?? 0} structure(s) registered in total.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200/90 bg-white">
              <table className="w-full min-w-[860px] border-collapse text-sm">
                <caption className="sr-only">Registered structures</caption>
                <thead>
                  <tr className="border-b border-slate-200 text-left">
                    <Th>Asset code</Th>
                    <Th>Structure</Th>
                    <Th>Type</Th>
                    <Th>Project</Th>
                    <Th className="text-right">Length</Th>
                    <Th className="text-right">Spans</Th>
                    <Th className="text-right">Locations</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s: Structure) => (
                    <tr
                      key={s.id}
                      className="border-b border-slate-100 last:border-0 transition-colors hover:bg-slate-50/70"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/structures/${s.id}`}
                          className="font-mono text-[0.75rem] font-semibold text-shm-navy-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-shm-navy-500"
                        >
                          {s.code}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-slate-800">{s.name}</span>
                        {s.siteAddress && (
                          <span className="mt-0.5 flex items-center gap-1 text-[0.71875rem] text-slate-400">
                            <MapPin className="h-3 w-3" strokeWidth={1.75} />
                            {s.siteAddress}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{TYPE_LABELS[s.type]}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {s.projectName ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[0.75rem] tabular-nums text-slate-600">
                        {metres(s.lengthMetres)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[0.75rem] tabular-nums text-slate-600">
                        {s.spanCount ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[0.75rem] tabular-nums text-slate-600">
                        {s.locationCount}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          label={STATUS_LABEL[s.status]}
                          tone={STATUS_TONE[s.status]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </QueryState>

      <CreateStructureModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        projects={(projectsQuery.data ?? []).map((p) => ({
          id: (p.projectId ?? p.id) as number,
          name: p.projectName,
        }))}
      />
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

function CreateStructureModal({
  open,
  onClose,
  projects,
}: {
  open: boolean;
  onClose: () => void;
  projects: { id: number; name: string }[];
}) {
  const create = useCreateStructure();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    setFormError(null);

    const form = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = {
      projectId: Number(form.get("projectId")),
      name: String(form.get("name") ?? "").trim(),
      code: String(form.get("code") ?? "").trim(),
      type: String(form.get("type") ?? "other"),
      status: String(form.get("status") ?? "planned"),
    };
    // Only send fields the operator actually filled in. Sending "" would
    // record an empty string where the truth is "not surveyed".
    for (const key of ["siteAddress", "spanCount", "lengthMetres", "constructionYear"]) {
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
        const message =
          (err as { response?: { data?: { message?: string } } })?.response?.data
            ?.message ?? "Could not create the structure. Please try again.";
        setFormError(message);
      }
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add structure"
      subtitle="Register a physical asset. Engineering details can be completed later."
    >
      {projects.length === 0 ? (
        <p className="text-sm text-slate-500">
          A structure belongs to a project. Create a project first, then return
          here to register its assets.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          {formError && (
            <p
              role="alert"
              className="rounded-lg border border-shm-red/25 bg-shm-red/5 px-3 py-2 text-[0.8125rem] text-shm-red"
            >
              {formError}
            </p>
          )}

          <Select
            name="projectId"
            label="Project"
            required
            options={projects.map((p) => ({
              value: String(p.id),
              label: p.name,
            }))}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              name="name"
              label="Structure name"
              placeholder="Kali River Bridge"
              required
              error={errors.name}
            />
            <Input
              name="code"
              label="Asset code"
              placeholder="BR-NH48-017"
              required
              error={errors.code}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              name="type"
              label="Type"
              options={(Object.keys(TYPE_LABELS) as StructureType[]).map((t) => ({
                value: t,
                label: TYPE_LABELS[t],
              }))}
            />
            <Select
              name="status"
              label="Status"
              options={(Object.keys(STATUS_LABEL) as StructureStatus[]).map((s) => ({
                value: s,
                label: STATUS_LABEL[s],
              }))}
            />
          </div>

          <Input
            name="siteAddress"
            label="Site (optional)"
            placeholder="NH-48, Gurugram"
            error={errors.siteAddress}
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              name="lengthMetres"
              label="Length (m)"
              type="number"
              step="0.01"
              min="0"
              error={errors.lengthMetres}
            />
            <Input
              name="spanCount"
              label="Spans"
              type="number"
              min="0"
              error={errors.spanCount}
            />
            <Input
              name="constructionYear"
              label="Built"
              type="number"
              min="1800"
              max="2200"
              error={errors.constructionYear}
            />
          </div>

          <p className="text-[0.75rem] leading-relaxed text-slate-400">
            Leave a field blank if the value is not known. Blank is recorded as
            unsurveyed, which is different from zero.
          </p>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending}>
              {create.isPending ? "Adding…" : "Add structure"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
