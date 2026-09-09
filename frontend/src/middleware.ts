import { NextRequest, NextResponse } from "next/server";

const ACCESS_COOKIE = "shm_access";
const PUBLIC_PATHS = new Set(["/login"]);
const HOME_PATH = "/dashboard";

// Coarse list of app route prefixes to protect (dynamic segments match by
// prefix). Everything else (assets, /login, /_next) is passed through.
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/analytics",
  "/alerts",
  "/gateways",
  "/devices",
  "/sensors",
  "/mqtt",
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

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

/**
 * Server-side route guard: redirects unauthenticated visitors away from
 * protected pages to /login. Role-based blocking stays on the client
 * (RoleGuard) since the role is stored in localStorage, not a cookie.
 * Authz is enforced authoritatively by the backend on every API call.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasAccess = request.cookies.has(ACCESS_COOKIE);

  if (PUBLIC_PATHS.has(pathname)) {
    if (hasAccess) return NextResponse.redirect(new URL(HOME_PATH, request.url));
    return NextResponse.next();
  }

  if (!hasAccess && isProtectedPath(pathname)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Protect everything except Next.js internals, API routes, and static assets.
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
