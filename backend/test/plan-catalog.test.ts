import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BILLING_PLANS } from "../prisma/plans";
import { describePlan, formatPrice, planHighlights } from "../src/modules/billing/plan-catalog";

/**
 * The public pricing page renders advertised-plans.json until the live catalog
 * arrives. If that file and the seed disagree, a visitor sees one price and
 * the sign-up form charges another — so the two are held identical here, and
 * a change to either fails until the other follows.
 */
const ADVERTISED = join(
  __dirname, "..", "..", "frontend", "src", "components", "home", "advertised-plans.json",
);

const seeded = (code: string) => {
  const row = BILLING_PLANS.find((p) => p.code === code);
  if (!row) throw new Error(`no seeded plan ${code}`);
  return row;
};

describe("the plan catalog", () => {
  test("words a plan's bullets from its row", () => {
    expect(planHighlights(seeded("starter"))).toEqual([
      "Up to 3 structures",
      "Up to 20 sensors",
      "5 users",
      "Basic analytics & reports",
      "Email alerts",
      "30-day retention",
    ]);
    expect(planHighlights(seeded("professional"))).toEqual([
      "Up to 20 structures",
      "Up to 200 sensors",
      "25 users",
      "Advanced analytics + FFT",
      "AI anomaly detection",
      "API access",
      "Email + SMS alerts",
      "1-year retention",
    ]);
  });

  test("never lists a capability the plan lacks", () => {
    const starter = planHighlights(seeded("starter"));
    expect(starter).not.toContain("API access");
    expect(starter).not.toContain("AI anomaly detection");
  });

  test("prices in rupees, with Custom and FREE for the unpriced plans", () => {
    expect(formatPrice(seeded("starter"))).toBe("₹4,999");
    expect(formatPrice(seeded("professional"))).toBe("₹14,999");
    expect(formatPrice(seeded("enterprise"))).toBe("Custom");
    expect(formatPrice(seeded("complimentary"))).toBe("FREE");
  });

  test("the advertised copy on the public page is the seeded catalog", () => {
    const advertised = JSON.parse(readFileSync(ADVERTISED, "utf8")) as Array<{
      code: string; name: string; priceLabel: string; tagline: string; highlights: string[];
    }>;
    expect(advertised.map((p) => p.code)).toEqual(["starter", "professional"]);
    for (const shown of advertised) {
      const { code, name, priceLabel, tagline, highlights } = describePlan(seeded(shown.code));
      expect(shown, `advertised ${shown.code} differs from the seed`).toEqual({
        code, name, priceLabel, tagline, highlights,
      });
    }
  });
});
