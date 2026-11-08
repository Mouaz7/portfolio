"use client";
import { useEffect, useState } from "react";
import { usePrefersReducedMotion } from "@/hooks/useMediaQuery";
import styles from "./RoleCycler.module.css";

type Props = {
  start?: boolean;
  words: string[];
  dwellMs?: number;
  initialDelayMs?: number;
  firstDwellMs?: number;
  transitionMs?: number;
  className?: string;
};

export default function RoleCycler({
  start = false,
  words,
  dwellMs = 700,
  initialDelayMs = 180,
  firstDwellMs = 1000,
  transitionMs = 300,
  className = "",
}: Props) {
  const [i, setI] = useState<number | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const reserveWords = words.length > 0 ? words : [""];
  const currentWord = prefersReducedMotion ? reserveWords[0] : i === null ? null : reserveWords[i] ?? reserveWords[0];

  useEffect(() => {
    if (!start || prefersReducedMotion) return;
    const t = setTimeout(() => setI(0), initialDelayMs);
    return () => clearTimeout(t);
  }, [start, initialDelayMs, prefersReducedMotion]);

  useEffect(() => {
    if (i === null || prefersReducedMotion) return;
    const last = reserveWords.length - 1;
    if (i >= last) return;
    const delay = i === 0 ? firstDwellMs : dwellMs;
    const t = setTimeout(() => setI((v) => (v === null ? 0 : v + 1)), delay);
    return () => clearTimeout(t);
  }, [i, reserveWords.length, dwellMs, firstDwellMs, prefersReducedMotion]);

  return (
    <span
      className={[
        "inline-block relative align-baseline",
        className,
      ].join(" ")}
      data-role-cycler
      data-role-cycler-reserved={reserveWords.join("|")}
      style={{
        display: "inline-grid",
        gridTemplateAreas: '"word"',
        position: "relative",
        verticalAlign: "baseline",
        willChange: "opacity, transform",
        "--rcdur": `${transitionMs}ms`,
      }}
    >
      <span
        aria-hidden="true"
        data-role-cycler-reserve
        style={{
          position: "absolute",
          width: "max-content",
          height: 0,
          overflow: "hidden",
          visibility: "hidden",
          pointerEvents: "none",
        }}
      >
        {reserveWords.map((word, index) => (
          <span
            data-role-cycler-reserve-word
            key={`${index}-${word}`}
            style={{ whiteSpace: "nowrap" }}
          >
            {word}
          </span>
        ))}
      </span>

      {currentWord && (
        <span
          key={`${i}-${currentWord}`}
          className={styles.fadeslide}
          data-role-cycler-active
          style={{ gridArea: "word", justifySelf: "start" }}
        >
          {currentWord}
        </span>
      )}
    </span>
  );
}
