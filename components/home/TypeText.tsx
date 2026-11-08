"use client";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/hooks/useMediaQuery";

type Props = {
  text: string;
  start?: boolean;
  speedMs?: number;       // ms per char
  onDone?: () => void;
  className?: string;
};

export default function TypeText({
  text,
  start = false,
  speedMs = 48,
  onDone,
  className = "",
}: Props) {
  const [n, setN] = useState(0);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (!start) return;
    if (n >= text.length) return;
    if (prefersReducedMotion) {
      setN(text.length);
      return;
    }
    const t = setTimeout(() => setN((v) => v + 1), speedMs);
    return () => clearTimeout(t);
  }, [start, n, text.length, speedMs, prefersReducedMotion]);

  // Fire onDone once per start, using the latest callback without making its
  // identity an effect dependency.
  const doneFiredRef = useRef(false);
  const notifyDone = useEffectEvent(() => onDone?.());

  useEffect(() => {
    if (!start) {
      doneFiredRef.current = false;
      return;
    }
    if (n !== text.length || doneFiredRef.current) return;
    doneFiredRef.current = true;
    notifyDone();
  }, [start, n, text.length]);

  // data-full-text lets old browsers and no-JS visitors see the whole text
  // (see the legacy rules in app/global.css and the noscript style in the layout).
  return <span className={className} data-full-text={text}>{text.slice(0, n)}</span>;
}
