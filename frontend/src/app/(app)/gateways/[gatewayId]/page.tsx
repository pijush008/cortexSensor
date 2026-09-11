"use client";

import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Radio } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FieldGrid } from "@/components/ui/field-grid";
import { QueryState } from "@/components/ui/query-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { useGateways } from "@/hooks/use-gateways";
import { formatDateTime, relativeTime } from "@/lib/format-detail";

/**
 * One gateway, reached by clicking its row in the list.
 *
 * Read from the list query rather than a per-record fetch: /gateways already
 * returns every field this page shows, so a second request would ask the server
 * for data the client is holding. React Query serves the cached list instantly
 * on a click-through and fetches it once on a cold deep link.
 */
export default function GatewayDetailPage() {
  const params = useParams<{ gatewayId: string }>();
  const router = useRouter();
  const query = useGateways();

  const id = Number(params?.gatewayId);

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" onClick={() => router.push("/gateways")}>
        <ArrowLeft className="mr-1.5 h-4 w-4" />
        Back to gateways
      </Button>

      <QueryState
        query={query}
        errorTitle="Couldn't load this gateway"
        skeleton={<Card className="h-64 animate-pulse bg-slate-100" />}
      >
        {(list) => {
          const g = list.items.find((x) => x.id === id);
          if (!g) {
            return (
              <EmptyState
                icon={Radio}
                title="Gateway not found"
                description="It may have been removed, or the link may be out of date."
              />
            );
          }

          return (
            <>
              <Card className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h1 className="text-xl font-semibold text-slate-900">{g.name}</h1>
                    <p className="mt-0.5 font-mono text-[0.8125rem] text-slate-500">
                      {g.gatewayKey}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      label={g.status}
                      tone={g.status === "active" ? "green" : "slate"}
                    />
                    <StatusBadge
                      label={g.connectivity}
                      tone={g.connectivity === "online" ? "green" : "yellow"}
                    />
                  </div>
                </div>

                <FieldGrid
                  className="mt-5 border-t border-slate-100 pt-5"
                  fields={[
                    { label: "Public ID", value: g.publicId, mono: true },
                    { label: "Hardware", value: g.hardwareModel },
                    { label: "Firmware", value: g.firmwareVersion, mono: true },
                    { label: "Devices", value: g.deviceCount },
                    {
                      label: "Buffered",
                      // Null is "we do not know", which is not the same claim as
                      // an empty buffer — so it stays an em dash, not a zero.
                      value: g.bufferedCount ?? null,
                    },
                    {
                      label: "Last seen",
                      value: g.lastSeenAt
                        ? `${formatDateTime(g.lastSeenAt)} (${relativeTime(g.secondsSinceLastSeen)})`
                        : "Never reported",
                    },
                    { label: "Registered", value: formatDateTime(g.createdAt) },
                    { label: "Project", value: g.projectId },
                    { label: "Structure", value: g.structureId },
                    { label: "Description", value: g.description, wide: true },
                  ]}
                />
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Attached devices</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-600">
                    {g.deviceCount === 0
                      ? "No devices report through this gateway yet."
                      : `${g.deviceCount} device${g.deviceCount === 1 ? "" : "s"} report through this gateway.`}
                  </p>
                  {g.deviceCount > 0 && (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="mt-3"
                      onClick={() => router.push("/devices")}
                    >
                      View in devices
                    </Button>
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
