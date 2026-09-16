/**
 * The homepage's section links, shared by the desktop row in `page.tsx` (a
 * server component) and the mobile disclosure in `mobile-nav.tsx` (a client
 * one), so the two rows cannot drift apart.
 *
 * This lives in its own module rather than in `mobile-nav.tsx` on purpose:
 * every export of a `"use client"` module is replaced by a client reference
 * when a server component imports it, so the array arrived on the server as a
 * proxy and `NAV_ITEMS.map` threw. Plain data crossing that boundary has to
 * come from a module that is not itself marked as client code.
 */
export const NAV_ITEMS = [
  { label: "Platform", href: "#platform" },
  { label: "Architecture", href: "#architecture" },
  { label: "Modules", href: "#modules" },
] as const;
