"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

/**
 * The session's identity and entitlements, as reported by the server.
 *
 * The client no longer infers what it may do from a role name; it asks. That
 * removes the drift that had an organization admin redirected away from a page
 * their permissions actually allowed.
 */
export interface SessionInfo {
  user: {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
    userType: string;
  };
  tenant: {
    id: number;
    publicId: string;
    name: string;
    slug: string;
    status: string;
  } | null;
  isPlatformAdmin: boolean;
  role: string | null;
  permissions: string[];
}

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const { data } = await api.get<{ data: SessionInfo }>("/me");
      return data.data;
    },
    // Entitlements change rarely; refetching them per navigation is waste.
    staleTime: 5 * 60_000,
    retry: false,
  });
}
