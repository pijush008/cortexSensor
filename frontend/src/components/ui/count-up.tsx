"use client";

import { useEffect, useRef, useState } from "react";

interface CountUpProps {
  value: number;
  duration?: number;
  delay?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

export function CountUp({
  value,
  duration = 1200,
  delay = 0,
  decimals = 0,
  prefix = "",
  suffix = "",
  className,
}: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState("0");
  const started = useRef(false);
  const rafRef = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value.toFixed(decimals));
      return;
    }
    // Re-arm on every dependency change. `started` exists to stop the count
    // restarting as the element scrolls in and out of view — but the effect
    // only re-runs when `value` itself changes, and that is exactly when we do
    // want to animate again. Without this reset the observer callback bailed
    // out on the second run and the card kept displaying the first value it
    // ever received, so a refetched stat never updated on screen.
    started.current = false;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting || started.current) return;
          started.current = true;
          io.disconnect();
          const startT = performance.now() + delay;
          const step = (now: number) => {
            if (now < startT) {
              rafRef.current = requestAnimationFrame(step);
              return;
            }
            const p = Math.min(1, (now - startT) / duration);
            const eased = 1 - Math.pow(1 - p, 3);
            setDisplay((value * eased).toFixed(decimals));
            if (p < 1) rafRef.current = requestAnimationFrame(step);
          };
          rafRef.current = requestAnimationFrame(step);
        });
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration, delay, decimals]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {display}
      {suffix}
    </span>
  );
}