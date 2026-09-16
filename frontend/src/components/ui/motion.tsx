"use client";

import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

/**
 * Scroll-triggered entrances.
 *
 * Two rules shape this:
 *
 * ONE WATCHER PER GROUP, not per element. A grid of twelve cards is watched
 * once, and the children cascade through a CSS custom property rather than each
 * holding its own timer and its own piece of React state.
 *
 * ONCE, THEN NEVER AGAIN. An element leaves the pending set the moment it is
 * revealed, so scrolling back up does not replay the page. Re-animating content
 * someone has already read is what makes motion feel like an obstacle.
 */

export type MotionVariant = "rise" | "ink" | "unroll";

/**
 * One scroll listener for the whole page.
 *
 * IntersectionObserver was the obvious choice and the wrong one. It fires when
 * an intersection threshold is CROSSED, so an element the viewport jumps past
 * between two frames — an anchor link, a flung scroll, a restored scroll
 * position — never fires at all and stays at opacity 0 permanently. Measured on
 * this page: a fast scroll to the bottom left 16 elements invisible, including
 * the whole structures plate.
 *
 * A position check has no such hole: "is enough of this element on screen" is
 * true from then on, however the reader got there. One
 * rAF-throttled listener serves every pending element and detaches itself once
 * the last one has been revealed, so a fully-revealed page costs nothing.
 */
type Pending = { el: HTMLElement; reveal: () => void };

/**
 * Has enough of this element arrived for its entrance to be worth playing?
 *
 * Measured in HOW MUCH OF THE ELEMENT is on screen, not in where its top edge
 * falls. The previous rule was `rect.top < vh * 0.82`: a fixed line with 18% of
 * the viewport below it — 146px on a 813px screen. That is the whole of a short
 * card and the top sliver of a tall one, so the rule was really calibrated for a
 * single element height and quietly wrong for every other.
 *
 * On this page it broke the pricing cards. At 491px they are the tallest
 * animated elements here, and they began their entrance with 30% of themselves
 * showing: the price, the feature list and the button all finished animating
 * below the fold, and the reader scrolled down to meet a card that had already
 * settled. The animation ran perfectly and nobody ever saw it — which, as the
 * motion CSS says of movement too small to notice, is the same as no animation
 * at all, only slower.
 *
 * Two bounds keep this honest:
 *
 * - A floor of 18% of the viewport, exactly the old rule. Elements that already
 *   read well — the twelve module cards, the plane cards — must not start
 *   arriving LATER because tall ones needed to start later.
 * - A ceiling of 62% of the viewport, so an element taller than the screen can
 *   still satisfy the test. Without it a full-height panel could never be 55%
 *   visible and would sit at opacity 0 forever.
 */
export function shouldReveal(rect: { top: number; height: number }, vh: number) {
  const needed = Math.max(vh * 0.18, Math.min(rect.height * 0.55, vh * 0.62));
  return rect.top < vh - needed;
}

const pending = new Set<Pending>();
let ticking = false;
let listening = false;

function flush() {
  ticking = false;
  const vh = window.innerHeight;
  for (const entry of [...pending]) {
    const rect = entry.el.getBoundingClientRect();
    // Height-aware, so a tall element waits until the reader can actually watch
    // it arrive. An element already scrolled past has a negative top and so
    // passes unconditionally — nothing is ever stranded at opacity 0.
    if (shouldReveal(rect, vh)) {
      entry.reveal();
      pending.delete(entry);
    }
  }
  if (pending.size === 0) stopListening();
}

function onScroll() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(flush);
}

function startListening() {
  if (listening) return;
  listening = true;
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
}

function stopListening() {
  if (!listening) return;
  listening = false;
  window.removeEventListener("scroll", onScroll);
  window.removeEventListener("resize", onScroll);
}

/** Shared visibility hook: true once the node has been reached. */
function useSeen<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Someone who has asked for reduced motion gets the finished state
    // immediately — not a slower animation.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setSeen(true);
      return;
    }

    const entry: Pending = { el, reveal: () => setSeen(true) };
    pending.add(entry);
    startListening();
    // Evaluate once at mount so content already on screen plays immediately
    // rather than waiting for a scroll that may never come.
    onScroll();

    return () => {
      pending.delete(entry);
      if (pending.size === 0) stopListening();
    };
  }, []);

  return { ref, seen };
}

interface MotionProps {
  children: ReactNode;
  variant?: MotionVariant;
  /** Position in a hand-built sequence, when not using <Stagger>. */
  index?: number;
  /** Milliseconds between successive children. */
  step?: number;
  className?: string;
  style?: CSSProperties;
}

/** A single element that enters when scrolled to. */
export function Motion({
  children,
  variant = "rise",
  index = 0,
  step,
  className,
  style,
}: MotionProps) {
  const { ref, seen } = useSeen<HTMLDivElement>();

  return (
    <div
      ref={ref}
      className={cn("mo", `mo-${variant}`, seen && "mo-in", className)}
      style={
        {
          "--i": index,
          ...(step !== undefined ? { "--step": `${step}ms` } : {}),
          ...style,
        } as CSSProperties
      }
    >
      {children}
    </div>
  );
}

interface StaggerProps {
  children: ReactNode;
  variant?: MotionVariant;
  step?: number;
  className?: string;
  /** Element to render as, so a stagger group can still be a <ul>. */
  as?: "div" | "ul" | "ol" | "section";
}

/**
 * Cascades its direct children.
 *
 * The index is written onto each child as a CSS variable rather than each child
 * carrying its own timer, so the cascade costs one class and one custom
 * property per child and nothing at runtime.
 */
export function Stagger({
  children,
  variant = "ink",
  step = 90,
  className,
  as: Tag = "div",
}: StaggerProps) {
  const { ref, seen } = useSeen<HTMLDivElement>();

  return (
    <Tag ref={ref as never} className={className}>
      {Children.map(children, (child, i) => {
        if (!isValidElement(child)) return child;
        const el = child as ReactElement<{ className?: string; style?: CSSProperties }>;
        return cloneElement(el, {
          className: cn("mo", `mo-${variant}`, seen && "mo-in", el.props.className),
          style: { "--i": i, "--step": `${step}ms`, ...el.props.style } as CSSProperties,
        });
      })}
    </Tag>
  );
}

interface OnLoadProps {
  children: ReactNode;
  /** Position in the load sequence. */
  index?: number;
  step?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * Entrance for content that is on screen when the page opens.
 *
 * Pure CSS, no observer, no state, no "use client" requirement of its own: the
 * animation begins as soon as the stylesheet applies. <Motion> hides its
 * children until a React effect reveals them, which above the fold shows the
 * visitor a blank hero for as long as hydration takes.
 *
 * Use this above the fold and <Motion> below it.
 */
export function MotionOnLoad({
  children,
  index = 0,
  step,
  className,
  style,
}: OnLoadProps) {
  return (
    <div
      className={cn("mo-load", className)}
      style={
        {
          "--i": index,
          ...(step !== undefined ? { "--step": `${step}ms` } : {}),
          ...style,
        } as CSSProperties
      }
    >
      {children}
    </div>
  );
}
