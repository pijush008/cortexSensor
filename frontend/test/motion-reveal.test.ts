import { describe, expect, it } from "vitest";
import { shouldReveal } from "@/components/ui/motion";

/**
 * The entrance trigger is pure geometry, so it is tested as geometry.
 *
 * The bug these cover: the trigger used to test the element's TOP EDGE against
 * a fixed line (82% of the viewport). That line is only correct for one element
 * height. It left 18% of the viewport — 146px at 813px tall — below the line,
 * which is the whole of a short card but only the top sliver of a tall one. The
 * two pricing cards are 491px tall and so began their entrance with under a
 * third of themselves on screen; the price, the feature list and the button had
 * all finished animating before the reader ever saw them.
 */

const VH = 813;

/** Fraction of an element that is on screen when its entrance fires. */
function visibleFractionAtReveal(height: number): number {
  for (let top = VH; top >= -height; top -= 1) {
    if (shouldReveal({ top, height }, VH)) {
      const visible = Math.min(top + height, VH) - Math.max(top, 0);
      return visible / height;
    }
  }
  return 0;
}

describe("shouldReveal", () => {
  it("does not fire while the element is entirely below the fold", () => {
    expect(shouldReveal({ top: VH + 10, height: 491 }, VH)).toBe(false);
  });

  it("fires for an element scrolled above the viewport", () => {
    expect(shouldReveal({ top: -900, height: 491 }, VH)).toBe(true);
  });

  it("starts a tall card only once most of it is on screen", () => {
    // The pricing cards. Previously 30%: the reader met the settled card.
    expect(visibleFractionAtReveal(491)).toBeGreaterThan(0.5);
  });

  it("keeps short cards firing as early as they always did", () => {
    // The 12 module cards and the 3 plane cards already read well; the fix must
    // not delay them. At the old fixed line these were fully visible.
    expect(visibleFractionAtReveal(171)).toBeGreaterThanOrEqual(0.85);
    expect(visibleFractionAtReveal(254)).toBeGreaterThanOrEqual(0.55);
  });

  it("still reveals an element taller than the viewport", () => {
    // Nothing may be stranded at opacity 0: an element that can never be 55%
    // visible must fall back to a viewport-relative amount.
    const tall = 2000;
    expect(shouldReveal({ top: 0, height: tall }, VH)).toBe(true);
    expect(visibleFractionAtReveal(tall)).toBeGreaterThan(0);
  });
});
