"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Filter state seeded from the URL.
 *
 * A stat tile on one page links to a filtered list on another — the dashboard's
 * "Running 2" goes to /projects?status=start — and the list has to arrive
 * already showing those records, or the drill-through has just dumped the user
 * on an unfiltered page to find them by hand.
 *
 * The value is validated against `allowed` rather than trusted: the query
 * string is user-editable, and an unrecognised value would otherwise filter the
 * list down to nothing with no way to tell why.
 *
 * The effect matters for the case where the route does NOT remount. Navigating
 * from /devices?status=active to /devices?status=inactive is the same route, so
 * React keeps the component mounted and a useState initialiser alone would hold
 * the stale value. Re-running only when the resolved param changes leaves a
 * filter the user picked by hand untouched.
 */
export function useParamFilter<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const params = useSearchParams();
  const raw = params.get(key);
  const resolved = (allowed as readonly string[]).includes(raw ?? "")
    ? (raw as T)
    : fallback;

  const [value, setValue] = useState<T>(resolved);
  useEffect(() => setValue(resolved), [resolved]);

  return [value, setValue];
}
