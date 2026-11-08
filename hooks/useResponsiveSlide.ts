"use client";

import { useState, type CSSProperties } from "react";
import { useIsomorphicLayoutEffect } from "@/hooks/useIsomorphicLayoutEffect";
import { layoutViewportSize } from "@/lib/viewport/layout-viewport";

// CSS zoom arrived in Firefox 126; Firefox ESR 115 ignores it and the slide
// would be cut off in short windows. There, a scale transform does the same.
function cssZoomSupported() {
  try {
    return typeof CSS === "undefined" || typeof CSS.supports !== "function" || CSS.supports("zoom", "0.5");
  } catch {
    return true;
  }
}

type ResponsiveSlide = {
  scale: number;
  style: CSSProperties & { "--home-slide-layout-height"?: string };
};

/**
 * Uses the reference portfolio's 560px minimum slide height and CSS zoom when
 * the visible viewport is shorter. Zoom preserves the viewport width and the
 * positioning of fixed navigation descendants.
 */
export function useResponsiveSlide(minHeight: number): ResponsiveSlide {
  const [viewportHeight, setViewportHeight] = useState(0);

  useIsomorphicLayoutEffect(() => {
    let frameId: number | null = null;
    const update = () => {
      frameId = null;
      setViewportHeight(layoutViewportSize().height);
    };
    // Resize events arrive many times per frame while the browser chrome or a
    // pinch moves; measure once per frame.
    const scheduleUpdate = () => {
      if (frameId === null) frameId = window.requestAnimationFrame(update);
    };

    // The first measurement decides the first paint, so it runs right away.
    update();
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("orientationchange", scheduleUpdate);
    window.visualViewport?.addEventListener("resize", scheduleUpdate);

    return () => {
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("orientationchange", scheduleUpdate);
      window.visualViewport?.removeEventListener("resize", scheduleUpdate);
      if (frameId !== null) window.cancelAnimationFrame(frameId);
    };
  }, []);

  const scale = viewportHeight > 0
    ? Math.min(1, viewportHeight / minHeight)
    : 1;

  return {
    scale,
    style: scale < 1
      ? {
          height: `${minHeight}px`,
          minHeight: `${minHeight}px`,
          ...(cssZoomSupported()
            ? { zoom: scale }
            : {
                width: `${100 / scale}%`,
                transform: `scale(${scale})`,
                // The wider box overflows towards the inline start: to the
                // right in left-to-right pages, to the left in Arabic.
                transformOrigin: document.documentElement.dir === "rtl" ? "top right" : "top left",
              }),
          "--home-slide-layout-height": `${minHeight}px`,
        }
      : {
          height: "100dvh",
          minHeight: "100dvh",
          zoom: 1,
          // Left unset on purpose: the stylesheet falls back to 100dvh, and
          // that fallback also gets a 100vh version for browsers without dvh.
          // An inline "100dvh" here would make the consumer invalid there.
        },
  };
}
