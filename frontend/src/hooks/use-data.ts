"use client";

import { useQuery } from "@tanstack/react-query";
import { api, type ApiResponse } from "@/lib/api";
import type {
  ChannelListResponse,
  ChannelListItem,
  DashboardStats,
  Device,
  DeviceType,
  GraphPoint,
  NodeData,
  Project,
  Sensor,
  SensorType,
} from "@/types";

/**
 * Read hooks for the monitoring API.
 *
 * These deliberately do NOT catch errors. They used to — every queryFn wrapped
 * its request in `try { ... } catch { return [] }` — which meant React Query
 * never saw a rejection, `isError` was permanently false, and a 500, a 403 and
 * an empty result were indistinguishable to the UI. Pages then papered over the
 * resulting blankness with hardcoded sample data.
 *
 * For a structural-monitoring product that is a correctness bug, not a styling
 * one: an operator must be able to tell "this structure reports no alerts" from
 * "we could not reach the server". Letting the rejection propagate is what makes
 * <QueryState /> able to show a real error state with a retry.
 */

/** Unwraps the API's `{ data: { currentData: T[] } }` pagination envelope. */
export function unwrapPaginated<T>(payload: unknown): T[] {
  const page = payload as { currentData?: T[] } | null | undefined;
  return page?.currentData ?? [];
}

export function useDevices() {
  return useQuery({
    queryKey: ["devices"],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<Device[]>>("/device", {
        params: { page: 1, limit: 100 },
      });
      return unwrapPaginated<Device>(data.data);
    },
  });
}

export function useSensors() {
  return useQuery({
    queryKey: ["sensors"],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<unknown>>("/sensor", {
        params: { page: 1, limit: 100 },
      });
      return unwrapPaginated<Sensor>(data.data);
    },
  });
}

export function useSensorTypes() {
  return useQuery({
    queryKey: ["sensorTypes"],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<SensorType[]>>("/sensorType");
      return (data.data as SensorType[]) ?? [];
    },
  });
}

export function useDeviceTypes() {
  return useQuery({
    queryKey: ["deviceTypes"],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<DeviceType[]>>("/deviceType");
      return (data.data as DeviceType[]) ?? [];
    },
  });
}

export function useProjects(adminId: number) {
  return useQuery({
    queryKey: ["projects", adminId],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<unknown>>(
        `/projects/${adminId}`,
      );
      return unwrapPaginated<Project>(data.projectDetail);
    },
    enabled: adminId !== null,
  });
}

export function useNodeData() {
  return useQuery({
    queryKey: ["nodeData"],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<NodeData[]>>("/beamNodeData");
      return (data.data as NodeData[]) ?? [];
    },
  });
}

export type { DashboardStats, GraphPoint };

export function useDashboardStats(userId: number | null, userType: string | null) {
  return useQuery({
    queryKey: ["dashboard", userId, userType],
    queryFn: async () => {
      const { data } = await api.post<ApiResponse<DashboardStats>>("/dashboard", {
        userId: String(userId),
        userType,
      });
      return data.data;
    },
    enabled: !!userId && !!userType,
  });
}

export function useChannels(deviceId: string) {
  return useQuery({
    queryKey: ["channels", deviceId],
    queryFn: async () => {
      const { data } = await api.get<ChannelListResponse>(
        `/channelList/${deviceId}`,
      );
      return {
        channels: (data.projectDetail?.currentData as ChannelListItem[]) ?? [],
        lastUpdateBy: data.lastUpdateBy ?? null,
        lastUpdateAt: data.lastUpdateAt ?? null,
      };
    },
    enabled: !!deviceId,
  });
}
