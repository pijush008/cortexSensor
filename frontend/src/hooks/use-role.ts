"use client";

import { useAuthStore } from "@/stores/auth-store";
import { useMe } from "@/hooks/use-me";
import type { UserRole } from "@/types";

/**
 * The role of whoever the API is answering as.
 *
 * The SERVER's answer wins over the one cached in localStorage, for the same
 * reason the sidebar resolves it this way: localStorage holds whoever last
 * signed in on this browser, which after a role change, an account switch or a
 * view-as session is a different person than the API is serving.
 *
 * Reading the cached value alone silently disabled a permission gate: a viewer
 * whose browser still held an older `userType` was treated as that older role,
 * and screens meant to be hidden from them rendered in full. A gate that fails
 * open is worse than no gate, so this exists to make the safe source the easy
 * one to reach for.
 *
 * Falls back to the cached value only while /me is in flight, and then to
 * "viewer" — the LEAST privileged role — so an unknown session is never
 * mistaken for a privileged one.
 */
export function useRole(): UserRole {
  const { userType } = useAuthStore();
  const me = useMe();
  return (me.data?.user.userType as UserRole) ?? (userType as UserRole) ?? "viewer";
}

/** True when the session may only browse the project directory. */
export function useIsViewer(): boolean {
  return useRole() === "viewer";
}
