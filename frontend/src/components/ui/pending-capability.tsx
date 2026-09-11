import type { LucideIcon } from "lucide-react";
import { Lock } from "lucide-react";

/**
 * Renders a capability that the platform does not yet provide.
 *
 * This component exists because the alternative is worse. These screens
 * previously rendered hardcoded arrays — invented modal frequencies, invented
 * FFT peaks, invented gateway battery levels, invented audit entries with
 * fabricated actor emails and source IPs — presented in the UI as if they were
 * measurements taken from real structures.
 *
 * For a platform that monitors bridges and dams, a plausible-looking number
 * that is not a measurement is the most dangerous thing the interface can draw.
 * An engineer cannot tell an invented 3.42 Hz from a measured one, and every
 * downstream decision inherits that error.
 *
 * So the rule is: state plainly that the capability is not available, name the
 * domain model it depends on, and show nothing that could be mistaken for data.
 */

export interface PendingCapabilityProps {
  /** What this screen will show once the capability exists. */
  summary: string;
  /**
   * Domain entities this capability requires which do not yet exist in the
   * schema. Naming them makes the dependency chain legible instead of implying
   * the feature is merely unfinished UI.
   */
  requires: string[];
  /** Short note on where this lands in the build sequence. */
  plannedIn?: string;
  icon?: LucideIcon;
}

export function PendingCapability({
  summary,
  requires,
  plannedIn,
  icon: Icon = Lock,
}: PendingCapabilityProps) {
  return (
    <section
      aria-labelledby="pending-capability-heading"
      className="rounded-xl border border-slate-200/90 bg-white"
    >
      <div className="flex items-start gap-4 border-b border-slate-100 px-6 py-5">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-400">
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <h2
            id="pending-capability-heading"
            className="text-[0.9375rem] font-semibold tracking-tight text-slate-900"
          >
            Not available yet
          </h2>
          <p className="mt-1 max-w-2xl text-[0.8125rem] leading-relaxed text-slate-500">
            {summary}
          </p>
        </div>
      </div>

      <div className="grid gap-x-10 gap-y-6 px-6 py-5 sm:grid-cols-2">
        <div>
          <p className="font-mono text-[0.625rem] font-semibold uppercase tracking-[0.22em] text-slate-400">
            Requires
          </p>
          <ul className="mt-3 space-y-2">
            {requires.map((item) => (
              <li
                key={item}
                className="flex items-baseline gap-2.5 text-[0.8125rem] text-slate-600"
              >
                <span
                  aria-hidden
                  className="h-1 w-1 shrink-0 translate-y-[-2px] rounded-full bg-slate-300"
                />
                <span className="font-mono text-[0.75rem]">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="font-mono text-[0.625rem] font-semibold uppercase tracking-[0.22em] text-slate-400">
            Why this is blank
          </p>
          <p className="mt-3 max-w-sm text-[0.8125rem] leading-relaxed text-slate-600">
            This screen shows no data rather than sample data. Displaying
            representative values here would be indistinguishable from real
            measurements once the platform is monitoring live structures.
          </p>
          {plannedIn && (
            <p className="mt-3 text-[0.75rem] leading-relaxed text-slate-400">
              {plannedIn}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
