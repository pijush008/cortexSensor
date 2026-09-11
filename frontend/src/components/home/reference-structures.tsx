"use client";

import { REFERENCE_STRUCTURES } from "@/lib/reference-structures";
import { ComparativePlate } from "./comparative-plate";
import { Motion, Stagger } from "@/components/ui/motion";

/**
 * Four real structures, drawn to one scale on one ground line.
 *
 * The plate carries the argument; the notes beneath it carry the detail. Prose
 * claiming this platform "handles everything from historic trusses to the
 * world's highest rail arch" asks to be believed. A drawing where Howrah's
 * towers reach a fifth of the way up Chenab's deck shows it, and shows at the
 * same time that these are four different physical problems rather than four
 * instances of one.
 *
 * Nothing here is a customer claim. See lib/reference-structures.ts.
 */
export function ReferenceStructures() {
  return (
    <section id="structures" className="bg-sheet">
      <div className="rule-spectrum" aria-hidden="true" />
      <div className="mx-auto max-w-[92rem] px-5 py-20 sm:px-8 lg:py-28">
        <Motion variant="rise" className="grid gap-8 lg:grid-cols-[minmax(0,30rem)_1fr] lg:items-end">
          <h2 className="text-[1.875rem] font-bold leading-[1.08] tracking-[-0.028em] text-sheet-ink sm:text-[2.5rem]">
            Four structures.
            <br />
            One scale.
          </h2>
          <p className="max-w-[62ch] text-[1rem] leading-[1.65] text-sheet-ink/70 lg:justify-self-end lg:text-right">
            A rail arch in the Himalaya, a gravity dam on the Sutlej, a
            cable-stayed sea crossing, and a riveted cantilever from 1943. Drawn
            together, they stop being a list of bridges and become four
            different physical problems.
          </p>
        </Motion>

        {/* The plate scrolls rather than shrinks.
            At 390 px the four structures compress to about 80 px each and
            their names become unreadable — a comparison nobody can read is
            worse than one they have to pan. The negative margin lets it bleed
            to the screen edges on small viewports so the scroll is discoverable,
            and the page itself never scrolls sideways. */}
        <div className="-mx-5 mt-14 overflow-x-auto px-5 sm:-mx-8 sm:px-8 lg:mx-0 lg:px-0">
          <Motion variant="unroll" className="min-w-[1040px] lg:min-w-0">
            <ComparativePlate />
          </Motion>
        </div>
        <p className="mt-3 font-mono text-[0.6875rem] text-sheet-ink/45 lg:hidden">
          Scroll the drawing sideways to compare
        </p>

        <Stagger
          as="ul"
          variant="ink"
          step={80}
          className="mt-16 grid gap-x-10 gap-y-10 border-t border-sheet-ink/15 pt-10 sm:grid-cols-2 xl:grid-cols-4"
        >
          {REFERENCE_STRUCTURES.map((s) => (
            <li key={s.id}>
              <h3 className="text-[0.96875rem] font-semibold tracking-[-0.01em] text-sheet-ink">
                {s.name}
              </h3>
              <p className="mt-1 text-[0.78125rem] text-sheet-ink/55">{s.place}</p>

              <dl className="mt-4 space-y-1.5 border-t border-sheet-ink/12 pt-3">
                {s.dimensions.map((d) => (
                  <div key={d.label} className="flex items-baseline justify-between gap-3">
                    <dt className="text-[0.78125rem] text-sheet-ink/55">{d.label}</dt>
                    <dd className="font-mono text-[0.8125rem] font-medium tabular-nums text-sheet-ink">
                      {d.value}
                    </dd>
                  </div>
                ))}
              </dl>

              <p className="mt-4 text-[0.84375rem] leading-[1.6] text-sheet-ink/75">
                {s.question}
              </p>
            </li>
          ))}
        </Stagger>

        <p className="mt-12 max-w-[76ch] border-l-2 border-sheet-rust/60 pl-4 text-[0.8125rem] leading-[1.6] text-sheet-ink/55">
          Dimensions are published figures, shown to illustrate the classes of
          structure this platform is built for. These are not Cloudglance
          installations, and no monitoring data is shown for them.
        </p>
      </div>
      <div className="rule-spectrum" aria-hidden="true" />
    </section>
  );
}
