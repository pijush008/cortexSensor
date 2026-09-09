"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  Location,
  Structure,
  StructureListResponse,
} from "@/types";

/**
 * Structures and locations.
 *
 * As with the other read hooks, errors are deliberately NOT swallowed: the UI
 * must be able to distinguish "this project has no structures yet" from "we
 * could not reach the server", and only a real rejection lets <QueryState />
 * render the difference.
 */

export function useStructures(params?: {
  projectId?: number;
  search?: string;
  status?: string;
  type?: string;
}) {
  return useQuery({
    queryKey: ["structures", params ?? {}],
    queryFn: async () => {
      const { data } = await api.get<StructureListResponse>("/structures", {
        params: { limit: 100, ...params },
      });
      return data;
    },
  });
}

export function useStructure(id: number | null) {
  return useQuery({
    queryKey: ["structure", id],
    queryFn: async () => {
      const { data } = await api.get<{ data: Structure }>(`/structures/${id}`);
      return data.data;
    },
    enabled: id !== null && Number.isFinite(id),
  });
}

export function useLocations(structureId: number | null) {
  return useQuery({
    queryKey: ["locations", structureId],
    queryFn: async () => {
      const { data } = await api.get<{ data: Location[] }>(
        `/structures/${structureId}/locations`,
      );
      return data.data;
    },
    enabled: structureId !== null && Number.isFinite(structureId),
  });
}

/** Field-level errors from the API, keyed by field name, for form display. */
export interface FieldError {
  field: string;
  message: string;
}

export function extractFieldErrors(error: unknown): Record<string, string> {
  const response = (error as { response?: { data?: { fields?: FieldError[] } } })
    ?.response?.data?.fields;
  if (!Array.isArray(response)) return {};
  return Object.fromEntries(response.map((f) => [f.field, f.message]));
}

export function useCreateStructure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Record<string, unknown>) => {
      const { data } = await api.post<{ data: Structure }>("/structures", input);
      return data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["structures"] });
    },
  });
}

export function useCreateLocation(structureId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Record<string, unknown>) => {
      const { data } = await api.post<{ data: Location }>(
        `/structures/${structureId}/locations`,
        input,
      );
      return data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["locations", structureId] });
      void qc.invalidateQueries({ queryKey: ["structure", structureId] });
    },
  });
}

export function useDeleteLocation(structureId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (locationId: number) => {
      await api.delete(`/locations/${locationId}`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["locations", structureId] });
      void qc.invalidateQueries({ queryKey: ["structure", structureId] });
    },
  });
}
