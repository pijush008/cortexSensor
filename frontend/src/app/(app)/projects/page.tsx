"use client";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/loading-state";
import { Modal } from "@/components/ui/modal";
import { Reveal } from "@/components/ui/reveal";
import { SectionLabel } from "@/components/ui/section-label";
import { Select } from "@/components/ui/select";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { useProjects } from "@/hooks/use-data";
import { api, type ApiResponse } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FolderKanban, Pause, Play, Plus, Square, Trash2 } from "lucide-react";
import { useState } from "react";

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
  projectUniqueID: "",
  startDate: "",
  endDate: "",
};

export default function ProjectsPage() {
  const { userId, userType } = useAuthStore();
  const adminId = userType === "superadmin" || !userType ? 0 : (userId ?? 0);
  const queryClient = useQueryClient();
  const { data: projects = [], isLoading } = useProjects(adminId);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["projects"] });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<ApiResponse>("/project", form);
      return data;
    },
    onSuccess: () => {
      invalidate();
      setShowModal(false);
      setForm(EMPTY_FORM);
    },
    onError: (err) =>
      setError((err as Error).message || "Failed to create project"),
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
    const matchesStatus = statusFilter === "all" || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        subtitle="Overview of all structural health monitoring projects."
        actions={
          <Button
            onClick={() => {
              setForm(EMPTY_FORM);
              setShowModal(true);
            }}
          >
            <Plus className="h-4 w-4" /> Add Project
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Projects"
          value={projects.length}
          icon={FolderKanban}
          accent="navy"
          delta="monitored structures"
          className="anim-fade-up"
        />
        <StatCard
          title="Running"
          value={projects.filter((p) => p.status === "start").length}
          icon={Play}
          accent="green"
          delta="collecting telemetry"
          className="anim-fade-up [animation-delay:80ms]"
        />
        <StatCard
          title="Paused"
          value={projects.filter((p) => p.status === "pause").length}
          icon={Pause}
          accent="yellow"
          delta="on hold"
          className="anim-fade-up [animation-delay:160ms]"
        />
        <StatCard
          title="Not started / ended"
          value={
            projects.filter((p) => p.status !== "start" && p.status !== "pause")
              .length
          }
          icon={Square}
          accent="blue"
          delta="inactive"
          className="anim-fade-up [animation-delay:240ms]"
        />
      </div>

      <Reveal>
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <SectionLabel index="16" label="Programme" className="mb-2" />
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
                  onChange={(e) => setStatusFilter(e.target.value)}
                  options={[
                    { value: "all", label: "All statuses" },
                    { value: "start", label: "Running" },
                    { value: "not_start", label: "Not Started" },
                    { value: "pause", label: "Paused" },
                    { value: "end", label: "Ended" },
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
                    <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-[0.14em] text-slate-500">
                      <th className="pb-3 pr-4 font-medium">Structure</th>
                      <th className="pb-3 pr-4 font-medium">Project Name</th>
                      <th className="pb-3 pr-4 font-medium">Project ID</th>
                      <th className="pb-3 pr-4 font-medium">Location</th>
                      <th className="pb-3 pr-4 font-medium">Start</th>
                      <th className="pb-3 pr-4 font-medium">End</th>
                      <th className="pb-3 pr-4 font-medium">Admin</th>
                      <th className="pb-3 pr-4 font-medium">Status</th>
                      <th className="pb-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => {
                      const meta =
                        STATUS_META[p.status] ?? STATUS_META.not_start;
                      return (
                        <tr
                          key={p.id}
                          className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
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
                          <td className="py-3 pr-4">
                            <StatusBadge label={meta.label} tone={meta.tone} />
                          </td>
                          <td className="py-3">
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
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
            {error}
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
          <Input
            label="Project Unique ID"
            value={form.projectUniqueID}
            onChange={(e) =>
              setForm({ ...form, projectUniqueID: e.target.value })
            }
          />
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
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowModal(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating…" : "Create Project"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
