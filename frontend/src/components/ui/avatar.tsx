"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The organization's logo, with a letter to fall back to.
 *
 * Every "avatar" in this app used to be a coloured box holding the first letter
 * of the role. That letter is still here and still does most of the work,
 * because the fallback is the common case rather than an edge one: organizations
 * created before logos existed, and those made by the seeds, have none.
 *
 * `onError` matters as much as the missing-src case. Uploads live on a bind
 * mount with no named volume, so a file can disappear while the row that names
 * it survives — and without this the header would show a broken-image glyph on
 * every page of the app.
 */

const SIZES = {
  sm: "h-7 w-7 rounded-md text-xs",
  lg: "h-16 w-16 rounded-full text-xl",
} as const;

interface AvatarProps {
  /** Relative path from the API, e.g. /api/uploads/tenants/x.png. */
  src?: string | null;
  /** Organization name, used for the alt text. */
  name?: string | null;
  /** Shown when there is no logo, or it fails to load. */
  fallback?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}

export function Avatar({
  src,
  name,
  fallback,
  size = "sm",
  className,
}: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden font-semibold uppercase",
        SIZES[size],
        // The tile is neutral behind a logo and branded behind a letter: a
        // wordmark on a dark navy square is usually unreadable.
        showImage
          ? "border border-slate-200 bg-white"
          : "bg-shm-navy-700 text-white",
        className,
      )}
    >
      {showImage ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={src as string}
          // `contain`, not `cover`. A company logo is usually a wide wordmark
          // with margin built in, and cover would crop the ends off it.
          className="h-full w-full object-contain p-0.5"
          alt={name ? `${name} logo` : ""}
          onError={() => setFailed(true)}
        />
      ) : (
        (fallback?.[0] ?? "U")
      )}
    </div>
  );
}
