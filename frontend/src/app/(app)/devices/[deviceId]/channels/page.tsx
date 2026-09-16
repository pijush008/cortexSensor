"use client";

import { use, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Cpu,
  GitCompareArrows,
  RefreshCw,
  Save,
  Trash2,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Reveal } from "@/components/ui/reveal";
import { Select } from "@/components/ui/select";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { useChannels, useDevices, useSensors } from "@/hooks/use-data";
import { api, type ApiResponse } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { formatDateTime } from "@/lib/utils";
import type { ChannelListItem, ChannelSensorUpdate, Sensor } from "@/types";

interface ChannelDraft extends ChannelListItem {
  sensorId: string;
  isEnable: boolean;
}

const STATUS_TONE: Record<string, string> = {
  one: "bg-green-100 text-green-700",
  zero: "bg-slate-100 text-slate-500",
};

export default function ChannelViewPage({
  params,
}: {
  params: Promise<{ deviceId: string }>;
}) {
  const { deviceId } = use(params);
  const router = useRouter();
  const { userId } = useAuthStore();
  const queryClient = useQueryClient();

  const { data: devices = [] } = useDevices();
  const { data: channelsData, isLoading } = useChannels(deviceId);
  const rawChannels = channelsData?.channels ?? [];
  const { data: sensors = [] } = useSensors();

  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<ChannelDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [swapA, setSwapA] = useState<number | null>(null);
  const [swapB, setSwapB] = useState<number | null>(null);

  const device = devices.find((d) => String(d.id) === String(deviceId));

  const availableSensors = useMemo(
    () => sensors.filter((s: Sensor) => s.sensorId != null),
    [sensors],
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["channels", deviceId] });
    queryClient.invalidateQueries({ queryKey: ["devices"] });
  };

  const upsertChannel = (draft: ChannelDraft) =>
    setDrafts((prev) => {
      const idx = prev.findIndex((c) => c.channelId === draft.channelId);
      if (idx === -1) return [...prev, draft];
      const next = [...prev];
      next[idx] = draft;
      return next;
    });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const sensorIds: ChannelSensorUpdate[] = drafts.map((d) => ({
        sensorId: Number(d.sensorId),
        channel: d.channelId,
        isEnable: d.isEnable ? "1" : "0",
        triggerValue: d.triggerValue || null,
        thresholdValue: d.thresholdValue || null,
      }));
      const { data } = await api.post<ApiResponse>("/device/assignSensor", {
        deviceId: Number(deviceId),
        userId: userId ?? 0,
        sensorIds,
      });
      return data;
    },
    onSuccess: () => {
      setEditing(false);
      setDrafts([]);
      setError(null);
      invalidate();
    },
    onError: (err) =>
      setError((err as Error).message || "Failed to save channel mapping"),
  });

  const swapMutation = useMutation({
    mutationFn: async () => {
      if (swapA == null || swapB == null) throw new Error("Select two channels");
      const { data } = await api.put<ApiResponse>("/channelSwap", undefined, {
        params: { channelsId: JSON.stringify([swapA, swapB]) },
      });
      return data;
    },
    onSuccess: () => {
      setSwapA(null);
      setSwapB(null);
      invalidate();
    },
    onError: (err) =>
      setError((err as Error).message || "Failed to swap channels"),
  });

  const removeSensorMutation = useMutation({
    mutationFn: async (channelId: number) => {
      const { data } = await api.delete<ApiResponse>(
        `/removeSensorFromChannel/${channelId}`,
      );
      return data;
    },
    onSuccess: () => {
      setDrafts([]);
      setEditing(false);
      invalidate();
    },
    onError: (err) =>
      setError((err as Error).message || "Failed to remove sensor"),
  });

  const startEditing = () => {
    setDrafts(
      rawChannels.map((c: ChannelListItem) => ({
        ...c,
        sensorId: c.assignSensor || "",
        isEnable: c.activeStatus === "one",
      })),
    );
    setEditing(true);
    setError(null);
  };

  const cancelEditing = () => {
    setDrafts([]);
    setEditing(false);
    setError(null);
  };

  const lastUpdate = formatDateTime(channelsData?.lastUpdateAt ?? "");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Channel View"
        subtitle={
          device
            ? // The legacy screen carried a "Last update ... by ..." line, which
              // is what tells a reader whether the mapping they are looking at
              // is current. Shown only when the device actually records one —
              // inventing "never" for a device that has simply not been edited
              // would be noise rather than information.
              `${device.deviceName} — sensor-to-channel mapping${
                device.updatedAt
                  ? ` · Last update ${new Date(device.updatedAt).toLocaleString()}`
                  : ""
              }`
            : "Device channel configuration"
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            {!editing && (
              <Button onClick={startEditing}>
                <Wrench className="h-4 w-4" /> Edit Channels
              </Button>
            )}
            {editing && (
              <>
                <Button variant="secondary" onClick={cancelEditing}>
                  Cancel
                </Button>
                <Button
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending || drafts.length === 0}
                >
                  <Save className="h-4 w-4" />
                  {saveMutation.isPending ? "Saving…" : "Save Mapping"}
                </Button>
              </>
            )}
          </div>
        }
      />

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss error">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}

      {isLoading ? (
        <LoadingState />
      ) : rawChannels.length === 0 ? (
        <EmptyState
          icon={Cpu}
          title="No channels found"
          description="This device has no channels yet. Recreate the device with a channel count to begin mapping."
        />
      ) : (
        <>
          <Reveal>
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Cpu className="h-5 w-5 text-shm-navy-700" strokeWidth={1.75} />
                      Channels &amp; Assigned Sensors
                    </CardTitle>
                  </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-400">
                    {channelsData?.lastUpdateAt
                      ? `Last update ${lastUpdate}${channelsData.lastUpdateBy ? ` by ${channelsData.lastUpdateBy}` : ""}`
                      : `${rawChannels.length} channel${rawChannels.length === 1 ? "" : "s"}`}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => invalidate()}
                    aria-label="Refresh channels"
                  >
                    <RefreshCw className="h-4 w-4" /> Refresh
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-[0.75rem] font-medium text-slate-500">
                      <th className="pb-3 pr-4 font-medium">Channel</th>
                      <th className="pb-3 pr-4 font-medium">Assigned Sensor</th>
                      <th className="pb-3 pr-4 font-medium">Icon</th>
                      <th className="pb-3 pr-4 font-medium">Type</th>
                      <th className="pb-3 pr-4 font-medium">Calibration / Unit</th>
                      <th className="pb-3 pr-4 font-medium">Trigger</th>
                      <th className="pb-3 pr-4 font-medium">Threshold</th>
                      <th className="pb-3 pr-4 font-medium">Status</th>
                      <th className="pb-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(editing ? drafts : rawChannels).map((row) => {
                      const channelItem = row as ChannelListItem;
                      const draft = editing ? (row as ChannelDraft) : null;
                      return (
                        <tr
                          key={channelItem.channelId}
                          className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                        >
                          <td className="py-3 pr-4 font-medium text-slate-800">
                            <label className="flex items-center gap-2.5">
                              {/* The selection itself, next to what it selects.
                                  It used to be a wrench button at the far right
                                  of the row, visible only while editing, which
                                  gave no hint that it decided whether the
                                  channel records anything at all. */}
                              <input
                                type="checkbox"
                                checked={
                                  editing && draft
                                    ? draft.isEnable
                                    : channelItem.activeStatus === "one"
                                }
                                disabled={!editing || !draft}
                                onChange={() =>
                                  draft &&
                                  upsertChannel({ ...draft, isEnable: !draft.isEnable })
                                }
                                className="h-4 w-4 rounded border-slate-300 accent-shm-navy-700 disabled:opacity-60"
                                aria-label={`Channel ${channelItem.channelNumber} selected`}
                              />
                              {/* "Channel 3", not the sensor's name. The column
                                  identifies the SOCKET on the device, which is
                                  what stays constant when a sensor is swapped. */}
                              {`Channel ${channelItem.channelNumber}`}
                            </label>
                          </td>
                          {!editing && !channelItem.assignSensor ? (
                            // An unassigned socket says what to DO about it,
                            // rather than showing six columns of em-dashes.
                            <td className="py-3 pr-4 text-slate-400" colSpan={7}>
                              Not in use — choose Edit Channels to assign a
                              sensor to this channel.
                            </td>
                          ) : (
                          <>
                          <td className="py-3 pr-4">
                            {editing && draft ? (
                              <Select
                                value={draft.sensorId}
                                onChange={(e) =>
                                  upsertChannel({ ...draft, sensorId: e.target.value })
                                }
                                options={[
                                  { value: "", label: "No sensor" },
                                  ...availableSensors.map((s: Sensor) => ({
                                    value: String(s.sensorId),
                                    label: s.sensorName,
                                  })),
                                ]}
                              />
                            ) : (
                              <span className="text-slate-700">
                                {channelItem.sensorName || "—"}
                              </span>
                            )}
                          </td>
                          <td className="py-3 pr-4">
                            {/* Avatar falls back to an initial badge, so a type
                                whose icon has not been uploaded still reads as
                                an icon slot rather than as a broken cell. */}
                            <Avatar
                              src={channelItem.sensorIcon}
                              name={channelItem.sensorTypeName}
                              fallback={channelItem.sensorTypeName}
                              size="sm"
                            />
                          </td>
                          <td className="py-3 pr-4 text-slate-600">
                            {channelItem.sensorTypeName || "—"}
                          </td>
                          <td className="py-3 pr-4 text-slate-600">
                            {channelItem.sensorCalibrationValue
                              ? `${channelItem.sensorCalibrationValue} ${channelItem.unit ?? ""}`.trim()
                              : "—"}
                          </td>
                          <td className="py-3 pr-4 text-slate-600">
                            {editing && draft ? (
                              <Input
                                type="number"
                                value={draft.triggerValue ?? ""}
                                onChange={(e) =>
                                  upsertChannel({
                                    ...draft,
                                    triggerValue: e.target.value,
                                  })
                                }
                                placeholder="Trigger"
                                className="w-24"
                              />
                            ) : (
                              channelItem.triggerValue || "—"
                            )}
                          </td>
                          <td className="py-3 pr-4 text-slate-600">
                            {editing && draft ? (
                              <Input
                                type="number"
                                value={draft.thresholdValue ?? ""}
                                onChange={(e) =>
                                  upsertChannel({
                                    ...draft,
                                    thresholdValue: e.target.value,
                                  })
                                }
                                placeholder="Threshold"
                                className="w-24"
                              />
                            ) : (
                              channelItem.thresholdValue || "—"
                            )}
                          </td>
                          <td className="py-3 pr-4">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                editing && draft
                                  ? (draft.isEnable
                                      ? STATUS_TONE.one
                                      : STATUS_TONE.zero)
                                  : STATUS_TONE[channelItem.activeStatus] ??
                                    "bg-slate-100 text-slate-500"
                              }`}
                            >
                              {(editing && draft ? draft.isEnable : channelItem.activeStatus === "one")
                                ? "Active"
                                : "Inactive"}
                            </span>
                          </td>
                          <td className="py-3">
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removeSensorMutation.mutate(channelItem.channelId)}
                                aria-label="Remove sensor from channel"
                              >
                                <Trash2 className="h-4 w-4 text-shm-red" />
                              </Button>
                            </div>
                          </td>
                          </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          </Reveal>

          <Reveal>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GitCompareArrows className="h-5 w-5 text-shm-navy-700" strokeWidth={1.75} />
                  Swap Channel Sensors
                </CardTitle>
              </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-end gap-3">
                <Select
                  label="First channel"
                  value={swapA == null ? "" : String(swapA)}
                  onChange={(e) => setSwapA(e.target.value ? Number(e.target.value) : null)}
                  options={[
                    { value: "", label: "Select channel" },
                    ...rawChannels.map((c: ChannelListItem) => ({
                      value: String(c.channelId),
                      label: `${c.channelNumber} — ${c.sensorName ?? "empty"}`,
                    })),
                  ]}
                />
                <Select
                  label="Second channel"
                  value={swapB == null ? "" : String(swapB)}
                  onChange={(e) => setSwapB(e.target.value ? Number(e.target.value) : null)}
                  options={[
                    { value: "", label: "Select channel" },
                    ...rawChannels.map((c: ChannelListItem) => ({
                      value: String(c.channelId),
                      label: `${c.channelNumber} — ${c.sensorName ?? "empty"}`,
                    })),
                  ]}
                />
                <Button
                  onClick={() => swapMutation.mutate()}
                  disabled={swapA == null || swapB == null || swapA === swapB || swapMutation.isPending}
                >
                  <GitCompareArrows className="h-4 w-4" />
                  {swapMutation.isPending ? "Swapping…" : "Swap Sensors"}
                </Button>
              </div>
            </CardContent>
          </Card>
          </Reveal>
        </>
      )}
    </div>
  );
}