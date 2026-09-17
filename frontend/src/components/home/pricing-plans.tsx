"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Motion } from "@/components/ui/motion";
import { api } from "@/lib/api";
import advertised from "./advertised-plans.json";

/** What /billing/plans returns per plan; the fields the cards use. */
interface OfferedPlan {
  code: string;
  name: string;
  priceLabel: string;
  tagline: string;
  highlights: string[];
}

/**
 * The plan cards on the public page.
 *
 * The cards are rendered from the same catalog the sign-up form and the
 * subscription page use, so a visitor, a new customer and a paying admin all
 * see the same plans at the same prices with the same bullets. A price typed
 * into this file would drift from the row billing charges against; a price
 * read from it cannot.
 *
 * The page is static, so it first renders the advertised copy in
 * advertised-plans.json and swaps in the live catalog once it arrives. The two
 * are held identical by a backend test against the seed, so the swap is
 * invisible unless the operator has changed a plan since the last deploy —
 * exactly the case in which the live figure should win.
 */
export function PricingPlans() {
  const [plans, setPlans] = useState<OfferedPlan[]>(advertised);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ plans: OfferedPlan[] }>("/billing/plans")
      .then(({ data }) => {
        if (!cancelled && Array.isArray(data.plans) && data.plans.length > 0) {
          setPlans(data.plans);
        }
      })
      .catch(() => {
        // The API being unreachable is not a reason to show no prices.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    /* Capped in width: two cards stretched across a three-column grid read as
       a row with something missing from it. */
    <div className="mx-auto grid max-w-3xl gap-5 sm:grid-cols-2">
      {plans.map((plan, i) => {
        const featured = plan.code === "professional";
        return (
          <Motion key={plan.code} variant="ink" index={i}>
            <div
              className={`relative flex h-full flex-col rounded-xl border bg-white p-6 ${
                featured
                  ? "border-shm-navy-500 shadow-[0_0_0_1px_rgba(17,17,17,0.25),0_20px_60px_-20px_rgba(17,17,17,0.35)]"
                  : "border-sheet-ink/15 shadow-[0_1px_2px_rgba(17,17,17,0.04)]"
              }`}
            >
              {featured && (
                <span className="absolute -top-3 left-6 rounded-full bg-sheet-ink px-3 py-1 font-mono text-label font-semibold uppercase tracking-[0.18em] text-white">
                  Most deployed
                </span>
              )}
              <div className="flex items-baseline justify-between">
                <h3 className="text-lead font-semibold tracking-tight text-sheet-ink">
                  {plan.name}
                </h3>
                <span className="font-mono text-label uppercase tracking-[0.18em] text-sheet-ink/45">
                  TIER 0{i + 1}
                </span>
              </div>
              <p className="mt-1 text-caption text-sheet-ink/55">{plan.tagline}</p>
              <div className="mt-5 flex items-baseline gap-1">
                <span className="text-3xl font-semibold tracking-tight text-sheet-ink">
                  {plan.priceLabel}
                </span>
                <span className="text-label text-sheet-ink/45">/month</span>
              </div>
              <ul className="mt-5 flex-1 space-y-2 border-t border-sheet-ink/10 pt-5">
                {plan.highlights.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-2 text-caption text-sheet-ink/70"
                  >
                    <CheckMark />
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/login" className="mt-6">
                {/* The same forward chevron the hero and closing CTAs carry.
                    Every primary action on the page now signals "this moves
                    you onward" the same way; without it these read as a
                    different KIND of control from the one in the hero. */}
                <Button
                  className={`w-full ${
                    featured
                      ? // Dark plate inverts to light. On a white card a
                        // white button would vanish, so it gains a 2px
                        // outline — drawn INSET, because a real border
                        // would resize the button under the cursor.
                        "hover:bg-sheet-paper hover:text-shm-navy-800 hover:shadow-[inset_0_0_0_2px_var(--color-shm-navy-800)]"
                      : // Light plate inverts to dark. The resting hover
                        // was sheet-ink at 15% — a grey barely separable
                        // from the resting grey, with the label unchanged.
                        "bg-slate-100 text-slate-800 hover:bg-shm-navy-800 hover:text-white"
                  }`}
                >
                  Get started
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </Motion>
        );
      })}
    </div>
  );
}

function CheckMark() {
  return (
    <span className="mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-sheet-paper0/10 text-sheet-navy">
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </span>
  );
}
