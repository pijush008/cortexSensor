import Link from "next/link";
import { Compass } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * 404 for any unmatched route.
 *
 * Deliberately does not assume the visitor is signed in — an unmatched URL is
 * just as likely to be reached from a stale bookmark or an external link, so it
 * offers both the dashboard and the sign-in page rather than pushing one.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400">
        <Compass className="h-6 w-6" strokeWidth={1.5} />
      </span>

      <p className="mt-4 font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
        Error 404
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
        This page doesn&apos;t exist
      </h1>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-slate-500">
        The link may be out of date, or the record it pointed to may have been
        removed.
      </p>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <Link href="/dashboard" className={cn(buttonVariants())}>
          Go to dashboard
        </Link>
        <Link
          href="/login"
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Sign in
        </Link>
      </div>
    </div>
  );
}
