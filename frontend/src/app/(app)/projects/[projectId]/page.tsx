"use client";

import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, FolderKanban } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FieldGrid } from "@/components/ui/field-grid";
import { QueryState } from "@/components/ui/query-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { useProjects } from "@/hooks/use-data";
import { useAuthStore } from "@/stores/auth-store";
import { useIsViewer } from "@/hooks/use-role";
import { formatDate, formatDateTime } from "@/lib/format-detail";
import type { Project } from "@/types";
import { DevicePanel } from "./device-panel";
import { StakeholdersPanel } from "./stakeholders-panel";

/** Status values the API stores, mapped to something a person reads. */
const STATUS_LABEL: Record<string, string> = {
  start: "Running",
  pause: "Paused",
  not_start: "Not started",
  end: "Ended",
};

const STATUS_TONE: Record<string, "green" | "yellow" | "slate"> = {
  start: "green",
  pause: "yellow",
  not_start: "slate",
  end: "slate",
};

function personName(
  first: string | null | undefined,
  last: string | null | undefined,
): string | null {
  const name = [first, last].filter(Boolean).join(" ").trim();
  return name || null;
}

export default function ProjectDetailPage() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();
  const { userId, userType } = useAuthStore();
  // Same rule the list page uses: a platform operator reads across tenants
  // with adminId 0, everyone else is scoped to their own id.
  const adminId = userType === "superadmin" || !userType ? 0 : (userId ?? 0);
  const query = useProjects(adminId);
  // A self-service viewer reads the directory. This page is reachable because
  // it is built from the SAME list response, but everything that administers
  // the project — its hardware, its stakeholders, its invitations — and the
  // route into live readings belong to the organization that owns it.
  // Resolved from the SERVER, not from localStorage: a cached role that is out
  // of date would turn this gate off and render the panels to a viewer.
  const isViewer = useIsViewer();

  const id = Number(params?.projectId);

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" onClick={() => router.push("/projects")}>
        <ArrowLeft className="mr-1.5 h-4 w-4" />
        Back to projects
      </Button>

      <QueryState
        query={query}
        errorTitle="Couldn't load this project"
        skeleton={<Card className="h-64 animate-pulse bg-slate-100" />}
      >
        {(projects) => {
          const p = projects.find(
            (x: Project) => (x.projectId ?? x.id) === id || x.id === id,
          );
          if (!p) {
            return (
              <EmptyState
                icon={FolderKanban}
                title="Project not found"
                description="It may have been removed, or the link may be out of date."
              />
            );
          }

          return (
            <div className="space-y-5">
            <Card className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <h1 className="text-xl font-semibold text-slate-900">
                    {p.projectName}
                  </h1>
                  <p className="mt-0.5 text-[0.8125rem] text-slate-500">
                    {p.projectLocation}
                  </p>
                </div>
                <StatusBadge
                  label={STATUS_LABEL[p.status] ?? p.status}
                  tone={STATUS_TONE[p.status] ?? "slate"}
                />
              </div>

              {/* The dashboard is the operational view of this project — the
                  images, sensor channels and live readings field teams work
                  from. It only resolves for a project that has a uniqueId. */}
              {!isViewer && (p.uniqueId ?? p.projectUniqueID) && (
                <div className="mt-4">
                  <Button
                    size="sm"
                    onClick={() =>
                      router.push(`/projects/${p.projectId ?? p.id}/dashboard`)
                    }
                  >
                    Open dashboard
                  </Button>
                </div>
              )}

              <FieldGrid
                className="mt-5 border-t border-slate-100 pt-5"
                fields={[
                  {
                    label: "Project code",
                    value: p.projectUniqueID ?? p.uniqueId,
                    mono: true,
                  },
                  { label: "Planned start", value: formatDate(p.startDate) },
                  { label: "Actual start", value: formatDate(p.actualStartDate) },
                  { label: "End", value: formatDate(p.endDate) },
                  { label: "Timezone offset", value: p.offset },
                  { label: "Created", value: formatDateTime(p.createdAt) },
                  {
                    label: "Admin",
                    value: personName(p.adminFirstName, p.adminLastName),
                  },
                  {
                    label: "Contractor",
                    value: personName(p.contractorFirstName, p.contractorLastName),
                  },
                  {
                    label: "Authority",
                    value: personName(p.authorityFirstName, p.authorityLastName),
                  },
                  {
                    label: "Device",
                    // The NAME, not Project.deviceId — which holds the device's
                    // row id and rendered as a bare integer. It read as "—"
                    // until devices could be attached from the UI at all; the
                    // id is kept only as a fallback for a shape that omits the
                    // resolved name.
                    value: p.deviceName ?? p.deviceId,
                  },
                  { label: "Sensor", value: p.sensorId, mono: true },
                ]}
              />
            </Card>
            {!isViewer && (
            <DevicePanel
              projectId={p.projectId ?? p.id}
              currentDeviceId={p.deviceId ?? null}
              currentDeviceName={p.deviceName ?? null}
              status={p.status}
            />
            )}
            {!isViewer && (
            <StakeholdersPanel
              projectId={p.projectId ?? p.id}
              contractor={{
                userId: p.contractorId ?? null,
                firstName: p.contractorFirstName,
                lastName: p.contractorLastName,
              }}
              authority={{
                userId: p.authorityId ?? null,
                firstName: p.authorityFirstName,
                lastName: p.authorityLastName,
              }}
            />
            )}
            </div>
          );
        }}
      </QueryState>
    </div>
  );
}
