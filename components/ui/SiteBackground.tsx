"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CSS_FALLBACK,
  workerSupported,
  type BackgroundControls,
} from "@/lib/background/page-state";
import {
  MOBILE_RENDER_QUERY,
  isConstrainedDocument,
  selectBackgroundProfile,
} from "@/lib/background/profile";
import { reportClientEvent } from "@/lib/telemetry/report-client";

/**
 * Single shared GPU backdrop for every page: slow, soft ocean-wave ribbons in
 * the theme colours. Colours are read live from CSS variables, so it adapts to
 * dark and light mode. Reduced motion renders one still frame.
 *
 * Rendering is two-pass (see lib/background/shaders.ts): the original wave shader
 * fills small keyframe textures a few times per second, and every displayed
 * frame blends them at the screen's resolution. The image matches the original
 * single-pass renderer while costing a fraction of the GPU/CPU time, so the
 * background stays at 60 fps on weak GPUs and software rendering too.
 */

export default function SiteBackground() {
  const [generation, setGeneration] = useState(0);
  const [forceCss, setForceCss] = useState(false);
  const [mainThreadOnly, setMainThreadOnly] = useState(false);
  const recoveries = useRef(0);
  const restart = useCallback(() => {
    recoveries.current += 1;
    if (recoveries.current > 1) setForceCss(true);
    setGeneration((value) => value + 1);
  }, []);
  const retryOnMainThread = useCallback(() => {
    setMainThreadOnly(true);
    setGeneration((value) => value + 1);
  }, []);
  useEffect(() => {
    const media = window.matchMedia(MOBILE_RENDER_QUERY);
    const onProfileChange = () => {
      recoveries.current = 0;
      setForceCss(false);
      setGeneration((value) => value + 1);
    };
    media.addEventListener("change", onProfileChange);
    return () => media.removeEventListener("change", onProfileChange);
  }, []);
  return (
    <BackgroundCanvas
      key={generation}
      generation={generation}
      restart={restart}
      retryOnMainThread={retryOnMainThread}
      forceCss={forceCss}
      mainThreadOnly={mainThreadOnly}
    />
  );
}

type BackgroundCanvasProps = {
  generation: number;
  restart: () => void;
  retryOnMainThread: () => void;
  forceCss: boolean;
  mainThreadOnly: boolean;
};

function BackgroundCanvas({
  generation,
  restart,
  retryOnMainThread,
  forceCss,
  mainThreadOnly,
}: BackgroundCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    let teardown: (() => void) | undefined;
    let idleId = 0;
    let fallbackTimer = 0;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const audit = new URLSearchParams(location.search).get("audit") === "performance";
    let reduced = audit || motion.matches;
    let updateMotion = () => {};
    const onMotion = () => {
      reduced = audit || motion.matches;
      if (canvas.dataset.backgroundRenderer === "css") {
        canvas.dataset.backgroundMode = reduced ? "static" : "animated";
      }
      updateMotion();
    };
    const onPageVisibility = () => {
      canvas.style.animationPlayState = document.hidden ? "paused" : "running";
    };
    onPageVisibility();
    motion.addEventListener("change", onMotion);
    document.addEventListener("visibilitychange", onPageVisibility);

    // Each device loads only the renderer it uses (worker or main thread),
    // and neither is part of the first page load.
    const initialize = async () => {
      if (disposed) return;

      const profile = selectBackgroundProfile({
        mobileViewport: window.matchMedia(MOBILE_RENDER_QUERY).matches,
        constrainedDevice: isConstrainedDocument(),
        workerAvailable: !mainThreadOnly && workerSupported(canvas),
      });
      const applyCssFallback = (reason?: string) => {
        if (reason) reportClientEvent("background", `${reason} ${profile.tier}`);
        canvas.style.background = CSS_FALLBACK;
        canvas.dataset.backgroundRenderer = "css";
        canvas.dataset.backgroundMode = reduced ? "static" : "animated";
        canvas.dataset.backgroundFps = "0";
        canvas.dataset.backgroundProfile = "css-soft";
        canvas.dataset.backgroundDeviceTier = profile.tier;
        canvas.dataset.backgroundRenderScale = "0";
      };
      if (forceCss) {
        applyCssFallback("gave-up-after-recoveries");
        return;
      }

      const controls: BackgroundControls = {
        canvas,
        profile,
        generation,
        isReduced: () => reduced,
        applyCssFallback,
        restart,
        retryOnMainThread,
      };

      try {
        if (profile.thread === "worker") {
          const { initializeWorkerBackground } = await import("@/lib/background/worker-host");
          if (disposed) return;
          const workerTeardown = initializeWorkerBackground(controls);
          if (workerTeardown) {
            teardown = workerTeardown;
            return;
          }
        }

        const { initializeMainThreadBackground } = await import("@/lib/background/main-thread");
        if (disposed) return;
        const mainThread = initializeMainThreadBackground(controls);
        teardown = () => mainThread.teardown();
        updateMotion = () => mainThread.updateMotion();
      } catch {
        // The renderer chunk could not load (offline, or an old tab after a
        // new deploy): keep the CSS background instead of failing.
        if (!disposed) applyCssFallback("renderer-chunk-failed");
      }
    };

    const queueInitialization = () => {
      if (disposed) return;
      if (typeof window.requestIdleCallback === "function") {
        idleId = window.requestIdleCallback(() => void initialize(), { timeout: 250 });
      } else {
        fallbackTimer = window.setTimeout(() => void initialize(), 1);
      }
    };

    // Start after React's first paint, but do not wait for every image and
    // network request. Waiting for window.load made the fallback-to-WebGL
    // change arrive conspicuously late on slower computers.
    const startupRaf = window.requestAnimationFrame(queueInitialization);

    return () => {
      disposed = true;
      motion.removeEventListener("change", onMotion);
      document.removeEventListener("visibilitychange", onPageVisibility);
      window.cancelAnimationFrame(startupRaf);
      if (idleId) window.cancelIdleCallback(idleId);
      if (fallbackTimer) window.clearTimeout(fallbackTimer);
      teardown?.();
    };
  }, [generation, restart, retryOnMainThread, forceCss, mainThreadOnly]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      data-background-generation={generation}
      data-background-renderer="css"
      data-background-mode="static"
      data-background-fps="0"
      data-background-scale="adaptive"
      data-background-profile="css-soft"
      data-background-device-tier="pending"
      data-background-render-scale="0"
      style={{ background: CSS_FALLBACK }}
      className="site-background pointer-events-none fixed inset-0 -z-10 h-full w-full"
    />
  );
}
