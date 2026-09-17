"use client";

import { Eye, Loader2, LogOut } from "lucide-react";
import { useMe } from "@/hooks/use-me";
import { useEndImpersonation } from "@/hooks/use-platform-user";

/**
 * Persistent notice that the console being shown belongs to someone else.
 *
 * Deliberately loud and never dismissible. An operator who forgets they are
 * inside a view-as session will read a customer's dashboard as their own, and
 * every mistaken conclusion after that follows from a page that looked normal.
 *
 * The state comes from GET /me — the same response that decides who the API
 * answers as — so the banner cannot disagree with the session it describes.
 */
export function ImpersonationBanner() {
  const me = useMe();
  const end = useEndImpersonation();

  const impersonation = me.data?.impersonation;
  if (!impersonation?.active) return null;

  const viewed = me.data?.user;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-amber-300 bg-amber-100 px-4 py-2 text-[0.8125rem] text-amber-950"
    >
      <Eye className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        Viewing as{" "}
        <strong className="font-semibold">
          {viewed ? `${viewed.firstName} ${viewed.lastName}`.trim() : "another user"}
        </strong>
        {viewed?.email ? ` (${viewed.email})` : ""}
        {impersonation.operator ? ` · opened by ${impersonation.operator.email}` : ""}
      </span>
      <span className="rounded border border-amber-400/70 bg-amber-50 px-1.5 py-0.5 text-[0.6875rem] font-medium uppercase tracking-wide">
        Read only
      </span>
      <button
        type="button"
        onClick={() => end.mutate()}
        disabled={end.isPending}
        className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-amber-950 px-2.5 py-1 text-[0.75rem] font-medium text-amber-50 transition-colors hover:bg-amber-900 disabled:opacity-60"
      >
        {end.isPending ? (
          <Loader2 className="mo-spin h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {end.isPending ? "Exiting…" : "Exit view-as"}
      </button>
    </div>
  );
}
