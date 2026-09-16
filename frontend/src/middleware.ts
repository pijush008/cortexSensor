import { NextRequest, NextResponse } from "next/server";

const ACCESS_COOKIE = "shm_access";
const PUBLIC_PATHS = new Set(["/login"]);
const HOME_PATH = "/dashboard";
// Coarse list of app route prefixes to protect (dynamic segments match by
// prefix). Everything else (assets, /login, /_next) is passed through.
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/alerts",
  "/gateways",
  "/devices",
  "/sensors",
  "/projects",
  "/structures",
  "/reports",
  "/exports",
  "/data-download",
  "/users",
  "/audit",
  "/subscription",
  "/profile",
  "/settings",
];

/** Everyone may reach their own account pages, whatever their role. */
const SELF_SERVICE = [/^\/profile(\/|$)/, /^\/settings(\/|$)/];

/**
 * What each restricted role may open.
 *
 * An ALLOWLIST per role, not a denylist: a route added next month is closed to
 * these roles until someone decides otherwise, rather than open until someone
 * remembers to close it.
 *
 * A role absent from this map is unrestricted here — superadmin and admin —
 * and is governed by the backend's own permission checks.
 *
 * `viewer` gets the project directory only. `contractor` and `authority` are
 * project stakeholders: they work inside projects, and the operations
 * dashboard, the alert queue, the hardware fleet and the administration screens
 * are not theirs. The project list already scopes each of them to their own
 * projects, so this narrows the console, not their data.
 */
/**
 * Routes a role may NOT open, for roles that are otherwise unrestricted.
 *
 * A deny list rather than an entry in ROLE_ALLOWED: an organization admin
 * reaches nearly every page, so expressing "everything except one" as an
 * allowlist would mean enumerating the whole console and revisiting it on every
 * new route. Here the exception stays one line, and a page added tomorrow is
 * open to admins by default — which is the correct default for that role.
 *
 * Checked BEFORE the allowlist, so a denial cannot be undone by one.
 */
const ROLE_DENIED: Record<string, RegExp[]> = {
  admin: [/^\/structures(\/|$)/],
};

const ROLE_ALLOWED: Record<string, RegExp[]> = {
  viewer: [/^\/projects$/, /^\/projects\/[^/]+$/, ...SELF_SERVICE],
  contractor: [
    /^\/projects(\/|$)/,
    /^\/structures(\/|$)/,
    /^\/reports(\/|$)/,
    ...SELF_SERVICE,
  ],
  authority: [/^\/projects(\/|$)/, /^\/reports(\/|$)/, ...SELF_SERVICE],
};

/**
 * Where each restricted role lands.
 *
 * MUST itself satisfy that role's allowlist. A home the role may not open is an
 * infinite redirect — the bug this file already carries scar tissue from — so
 * the pairing is asserted by test rather than trusted.
 */
const ROLE_HOME: Record<string, string> = {
  viewer: "/projects",
  contractor: "/projects",
  authority: "/projects",
};

/** Whether a role may open this page. Unlisted roles are unrestricted here. */
export function roleMayOpen(role: string, pathname: string): boolean {
  const denied = ROLE_DENIED[role];
  if (denied?.some((p) => p.test(pathname))) return false;

  const allowed = ROLE_ALLOWED[role];
  if (!allowed) return true;
  return allowed.some((p) => p.test(pathname));
}

/** Where this role is sent when it lands somewhere it may not be. */
export function homeForRole(role: string | null): string {
  return (role && ROLE_HOME[role]) || HOME_PATH;
}

/** Roles this file restricts — exported so the invariant can be tested. */
export const RESTRICTED_ROLES = Object.keys(ROLE_ALLOWED);

/** Roles with a deny list, exported for the same reason. */
export const ROLES_WITH_DENIALS = Object.keys(ROLE_DENIED);

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

/**
 * Short-lived cache of token → role.
 *
 * Without it every navigation costs a round trip to the API. The window is
 * deliberately small: a role change should take effect in seconds, not for the
 * life of the session.
 */
const roleCache = new Map<string, { role: string; at: number }>();
const ROLE_TTL_MS = 10_000;

/**
 * Where this server reaches the API, server-to-server.
 *
 * The SAME origin the rewrites use — deliberately not the request's own origin.
 * Calling back through the public hostname sends an internal lookup out to the
 * edge and back: slow, dependent on the proxy in front, and it simply times out
 * behind a tunnel, which silently disables the check this function exists for.
 */
function backendOrigin(): string {
  return process.env.BACKEND_ORIGIN ?? "http://localhost:3001";
}

async function roleForToken(token: string): Promise<string | null> {
  const cached = roleCache.get(token);
  if (cached && Date.now() - cached.at < ROLE_TTL_MS) return cached.role;

  try {
    // Aborted rather than allowed to hang: a slow or down API must not stall
    // every page load. On failure this returns null and the request proceeds to
    // the client guard, which is the behaviour that existed before.
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 1500);
    const res = await fetch(`${backendOrigin()}/api/me`, {
      headers: { cookie: `${ACCESS_COOKIE}=${token}` },
      signal: abort.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;

    const body = (await res.json()) as { data?: { user?: { userType?: string } } };
    const role = body?.data?.user?.userType;
    if (!role) return null;

    roleCache.set(token, { role, at: Date.now() });
    // Bounded, so a long-running server does not accumulate dead tokens.
    if (roleCache.size > 500) {
      for (const [k, v] of roleCache) {
        if (Date.now() - v.at > ROLE_TTL_MS) roleCache.delete(k);
      }
    }
    return role;
  } catch {
    return null;
  }
}

/**
 * Server-side route guard.
 *
 * Redirects unauthenticated visitors to /login, and confines a self-service
 * viewer to the project directory.
 *
 * The role check is here, not only in the client's RoleGuard, because a client
 * guard lives in the JavaScript bundle the browser happens to be running. A tab
 * opened before a deploy keeps the OLD guard until it is reloaded, so a gate
 * that exists only there is a gate the user can be looking straight past — which
 * is exactly what happened: the client redirect was correct and a stale bundle
 * kept serving the page anyway. Deciding before the page is served removes the
 * browser's cached copy from the question.
 *
 * The backend remains the authority on data; this decides which page is served.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  const hasAccess = Boolean(token);

  if (PUBLIC_PATHS.has(pathname)) {
    if (!hasAccess) return NextResponse.next();
    const role = await roleForToken(token as string);
    return NextResponse.redirect(new URL(homeForRole(role), request.url));
  }

  if (!hasAccess && isProtectedPath(pathname)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (hasAccess && isProtectedPath(pathname)) {
    const role = await roleForToken(token as string);
    if (role && !roleMayOpen(role, pathname)) {
      return NextResponse.redirect(new URL(homeForRole(role), request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Protect everything except Next.js internals, API routes, and static assets.
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
