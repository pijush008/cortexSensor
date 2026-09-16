"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Cpu, Save, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { api, type ApiResponse } from "@/lib/api";
import { describeError, type DescribedError } from "@/lib/errors";
import { useRole } from "@/hooks/use-role";

/**
 * The hardware a project monitors with.
 *
 * Kept beside the stakeholders panel rather than inside the detail card for the
 * same reason: this is the part of the screen that writes.
 */

interface DeviceOption {
  id: number;
  deviceName: string;
  deviceId: string | null;
}

interface DevicePanelProps {
  projectId: number;
  /** Project.deviceId — the device's row id, held as a string. */
  currentDeviceId: string | null;
  currentDeviceName: string | null;
  /** Only a Not Started project may have its device changed. */
  status: string;
}

function optionLabel(d: DeviceOption): string {
  return d.deviceId ? `${d.deviceName} · ${d.deviceId}` : d.deviceName;
}

export function DevicePanel({
  projectId,
  currentDeviceId,
  currentDeviceName,
  status,
}: DevicePanelProps) {
  const role = useRole();
  const queryClient = useQueryClient();
  // Resolved from the SERVER. Read from localStorage this was a gate that could
  // fail open: a stale cached role let an unprivileged session through.
  const canManage = role === "superadmin" || role === "admin";


  const notStarted = status === "not_start";
  const editable = canManage && notStarted;

  const [selected, setSelected] = useState(currentDeviceId ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<DescribedError | null>(null);

  // The project query can resolve after this mounts, so the initial value has
  // to follow it rather than being captured once.
  useEffect(() => {
    setSelected(currentDeviceId ?? "");
  }, [currentDeviceId]);

  const optionsQuery = useQuery({
    queryKey: ["project", projectId, "device-options"],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse & { data: DeviceOption[] }>(
        `/project/${projectId}/device-options`,
      );
      return data.data ?? [];
    },
    enabled: editable,
  });

  const saveMutation = useMutation({
    mutationFn: async (deviceId: string | null) => {
      const { data } = await api.put<ApiResponse>(
        `/project/${projectId}/device`,
        { deviceId },
      );
      return data;
    },
    onSuccess: (data) => {
      setError(null);
      setMessage(data.message ?? "Device updated");
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({
        queryKey: ["project", projectId, "device-options"],
      });
    },
    onError: (err) => {
      setMessage(null);
      setError(describeError(err));
    },
  });

  const options = optionsQuery.data ?? [];

  // The attached device is claimed, so the available list never contains it.
  // Without this the Select would have no option matching its own value and
  // would silently display the first entry instead.
  const selectOptions = [
    { value: "", label: "No device" },
    ...(currentDeviceId
      ? [
          {
            value: currentDeviceId,
            label: currentDeviceName
              ? `${currentDeviceName} (current)`
              : "Current device",
          },
        ]
      : []),
    ...options.map((d) => ({ value: String(d.id), label: optionLabel(d) })),
  ];

  // A self-service viewer never sees this panel. Placed after the hooks,
  // not before them, because a conditional early return above a hook changes
  // the hook order between renders. Gated here as well as at the caller so no
  // future caller can render it to them by accident; the API refuses every
  // action it offers anyway.
  if (role === "viewer") return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Device</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Cpu className="h-4 w-4 shrink-0 text-slate-400" />
          <div className="min-w-0 flex-1">
            <p className="text-[0.78125rem] text-slate-500">Monitoring hardware</p>
            <p className="truncate text-sm text-slate-800">
              {currentDeviceName ?? (
                <span className="text-slate-400">No device attached</span>
              )}
            </p>
          </div>
        </div>

        {editable ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Select
              label="Attached device"
              className="sm:max-w-sm"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              options={selectOptions}
            />
            <div className="flex gap-2">
              <Button
                disabled={
                  saveMutation.isPending || selected === (currentDeviceId ?? "")
                }
                onClick={() => saveMutation.mutate(selected || null)}
              >
                <Save className="h-4 w-4" />
                {saveMutation.isPending ? "Saving…" : "Save"}
              </Button>
              {currentDeviceId && (
                <Button
                  variant="secondary"
                  disabled={saveMutation.isPending}
                  onClick={() => {
                    setSelected("");
                    saveMutation.mutate(null);
                  }}
                >
                  <Unplug className="h-4 w-4" />
                  Remove
                </Button>
              )}
            </div>
          </div>
        ) : (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[0.8125rem] text-slate-600">
            {!canManage
              ? "Only an administrator can change this project's device."
              : "A project's device can only be changed before the project starts."}
          </p>
        )}

        {editable && options.length === 0 && !optionsQuery.isLoading && (
          <p className="text-[0.78125rem] text-slate-500">
            No other device is available. Only devices in this organization that
            are free and have sensors assigned can be attached.
          </p>
        )}

        {message && (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[0.8125rem] text-slate-700">
            {message}
          </p>
        )}
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-shm-red/20 bg-shm-red/5 px-3 py-2 text-[0.8125rem] text-shm-red"
          >
            <p className="font-medium">{error.title}</p>
            <p className="mt-0.5 text-shm-red/85">{error.description}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
