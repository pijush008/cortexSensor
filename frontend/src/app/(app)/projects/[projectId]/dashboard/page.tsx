"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  Pause,
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
import { useIsViewer } from "@/hooks/use-role";
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

/** "Ravi Kumar", or null when the slot is unfilled. */
function personName(
  first?: string | null,
  last?: string | null,
): string | null {
  const name = `${first ?? ""} ${last ?? ""}`.trim();
  return name || null;
}

export default function ProjectDashboardPage() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { userId, userType } = useAuthStore();

  // This screen is charts and live readings, which a self-service viewer does
  // not get. The button into it is already hidden and the API refuses the data,
  // but the URL is guessable, so the page turns such a session around itself
  // rather than rendering an armature of empty panels.
  const isViewer = useIsViewer();
  useEffect(() => {
    if (isViewer) router.replace(`/projects/${params?.projectId ?? ""}`);
  }, [isViewer, router, params?.projectId]);

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

  const [statusError, setStatusError] = useState<string | null>(null);

  const setStatus = useMutation({
    // PATCH /projectStatus was a 404: no such route has ever existed, and the
    // mutation had no onError, so every press of Start and Pause failed
    // silently and the screen simply refetched. The real endpoint is the one
    // the projects list uses.
    mutationFn: async (next: "start" | "pause" | "end") => {
      await api.get(`/projectStart/${projectIdNum}`, {
        params: { statusType: next },
      });
    },
    onSuccess: () => {
      setStatusError(null);
      queryClient.invalidateQueries({ queryKey: ["project-dashboard"] });
      // The list's status column reads from a different query.
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    // The server enforces which transitions are legal and says why one is not;
    // showing that is the whole difference between a button that works and a
    // button that appears to.
    onError: (err) => setStatusError(describeError(err).description),
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
  //
  // The name is carried alongside the image so the emblem can say WHO it is.
  // A row of three unlabelled logos asks the reader to recognise companies they
  // may never have seen, and the initials fallback ("AD", "CO") is worse still
  // — it names the role and nothing else.
  const emblems = [
    {
      src: d.adminImg,
      label: "Admin",
      name: personName(d.adminFirstName, d.adminLastName),
    },
    {
      src: d.contractorImg,
      label: "Contractor",
      name: personName(d.contractorFirstName, d.contractorLastName),
    },
    {
      src: d.authorityImg,
      label: "Authority",
      name: personName(d.authorityFirstName, d.authorityLastName),
    },
  ];

  const running = d.projectStatus === "start";
  const finished = d.projectStatus === "end";
  const paused = d.projectStatus === "pause";
  const notStarted = d.projectStatus === "not_start";
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
          {/* The device check-in badge that used to sit here has been removed at
              the owner's request: beside the admin, contractor and authority
              logos it read as a fourth stakeholder rather than as hardware
              status. Gateway liveness is still shown on the operations
              dashboard's "Gateway nodes" panel, which is where it belongs. */}
          {emblems.map((e) => {
            // "Contractor — Acme Infra", or just "Contractor" where the slot is
            // empty. The title is what a reader gets on hover for a logo they
            // do not recognise.
            const title = e.name ? `${e.label} — ${e.name}` : e.label;
            return (
              <span key={e.label} className={styles.emblemSlot} title={title}>
                {e.src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={e.src} alt={title} className={styles.emblem} />
                ) : (
                  <span
                    className={`${styles.emblem} ${styles.emblemFallback}`}
                    aria-label={title}
                  >
                    {/* Initials of the PERSON where there is one; the role's
                        first two letters only when the slot is unfilled. */}
                    {e.name
                      ? e.name
                          .split(/\s+/)
                          .slice(0, 2)
                          .map((w) => w[0])
                          .join("")
                          .toUpperCase()
                      : e.label.slice(0, 2).toUpperCase()}
                  </span>
                )}
                <span className={styles.emblemCaption}>{e.label}</span>
              </span>
            );
          })}

          {/* Enabled exactly where the server allows the move, so the screen
              stops offering transitions the API refuses:
                not_start -> start
                start     -> pause, end
                pause     -> start (resume), end
                end       -> pause (reopen)  */}
          <button
            type="button"
            className={styles.runBtn}
            aria-label={paused ? "Resume project" : "Start project"}
            title={paused ? "Resume project" : "Start project"}
            disabled={!(notStarted || paused) || setStatus.isPending}
            onClick={() => setStatus.mutate("start")}
          >
            <Play size={18} fill="currentColor" />
          </button>
          <button
            type="button"
            className={styles.stopBtn}
            aria-label={finished ? "Reopen project" : "Pause project"}
            title={finished ? "Reopen project" : "Pause project"}
            disabled={!(running || finished) || setStatus.isPending}
            onClick={() => setStatus.mutate("pause")}
          >
            {/* A pause icon for a pause action; this was a stop square. */}
            <Pause size={16} fill="currentColor" />
          </button>
          <button
            type="button"
            className={styles.endBtn}
            aria-label="End project"
            title="End project"
            disabled={!(running || paused) || setStatus.isPending}
            onClick={() => {
              // Ending releases the device and emails the stakeholders, and the
              // only way back is a reopen that lands paused with no hardware.
              // Worth one question first.
              if (
                window.confirm(
                  "End this project? Its device is released and the stakeholders are notified. You can reopen it later, but it will come back paused and without a device.",
                )
              ) {
                setStatus.mutate("end");
              }
            }}
          >
            <Square size={16} fill="currentColor" />
          </button>
        </div>
      </header>

      {/* The server decides which transitions are legal and explains a refusal;
          without this the button simply appeared not to work. */}
      {statusError && (
        <div role="alert" className={styles.statusError}>
          {statusError}
        </div>
      )}

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

            <div className="-mx-1 overflow-x-auto px-1">
              {/* A data table sets its own minimum width; without this
                  the columns would widen the whole page on a phone. */}
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
