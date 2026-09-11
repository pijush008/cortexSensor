"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface ProjectEmail {
  id: number;
  email: string;
  name: string | null;
  isEnable: boolean;
  projectId: number;
}

/** Who is emailed when a reading on this project crosses a limit. */
export function useProjectEmails(uniqueId: string | null | undefined) {
  return useQuery({
    queryKey: ["project-emails", uniqueId],
    queryFn: async () => {
      const { data } = await api.get<{ data: ProjectEmail[] }>(
        `/getEmailSetting/${uniqueId}`,
      );
      return data.data ?? [];
    },
    enabled: Boolean(uniqueId),
  });
}

export interface RecipientDraft {
  emailId?: number;
  email?: string;
  name?: string | null;
  isEnable: boolean;
}

/**
 * Saves the recipient list.
 *
 * The whole list is sent, not a delta: the server removes any stored row whose
 * id is absent, which is what makes removal work. An entry without an emailId
 * is a new address.
 */
export function useSaveProjectEmails(uniqueId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (emails: RecipientDraft[]) => {
      await api.patch("/emailSetting", { uniqueId, emails });
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["project-emails", uniqueId] }),
  });
}
