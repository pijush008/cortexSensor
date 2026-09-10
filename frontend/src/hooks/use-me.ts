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
    /**
     * Relative path to the organization's logo (/api/uploads/tenants/x.png),
     * or null. Relative on purpose — see toPublicImagePath on the server: an
     * absolute URL built from BASE_URL points at the backend's own port and
     * fails everywhere except a developer's own machine.
     */
    logoUrl: string | null;
  } | null;
  isPlatformAdmin: boolean;
  role: string | null;
  permissions: string[];
  /**
   * Null in an ordinary session. Set while a platform operator is viewing the
   * console as this user — reported by the server, because the banner warning
   * an operator that they are inside someone else's session must not depend on
   * client state that can go stale.
   */
  impersonation: {
    active: true;
    readOnly: true;
    operator: { id: number; name: string; email: string } | null;
  } | null;
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
