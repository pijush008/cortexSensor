import { describe, expect, it } from "vitest";
import {
  RESTRICTED_ROLES,
  ROLES_WITH_DENIALS,
  homeForRole,
  roleMayOpen,
} from "@/middleware";

/**
 * Which pages the server will serve to each role.
 *
 * Enforced in middleware rather than only in the client's RoleGuard, because a
 * client guard lives in whatever JavaScript bundle the browser is running: a
 * tab opened before a deploy keeps the OLD guard until it is reloaded, and the
 * page is served to it regardless. Deciding before the page is served takes the
 * browser's cached copy out of the question.
 */

const ADMIN_ONLY = ["/users", "/audit"];
const OPERATIONS = ["/dashboard", "/alerts"];
const FLEET = ["/gateways", "/devices", "/sensors", "/mqtt"];

describe("the redirect invariant", () => {
  it("sends every restricted role somewhere it is allowed to be", () => {
    // The property that, when violated, produces an infinite redirect and a
    // permanently blank application. Asserted for every role rather than spot
    // checked, so adding a role cannot quietly reintroduce it.
    for (const role of RESTRICTED_ROLES) {
      const home = homeForRole(role);
      expect(roleMayOpen(role, home), `${role} -> ${home}`).toBe(true);
    }
  });
});

describe("contractor", () => {
  it("keeps the project workspace", () => {
    for (const p of ["/projects", "/projects/1804", "/structures", "/reports"]) {
      expect(roleMayOpen("contractor", p), p).toBe(true);
    }
  });

  it("cannot open operations, fleet or administration", () => {
    for (const p of [...OPERATIONS, ...FLEET, ...ADMIN_ONLY]) {
      expect(roleMayOpen("contractor", p), p).toBe(false);
    }
  });
});

describe("authority", () => {
  it("keeps projects and reports", () => {
    for (const p of ["/projects", "/projects/1804", "/reports"]) {
      expect(roleMayOpen("authority", p), p).toBe(true);
    }
  });

  it("cannot open operations, fleet, administration or structures", () => {
    for (const p of [...OPERATIONS, ...FLEET, ...ADMIN_ONLY, "/structures"]) {
      expect(roleMayOpen("authority", p), p).toBe(false);
    }
  });
});

describe("viewer", () => {
  it("gets the directory and one project's summary, nothing deeper", () => {
    expect(roleMayOpen("viewer", "/projects")).toBe(true);
    expect(roleMayOpen("viewer", "/projects/1804")).toBe(true);
    // Anchored deliberately: the summary matches, the charts below it do not.
    expect(roleMayOpen("viewer", "/projects/1804/dashboard")).toBe(false);
    expect(roleMayOpen("viewer", "/reports")).toBe(false);
    expect(roleMayOpen("viewer", "/structures")).toBe(false);
  });
});

describe("an organization admin", () => {
  /**
   * Admins reach nearly everything, so the exception is expressed as a DENY
   * rather than by listing every page they may open — an allowlist would have
   * to be revisited on every new route, and forgetting would lock admins out
   * of it silently.
   */
  it("cannot open structures", () => {
    expect(roleMayOpen("admin", "/structures")).toBe(false);
    expect(roleMayOpen("admin", "/structures/42")).toBe(false);
  });

  it("still reaches the rest of the console", () => {
    for (const p of [
      "/dashboard",
      "/alerts",
      "/gateways",
      "/devices",
      "/sensors",
      "/mqtt",
      "/projects",
      "/reports",
      "/users",
      "/audit",
      "/subscription",
      "/data-download",
    ]) {
      expect(roleMayOpen("admin", p), p).toBe(true);
    }
  });

  it("is still sent somewhere it can actually go", () => {
    // The redirect invariant, checked for a denied role too: an admin bounced
    // off /structures must land on a page that opens.
    const home = homeForRole("admin");
    expect(roleMayOpen("admin", home)).toBe(true);
  });

  it("a route added later stays open to admins by default", () => {
    // The point of a deny list: new pages are not accidentally withheld.
    expect(roleMayOpen("admin", "/something-added-later")).toBe(true);
  });
});

describe("denials do not leak between roles", () => {
  it("leaves structures open to a contractor", () => {
    // The denial is scoped to admin; contractors still work in structures.
    expect(roleMayOpen("contractor", "/structures")).toBe(true);
  });

  it("leaves structures open to a platform operator", () => {
    expect(roleMayOpen("superadmin", "/structures")).toBe(true);
  });

  it("names exactly the roles that carry a denial", () => {
    expect(ROLES_WITH_DENIALS).toEqual(["admin"]);
  });
});

describe("unrestricted roles", () => {
  it("leaves superadmin and admin to the backend's own checks", () => {
    for (const role of ["superadmin", "admin"]) {
      for (const p of [...OPERATIONS, ...FLEET, ...ADMIN_ONLY, "/projects"]) {
        expect(roleMayOpen(role, p), `${role} ${p}`).toBe(true);
      }
      expect(homeForRole(role)).toBe("/dashboard");
    }
    // Structures is deliberately absent above: an admin is denied it, so it is
    // covered by its own test rather than lumped in with the open routes.
  });
});

describe("every restricted role", () => {
  it("can always reach its own account pages", () => {
    // Owning an account is not the same as having access to data; someone must
    // still be able to correct their profile and sign out.
    for (const role of RESTRICTED_ROLES) {
      expect(roleMayOpen(role, "/profile"), role).toBe(true);
      expect(roleMayOpen(role, "/settings"), role).toBe(true);
    }
  });

  it("is an allowlist, so an unknown future route is closed", () => {
    for (const role of RESTRICTED_ROLES) {
      expect(roleMayOpen(role, "/something-added-later"), role).toBe(false);
    }
  });
});
