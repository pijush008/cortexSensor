import { describe, expect, it } from "vitest";
import {
  canAccessRoute,
  fallbackRouteFor,
  guardDecision,
  type SessionEntitlements,
} from "@/lib/rbac";

/**
 * Regression guard for the blank application.
 *
 * A self-service Google sign-in creates a real, authenticated user who belongs
 * to no organization and therefore holds no permissions. The route guard used
 * to answer every denial by redirecting to GUARD_FALLBACK and rendering null —
 * but that fallback is itself a permission-mapped route, so this session was
 * refused there too. It redirected to the page it had just refused, on every
 * render, showing an empty page indefinitely with no error and no way out.
 *
 * The invariant: the guard never sends a session somewhere that session cannot
 * go. When nowhere is reachable it must say so instead of redirecting.
 */

const noPermissions: SessionEntitlements = {
  isPlatformAdmin: false,
  permissions: [],
};

/** An organization member who may view projects and their data. */
const member: SessionEntitlements = {
  isPlatformAdmin: false,
  permissions: ["PROJECT_BROWSE", "PROJECT_VIEW"],
};

/** A self-service Google sign-up: the directory and nothing else. */
const viewer: SessionEntitlements = {
  isPlatformAdmin: false,
  permissions: ["PROJECT_BROWSE"],
};

const operator: SessionEntitlements = {
  isPlatformAdmin: true,
  permissions: [],
};

describe("guardDecision", () => {
  it("never redirects a session to a route it cannot reach", () => {
    // The property that was violated, stated directly.
    for (const session of [noPermissions, member, viewer, operator]) {
      for (const path of ["/dashboard", "/audit", "/users", "/subscription", "/projects"]) {
        if (guardDecision(session, path) === "redirect") {
          const target = fallbackRouteFor(session);
          expect(target).not.toBeNull();
          expect(canAccessRoute(session, target as string)).toBe(true);
        }
      }
    }
  });

  it("never loops when the session has no permissions", () => {
    // Previously "redirect" → /dashboard → denied → redirect → blank forever.
    // Now it resolves to the always-allowed /profile, so there is somewhere to
    // land. A suspended organization's member is the case that reaches here.
    expect(guardDecision(noPermissions, "/dashboard")).toBe("redirect");
    expect(fallbackRouteFor(noPermissions)).toBe("/profile");
  });

  it("blocks only when there is genuinely nowhere to send the session", () => {
    expect(guardDecision(null, "/dashboard")).toBe("blocked");
    expect(fallbackRouteFor(null)).toBeNull();
  });

  it("still lets a permitted session through", () => {
    expect(guardDecision(member, "/dashboard")).toBe("allow");
    expect(guardDecision(member, "/projects")).toBe("allow");
  });

  it("gives a viewer the project directory and nothing more", () => {
    // The whole point of splitting PROJECT_BROWSE from PROJECT_VIEW.
    expect(guardDecision(viewer, "/projects")).toBe("allow");
    expect(guardDecision(viewer, "/dashboard")).toBe("redirect");
    expect(guardDecision(viewer, "/alerts")).toBe("redirect");
    expect(guardDecision(viewer, "/data-download")).toBe("redirect");
  });

  it("sends a viewer to the directory, not to a page it cannot open", () => {
    // A constant "/dashboard" fallback would have looped here.
    expect(fallbackRouteFor(viewer)).toBe("/projects");
    expect(fallbackRouteFor(member)).toBe("/dashboard");
  });

  it("redirects a permitted session away from a page it may not see", () => {
    // PROJECT_VIEW does not grant the audit log, but /dashboard is reachable,
    // so bouncing there is safe and remains the behaviour.
    expect(guardDecision(member, "/audit")).toBe("redirect");
  });

  it("lets a platform operator everywhere", () => {
    expect(guardDecision(operator, "/audit")).toBe("allow");
    expect(guardDecision(operator, "/subscription")).toBe("allow");
  });

  it("keeps always-allowed routes reachable even with no permissions", () => {
    // Otherwise a blocked user could not even reach their own profile.
    expect(guardDecision(noPermissions, "/profile")).toBe("allow");
  });

  it("treats an absent session as not yet entitled, never as permitted", () => {
    expect(canAccessRoute(null, "/dashboard")).toBe(false);
  });
});
