"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileBarChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Reveal } from "@/components/ui/reveal";
import { Select } from "@/components/ui/select";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { useProjects } from "@/hooks/use-data";
import { api, type ApiResponse } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { formatDateTime } from "@/lib/utils";
import type { Project, ReportSensorData } from "@/types";

export default function ReportsPage() {
  const { userId, userType } = useAuthStore();
  const adminId = userType === "superadmin" ? 0 : (userId ?? 0);
  const { data: projects = [] } = useProjects(adminId);

  const [selectedUniqueId, setSelectedUniqueId] = useState("");
  const [offset, setOffset] = useState("0");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [frequency, setFrequency] = useState("1hr");
  const [submitted, setSubmitted] = useState(false);

  const reportQuery = useQuery({
    queryKey: [
      "reportSensorList",
      selectedUniqueId,
      offset,
      startDate,
      endDate,
      frequency,
      submitted,
    ],
    queryFn: async () => {
      const { data } = await api.post<ApiResponse<ReportSensorData[]>>(
        `/reportSensorList/${selectedUniqueId}`,
        {
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          offset,
          frequency,
        },
      );
      return (data.data as ReportSensorData[]) || [];
    },
    enabled: submitted && !!selectedUniqueId,
  });

  const reportRows: ReportSensorData[] = reportQuery.data ?? [];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUniqueId) return;
    setSubmitted(true);
  };

  const projectOptions = [
    { value: "", label: "Select project…" },
    ...projects.map((p: Project) => ({
      value: p.uniqueId ?? "",
      label: p.projectName,
    })),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        subtitle="Generate sensor reports for a selected project."
      />

      <Reveal>
        <Card>
          <CardHeader>
            <CardTitle>Report Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 lg:grid-cols-5" onSubmit={submit}>
            <div className="lg:col-span-2">
              <Select
                label="Project"
                value={selectedUniqueId}
                onChange={(e) => {
                  setSelectedUniqueId(e.target.value);
                  setSubmitted(false);
                }}
                options={projectOptions}
                required
              />
            </div>
            <div>
              <Input
                label="Offset"
                type="number"
                value={offset}
                onChange={(e) => setOffset(e.target.value)}
                placeholder="0"
              />
            </div>
            <div>
              <Select
                label="Frequency"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                options={[
                  { value: "1hr", label: "1 Hour" },
                  { value: "6hr", label: "6 Hours" },
                  { value: "12hr", label: "12 Hours" },
                  { value: "24hr", label: "24 Hours" },
                ]}
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" className="w-full" disabled={!selectedUniqueId}>
                Generate
              </Button>
            </div>
            <div className="lg:col-span-2">
              <Input
                label="Start Date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="lg:col-span-2">
              <Input
                label="End Date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </form>
        </CardContent>
      </Card>
      </Reveal>

      {submitted && reportQuery.isLoading && (
        <Card>
          <CardContent>
            <LoadingState label="Generating report…" />
          </CardContent>
        </Card>
      )}

      {submitted && reportQuery.isError && (
        <Card>
          <CardContent className="flex h-40 items-center justify-center text-red-500">
            Failed to generate report. Check project configuration.
          </CardContent>
        </Card>
      )}

      {submitted && !reportQuery.isLoading && !reportQuery.isError && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileBarChart className="h-5 w-5 text-shm-navy-700" />
              <CardTitle>Sensor Readings</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {reportRows.length === 0 ? (
              <EmptyState
                icon={FileBarChart}
                title="No sensor data found"
                description="No readings are available for the selected date range."
              />
            ) : (
              <div className="space-y-6">
                {reportRows.map((row) => (
                  <div key={row.sensorId}>
                    <h3 className="mb-2 font-semibold text-slate-800">
                      Sensor #{row.sensorId}
                      <span className="ml-2 text-xs font-normal text-slate-400">
                        {row.data.length} readings
                      </span>
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                            <th className="pb-2 pr-4">Timestamp</th>
                            <th className="pb-2">Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {row.data.slice(0, 20).map((d, i) => (
                            <tr
                              key={i}
                              className="border-b border-slate-100 last:border-0"
                            >
                              <td className="py-2 pr-4 font-mono text-slate-600">
                                {d.createdAt ? formatDateTime(d.createdAt) : "—"}
                              </td>
                              <td className="py-2 font-mono font-medium text-slate-800">
                                {d.sensorData ?? "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}