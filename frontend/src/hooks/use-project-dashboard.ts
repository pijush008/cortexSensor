"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

/** One channel of the device attached to the project. */
export interface DashboardChannel {
  id: number;
  deviceId: string;
  channelNumber: string;
  channelName: string | null;
  thresholdValue: string | null;
  triggerValue: string | null;
  /** Sensor id as a string, or null for an unassigned channel. */
  assignSensor: string | null;
  activeStatus: string;
}

export interface ProjectDashboard {
  projectId: number;
  uniqueId: string | null;
  projectName: string;
  projectStatus: string;
  projectUniqueID: string | null;
  channelCount: number;
  dashImage: string | null;
  dashImage2: string | null;
  /** Source for the live video panel, or null when no feed is configured. */
  liveVideoUrl: string | null;
  /** The user who may upload the project image, alongside administrators. */
  contractorId: number | null;
  adminImg: string | null;
  contractorImg: string | null;
  authorityImg: string | null;
  superAdminImage: string | null;
  deviceId: string | null;
  gatewayDeviceId: string | null;
  deviceName: string | null;
  projectLocation: string;
  /** Null when the device has never checked in. */
  updateHeartBeat: string | null;
  deviceChannels: DashboardChannel[];
}

/**
 * The project dashboard payload.
 *
 * Keyed on uniqueId rather than the numeric project id, because that is what
 * the endpoint resolves on. The caller holds the project row and passes its
 * uniqueId through; a project without one cannot be resolved at all, so the
 * query stays disabled rather than firing a request that is certain to 404.
 */
export function useProjectDashboard(uniqueId: string | null | undefined) {
  return useQuery({
    queryKey: ["project-dashboard", uniqueId],
    queryFn: async () => {
      const { data } = await api.get<{ projectDetail: ProjectDashboard[] }>(
        `/dashboard/${uniqueId}`,
      );
      // The endpoint wraps the single record in an array.
      return data.projectDetail?.[0] ?? null;
    },
    enabled: Boolean(uniqueId),
  });
}
