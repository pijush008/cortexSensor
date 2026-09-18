"use client";

import { useState } from "react";
import Link from "next/link";
import { FileInput } from "lucide-react";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { PageHeader } from "@/components/layout/page-header";
import { QueryState } from "@/components/ui/query-state";
import { Select } from "@/components/ui/select";
import { SkeletonCard } from "@/components/ui/skeleton";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { useIngestionFiles } from "@/hooks/use-ingestion";
import { formatDateTime } from "@/lib/format-detail";
import type { IngestionFile } from "@/types";

/**
 * The FTP drop's ledger: every file the gateways uploaded and what became of
 * it. This is where an administrator learns that a file failed and why, that
 * an upload was a repeat, and that a gateway nobody has registered is sending
 * data that is being kept but attached to no project.
 */

const STATUS_LABEL: Record<IngestionFile["status"], string> = {
  received: "Received",
  processed: "Processed",
  failed: "Failed",
  unknown_gateway: "Unknown gateway",
  duplicate: "Duplicate",
};

const STATUS_TONE: Record<IngestionFile["status"], StatusTone> = {
  received: "slate",
  processed: "green",
  failed: "red",
  unknown_gateway: "yellow",
  duplicate: "slate",
};

function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function IngestionPage() {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const query = useIngestionFiles(status, page);

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs items={[{ label: "Field Infrastructure" }, { label: "Gateways", href: "/gateways" }, { label: "Ingestion" }]} />
        <PageHeader
          eyebrow="Edge Fleet"
          title="Ingestion"
          subtitle="Files received from the gateways over FTPS, and what was done with each."
          actions={
            <Select
              aria-label="Filter by outcome"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              options={[
                { value: "", label: "All outcomes" },
                { value: "processed", label: "Processed" },
                { value: "failed", label: "Failed" },
                { value: "unknown_gateway", label: "Unknown gateway" },
                { value: "duplicate", label: "Duplicate" },
              ]}
            />
          }
        />
      </div>

      <QueryState
        query={query}
        errorTitle="Couldn't load the ingestion ledger"
        isEmpty={(d) => (d?.items?.length ?? 0) === 0}
        empty={{
          icon: FileInput,
          title: status ? "Nothing with that outcome" : "No files received yet",
          description: status
            ? "Choose another outcome, or all."
            : "Once a gateway is configured to upload over FTPS, each file it sends appears here with its outcome.",
        }}
        skeleton={<SkeletonCard bodyHeight="h-56" />}
      >
        {(data) => (
          <>
            {data.unknownGatewayFiles > 0 && (
              <div
                role="status"
                className="rounded-lg border border-shm-yellow/40 bg-shm-yellow/10 px-4 py-3 text-sm text-slate-800"
              >
                {data.unknownGatewayFiles === 1
                  ? "1 file has arrived from a gateway that is not registered."
                  : `${data.unknownGatewayFiles} files have arrived from gateways that are not registered.`}{" "}
                They are kept and attached to no project. Register the gateway under{" "}
                <Link href="/gateways" className="font-medium underline-offset-2 hover:underline">
                  Gateways
                </Link>{" "}
                with the ID shown below, and its next upload will be stored.
              </div>
            )}

            <div className="overflow-x-auto rounded-xl border border-slate-200/90 bg-white">
              <table className="w-full min-w-[1080px] border-collapse text-sm">
                <caption className="sr-only">Files received from gateways</caption>
                <thead>
                  <tr className="border-b border-slate-200 text-left">
                    <Th>Received</Th>
                    <Th>File</Th>
                    <Th>Type</Th>
                    <Th>Gateway</Th>
                    <Th>Node</Th>
                    <Th>Outcome</Th>
                    <Th className="text-right">Rows</Th>
                    <Th className="text-right">Stored</Th>
                    <Th className="text-right">Repeats</Th>
                    <Th>Detail</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((f) => (
                    <tr key={f.id} className="border-b border-slate-100 last:border-0 align-top">
                      <td className="whitespace-nowrap px-4 py-3 text-[0.75rem] text-slate-500">
                        {formatDateTime(f.receivedAt)}
                      </td>
                      <td className="max-w-[320px] px-4 py-3">
                        <span className="block truncate font-mono text-[0.75rem] text-slate-800" title={f.fileName}>
                          {f.fileName}
                        </span>
                        <span className="text-[0.6875rem] text-slate-400">{bytes(f.sizeBytes)}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{f.fileType}</td>
                      <td className="px-4 py-3 font-mono text-[0.75rem]">
                        {f.gatewayId !== null ? (
                          <Link href={`/gateways/${f.gatewayId}`} className="text-slate-800 underline-offset-2 hover:underline">
                            {f.gatewayKey}
                          </Link>
                        ) : (
                          <span className="text-slate-700">{f.gatewayKey ?? "—"}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-[0.75rem] text-slate-600">{f.nodeKey ?? "—"}</td>
                      <td className="px-4 py-3">
                        <StatusBadge label={STATUS_LABEL[f.status]} tone={STATUS_TONE[f.status]} />
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[0.75rem] tabular-nums text-slate-600">{f.rowsTotal}</td>
                      <td className="px-4 py-3 text-right font-mono text-[0.75rem] tabular-nums text-slate-600">{f.rowsStored}</td>
                      <td className="px-4 py-3 text-right font-mono text-[0.75rem] tabular-nums text-slate-500">{f.rowsDuplicate}</td>
                      <td className="max-w-[360px] px-4 py-3 text-[0.75rem] text-slate-600">
                        {/* The error for a failed file; the notes for a processed one. */}
                        <span className="line-clamp-3" title={f.error ?? undefined}>{f.error ?? "—"}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {data.totalPages > 1 && (
              <div className="flex items-center justify-between text-[0.8125rem] text-slate-600">
                <span>
                  Page {data.page} of {data.totalPages} · {data.total} files
                </span>
                <span className="flex gap-2">
                  <button type="button" className="underline-offset-2 hover:underline disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    Previous
                  </button>
                  <button type="button" className="underline-offset-2 hover:underline disabled:opacity-40" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>
                    Next
                  </button>
                </span>
              </div>
            )}
          </>
        )}
      </QueryState>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th scope="col" className={`px-4 py-2.5 font-mono text-[0.75rem] font-medium text-slate-500 ${className}`}>
      {children}
    </th>
  );
}
