import Image from "next/image";

/**
 * Full-screen branded loading state.
 *
 * Shown while a route's server work resolves — the point at which the previous
 * page has gone and the next one has not arrived. Without something here the
 * window is simply blank, which reads as a broken page rather than a busy one.
 *
 * The company mark is the whole point: it says the wait belongs to this
 * product. The bar beneath it is INDETERMINATE, because a route transition does
 * not report how far along it is and a bar filling to 70% would be inventing
 * progress the same way an invented sensor reading would.
 */
export function BrandLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="bg-sheet fixed inset-0 z-50 flex flex-col items-center justify-center gap-7"
    >
      <span className="sr-only">{label}</span>

      {/* The mark breathes rather than spins: a logo rotating on its own axis
          reads as a novelty, a slow pulse reads as waiting. */}
      <Image
        src="/brand/company-logo.png"
        alt="Cloudglance Sensinglab Pvt Ltd"
        width={599}
        height={126}
        priority
        className="brand-loader-mark h-10 w-auto sm:h-12"
      />

      <div className="w-56 max-w-[70vw]">
        <div className="mo-progress-track !static h-[3px] w-full rounded-full">
          <span className="rounded-full" />
        </div>
        <p
          aria-hidden="true"
          className="mt-3 text-center font-mono text-[11px] tracking-[0.14em] text-sheet-ink/45"
        >
          {label.toUpperCase()}
        </p>
      </div>
    </div>
  );
}
