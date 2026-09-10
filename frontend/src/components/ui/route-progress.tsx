"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Progress indicator for navigations that leave this page.
 *
 * The console is a separate, heavier route: on a cold visit it authenticates,
 * fetches entitlements and compiles. Without feedback the button appears to do
 * nothing for a second or two, and people click it again.
 *
 * The bar is INDETERMINATE by design. A route transition does not report how
 * far along it is, so a bar that filled to 60% would be inventing progress —
 * the same rule the rest of this product follows about numbers it cannot
 * measure.
 */
export function useNavigateWithProgress() {
  const router = useRouter();
  const [pending, start] = useTransition();

  const navigate = (href: string) => {
    start(() => {
      router.push(href);
    });
  };

  return { navigate, pending };
}

/** The bar itself. Renders nothing unless a navigation is in flight. */
export function RouteProgress({ active }: { active: boolean }) {
  // Held briefly after completion so a fast transition still registers as
  // having happened, rather than flashing for one frame.
  const [visible, setVisible] = useState(active);

  useEffect(() => {
    if (active) {
      setVisible(true);
      return;
    }
    const t = setTimeout(() => setVisible(false), 220);
    return () => clearTimeout(t);
  }, [active]);

  if (!visible) return null;

  return (
    <div
      className="mo-progress-track"
      role="progressbar"
      aria-busy="true"
      aria-label="Loading"
    >
      <span />
    </div>
  );
}
