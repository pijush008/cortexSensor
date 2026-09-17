import { Loader2 } from "lucide-react";

/**
 * In-panel waiting state: a turning ring and a label.
 *
 * A ring that moves is the one signal every user reads as "working" without a
 * caption. It replaced three fading dots, which at 6px looked like a decoration
 * rather than activity.
 */
export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="flex h-48 flex-col items-center justify-center gap-4"
    >
      <Loader2
        className="mo-spin h-6 w-6 text-shm-navy-500"
        strokeWidth={2}
        aria-hidden="true"
      />
      <p className="font-mono text-[0.6875rem] uppercase tracking-[0.2em] text-slate-400">{label}</p>
    </div>
  );
}
