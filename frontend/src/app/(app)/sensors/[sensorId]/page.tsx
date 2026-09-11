"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Gauge } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FieldGrid } from "@/components/ui/field-grid";
import { QueryState } from "@/components/ui/query-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { useSensors, useSensorTypes } from "@/hooks/use-data";
import type { SensorType } from "@/types";

/**
 * One sensor.
 *
 * Served from the list query on purpose. The API has no GET /sensor/:id, but
 * the list already returns every field a sensor has — adding an endpoint to
 * re-fetch what the client holds would be work that buys nothing.
 */
export default function SensorDetailPage() {
  const params = useParams<{ sensorId: string }>();
  const router = useRouter();
  const sensorsQuery = useSensors();
  const { data: sensorTypes = [] } = useSensorTypes();

  const id = Number(params?.sensorId);

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" onClick={() => router.push("/sensors")}>
        <ArrowLeft className="mr-1.5 h-4 w-4" />
        Back to sensors
      </Button>

      <QueryState
        query={sensorsQuery}
        errorTitle="Couldn't load this sensor"
        skeleton={<Card className="h-64 animate-pulse bg-slate-100" />}
      >
        {(sensors) => {
          const s = sensors.find((x) => x.sensorId === id);
          if (!s) {
            return (
              <EmptyState
                icon={Gauge}
                title="Sensor not found"
                description="It may have been removed, or the link may be out of date."
              />
            );
          }

          const type = sensorTypes.find((t: SensorType) => t.id === s.sensorTypeID);

          return (
            <Card className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <h1 className="text-xl font-semibold text-slate-900">
                    {s.sensorName}
                  </h1>
                  <p className="mt-0.5 text-[0.8125rem] text-slate-500">{s.sensorType}</p>
                </div>
                <StatusBadge
                  label={s.calibrationValue != null ? "Calibrated" : "Not calibrated"}
                  tone={s.calibrationValue != null ? "green" : "yellow"}
                />
              </div>

              <FieldGrid
                className="mt-5 border-t border-slate-100 pt-5"
                fields={[
                  { label: "Sensor ID", value: s.sensorId, mono: true },
                  { label: "Type", value: s.sensorType },
                  { label: "Unit", value: type?.unit ?? null },
                  { label: "Calibration", value: s.calibrationValue, mono: true },
                  {
                    label: "Device",
                    value: s.deviceId ? (
                      <span className="font-mono text-[0.78125rem]">{s.deviceId}</span>
                    ) : null,
                  },
                  { label: "Project", value: s.projectName },
                  {
                    label: "Managing admin",
                    value:
                      s.adminId != null ? (
                        <Link
                          href={`/users/${s.adminId}`}
                          className="text-shm-navy-700 underline-offset-2 hover:underline"
                        >
                          {s.firstName ?? `User #${s.adminId}`}
                        </Link>
                      ) : null,
                  },
                ]}
              />
            </Card>
          );
        }}
      </QueryState>
    </div>
  );
}
