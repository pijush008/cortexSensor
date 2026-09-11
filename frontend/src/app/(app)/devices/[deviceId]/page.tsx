"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Boxes } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FieldGrid } from "@/components/ui/field-grid";
import { QueryState } from "@/components/ui/query-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { useDevices, useDeviceTypes, useSensors } from "@/hooks/use-data";
import { formatDateTime } from "@/lib/format-detail";
import type { DeviceType, Sensor } from "@/types";

/**
 * One device, reached from the devices table.
 *
 * Keyed on the numeric row id, which is what the sibling /channels route
 * already uses — so /devices/7 and /devices/7/channels name the same device.
 */
export default function DeviceDetailPage() {
  const params = useParams<{ deviceId: string }>();
  const router = useRouter();
  const devicesQuery = useDevices();
  const { data: deviceTypes = [] } = useDeviceTypes();
  const { data: sensors = [] } = useSensors();

  const id = Number(params?.deviceId);

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" onClick={() => router.push("/devices")}>
        <ArrowLeft className="mr-1.5 h-4 w-4" />
        Back to devices
      </Button>

      <QueryState
        query={devicesQuery}
        errorTitle="Couldn't load this device"
        skeleton={<Card className="h-64 animate-pulse bg-slate-100" />}
      >
        {(devices) => {
          const d = devices.find((x) => x.id === id);
          if (!d) {
            return (
              <EmptyState
                icon={Boxes}
                title="Device not found"
                description="It may have been removed, or the link may be out of date."
              />
            );
          }

          const typeName =
            deviceTypes.find((t: DeviceType) => t.deviceTypeId === d.deviceType)
              ?.deviceType ?? null;
          const attached = sensors.filter((s: Sensor) => s.deviceId === d.deviceId);

          return (
            <>
              <Card className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h1 className="text-xl font-semibold text-slate-900">
                      {d.deviceName}
                    </h1>
                    <p className="mt-0.5 font-mono text-[0.8125rem] text-slate-500">
                      {d.deviceId ?? `#${d.id}`}
                    </p>
                  </div>
                  <StatusBadge
                    label={d.deviceStatus}
                    tone={d.deviceStatus === "active" ? "green" : "yellow"}
                  />
                </div>

                <FieldGrid
                  className="mt-5 border-t border-slate-100 pt-5"
                  fields={[
                    { label: "Device type", value: typeName },
                    { label: "Gateway device ID", value: d.gatewayDeviceId, mono: true },
                    { label: "Channels", value: d.channelCount },
                    { label: "Assigned admin", value: d.assignedAdmin },
                    { label: "Start date", value: formatDateTime(d.deviceStartDate) },
                    { label: "Registered", value: formatDateTime(d.createdAt) },
                  ]}
                />

                <div className="mt-5 border-t border-slate-100 pt-4">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => router.push(`/devices/${d.id}/channels`)}
                  >
                    View channels
                  </Button>
                </div>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Sensors on this device</CardTitle>
                </CardHeader>
                <CardContent>
                  {attached.length === 0 ? (
                    <p className="text-sm text-slate-600">
                      No sensors are attached to this device.
                    </p>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {attached.map((s: Sensor) => (
                        <li key={s.sensorId} className="py-2.5">
                          <Link
                            href={`/sensors/${s.sensorId}`}
                            className="text-sm font-medium text-shm-navy-700 underline-offset-2 hover:underline"
                          >
                            {s.sensorName}
                          </Link>
                          <span className="ml-2 text-[0.8125rem] text-slate-500">
                            {s.sensorType}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </>
          );
        }}
      </QueryState>
    </div>
  );
}
