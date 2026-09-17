"use client";

import { use, useState } from "react";
import { MapPin, Plus, Trash2, Waypoints } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { QueryState } from "@/components/ui/query-state";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { SkeletonCard } from "@/components/ui/skeleton";
import {
  extractFieldErrors,
  useCreateLocation,
  useDeleteLocation,
  useLocations,
  useStructure,
} from "@/hooks/use-structures";
import type { Location, StructureStatus } from "@/types";

/**
 * Structure detail (§47).
 *
 * Two halves: the asset's identity and engineering metadata, and the register
 * of monitoring locations installed on it. Unrecorded fields are shown as
 * unrecorded — this page will later carry live measurements, and an operator
 * must never be unable to tell a real value from a filler one.
 */

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

function Field({
  label,
  value,
  unit,
}: {
  label: string;
  value: string | number | null | undefined;
  unit?: string;
}) {
  const missing = value === null || value === undefined || value === "";
  return (
    <div className="border-t border-slate-100 py-2.5 first:border-t-0">
      <dt className="font-mono text-[0.75rem] font-medium text-slate-500">
        {label}
      </dt>
      <dd
        className={
          missing
            ? "mt-1 text-[0.8125rem] italic text-slate-400"
            : "mt-1 text-[0.84375rem] text-slate-800"
        }
      >
        {missing ? "Not recorded" : `${value}${unit ? ` ${unit}` : ""}`}
      </dd>
    </div>
  );
}

export default function StructureDetailPage({
  params,
}: {
  params: Promise<{ structureId: string }>;
}) {
  const { structureId } = use(params);
  const id = Number(structureId);

  const structureQuery = useStructure(Number.isFinite(id) ? id : null);
  const locationsQuery = useLocations(Number.isFinite(id) ? id : null);
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div className="space-y-6">
      <QueryState
        query={structureQuery}
        errorTitle="Couldn't load this structure"
        skeleton={<SkeletonCard bodyHeight="h-40" />}
        empty={{
          icon: Waypoints,
          title: "Structure not found",
          description: "It may have been removed, or you may not have access to it.",
        }}
      >
        {(structure) => (
          <>
            <div>
              <Breadcrumbs
                items={[
                  { label: "Monitoring" },
                  { label: "Structures", href: "/structures" },
                  ...(structure.projectName
                    ? [{ label: structure.projectName }]
                    : []),
                  { label: structure.code },
                ]}
              />
              <PageHeader
                eyebrow={structure.projectName ?? "Structure"}
                title={structure.name}
                subtitle={
                  structure.description ??
                  `Asset ${structure.code}${
                    structure.siteAddress ? ` · ${structure.siteAddress}` : ""
                  }`
                }
                actions={
                  <StatusBadge
                    label={STATUS_LABEL[structure.status]}
                    tone={STATUS_TONE[structure.status]}
                  />
                }
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <section className="rounded-xl border border-slate-200/90 bg-white p-5 lg:col-span-1">
                <h2 className="font-mono text-[0.625rem] font-semibold uppercase tracking-[0.22em] text-slate-400">
                  Asset record
                </h2>
                <dl className="mt-3">
                  <Field label="Asset code" value={structure.code} />
                  <Field label="Type" value={structure.type} />
                  <Field label="Length" value={structure.lengthMetres} unit="m" />
                  <Field label="Spans" value={structure.spanCount} />
                  <Field label="Built" value={structure.constructionYear} />
                  <Field label="Material" value={structure.material} />
                  <Field label="Design standard" value={structure.designStandard} />
                  <Field
                    label="Coordinates"
                    value={
                      structure.latitude != null && structure.longitude != null
                        ? `${structure.latitude}, ${structure.longitude}`
                        : null
                    }
                  />
                  <Field
                    label="Reference"
                    value={structure.publicId}
                  />
                </dl>
              </section>

              <section className="lg:col-span-2">
                <div className="mb-3 flex items-end justify-between gap-3">
                  <div>
                    <h2 className="text-[0.9375rem] font-semibold tracking-tight text-slate-900">
                      Monitoring locations
                    </h2>
                    <p className="mt-0.5 text-[0.8125rem] text-slate-500">
                      Points on this structure where instruments are installed.
                    </p>
                  </div>
                  <Button size="sm" onClick={() => setShowAdd(true)}>
                    <Plus className="h-4 w-4" /> Add location
                  </Button>
                </div>

                <QueryState
                  query={locationsQuery}
                  errorTitle="Couldn't load monitoring locations"
                  skeleton={<SkeletonCard bodyHeight="h-40" />}
                  empty={{
                    icon: MapPin,
                    title: "No monitoring locations yet",
                    description:
                      "Define the points on this structure that will carry instruments — a bearing, a mid-span soffit, a pier cap.",
                    action: (
                      <Button size="sm" onClick={() => setShowAdd(true)}>
                        <Plus className="h-4 w-4" /> Add location
                      </Button>
                    ),
                  }}
                >
                  {(locations) => (
                    <LocationTable structureId={id} locations={locations} />
                  )}
                </QueryState>
              </section>
            </div>

            <AddLocationModal
              structureId={id}
              open={showAdd}
              onClose={() => setShowAdd(false)}
            />
          </>
        )}
      </QueryState>
    </div>
  );
}

function LocationTable({
  structureId,
  locations,
}: {
  structureId: number;
  locations: Location[];
}) {
  const remove = useDeleteLocation(structureId);
  const [pendingId, setPendingId] = useState<number | null>(null);

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200/90 bg-white">
      <table className="w-full min-w-[620px] border-collapse text-sm">
        <caption className="sr-only">Monitoring locations on this structure</caption>
        <thead>
          <tr className="border-b border-slate-200 text-left">
            <th scope="col" className="px-4 py-2.5 font-mono text-[0.75rem] font-medium text-slate-500">
              Point
            </th>
            <th scope="col" className="px-4 py-2.5 font-mono text-[0.75rem] font-medium text-slate-500">
              Description
            </th>
            <th scope="col" className="px-4 py-2.5 text-right font-mono text-[0.75rem] font-medium text-slate-500">
              Station
            </th>
            <th scope="col" className="px-4 py-2.5 text-right font-mono text-[0.75rem] font-medium text-slate-500">
              Elevation
            </th>
            <th scope="col" className="px-4 py-2.5 text-right font-mono text-[0.75rem] font-medium text-slate-500">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {locations.map((loc) => (
            <tr
              key={loc.id}
              className="border-b border-slate-100 last:border-0 transition-colors hover:bg-slate-50/70"
            >
              <td className="px-4 py-3">
                <span className="font-mono text-[0.75rem] font-semibold text-slate-800">
                  {loc.code}
                </span>
                <span className="mt-0.5 block text-[0.8125rem] text-slate-600">
                  {loc.name}
                </span>
              </td>
              <td className="px-4 py-3 text-[0.8125rem] text-slate-500">
                {loc.description ?? "—"}
              </td>
              <td className="px-4 py-3 text-right font-mono text-[0.75rem] tabular-nums text-slate-600">
                {loc.stationMetres == null ? "—" : `${loc.stationMetres} m`}
              </td>
              <td className="px-4 py-3 text-right font-mono text-[0.75rem] tabular-nums text-slate-600">
                {loc.elevationMetres == null ? "—" : `${loc.elevationMetres} m`}
              </td>
              <td className="px-4 py-3 text-right">
                {pendingId === loc.id ? (
                  // Destructive actions confirm inline rather than acting on
                  // the first click (§64).
                  <span className="inline-flex items-center gap-2">
                    <span className="text-[0.75rem] text-slate-500">Remove?</span>
                    <Button
                      size="sm"
                      variant="destructive"
                      loading={remove.isPending && remove.variables === loc.id}
                      disabled={remove.isPending}
                      onClick={async () => {
                        await remove.mutateAsync(loc.id);
                        setPendingId(null);
                      }}
                    >
                      Confirm
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setPendingId(null)}
                    >
                      Cancel
                    </Button>
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Remove location ${loc.code}`}
                    onClick={() => setPendingId(loc.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AddLocationModal({
  structureId,
  open,
  onClose,
}: {
  structureId: number;
  open: boolean;
  onClose: () => void;
}) {
  const create = useCreateLocation(structureId);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    setFormError(null);

    const form = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = {
      name: String(form.get("name") ?? "").trim(),
      code: String(form.get("code") ?? "").trim(),
    };
    for (const key of ["description", "stationMetres", "elevationMetres"]) {
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
            ?.message ?? "Could not add the location. Please try again.",
        );
      }
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add monitoring location"
      subtitle="A named point on this structure where instruments will be installed."
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

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            name="name"
            label="Location name"
            placeholder="Pier P-17 / North Bearing"
            required
            error={errors.name}
          />
          <Input
            name="code"
            label="Point reference"
            placeholder="P17-NB"
            required
            error={errors.code}
          />
        </div>

        <Input
          name="description"
          label="Description (optional)"
          placeholder="Bearing shelf, upstream face"
          error={errors.description}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            name="stationMetres"
            label="Station / chainage (m)"
            type="number"
            step="0.001"
            error={errors.stationMetres}
          />
          <Input
            name="elevationMetres"
            label="Elevation (m)"
            type="number"
            step="0.001"
            error={errors.elevationMetres}
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={create.isPending}>
            {create.isPending ? "Adding…" : "Add location"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
