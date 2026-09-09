"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

/**
 * One user as a platform operator sees them.
 *
 * Everything here is read back from stored rows. The platform records writes
 * and session issuance; it does not record page views or reads, so this shows
 * what someone HAS DONE and never claims to show what they are looking at.
 */

export type SessionState = "active" | "revoked" | "rotated" | "expired";

export interface PlatformUserDetail {
  user: {
    id: number;
    firstName: string;
    lastName: string;
    emailId: string;
    phoneNo: string;
    userType: string;
    isPlatformAdmin: boolean;
    isMailVerified: boolean;
    isUserVerified: boolean;
    isActive: boolean;
    mfaEnabled: boolean;
    createdAt: string | null;
  };
  memberships: {
    tenantId: number;
    tenantName: string;
    tenantSlug: string;
    tenantStatus: string;
    role: string | null;
    membershipStatus: string;
  }[];
  permissions: string[];
  sessions: {
    id: number;
    familyId: string;
    createdAt: string;
    expiresAt: string;
    revokedAt: string | null;
    consumedAt: string | null;
    state: SessionState;
  }[];
  activity: {
    items: {
      id: number;
      action: string;
      entity: string;
      entityId: number | null;
      ipAddress: string | null;
      createdAt: string;
    }[];
    total: number;
  };
}

export function usePlatformUser(userId: number | null) {
  return useQuery({
    queryKey: ["platform-user", userId],
    enabled: userId !== null,
    queryFn: async () => {
      const { data } = await api.get<{ data: PlatformUserDetail }>(
        `/admin/users/${userId}`,
      );
      return data.data;
    },
    retry: false,
  });
}

export function useStartImpersonation() {
  return useMutation({
    mutationFn: async (userId: number) => {
      const { data } = await api.post<{
        data: { target: { emailId: string }; expiresAt: string; readOnly: boolean };
      }>("/admin/impersonation", { userId });
      return data.data;
    },
    onSuccess: () => {
      // A hard reload, not a router push. Every cached query in memory belongs
      // to the operator's own session; entering a view-as session changes who
      // the API answers as, so the safest thing is to start the app over rather
      // than reconcile two identities in one cache.
      window.location.href = "/dashboard";
    },
  });
}

export function useEndImpersonation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.delete("/admin/impersonation");
    },
    onSuccess: () => {
      qc.clear();
      // Same reasoning in reverse: the cache holds the viewed user's data.
      window.location.href = "/users";
    },
  });
}
