// Runs the site background in a Web Worker on an OffscreenCanvas, with the
// main thread showing compositor-crossfade keyframes when the device renders
// WebGL in software. Falls back to the main thread when the worker fails.

import { CrossfadeController, crossfadeSupported, type KeyframeSource } from "./crossfade";
import {
  markWebgl,
  readThemeColors,
  startCrossfade,
  viewportSize,
  type BackgroundControls,
} from "./page-state";
import { BACKGROUND_TARGET_FPS } from "./profile";
import { subscribeToThemeChanges } from "@/lib/theme/theme-store";
import { reportClientEvent } from "@/lib/telemetry/report-client";

const WORKER_STARTUP_TIMEOUT_MS = 5_000;

export function initializeWorkerBackground(controls: BackgroundControls) {
  const { canvas, profile, generation, applyCssFallback } = controls;
  let worker: Worker;
  try {
    worker = new Worker(new URL("./site-background.worker.ts", import.meta.url));
  } catch {
    return null;
  }

  let offscreen: OffscreenCanvas;
  try {
    offscreen = canvas.transferControlToOffscreen();
  } catch {
    worker.terminate();
    return null;
  }

  canvas.dataset.backgroundRenderer = "css";
  canvas.dataset.backgroundMode = "static";
  canvas.dataset.backgroundFps = "0";
  canvas.dataset.backgroundThread = "worker";
  canvas.dataset.backgroundProfile = profile.profileName;
  canvas.dataset.backgroundDeviceTier = profile.tier;

  let active = true;
  let ready = false;
  let cleanup = () => {};
  let watchdog = 0;
  // The transferred canvas can never be used on the main thread again, so a
  // failing worker hands over to a fresh canvas that renders on the main thread.
  const failWorker = () => {
    if (!active) return;
    reportClientEvent("background", `worker-failed ${profile.tier}`);
    cleanup();
    controls.retryOnMainThread();
  };
  watchdog = window.setTimeout(failWorker, WORKER_STARTUP_TIMEOUT_MS);

  const initial = viewportSize();
  try {
    worker.postMessage({
      type: "init",
      generation,
      canvas: offscreen,
      ...initial,
      settings: profile.renderer,
      colors: readThemeColors(),
      reduced: controls.isReduced(),
      visible: !document.hidden,
      powerPreference: profile.powerPreference,
      crossfade: crossfadeSupported(),
    }, [offscreen]);
  } catch {
    active = false;
    window.clearTimeout(watchdog);
    worker.terminate();
    reportClientEvent("background", `worker-failed ${profile.tier}`);
    controls.retryOnMainThread();
    return () => {};
  }

  type WorkerEvent = {
    type: "compiled" | "ready" | "error" | "lost" | "restored" | "scale" | "struggling" | "crossfade" | "keyframe";
    generation: number;
    outputScale?: number;
    mode?: "crossfade";
    fieldScale?: number;
    keyframeSeconds?: number;
    id?: number;
    bitmap?: ImageBitmap | null;
  };
  let outputScale = 1;
  // Crossfade pipeline (software rendering): the worker paints keyframes on
  // request and this thread shows them; see lib/background/crossfade.ts.
  let crossfade: CrossfadeController | null = null;
  let nextKeyframeId = 0;
  const pendingKeyframes = new Map<number, (bitmap: ImageBitmap | null) => void>();
  const keyframeSource: KeyframeSource = (time, width, height) => new Promise((resolve) => {
    if (!active) {
      resolve(null);
      return;
    }
    const id = ++nextKeyframeId;
    pendingKeyframes.set(id, resolve);
    worker.postMessage({ type: "keyframe", id, time, width, height });
  });
  let crossfadeStarting = false;
  const beginCrossfade = (fieldScale: number, keyframeSeconds: number, software: boolean) => {
    if (crossfade || crossfadeStarting) return;
    crossfadeStarting = true;
    void startCrossfade(controls, keyframeSource, "worker", fieldScale, keyframeSeconds, () => {
      crossfade = null;
      failWorker();
    }, software)
      .then((started) => {
        crossfadeStarting = false;
        if (!active) {
          started?.dispose();
          return;
        }
        if (started) crossfade = started;
        else failWorker();
      });
  };
  worker.onmessage = (event: MessageEvent<WorkerEvent>) => {
    if (!active || event.data.generation !== generation) return;
    const { type } = event.data;
    if (type === "compiled") {
      // Shaders compiled: give the first frame its own full timeout, so slow
      // shader compilation on weak GPUs does not count against it.
      window.clearTimeout(watchdog);
      watchdog = window.setTimeout(failWorker, WORKER_STARTUP_TIMEOUT_MS);
    } else if (type === "keyframe") {
      const resolve = pendingKeyframes.get(event.data.id ?? -1);
      pendingKeyframes.delete(event.data.id ?? -1);
      if (resolve) resolve(event.data.bitmap ?? null);
      else event.data.bitmap?.close();
    } else if (type === "ready" && event.data.mode === "crossfade") {
      window.clearTimeout(watchdog);
      ready = true;
      beginCrossfade(
        event.data.outputScale ?? profile.renderer.softwareFieldScale,
        1 / profile.renderer.softwareKeyframesPerSecond,
        // The worker chose the crossfade itself because WebGL is software.
        true,
      );
    } else if (type === "ready") {
      window.clearTimeout(watchdog);
      ready = true;
      outputScale = event.data.outputScale ?? outputScale;
      markWebgl(canvas, profile, "worker", controls.isReduced(), outputScale);
    } else if (type === "struggling") {
      if (!crossfade && crossfadeSupported()) worker.postMessage({ type: "crossfade" });
    } else if (type === "crossfade") {
      beginCrossfade(
        event.data.fieldScale ?? profile.renderer.softwareFieldScale,
        event.data.keyframeSeconds ?? 1 / profile.renderer.softwareKeyframesPerSecond,
        // Switched because the GPU struggled, not because it is missing.
        false,
      );
    } else if (type === "scale") {
      outputScale = event.data.outputScale ?? outputScale;
      if (ready) canvas.dataset.backgroundRenderScale = String(Math.round(outputScale * 100) / 100);
    } else if (type === "lost") {
      // In crossfade mode the transferred canvas is not drawn any more; a
      // failing keyframe painter reports through onFailure instead.
      if (crossfade || crossfadeStarting) return;
      ready = false;
      applyCssFallback("context-lost");
      window.clearTimeout(watchdog);
      watchdog = window.setTimeout(failWorker, WORKER_STARTUP_TIMEOUT_MS);
    } else if (type === "restored") {
      cleanup();
      controls.restart();
    } else {
      failWorker();
    }
  };
  worker.onerror = failWorker;

  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const onMotion = () => {
    const reduced = controls.isReduced();
    worker.postMessage({ type: "motion", reduced });
    crossfade?.setReduced(reduced);
    if (ready) {
      canvas.dataset.backgroundMode = reduced ? "static" : "animated";
      canvas.dataset.backgroundFps = reduced ? "0" : String(BACKGROUND_TARGET_FPS);
    } else if (canvas.dataset.backgroundProfile === "css-soft") applyCssFallback();
  };
  motion.addEventListener("change", onMotion);

  const unsubscribeTheme = subscribeToThemeChanges(() => {
    const colors = readThemeColors();
    // Colours reach the worker before any keyframe request that follows.
    worker.postMessage({ type: "colors", colors });
    crossfade?.setColors(colors);
  });

  let resizeRaf = 0;
  const onResize = () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      if (crossfade) crossfade.resize();
      else worker.postMessage({ type: "resize", ...viewportSize() });
    });
  };
  window.addEventListener("resize", onResize);

  let pointerRaf = 0;
  let pointer = { x: 0.5, y: 0.5, amount: 0 };
  const sendPointer = () => {
    pointerRaf = 0;
    if (crossfade) crossfade.setPointer(pointer.x, pointer.y, pointer.amount);
    else worker.postMessage({ type: "pointer", ...pointer });
  };
  const onMove = (event: PointerEvent) => {
    if (event.pointerType === "touch") return;
    pointer = {
      x: event.clientX / window.innerWidth,
      y: 1 - event.clientY / window.innerHeight,
      amount: 1,
    };
    if (!pointerRaf) pointerRaf = requestAnimationFrame(sendPointer);
  };
  const onLeave = () => {
    pointer = { ...pointer, amount: 0 };
    if (!pointerRaf) pointerRaf = requestAnimationFrame(sendPointer);
  };
  const interactivePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (interactivePointer) {
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerout", onLeave);
  }

  const onVisibility = () => {
    worker.postMessage({ type: "visibility", visible: !document.hidden });
    crossfade?.setVisible(!document.hidden);
  };
  document.addEventListener("visibilitychange", onVisibility);

  cleanup = () => {
    if (!active) return;
    active = false;
    window.clearTimeout(watchdog);
    motion.removeEventListener("change", onMotion);
    worker.onmessage = null;
    worker.onerror = null;
    cancelAnimationFrame(resizeRaf);
    cancelAnimationFrame(pointerRaf);
    window.removeEventListener("resize", onResize);
    if (interactivePointer) {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerout", onLeave);
    }
    document.removeEventListener("visibilitychange", onVisibility);
    unsubscribeTheme();
    crossfade?.dispose();
    crossfade = null;
    for (const resolve of pendingKeyframes.values()) resolve(null);
    pendingKeyframes.clear();
    // Ask the worker to release its GPU context first (best effort; terminating
    // the worker frees it too, but some browsers do so lazily).
    try { worker.postMessage({ type: "dispose" }); } catch {}
    worker.terminate();
  };
  return cleanup;
}
