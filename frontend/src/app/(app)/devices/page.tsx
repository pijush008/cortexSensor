"use client";

import Link from "next/link";

import { useState } from "react";
import { useParamFilter } from "@/hooks/use-param-filter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Boxes, Cpu, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Reveal } from "@/components/ui/reveal";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { QueryState } from "@/components/ui/query-state";
import { SkeletonTable } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/page-header";
import { useDevices, useDeviceTypes } from "@/hooks/use-data";
import { api, type ApiResponse } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { formatDate } from "@/lib/utils";
import type { Device, DeviceType } from "@/types";

const EMPTY_FORM = {
  deviceName: "",
  channelCount: "1",
  deviceType: "",
  gatewayDeviceId: "",
  deviceStartDate: "",
};

const STATUS_TONE: Record<string, StatusTone> = {
  active: "green",
  inactive: "slate",
};

/** Filter values shared by the Select, the stat tiles and ?status. */
const DEVICE_STATUSES = ["all", "active", "inactive"] as const;

type DeviceStatusFilter = (typeof DEVICE_STATUSES)[number];

export default function DevicesPage() {
  const { userType } = useAuthStore();
  const isSuperAdmin = userType === "superadmin";
  const router = useRouter();
  const queryClient = useQueryClient();
  // The query object is kept whole (not destructured to `data`) so <QueryState />
  // can tell a failed fetch apart from a genuinely empty fleet — defaulting
  // `data` to [] would render "no devices" for both.
  const devicesQuery = useDevices();
  const devices = devicesQuery.data ?? [];
  const { data: deviceTypes = [] } = useDeviceTypes();

  const [search, setSearch] = useState("");
  // Seeded from ?status so a link into this page can arrive pre-filtered.
  const [statusFilter, setStatusFilter] = useParamFilter(
    "status",
    DEVICE_STATUSES,
    "all",
  );
  const [showModal, setShowModal] = useState(false);
  // "Device types" counts reference data, not devices, so there is no list to
  // filter — the detail behind that number is the set of types itself.
  const [showTypes, setShowTypes] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState<Device | null>(null);
  const [error, setError] = useState<string | null>(null);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["devices"] });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        deviceType: form.deviceType || "0",
      };
      if (editing) {
        const { data } = await api.patch<ApiResponse>(
          `/device/${editing.id}`,
          payload,
        );
        return data;
      }
      const { data } = await api.post<ApiResponse>("/device", payload);
      return data;
    },
    onSuccess: () => {
      invalidate();
      setShowModal(false);
      setForm(EMPTY_FORM);
      setEditing(null);
    },
    onError: (err) =>
      setError((err as Error).message || "Failed to save device"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.delete<ApiResponse>(`/device/${id}`);
      return data;
    },
    onSuccess: () => invalidate(),
  });

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (d: Device) => {
    setEditing(d);
    setForm({
      deviceName: d.deviceName,
      channelCount: String(d.channelCount),
      deviceType: String(d.deviceType),
      gatewayDeviceId: d.gatewayDeviceId || "",
      deviceStartDate: d.deviceStartDate || "",
    });
    setShowModal(true);
  };

  const filtered = devices.filter((d) => {
    const matchesSearch =
      !search ||
      d.deviceName.toLowerCase().includes(search.toLowerCase()) ||
      (d.deviceId || "").toLowerCase().includes(search.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || d.deviceStatus === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Devices"
        subtitle="Monitor and manage monitoring devices across projects."
        actions={
          isSuperAdmin && (
            <Button onClick={openAdd}>
              <Plus className="h-4 w-4" /> Add Device
            </Button>
          )
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Registered devices"
          value={devices.length}
          icon={Boxes}
          accent="navy"
          delta="fleet-wide"
          onClick={() => setStatusFilter("all")}
        />
        <StatCard
          title="Active"
          value={devices.filter((d) => d.deviceStatus === "active").length}
          icon={Cpu}
          accent="green"
          delta="reporting telemetry"
          onClick={() => setStatusFilter("active")}
        />
        <StatCard
          title="Inactive"
          value={devices.filter((d) => d.deviceStatus !== "active").length}
          icon={Cpu}
          accent="yellow"
          delta="not reporting"
          onClick={() => setStatusFilter("inactive")}
        />
        <StatCard
          title="Device types"
          value={deviceTypes.length}
          icon={Boxes}
          accent="blue"
          delta="available types"
          onClick={() => setShowTypes(true)}
        />
      </div>

      <Reveal>
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Device List</CardTitle>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                placeholder="Search by name or ID"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="sm:w-64"
              />
              <Select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as DeviceStatusFilter)
                }
                options={[
                  { value: "all", label: "All statuses" },
                  { value: "active", label: "Active" },
                  { value: "inactive", label: "Inactive" },
                ]}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <QueryState
            query={devicesQuery}
            bareError
            errorTitle="Couldn't load devices"
            skeleton={<SkeletonTable rows={6} columns={7} className="border-0" />}
            empty={{
              icon: Boxes,
              title: "No devices registered",
              description:
                "Devices added for monitoring will appear here with their gateway, channel count and status.",
              action: isSuperAdmin ? (
                <Button size="sm" onClick={openAdd}>
                  <Plus className="h-4 w-4" strokeWidth={2} />
                  Add device
                </Button>
              ) : undefined,
            }}
          >
            {() =>
              // Distinct from the empty state above: the fleet is not empty,
              // the current search/status filter just excludes everything.
              filtered.length === 0 ? (
                <EmptyState
                  icon={SearchX}
                  title="No devices match your filters"
                  description={`${devices.length} device${devices.length === 1 ? "" : "s"} registered, none matching the current search or status.`}
                  action={
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSearch("");
                        setStatusFilter("all");
                      }}
                    >
                      Clear filters
                    </Button>
                  }
                />
              ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[0.75rem] font-medium text-slate-500">
                    <th className="pb-3 pr-4 font-medium">Device Name</th>
                    <th className="pb-3 pr-4 font-medium">Type</th>
                    <th className="pb-3 pr-4 font-medium">Device ID</th>
                    <th className="pb-3 pr-4 font-medium">Gateway ID</th>
                    <th className="pb-3 pr-4 font-medium">Ch Count</th>
                    <th className="pb-3 pr-4 font-medium">Status</th>
                    <th className="pb-3 pr-4 font-medium">Start Date</th>
                    <th className="pb-3 pr-4 font-medium">Assigned Admin</th>
                    {isSuperAdmin && <th className="pb-3 font-medium">Actions</th>}
                    <th className="pb-3 font-medium">Channels</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((d) => {
                    const typeName =
                      deviceTypes.find(
                        (t: DeviceType) => t.deviceTypeId === d.deviceType,
                      )?.deviceType ?? "—";
                    return (
                      <tr
                        key={d.id}
                        onClick={() => router.push(`/devices/${d.id}`)}
                        className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50"
                      >
                        <td className="py-3 pr-4 font-medium text-slate-800">
                          <Link
                            href={`/devices/${d.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="underline-offset-2 hover:underline"
                          >
                            {d.deviceName}
                          </Link>
                        </td>
                        <td className="py-3 pr-4 text-slate-600">{typeName}</td>
                        <td className="py-3 pr-4 font-mono text-slate-600">
                          {d.deviceId || "—"}
                        </td>
                        <td className="py-3 pr-4 font-mono text-slate-600">
                          {d.gatewayDeviceId}
                        </td>
                        <td className="py-3 pr-4 text-slate-600">
                          {d.channelCount}
                        </td>
                        <td className="py-3 pr-4">
                          <StatusBadge
                            label={d.deviceStatus}
                            tone={STATUS_TONE[d.deviceStatus] ?? "yellow"}
                          />
                        </td>
                        <td className="py-3 pr-4 text-slate-600">
                          {d.deviceStartDate ? formatDate(d.deviceStartDate) : "—"}
                        </td>
                        <td className="py-3 pr-4 text-slate-600">
                          {d.assignedAdmin ? `#${d.assignedAdmin}` : "—"}
                        </td>
                        {isSuperAdmin && (
                          <td className="py-3" onClick={(e) => e.stopPropagation()}>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEdit(d)}
                                aria-label="Edit device"
                              >
                                <Pencil className="h-4 w-4 text-slate-500" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => deleteMutation.mutate(d.id)}
                                aria-label="Delete device"
                              >
                                <Trash2 className="h-4 w-4 text-shm-red" />
                              </Button>
                            </div>
                          </td>
                        )}
                        <td className="py-3" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              router.push(`/devices/${d.id}/channels`)
                            }
                            aria-label="View channels"
                          >
                            <Cpu className="h-4 w-4 text-shm-navy-600" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
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
        open={showTypes}
        onClose={() => setShowTypes(false)}
        title="Device types"
        subtitle={`${deviceTypes.length} type${deviceTypes.length === 1 ? "" : "s"} available`}
      >
        {deviceTypes.length === 0 ? (
          <p className="text-sm text-slate-500">No device types are configured.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left font-mono text-[0.75rem] font-medium text-slate-500">
                <th className="pb-2">Type</th>
                <th className="pb-2">ID</th>
                <th className="pb-2 text-right">Devices</th>
              </tr>
            </thead>
            <tbody>
              {deviceTypes.map((t: DeviceType) => (
                <tr key={t.deviceTypeId} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 font-medium text-slate-800">{t.deviceType}</td>
                  <td className="py-2 font-mono text-xs text-slate-500">{t.deviceTypeId}</td>
                  <td className="py-2 text-right tabular-nums text-slate-600">
                    {devices.filter((d) => d.deviceType === t.deviceTypeId).length}
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
        title={editing ? "Edit Device" : "Add Device"}
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
            label="Device Name"
            value={form.deviceName}
            onChange={(e) => setForm({ ...form, deviceName: e.target.value })}
            required
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Channel Count"
              type="number"
              min={1}
              value={form.channelCount}
              onChange={(e) =>
                setForm({ ...form, channelCount: e.target.value })
              }
              required
            />
            <Select
              label="Device Type"
              value={form.deviceType}
              onChange={(e) => setForm({ ...form, deviceType: e.target.value })}
              options={[
                { value: "", label: "Select type" },
                ...deviceTypes.map((t: DeviceType) => ({
                  value: String(t.deviceTypeId),
                  label: t.deviceType,
                })),
              ]}
            />
          </div>
          <Input
            label="Gateway Device ID"
            value={form.gatewayDeviceId}
            onChange={(e) =>
              setForm({ ...form, gatewayDeviceId: e.target.value })
            }
            placeholder="e.g. gateway-001"
          />
          <Input
            label="Start Date"
            type="date"
            value={form.deviceStartDate}
            onChange={(e) =>
              setForm({ ...form, deviceStartDate: e.target.value })
            }
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowModal(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending
                ? "Saving…"
                : editing
                  ? "Update Device"
                  : "Add Device"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}