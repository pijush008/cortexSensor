"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useNavigateWithProgress } from "@/components/ui/route-progress";
import { BrandLoader } from "@/components/ui/brand-loader";

/**
 * The link into the console, with feedback while it loads.
 *
 * This is the one navigation on the page that is genuinely slow: the console is
 * a separate route that authenticates and fetches entitlements before it can
 * render. A plain <Link> looks inert for a second or two, and people click it
 * again. The button reports that it is working, and the branded loading screen
 * covers the window so the wait is unmistakably part of this product.
 */
export function ConsoleLink({
  children,
  ...props
}: Omit<ButtonProps, "loading" | "onClick">) {
  const { navigate, pending } = useNavigateWithProgress();

  // Portalled to <body>, not rendered in place.
  //
  // `position: fixed` resolves against the nearest ancestor with a transform,
  // and this button sits inside the hero's entrance animation — which is a
  // transform. Rendered in place the "full-screen" overlay was clipped into a
  // box a few hundred pixels wide, sitting under the headline. A portal is the
  // only way out of a transformed containing block.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <>
      {/* A full-screen branded wait, not a hairline bar. This navigation leaves
          the marketing page for the console, so the whole window is about to
          change; covering it states that plainly instead of leaving the old
          page sitting there looking unresponsive. */}
      {pending &&
        mounted &&
        createPortal(<BrandLoader label="Opening console" />, document.body)}
      <Button {...props} loading={pending} onClick={() => navigate("/login")}>
        {children}
        {/* The chevron is hidden while the spinner shows, so the button does
            not carry two competing indicators at once. */}
        {!pending && <ChevronRight className="h-4 w-4" />}
      </Button>
    </>
  );
}
