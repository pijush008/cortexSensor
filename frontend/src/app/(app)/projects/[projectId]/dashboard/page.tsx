"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  MonitorSmartphone,
  Play,
  Square,
} from "lucide-react";

import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { api } from "@/lib/api";
import { describeError } from "@/lib/errors";
import { useProjects, useSensorTypes, useSensors } from "@/hooks/use-data";
import {
  useProjectDashboard,
  type DashboardChannel,
} from "@/hooks/use-project-dashboard";
import { useLiveStream } from "@/hooks/use-live-stream";
import { useAuthStore } from "@/stores/auth-store";
import type { Project, Sensor, SensorType } from "@/types";

import { ChannelCard } from "./channel-card";
import { AlertRecipients } from "./alert-recipients";
import { LiveVideoPanel, ProjectImagePanel } from "./media-panels";
import styles from "./legacy.module.css";

/**
 * The project dashboard, reproduced from the legacy Flutter screen.
 *
 * Deliberately NOT in the new console's visual language. This is the view field
 * teams already know, so its layout, colours and controls are carried across
 * from lib/screen/project_dashboard.dart rather than redesigned — the numbers
 * (758/310px panel, 500px cap, 250px graph, 300ms) and the palette come from
 * that source. The styling is confined to a CSS module so it cannot leak into
 * the rest of the app.
 *
 * Live readings are not invented. Until real telemetry arrives for a channel's
 * sensor the graph says "No Data Available" and the sensor value reads 0, which
 * is what the legacy screen does and what the data honestly supports.
 */

export default function ProjectDashboardPage() {
  const params = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();
  const { userId, userType } = useAuthStore();

  const adminId = userType === "superadmin" || !userType ? 0 : (userId ?? 0);
  const projectsQuery = useProjects(adminId);
  const projectIdNum = Number(params?.projectId);

  const project = (projectsQuery.data ?? []).find(
    (p: Project) => (p.projectId ?? p.id) === projectIdNum,
  );

  const dashboard = useProjectDashboard(project?.uniqueId);
  const { data: sensors = [] } = useSensors();
  const { data: sensorTypes = [] } = useSensorTypes();
  // One feed for every sensor on the tenant, so the ring buffer has to hold
  // enough for each channel to still have a trace after interleaving.
  const { events: liveEvents } = useLiveStream({ limit: 600 });

  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<DashboardChannel[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // ACTIVE channels only, however many there are — one card for one active
  // channel, four for four. The legacy screen filtered on activeStatus in both
  // the sensors table and the card row; its cap of three was a quirk of that
  // row's fixed layout, not a rule about the data.
  const channels = useMemo(
    () =>
      (dashboard.data?.deviceChannels ?? [])
        .filter((c) => c.activeStatus === "one")
        .sort((a, b) => Number(a.channelNumber) - Number(b.channelNumber)),
    [dashboard.data],
  );

  // Drafts mirror the server rows while not editing, so Cancel restores what
  // the server holds rather than whatever was typed before.
  useEffect(() => setDrafts(channels), [channels]);

  const sensorFor = (ch: DashboardChannel): Sensor | undefined =>
    ch.assignSensor
      ? sensors.find((s: Sensor) => String(s.sensorId) === String(ch.assignSensor))
      : undefined;

  const saveChannels = useMutation({
    mutationFn: async (rows: DashboardChannel[]) => {
      // One batched PATCH, matching channelUpdateSchema on the server: every
      // id is a string, and the trigger field is spelled triggeredValue there
      // even though the column is triggerValue.
      await api.patch("/channelList", {
        channelUpdate: rows.map((row) => ({
          channelId: String(row.id),
          sensorId: String(row.assignSensor ?? ""),
          sensorName: row.channelName ?? undefined,
          thresholdValue: row.thresholdValue,
          triggeredValue: row.triggerValue,
        })),
      });
    },
    onSuccess: () => {
      setEditing(false);
      setSaveError(null);
      queryClient.invalidateQueries({ queryKey: ["project-dashboard"] });
    },
    // Surfaced rather than swallowed: a silent failure here looks exactly like
    // a successful save until the page is reloaded.
    onError: (e) => {
      const d = describeError(e);
      setSaveError(`${d.title} — ${d.description}`);
    },
  });

  // Media changes go through the same PATCH the server authorizes per project:
  // the assigned contractor or an administrator.
  const saveMedia = useMutation({
    mutationFn: async (body: { dashImage?: string }) => {
      await api.patch(`/project/${projectIdNum}`, body);
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["project-dashboard"] }),
    onError: (e) => {
      const d = describeError(e);
      setUploadError(`${d.title} — ${d.description}`);
    },
  });

  const setStatus = useMutation({
    mutationFn: async (next: "start" | "pause") => {
      await api.patch(`/projectStatus/${projectIdNum}`, { status: next });
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["project-dashboard"] }),
  });

  if (projectsQuery.isLoading || dashboard.isLoading) return <LoadingState />;

  if (!project) {
    return (
      <EmptyState
        icon={FolderKanban}
        title="Project not found"
        description="It may have been removed, or the link may be out of date."
      />
    );
  }

  if (!project.uniqueId) {
    return (
      <EmptyState
        icon={FolderKanban}
        title="This project has no dashboard yet"
        description="A project needs a unique ID and an attached device before its dashboard can be shown."
      />
    );
  }

  const d = dashboard.data;
  if (!d) {
    return (
      <EmptyState
        icon={FolderKanban}
        title="Dashboard unavailable"
        description="The project could not be resolved from its unique ID."
      />
    );
  }

  // Admin, contractor, authority — the three parties to the project, in the
  // order the legacy ConImages row uses. The platform operator is deliberately
  // NOT among them: they are not a party to the work, and the legacy header
  // never showed them either.
  const emblems = [
    { src: d.adminImg, label: "Admin" },
    { src: d.contractorImg, label: "Contractor" },
    { src: d.authorityImg, label: "Authority" },
  ];

  const running = d.projectStatus === "start";
  const finished = d.projectStatus === "end";
  // Mirrors the server's rule so the control is not offered where the API
  // would refuse it. The API remains the enforcement point.
  const isAdmin = userType === "superadmin" || userType === "admin";
  const canUploadImage = isAdmin || (userId != null && d.contractorId === userId);
  const shown = channels;

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/company-logo.png" alt="Cloudglance Sensinglab Pvt Ltd" style={{ height: 38 }} />

        <div className={styles.headerIcons}>
          <span
            className={styles.deviceBadge}
            title={
              d.updateHeartBeat
                ? `Last check-in ${new Date(d.updateHeartBeat).toLocaleString()}`
                : "Never checked in"
            }
          >
            <MonitorSmartphone size={20} strokeWidth={1.75} />
            {/* Red when the device has never reported — the legacy screen's
                dot means "attention", not "connected". */}
            <span
              className={styles.deviceDot}
              style={{ background: d.updateHeartBeat ? "rgb(55,151,69)" : "rgb(175,0,0)" }}
            />
          </span>

          {emblems.map((e) =>
            e.src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={e.label} src={e.src} alt={e.label} className={styles.emblem} />
            ) : (
              <span
                key={e.label}
                className={`${styles.emblem} ${styles.emblemFallback}`}
                title={e.label}
              >
                {e.label.slice(0, 2).toUpperCase()}
              </span>
            ),
          )}

          <button
            type="button"
            className={styles.runBtn}
            aria-label="Start project"
            disabled={running || setStatus.isPending}
            onClick={() => setStatus.mutate("start")}
          >
            <Play size={18} fill="currentColor" />
          </button>
          <button
            type="button"
            className={styles.stopBtn}
            aria-label="Pause project"
            disabled={!running || setStatus.isPending}
            onClick={() => setStatus.mutate("pause")}
          >
            <Square size={16} fill="currentColor" />
          </button>
        </div>
      </header>

      <div className={styles.body}>
        {expanded && (
          <div className={styles.imagesCol}>
            {/* Upper: the site's live feed, replaced by a completion notice
                once the project has ended. Lower: the contractor's project
                image, which stays either way. */}
            <LiveVideoPanel url={d.liveVideoUrl} finished={finished} />
            <ProjectImagePanel
              src={d.dashImage ?? d.dashImage2}
              canUpload={canUploadImage}
              uploading={saveMedia.isPending}
              error={uploadError}
              onUpload={(dataUrl) => {
                setUploadError(null);
                saveMedia.mutate({ dashImage: dataUrl });
              }}
            />
          </div>
        )}

        <div className={styles.sensorsWrap}>
          <button
            type="button"
            className={styles.sideButton}
            aria-label={expanded ? "Collapse images" : "Expand images"}
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>

          <div
            className={`${styles.sensorsPanel} ${expanded ? "" : styles.sensorsPanelCollapsed}`}
          >
            <div className={styles.sensorsHead}>
              <span className={styles.sensorsTitle}>Sensors</span>
              <span className={styles.headActions}>
                {editing ? (
                  <>
                    <button
                      type="button"
                      className={`${styles.pill} ${styles.pillCancel}`}
                      onClick={() => {
                        setDrafts(channels);
                        setEditing(false);
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className={`${styles.pill} ${styles.pillDone}`}
                      disabled={saveChannels.isPending}
                      onClick={() => saveChannels.mutate(drafts)}
                    >
                      {saveChannels.isPending ? "Saving…" : "Done"}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className={`${styles.pill} ${styles.pillEdit}`}
                    onClick={() => setEditing(true)}
                  >
                    Edit
                  </button>
                )}
              </span>
            </div>

            {saveError && (
              <p role="alert" style={{ color: "rgb(175,0,0)", fontSize: 13, padding: "0 8px 8px" }}>
                {saveError}
              </p>
            )}

            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Channel</th>
                  <th>Sensor Name</th>
                  <th>Sensor Type</th>
                  <th>Threshold Value</th>
                  <th>Triggered Value</th>
                </tr>
              </thead>
              <tbody>
                {drafts.length === 0 ? (
                  <tr>
                    <td colSpan={5}>No channels on this device.</td>
                  </tr>
                ) : (
                  drafts.map((ch, i) => {
                    const sensor = sensorFor(ch);
                    return (
                      <tr key={ch.id}>
                        <td>CH {ch.channelNumber}</td>
                        <td>{ch.channelName ?? sensor?.sensorName ?? "—"}</td>
                        <td>{sensor?.sensorType ?? "—"}</td>
                        <td>
                          <input
                            className={styles.cellInput}
                            value={ch.thresholdValue ?? ""}
                            disabled={!editing}
                            aria-label={`Threshold for channel ${ch.channelNumber}`}
                            onChange={(e) =>
                              setDrafts((rows) =>
                                rows.map((r, j) =>
                                  j === i ? { ...r, thresholdValue: e.target.value } : r,
                                ),
                              )
                            }
                          />
                        </td>
                        <td>
                          <input
                            className={styles.cellInput}
                            value={ch.triggerValue ?? ""}
                            disabled={!editing}
                            aria-label={`Triggered for channel ${ch.channelNumber}`}
                            onChange={(e) =>
                              setDrafts((rows) =>
                                rows.map((r, j) =>
                                  j === i ? { ...r, triggerValue: e.target.value } : r,
                                ),
                              )
                            }
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <AlertRecipients uniqueId={d.uniqueId} canEdit={canUploadImage} />
        </div>
      </div>

      <div className={styles.channels}>
        {shown.length === 0 ? (
          <div className={styles.channelCard}>
            <span className={styles.graph}>No Sensors Available</span>
          </div>
        ) : (
          shown.map((ch, i) => {
            const sensor = sensorFor(ch);
            // The unit is a property of the sensor TYPE (uS for a load cell,
            // mm for an LVDT), not of the individual sensor row.
            const unit =
              sensorTypes.find((t: SensorType) => t.id === sensor?.sensorTypeID)
                ?.unit ?? "";
            return (
              <ChannelCard
                key={ch.id}
                index={i}
                channelNumber={ch.channelNumber}
                sensorId={ch.assignSensor}
                sensorName={ch.channelName ?? sensor?.sensorName ?? "Sensor"}
                unit={unit}
                thresholdValue={toNumber(ch.thresholdValue)}
                triggerValue={toNumber(ch.triggerValue)}
                events={liveEvents}
              />
            );
          })
        )}
      </div>
    </div>
  );
}



/** Numeric form of a channel bound, or null when it is unset or unparseable. */
function toNumber(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
