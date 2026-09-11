"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useParamFilter } from "@/hooks/use-param-filter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Gauge, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Reveal } from "@/components/ui/reveal";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { QueryState } from "@/components/ui/query-state";
import { SkeletonTable } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/page-header";
import { useSensors, useSensorTypes } from "@/hooks/use-data";
import { api, type ApiResponse } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import type { Sensor, SensorType } from "@/types";

const EMPTY_FORM = {
  sensorName: "",
  sensorTypeID: "",
  calibrationValue: "",
  unit: "",
};

/** Calibration states the sensor list can be narrowed to. */
const SENSOR_FILTERS = ["all", "calibrated", "uncalibrated"] as const;

type SensorFilter = (typeof SENSOR_FILTERS)[number];

export default function SensorsPage() {
  const router = useRouter();
  const { userType } = useAuthStore();
  const isSuperAdmin = userType === "superadmin";
  const queryClient = useQueryClient();
  // Whole query object so <QueryState /> can distinguish a failed fetch from
  // an empty sensor list rather than showing "no sensors" for both.
  const sensorsQuery = useSensors();
  const sensors = sensorsQuery.data ?? [];
  const { data: sensorTypes = [] } = useSensorTypes();

  const [search, setSearch] = useState("");
  // The list had search only, so the Calibrated tile had nothing to drill into.
  const [calibration, setCalibration] = useParamFilter(
    "calibration",
    SENSOR_FILTERS,
    "all",
  );
  // Two tiles count reference/roll-up data rather than sensors, so their detail
  // is a listing of their own rather than a filtered sensor list.
  const [showTypeList, setShowTypeList] = useState(false);
  const [showAdmins, setShowAdmins] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState<Sensor | null>(null);
  const [typeForm, setTypeForm] = useState({
    sensorType: "",
    sensorIcon: "",
    unit: "",
  });
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["sensors"] });
    queryClient.invalidateQueries({ queryKey: ["sensorTypes"] });
  };

  const unitFor = (sensorTypeID: number): string =>
    sensorTypes.find((t: SensorType) => t.id === sensorTypeID)?.unit ?? "—";

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editing) {
        const { data } = await api.patch<ApiResponse>(
          `/sensor/${editing.sensorId}`,
          form,
        );
        return data;
      }
      const { data } = await api.post<ApiResponse>("/sensor", form);
      return data;
    },
    onSuccess: () => {
      invalidate();
      setShowModal(false);
      setForm(EMPTY_FORM);
      setEditing(null);
    },
    onError: (err) =>
      setError((err as Error).message || "Failed to save sensor"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.delete<ApiResponse>(`/sensor/${id}`);
      return data;
    },
    onSuccess: () => invalidate(),
  });

  const saveTypeMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<ApiResponse>("/sensorType", typeForm);
      return data;
    },
    onSuccess: () => {
      invalidate();
      setShowTypeModal(false);
      setTypeForm({ sensorType: "", sensorIcon: "", unit: "" });
    },
    onError: (err) =>
      setError((err as Error).message || "Failed to save sensor type"),
  });

  const filtered = sensors.filter((s) => {
    const matchesSearch =
      !search || s.sensorName.toLowerCase().includes(search.toLowerCase());
    const matchesCalibration =
      calibration === "all" ||
      (calibration === "calibrated"
        ? s.calibrationValue != null
        : s.calibrationValue == null);
    return matchesSearch && matchesCalibration;
  });

  /** Distinct admins holding at least one sensor, with how many each holds. */
  const adminLoad = Object.values(
    sensors.reduce<Record<number, { id: number; name: string; count: number }>>(
      (acc, s) => {
        if (s.adminId == null) return acc;
        acc[s.adminId] ??= {
          id: s.adminId,
          name: s.firstName ?? `User #${s.adminId}`,
          count: 0,
        };
        acc[s.adminId].count += 1;
        return acc;
      },
      {},
    ),
  ).sort((a, b) => b.count - a.count);

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (s: Sensor) => {
    setEditing(s);
    setForm({
      sensorName: s.sensorName,
      sensorTypeID: String(s.sensorTypeID),
      calibrationValue: s.calibrationValue ?? "",
      unit: unitFor(s.sensorTypeID) === "—" ? "" : unitFor(s.sensorTypeID),
    });
    setShowModal(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sensors"
        subtitle="Configure sensor types and individual sensors."
        actions={
          isSuperAdmin && (
            <>
              <Button
                variant="secondary"
                onClick={() => setShowTypeModal(true)}
              >
                <Plus className="h-4 w-4" /> Sensor Type
              </Button>
              <Button onClick={openAdd}>
                <Plus className="h-4 w-4" /> Add Sensor
              </Button>
            </>
          )
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total sensors"
          value={sensors.length}
          icon={Gauge}
          accent="navy"
          delta="registered fleet"
          onClick={() => {
            setCalibration("all");
            setSearch("");
          }}
        />
        <StatCard
          title="Sensor types"
          value={sensorTypes.length}
          icon={Gauge}
          accent="blue"
          delta="available types"
          onClick={() => setShowTypeList(true)}
        />
        <StatCard
          title="Calibrated"
          value={sensors.filter((s) => s.calibrationValue != null).length}
          icon={Gauge}
          accent="green"
          delta="with calibration"
          onClick={() => setCalibration("calibrated")}
        />
        <StatCard
          title="Admins assigned"
          value={new Set(sensors.filter((s) => s.adminId).map((s) => s.adminId)).size}
          icon={Gauge}
          accent="yellow"
          delta="managing sensors"
          onClick={() => setShowAdmins(true)}
        />
      </div>

      <Reveal>
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Sensor List</CardTitle>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Input
                  placeholder="Search sensors…"
                  value={search}
                onChange={(e) => setSearch(e.target.value)}
                  className="sm:w-64"
                />
                <Select
                  value={calibration}
                  onChange={(e) =>
                    setCalibration(e.target.value as SensorFilter)
                  }
                  options={[
                    { value: "all", label: "All sensors" },
                    { value: "calibrated", label: "Calibrated" },
                    { value: "uncalibrated", label: "Not calibrated" },
                  ]}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <QueryState
              query={sensorsQuery}
              bareError
              errorTitle="Couldn't load sensors"
              skeleton={<SkeletonTable rows={6} columns={6} className="border-0" />}
              empty={{
                icon: Gauge,
                title: "No sensors registered",
                description:
                  "Sensors attached to monitored devices will appear here with their type, calibration and unit.",
                action: isSuperAdmin ? (
                  <Button size="sm" onClick={openAdd}>
                    <Plus className="h-4 w-4" strokeWidth={2} />
                    Add sensor
                  </Button>
                ) : undefined,
              }}
            >
              {() =>
                filtered.length === 0 ? (
                  <EmptyState
                    icon={SearchX}
                    title="No sensors match your search"
                    description={`${sensors.length} sensor${sensors.length === 1 ? "" : "s"} registered, none matching the current search.`}
                    action={
                      <Button size="sm" variant="outline" onClick={() => setSearch("")}>
                        Clear search
                      </Button>
                    }
                  />
                ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-[0.75rem] font-medium text-slate-500">
                      <th className="pb-3 pr-4 font-medium">Sensor Name</th>
                      <th className="pb-3 pr-4 font-medium">Type</th>
                      <th className="pb-3 pr-4 font-medium">Calibration</th>
                      <th className="pb-3 pr-4 font-medium">Unit</th>
                      <th className="pb-3 pr-4 font-medium">Assigned Admin</th>
                      {isSuperAdmin && <th className="pb-3 font-medium">Actions</th>}
                    </tr>
                  </thead>
                <tbody>
                  {filtered.map((s) => (
                    <tr
                      key={s.sensorId}
                      onClick={() => router.push(`/sensors/${s.sensorId}`)}
                      className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50"
                    >
                      <td className="py-3 pr-4 font-medium text-slate-800">
                        <Link
                          href={`/sensors/${s.sensorId}`}
                          onClick={(e) => e.stopPropagation()}
                          className="underline-offset-2 hover:underline"
                        >
                          {s.sensorName}
                        </Link>
                      </td>
                      <td className="py-3 pr-4 text-slate-600">{s.sensorType}</td>
                      <td className="py-3 pr-4 font-mono text-slate-600">
                        {s.calibrationValue ?? "—"}
                      </td>
                      <td className="py-3 pr-4 text-slate-600">
                        {unitFor(s.sensorTypeID)}
                      </td>
                      <td className="py-3 pr-4 text-slate-600">
                        {s.firstName ? `${s.firstName} (${s.adminId})` : "—"}
                      </td>
                      {isSuperAdmin && (
                        <td className="py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEdit(s)}
                              aria-label="Edit sensor"
                            >
                              <Pencil className="h-4 w-4 text-slate-500" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteMutation.mutate(s.sensorId)}
                              aria-label="Delete sensor"
                            >
                              <Trash2 className="h-4 w-4 text-shm-red" />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
                )
              }
            </QueryState>
        </CardContent>
      </Card>
      </Reveal>

      <Modal
        open={showTypeList}
        onClose={() => setShowTypeList(false)}
        title="Sensor types"
        subtitle={`${sensorTypes.length} type${sensorTypes.length === 1 ? "" : "s"} available`}
      >
        {sensorTypes.length === 0 ? (
          <p className="text-sm text-slate-500">No sensor types are configured.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left font-mono text-[0.75rem] font-medium text-slate-500">
                <th className="pb-2">Type</th>
                <th className="pb-2">Unit</th>
                <th className="pb-2">Calibration</th>
                <th className="pb-2 text-right">Sensors</th>
              </tr>
            </thead>
            <tbody>
              {sensorTypes.map((t: SensorType) => (
                <tr key={t.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 font-medium text-slate-800">{t.sensorType}</td>
                  <td className="py-2 text-slate-600">{t.unit ?? "—"}</td>
                  <td className="py-2 font-mono text-xs text-slate-500">
                    {t.calibrationValue || "—"}
                  </td>
                  <td className="py-2 text-right tabular-nums text-slate-600">
                    {sensors.filter((x) => x.sensorTypeID === t.id).length}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Modal>

      <Modal
        open={showAdmins}
        onClose={() => setShowAdmins(false)}
        title="Admins assigned"
        subtitle={`${adminLoad.length} admin${adminLoad.length === 1 ? "" : "s"} managing sensors`}
      >
        {adminLoad.length === 0 ? (
          <p className="text-sm text-slate-500">
            No sensors are assigned to an admin yet.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left font-mono text-[0.75rem] font-medium text-slate-500">
                <th className="pb-2">Admin</th>
                <th className="pb-2 text-right">Sensors</th>
              </tr>
            </thead>
            <tbody>
              {adminLoad.map((a) => (
                <tr key={a.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2">
                    <Link
                      href={`/users/${a.id}`}
                      className="font-medium text-shm-navy-700 underline-offset-2 hover:underline"
                      onClick={() => setShowAdmins(false)}
                    >
                      {a.name}
                    </Link>
                  </td>
                  <td className="py-2 text-right tabular-nums text-slate-600">
                    {a.count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Modal>

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? "Edit Sensor" : "Add Sensor"}
      >
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
            {error}
          </div>
        )}
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            saveMutation.mutate();
          }}
        >
          <Input
            label="Sensor Name"
            value={form.sensorName}
            onChange={(e) => setForm({ ...form, sensorName: e.target.value })}
            required
          />
          <Select
            label="Sensor Type"
            value={form.sensorTypeID}
            onChange={(e) => setForm({ ...form, sensorTypeID: e.target.value })}
            options={[
              { value: "", label: "Select type" },
              ...sensorTypes.map((t: SensorType) => ({
                value: String(t.id),
                label: t.sensorType,
              })),
            ]}
            required
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Calibration Value"
              value={form.calibrationValue}
              onChange={(e) =>
                setForm({ ...form, calibrationValue: e.target.value })
              }
              required
            />
            <Input
              label="Unit"
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending
                ? "Saving…"
                : editing
                  ? "Update Sensor"
                  : "Add Sensor"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={showTypeModal}
        onClose={() => setShowTypeModal(false)}
        title="Add Sensor Type"
      >
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
            {error}
          </div>
        )}
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            saveTypeMutation.mutate();
          }}
        >
          <Input
            label="Sensor Type Name"
            value={typeForm.sensorType}
            onChange={(e) =>
              setTypeForm({ ...typeForm, sensorType: e.target.value })
            }
            required
          />
          <Input
            label="Sensor Icon"
            value={typeForm.sensorIcon}
            onChange={(e) =>
              setTypeForm({ ...typeForm, sensorIcon: e.target.value })
            }
            placeholder="Icon name or URL"
            required
          />
          <Input
            label="Unit"
            value={typeForm.unit}
            onChange={(e) => setTypeForm({ ...typeForm, unit: e.target.value })}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setShowTypeModal(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saveTypeMutation.isPending}>
              {saveTypeMutation.isPending ? "Saving…" : "Save Type"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}