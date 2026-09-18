"use client";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/loading-state";
import { Modal } from "@/components/ui/modal";
import { Reveal } from "@/components/ui/reveal";
import { Select } from "@/components/ui/select";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { useProjects } from "@/hooks/use-data";
import { api, type ApiResponse } from "@/lib/api";
import { describeError, type DescribedError } from "@/lib/errors";
import { formatDate } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useRole } from "@/hooks/use-role";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderKanban, Pause, Play, Plus, Square, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useParamFilter } from "@/hooks/use-param-filter";

const PROJECT_IMG: Record<string, string> = {
  "Bandra–Worli Sea Link SHM": "/images/structures/cable-stayed.jpg",
  "Howrah Bridge Structural Assessment": "/images/structures/hero-bridge.jpg",
  "Yamuna River Bridge Monitoring": "/images/structures/night-bridge.jpg",
  "Coastal Pier Corrosion Survey": "/images/structures/dam.jpg",
  "Ganga Bridge Load Assessment": "/images/structures/stone-bridge.jpg",
  "Metro Viaduct Vibration Study": "/images/structures/cable-stayed.jpg",
};

const projectImage = (name: string) =>
  PROJECT_IMG[name] ?? "/images/structures/hero-bridge.jpg";

const STATUS_META: Record<string, { label: string; tone: StatusTone }> = {
  not_start: { label: "Not Started", tone: "slate" },
  start: { label: "Running", tone: "green" },
  pause: { label: "Paused", tone: "yellow" },
  end: { label: "Ended", tone: "red" },
};

const EMPTY_FORM = {
  projectName: "",
  projectLocation: "",
  startDate: "",
  endDate: "",
  // Assigning a stakeholder by address. Nobody is attached to the project by
  // typing here — an invitation goes out, and the assignment happens when the
  // person accepts it.
  contractorEmail: "",
  authorityEmail: "",
  // The monitoring hardware: the Ackcio gateway this project will own.
  // Optional, because a project can be set up before its gateway is on site
  // and attached from the project page later.
  gatewayId: "",
};

interface GatewayOption {
  id: number;
  name: string;
  /** The GatewayDeviceId printed on the unit, e.g. "ba92". */
  gatewayKey: string;
  lastSeenAt: string | null;
}

interface InvitationOutcome {
  role: string;
  emailId: string;
  sent: boolean;
  message: string;
}

interface CreateProjectResponse extends ApiResponse {
  projectId: number;
  invitations?: InvitationOutcome[];
}

/** The statuses the list can be filtered to, shared by the Select and ?status. */
const PROJECT_STATUSES = [
  "all",
  "start",
  "not_start",
  "pause",
  "end",
  // Spans not_start AND end. The "Not started / ended" tile counts both, so
  // without a filter value meaning the same thing the tile could only drill to
  // half of what its own number claims.
  "inactive",
] as const;

type ProjectStatusFilter = (typeof PROJECT_STATUSES)[number];

export default function ProjectsPage() {
  const router = useRouter();
  const { userId, userType } = useAuthStore();
  const adminId = userType === "superadmin" || !userType ? 0 : (userId ?? 0);
  // A self-service viewer may read the directory and open nothing in it. The
  // API refuses the per-project routes regardless; this stops the UI offering
  // a click that can only end in an error.
  const role = useRole();
  const isViewer = role === "viewer";
  // Creating a project, and starting/pausing/ending one, require
  // MANAGE_PROJECTS — which the API grants to superadmin and admin only. A
  // contractor or authority was still shown the buttons, so the only thing
  // pressing them achieved was a 403. Offer an action only to whoever the API
  // will actually let perform it.
  const canManageProjects = role === "superadmin" || role === "admin";
  const queryClient = useQueryClient();
  const { data: projects = [], isLoading } = useProjects(adminId);

  const [search, setSearch] = useState("");
  // Seeded from ?status so the dashboard's Running/Paused/Upcoming tiles land
  // here already filtered rather than on the full list.
  const [statusFilter, setStatusFilter] = useParamFilter(
    "status",
    PROJECT_STATUSES,
    "all",
  );
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<DescribedError | null>(null);
  /** Per-role outcome of the invitations a submitted form asked for. */
  const [inviteResults, setInviteResults] = useState<InvitationOutcome[]>([]);


  // Gateways this project could actually take: the organization's own, not
  // held by any project. Only these are OFFERED; the server enforces the rule
  // when the form is submitted, so a gateway claimed by someone else in the
  // meantime is refused with a sentence rather than taken twice.
  const gatewaysQuery = useQuery({
    queryKey: ["gateways", "available"],
    queryFn: async () => {
      const { data } = await api.get<{ items: GatewayOption[] }>("/gateways", {
        params: { available: "1", limit: 100 },
      });
      return data.items ?? [];
    },
    enabled: showModal,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["projects"] });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<CreateProjectResponse>("/project", form);
      return data;
    },
    onSuccess: (data) => {
      invalidate();
      setForm(EMPTY_FORM);

      // Show the list the new project is actually in.
      //
      // A new project is always NOT STARTED, and this page arrives already
      // filtered when it is reached from a dashboard tile —
      // /projects?status=start is the "Running" drill-through. Creating a
      // project from that view left it filtered out the moment it was made:
      // created, returned by the API, and invisible, with nothing on screen
      // explaining why. A stale search term hides it just as effectively.
      //
      // Clearing both is safe: useParamFilter re-seeds from the URL only when
      // the parameter itself changes, so a filter chosen here is not undone by
      // the query string that is still in the address bar.
      setStatusFilter("all");
      setSearch("");

      // The project exists either way. An invitation that could not be sent is
      // reported instead of silently swallowed, because the administrator is
      // the only one who can do anything about it — they can resend from the
      // project page once they have fixed the address.
      const failed = (data.invitations ?? []).filter((i) => !i.sent);
      if (failed.length > 0) {
        setInviteResults(data.invitations ?? []);
      } else {
        setShowModal(false);
        setInviteResults([]);
      }
    },
    onError: (err) =>
      // describeError, not err.message: on a rejected request the latter is
      // axios's own "Request failed with status code 400", which tells someone
      // filling in this form nothing. The API answers a rejected creation with
      // a sentence written for them — "Project Name already exists" — and
      // describeError is what surfaces it.
      setError(describeError(err)),
  });

  const startMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const { data } = await api.get<ApiResponse>(`/projectStart/${id}`, {
        params: { statusType: status },
      });
      return data;
    },
    onSuccess: () => invalidate(),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.delete<ApiResponse>(`/project/${id}`);
      return data;
    },
    onSuccess: () => invalidate(),
  });

  const filtered = projects.filter((p) => {
    const matchesSearch =
      !search ||
      p.projectName.toLowerCase().includes(search.toLowerCase()) ||
      (p.projectUniqueID || "").toLowerCase().includes(search.toLowerCase());
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "inactive"
        ? p.status !== "start" && p.status !== "pause"
        : p.status === statusFilter);
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        subtitle="Overview of all structural health monitoring projects."
        actions={
          !canManageProjects ? null : (
            <Button
              onClick={() => {
                setForm(EMPTY_FORM);
                setInviteResults([]);
                setError(null);
                setShowModal(true);
              }}
            >
              <Plus className="h-4 w-4" /> Add Project
            </Button>
          )
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Projects"
          value={projects.length}
          icon={FolderKanban}
          accent="navy"
          delta="monitored structures"
          onClick={() => setStatusFilter("all")}
        />
        <StatCard
          title="Running"
          value={projects.filter((p) => p.status === "start").length}
          icon={Play}
          accent="green"
          delta="collecting telemetry"
          onClick={() => setStatusFilter("start")}
        />
        <StatCard
          title="Paused"
          value={projects.filter((p) => p.status === "pause").length}
          icon={Pause}
          accent="yellow"
          delta="on hold"
          onClick={() => setStatusFilter("pause")}
        />
        <StatCard
          title="Not started / ended"
          value={
            projects.filter((p) => p.status !== "start" && p.status !== "pause")
              .length
          }
          icon={Square}
          accent="blue"
          onClick={() => setStatusFilter("inactive")}
          delta="inactive"
        />
      </div>

      <Reveal>
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Project List</CardTitle>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  placeholder="Search projects…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="sm:w-64"
                />
                <Select
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value as ProjectStatusFilter)
                  }
                  options={[
                    { value: "all", label: "All statuses" },
                    { value: "start", label: "Running" },
                    { value: "not_start", label: "Not Started" },
                    { value: "pause", label: "Paused" },
                    { value: "end", label: "Ended" },
                    { value: "inactive", label: "Not started / ended" },
                  ]}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <LoadingState />
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={FolderKanban}
                title="No projects found"
                description="Projects created for monitoring will appear here."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-[0.75rem] font-medium text-slate-500">
                      <th className="pb-3 pr-4 font-medium">Structure</th>
                      <th className="pb-3 pr-4 font-medium">Project Name</th>
                      <th className="pb-3 pr-4 font-medium">Project ID</th>
                      <th className="pb-3 pr-4 font-medium">Location</th>
                      <th className="pb-3 pr-4 font-medium">Start</th>
                      <th className="pb-3 pr-4 font-medium">End</th>
                      <th className="pb-3 pr-4 font-medium">Admin</th>
                      {/* A viewer cannot open a project, so the stakeholders
                          have to be visible in the directory itself — it is the
                          only place they will ever see them. */}
                      {isViewer && (
                        <>
                          <th className="pb-3 pr-4 font-medium">Contractor</th>
                          <th className="pb-3 pr-4 font-medium">Authority</th>
                        </>
                      )}
                      <th className="pb-3 pr-4 font-medium">Status</th>
                      {canManageProjects && (
                        <th className="pb-3 font-medium">Actions</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => {
                      const meta =
                        STATUS_META[p.status] ?? STATUS_META.not_start;
                      return (
                        <tr
                          key={p.projectId ?? p.id}
                          onClick={() =>
                            router.push(`/projects/${p.projectId ?? p.id}`)
                          }
                          className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50"
                        >
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-3">
                              <span className="block h-10 w-14 shrink-0 overflow-hidden rounded-md border border-slate-200">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={projectImage(p.projectName)}
                                  alt=""
                                  aria-hidden
                                  loading="lazy"
                                  className="h-full w-full object-cover"
                                />
                              </span>
                              <span className="font-medium text-slate-800">
                                {p.projectName}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 pr-4 font-mono text-slate-600">
                            {p.projectUniqueID || p.uniqueId || "—"}
                          </td>
                          <td className="py-3 pr-4 text-slate-600">
                            {p.projectLocation}
                          </td>
                          <td className="py-3 pr-4 text-slate-600">
                            {p.startDate ? formatDate(p.startDate) : "—"}
                          </td>
                          <td className="py-3 pr-4 text-slate-600">
                            {p.endDate ? formatDate(p.endDate) : "—"}
                          </td>
                          <td className="py-3 pr-4 text-slate-600">
                            {p.adminFirstName
                              ? `${p.adminFirstName} ${p.adminLastName ?? ""}`
                              : "—"}
                          </td>
                          {isViewer && (
                            <>
                              <td className="py-3 pr-4 text-slate-600">
                                {p.contractorFirstName
                                  ? `${p.contractorFirstName} ${p.contractorLastName ?? ""}`
                                  : "—"}
                              </td>
                              <td className="py-3 pr-4 text-slate-600">
                                {p.authorityFirstName
                                  ? `${p.authorityFirstName} ${p.authorityLastName ?? ""}`
                                  : "—"}
                              </td>
                            </>
                          )}
                          <td className="py-3 pr-4">
                            <StatusBadge label={meta.label} tone={meta.tone} />
                          </td>
                          {canManageProjects && (
                          <td className="py-3" onClick={(e) => e.stopPropagation()}>
                            <div className="flex gap-1">
                              {p.status === "not_start" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    startMutation.mutate({
                                      id: p.projectId ?? p.id,
                                      status: "start",
                                    })
                                  }
                                  aria-label="Start project"
                                >
                                  <Play className="h-4 w-4 text-green-600" />
                                </Button>
                              )}
                              {p.status === "start" && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                      startMutation.mutate({
                                        id: p.projectId ?? p.id,
                                        status: "pause",
                                      })
                                    }
                                    aria-label="Pause project"
                                  >
                                    <Pause className="h-4 w-4 text-amber-600" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                      startMutation.mutate({
                                        id: p.projectId ?? p.id,
                                        status: "end",
                                      })
                                    }
                                    aria-label="End project"
                                  >
                                    <Square className="h-4 w-4 text-shm-red" />
                                  </Button>
                                </>
                              )}
                              {p.status === "pause" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    startMutation.mutate({
                                      id: p.projectId ?? p.id,
                                      status: "start",
                                    })
                                  }
                                  aria-label="Resume project"
                                >
                                  <Play className="h-4 w-4 text-green-600" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  deleteMutation.mutate(p.projectId ?? p.id)
                                }
                                aria-label="Delete project"
                              >
                                <Trash2 className="h-4 w-4 text-shm-red" />
                              </Button>
                            </div>
                          </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </Reveal>

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title="New Project"
      >
        {error && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600"
          >
            <p className="font-medium">{error.title}</p>
            <p className="mt-0.5 text-red-600/85">{error.description}</p>
          </div>
        )}
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            createMutation.mutate();
          }}
        >
          <Input
            label="Project Name"
            value={form.projectName}
            onChange={(e) => setForm({ ...form, projectName: e.target.value })}
            required
          />
          <Input
            label="Project Location"
            value={form.projectLocation}
            onChange={(e) =>
              setForm({ ...form, projectLocation: e.target.value })
            }
            required
          />
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[0.8125rem] text-slate-600">
            A unique Project ID is generated automatically when the project is
            created. It cannot be edited afterwards.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Start Date"
              type="date"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            />
            <Input
              label="End Date"
              type="date"
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
            />
          </div>

          {(() => {
            const gateways = gatewaysQuery.data ?? [];
            return (
              <div>
                <Select
                  label="Gateway (optional)"
                  value={form.gatewayId}
                  disabled={gateways.length === 0}
                  onChange={(e) =>
                    setForm({ ...form, gatewayId: e.target.value })
                  }
                  options={[
                    { value: "", label: "No gateway yet" },
                    ...gateways.map((g) => ({
                      value: String(g.id),
                      label: `${g.name} · ${g.gatewayKey}`,
                    })),
                  ]}
                />
                <p className="mt-1.5 text-[0.78125rem] text-slate-500">
                  {gatewaysQuery.isLoading
                    ? "Loading gateways…"
                    : gateways.length === 0
                      ? "No gateway is available. Register one under Gateways, or end the project that holds it."
                      : "A gateway serves one project at a time, and is released when the project ends."}
                </p>
              </div>
            );
          })()}

          <div className="space-y-4 rounded-lg border border-slate-200 p-4">
            <div>
              <h3 className="text-sm font-medium text-slate-800">
                Assign stakeholders
              </h3>
              <p className="mt-1 text-[0.8125rem] text-slate-600">
                We email each person a verification code. They set their own
                password, and are assigned to the project once they accept.
                Optional — you can assign them later.
              </p>
            </div>
            <Input
              label="Contractor email"
              type="email"
              placeholder="contractor@example.com"
              value={form.contractorEmail}
              onChange={(e) =>
                setForm({ ...form, contractorEmail: e.target.value })
              }
            />
            <Input
              label="Authority email"
              type="email"
              placeholder="authority@example.com"
              value={form.authorityEmail}
              onChange={(e) =>
                setForm({ ...form, authorityEmail: e.target.value })
              }
            />
          </div>

          {inviteResults.length > 0 && (
            <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[0.8125rem]">
              <p className="font-medium text-amber-900">
                The project was created, but not every invitation went out.
              </p>
              <ul className="space-y-1 text-amber-800">
                {inviteResults.map((r) => (
                  <li key={`${r.role}-${r.emailId}`}>
                    <span className="capitalize">{r.role}</span>: {r.message}
                  </li>
                ))}
              </ul>
              <p className="text-amber-800">
                You can resend from the project page.
              </p>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setShowModal(false);
                setInviteResults([]);
              }}
            >
              {inviteResults.length > 0 ? "Close" : "Cancel"}
            </Button>
            <Button type="submit" loading={createMutation.isPending}>
              {createMutation.isPending ? "Creating…" : "Create Project"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
