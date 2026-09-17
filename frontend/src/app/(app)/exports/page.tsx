"use client";

import { useState } from "react";
import { Download, UploadCloud, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Reveal } from "@/components/ui/reveal";
import { SectionLabel } from "@/components/ui/section-label";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PageHeader } from "@/components/layout/page-header";
import { useProjects } from "@/hooks/use-data";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import type { Project } from "@/types";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function ExportsPage() {
  const { userId, userType } = useAuthStore();
  const adminId = userType === "superadmin" ? 0 : (userId ?? 0);
  const { data: projects = [] } = useProjects(adminId);

  const [selectedUniqueId, setSelectedUniqueId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const exportList = async (
    key: string,
    url: string,
    params: Record<string, string | number>,
  ) => {
    setBusy(key);
    setMsg(null);
    try {
      const res = await api.post(url, {}, {
        params,
        responseType: "blob",
      });
      downloadBlob(res.data as Blob, `${key}.csv`);
    } catch (err) {
      setMsg("Export failed: " + ((err as Error).message || "Unknown error"));
    } finally {
      setBusy(null);
    }
  };

  const exportCsv = async () => {
    if (!selectedUniqueId) return;
    setBusy("csv");
    setMsg(null);
    try {
      const res = await api.post(`/exportCsv/${selectedUniqueId}`, {}, {
        responseType: "blob",
      });
      downloadBlob(res.data as Blob, `${selectedUniqueId}_export.csv`);
    } catch (err) {
      setMsg("CSV export failed: " + ((err as Error).message || "Unknown error"));
    } finally {
      setBusy(null);
    }
  };

  const importCsv = async () => {
    if (!selectedUniqueId || !file) {
      setMsg("Select a project and a CSV file first.");
      return;
    }
    setBusy("import");
    setMsg(null);
    try {
      const form = new FormData();
      form.append("csvFiles", file);
      await api.post(`/importCsv/${selectedUniqueId}`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setMsg("CSV imported successfully.");
      setFile(null);
    } catch (err) {
      setMsg("Import failed: " + ((err as Error).message || "Unknown error"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Exports"
        subtitle="Download CSV backups or exchange sensor data with a project."
      />

      {msg && (
        <div className="anim-tick-in rounded-lg border border-shm-sky-200 bg-shm-sky-50 px-3.5 py-2.5 text-sm text-shm-navy-700">
          {msg}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Reveal>
          <Card>
            <CardHeader>
              <SectionLabel label="Backups" className="mb-2" />
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-shm-navy-700" strokeWidth={1.75} />
                <CardTitle>Download Data</CardTitle>
              </div>
            </CardHeader>
          <CardContent className="space-y-3">
            <Button
              variant="secondary"
              className="w-full justify-start"
              loading={busy === "admin"}
              onClick={() =>
                exportList("admin", "/download/list/admin/0", { userType: "admin" })
              }
            >
              <Download className="h-4 w-4" />
              {busy === "admin" ? "Exporting…" : "Admin List"}
            </Button>
            <Button
              variant="secondary"
              className="w-full justify-start"
              loading={busy === "contractor"}
              onClick={() =>
                exportList("contractor", "/download/list/contractor/0", {
                  userType: "contractor",
                })
              }
            >
              <Download className="h-4 w-4" />
              {busy === "contractor" ? "Exporting…" : "Contractor List"}
            </Button>
            <Button
              variant="secondary"
              className="w-full justify-start"
              loading={busy === "authority"}
              onClick={() =>
                exportList("authority", "/download/list/authority/0", {
                  userType: "authority",
                })
              }
            >
              <Download className="h-4 w-4" />
              {busy === "authority" ? "Exporting…" : "Authority List"}
            </Button>
            <Button
              variant="secondary"
              className="w-full justify-start"
              loading={busy === "device"}
              onClick={() => exportList("devices", "/download/device/0", {})}
            >
              <Download className="h-4 w-4" />
              {busy === "device" ? "Exporting…" : "Devices"}
            </Button>
            <Button
              variant="secondary"
              className="w-full justify-start"
              loading={busy === "sensor"}
              onClick={() => exportList("sensors", "/download/sensor/0", {})}
            >
              <Download className="h-4 w-4" />
              {busy === "sensor" ? "Exporting…" : "Sensors"}
            </Button>
            <Button
              variant="secondary"
              className="w-full justify-start"
              loading={busy === "projects"}
              onClick={() => exportList("projects", "/download/projects/0", {})}
            >
              <Download className="h-4 w-4" />
              {busy === "projects" ? "Exporting…" : "Projects"}
            </Button>
          </CardContent>
        </Card>
        </Reveal>

        <Reveal delay={80}>
          <Card>
            <CardHeader>
              <SectionLabel label="Exchange" className="mb-2" />
              <div className="flex items-center gap-2">
                <UploadCloud className="h-5 w-5 text-shm-navy-700" strokeWidth={1.75} />
                <CardTitle>Project CSV Exchange</CardTitle>
              </div>
            </CardHeader>
          <CardContent className="space-y-4">
            <Select
              label="Project"
              value={selectedUniqueId}
              onChange={(e) => setSelectedUniqueId(e.target.value)}
              options={[
                { value: "", label: "Select project…" },
                ...projects.map((p: Project) => ({
                  value: p.uniqueId ?? "",
                  label: p.projectName,
                })),
              ]}
            />
            <Button
              className="flex-1"
              loading={busy === "csv"}
              disabled={!selectedUniqueId}
              onClick={exportCsv}
            >
              <Download className="h-4 w-4" />
              {busy === "csv" ? "Exporting…" : "Export Sensor CSV"}
            </Button>
            <div className="border-t border-slate-200 pt-4">
              <p className="mb-2 text-sm font-medium text-slate-700">
                Import Sensor CSV
              </p>
              <Input
                type="file"
                accept=".csv"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <Button
                className="mt-3 w-full"
                loading={busy === "import"}
                disabled={!selectedUniqueId || !file}
                onClick={importCsv}
              >
                <UploadCloud className="h-4 w-4" />
                {busy === "import" ? "Importing…" : "Import CSV"}
              </Button>
            </div>
          </CardContent>
        </Card>
        </Reveal>
      </div>
    </div>
  );
}