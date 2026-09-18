"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Radio, Save, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { api, type ApiResponse } from "@/lib/api";
import { describeError, type DescribedError } from "@/lib/errors";
import { useRole } from "@/hooks/use-role";

/**
 * The Ackcio gateway a project owns.
 *
 * One gateway serves one project, and the database enforces it; this panel
 * only offers gateways that are free and reports the server's answer. It is
 * editable while the project is not collecting — not started, or paused — for
 * the same reason as the device panel beside it.
 */

interface GatewayOption {
  id: number;
  name: string;
  gatewayKey: string;
  status: string;
  lastSeenAt: string | null;
}

interface GatewayPanelProps {
  projectId: number;
  currentGatewayId: number | null;
  currentGatewayName: string | null;
  currentGatewayKey: string | null;
  status: string;
}

export function GatewayPanel({
  projectId,
  currentGatewayId,
  currentGatewayName,
  currentGatewayKey,
  status,
}: GatewayPanelProps) {
  const role = useRole();
  const queryClient = useQueryClient();
  const canManage = role === "superadmin" || role === "admin";
  const editable = canManage && (status === "not_start" || status === "pause");

  const current = currentGatewayId !== null ? String(currentGatewayId) : "";
  const [selected, setSelected] = useState(current);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<DescribedError | null>(null);

  useEffect(() => {
    setSelected(current);
  }, [current]);

  const optionsQuery = useQuery({
    queryKey: ["project", projectId, "gateway-options"],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse & { data: GatewayOption[] }>(
        `/project/${projectId}/gateway-options`,
      );
      return data.data ?? [];
    },
    enabled: editable,
  });

  const saveMutation = useMutation({
    mutationFn: async (gatewayId: number | null) => {
      const { data } = await api.put<ApiResponse>(`/project/${projectId}/gateway`, { gatewayId });
      return data;
    },
    onSuccess: () => {
      setError(null);
      setMessage("Gateway updated");
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["gateways"] });
      queryClient.invalidateQueries({ queryKey: ["project", projectId, "gateway-options"] });
    },
    onError: (err) => {
      setMessage(null);
      setError(describeError(err));
    },
  });

  const options = optionsQuery.data ?? [];
  const selectOptions = [
    { value: "", label: "No gateway" },
    ...(currentGatewayId !== null
      ? [{ value: current, label: `${currentGatewayName ?? "Current gateway"} (current)` }]
      : []),
    ...options.map((g) => ({ value: String(g.id), label: `${g.name} · ${g.gatewayKey}` })),
  ];

  if (role === "viewer") return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gateway</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Radio className="h-4 w-4 shrink-0 text-slate-400" />
          <div className="min-w-0 flex-1">
            <p className="text-[0.78125rem] text-slate-500">Ackcio gateway feeding this project</p>
            <p className="truncate text-sm text-slate-800">
              {currentGatewayId !== null ? (
                <Link href={`/gateways/${currentGatewayId}`} className="underline-offset-2 hover:underline">
                  {currentGatewayName ?? `Gateway ${currentGatewayId}`}
                  {currentGatewayKey ? (
                    <span className="ml-2 font-mono text-[0.75rem] text-slate-500">{currentGatewayKey}</span>
                  ) : null}
                </Link>
              ) : (
                <span className="text-slate-400">No gateway attached</span>
              )}
            </p>
          </div>
        </div>

        {editable ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Select
              label="Attached gateway"
              className="sm:max-w-sm"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              options={selectOptions}
            />
            <div className="flex gap-2">
              <Button
                loading={saveMutation.isPending}
                disabled={selected === current}
                onClick={() => saveMutation.mutate(selected ? Number(selected) : null)}
              >
                <Save className="h-4 w-4" />
                {saveMutation.isPending ? "Saving…" : "Save"}
              </Button>
              {currentGatewayId !== null && (
                <Button
                  variant="secondary"
                  loading={saveMutation.isPending}
                  onClick={() => {
                    setSelected("");
                    saveMutation.mutate(null);
                  }}
                >
                  <Unplug className="h-4 w-4" />
                  Release
                </Button>
              )}
            </div>
          </div>
        ) : (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[0.8125rem] text-slate-600">
            {!canManage
              ? "Only an administrator can change this project's gateway."
              : "A project's gateway can only be changed while it is not collecting: before it starts, or while paused."}
          </p>
        )}

        {editable && options.length === 0 && !optionsQuery.isLoading && (
          <p className="text-[0.78125rem] text-slate-500">
            No other gateway is available. Register one under Gateways, or end the project that holds it.
          </p>
        )}

        {message && (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[0.8125rem] text-slate-700">
            {message}
          </p>
        )}
        {error && (
          <div role="alert" className="rounded-lg border border-shm-red/20 bg-shm-red/5 px-3 py-2 text-[0.8125rem] text-shm-red">
            <p className="font-medium">{error.title}</p>
            <p className="mt-0.5 text-shm-red/85">{error.description}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
