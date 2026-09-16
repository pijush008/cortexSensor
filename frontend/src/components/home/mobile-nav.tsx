"use client";

import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { NAV_ITEMS } from "@/components/home/nav-items";

/**
 * Section navigation for the homepage below the `md` breakpoint.
 *
 * The header's link row is `hidden md:flex`, which on a phone removed the only
 * way to reach Platform, Architecture and Modules and replaced it with nothing.
 * Hiding navigation is a legitimate response to a narrow viewport; hiding it
 * without a substitute is just losing it.
 */

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Escape closes, because a panel that covers the page needs a way out that
  // does not depend on hitting a small target.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        // 44px square: a header control is the one thing a thumb reaches for
        // first, and it should not be the hardest thing on the page to hit.
        className="-mr-2 flex h-11 w-11 items-center justify-center rounded-lg text-sheet-ink/70 transition-colors hover:bg-sheet-ink/5 hover:text-sheet-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sheet-rust"
        aria-expanded={open}
        aria-controls="home-mobile-nav"
        aria-label={open ? "Close menu" : "Open menu"}
      >
        {open ? (
          <X className="h-5 w-5" strokeWidth={1.75} />
        ) : (
          <Menu className="h-5 w-5" strokeWidth={1.75} />
        )}
      </button>

      <div
        id="home-mobile-nav"
        ref={panelRef}
        hidden={!open}
        // Solid, not translucent. At 95% white the hero headline still ghosted
        // through behind the links, and the backdrop-blur meant to hide it is a
        // GPU effect that silently does nothing where compositing is
        // unavailable. A navigation overlay gains nothing from transparency and
        // loses legibility to it.
        className="absolute inset-x-0 top-16 border-b border-sheet-ink/15 bg-white shadow-[0_12px_24px_-12px_rgba(17,17,17,0.25)]"
      >
        <ul className="mx-auto max-w-7xl px-4 py-2 sm:px-6">
          {NAV_ITEMS.map((item) => (
            <li key={item.label}>
              <a
                href={item.href}
                onClick={() => setOpen(false)}
                className="block border-b border-sheet-ink/10 py-3.5 text-body font-medium text-sheet-ink/70 transition-colors last:border-b-0 hover:text-sheet-ink"
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
