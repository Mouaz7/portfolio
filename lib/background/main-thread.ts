// Runs the site background on the main thread: WebGL two-pass rendering, or
// the compositor crossfade on devices without GPU acceleration.

import { CrossfadeController, crossfadeSupported, type KeyframeSource } from "./crossfade";
import {
  markWebgl,
  readThemeColors,
  startCrossfade,
  viewportSize,
  type BackgroundControls,
} from "./page-state";
import { BACKGROUND_TARGET_FPS } from "./profile";
import {
  FramePacer,
  WaveRenderer,
  advanceAnimationTime,
  createKeyframePainter,
} from "./renderer";
import { subscribeToThemeChanges } from "@/lib/theme/theme-store";

/**
 * Crossfade pipeline on the main thread: keyframes are painted here and the
 * compositor fades between them. Returns the same handles as the WebGL path.
 */
function initializeMainThreadCrossfade(controls: BackgroundControls, software: boolean) {
  const { canvas, profile, applyCssFallback } = controls;
  const painter = createKeyframePainter(profile.renderer.shader);
  if (!painter) return null;
  let colors = readThemeColors();
  const source: KeyframeSource = async (time, width, height) => {
    painter.paint(time, colors, width, height);
    return painter.bitmap();
  };
  let crossfade: CrossfadeController | null = null;
  let disposed = false;

  let resizeRaf = 0;
  const onResize = () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => crossfade?.resize());
  };
  const onTheme = () => {
    colors = readThemeColors();
    crossfade?.setColors(colors);
  };
  // Subscribed before the first keyframes are painted: a theme change while
  // they are being made must reach the colours the keyframe source paints with.
  const unsubscribeTheme = subscribeToThemeChanges(onTheme);
  // One pointer update per frame: this path runs on the weakest devices.
  let pointerRaf = 0;
  let pointerX = 0;
  let pointerY = 0;
  const onMove = (event: PointerEvent) => {
    if (event.pointerType === "touch") return;
    pointerX = event.clientX;
    pointerY = event.clientY;
    if (pointerRaf) return;
    pointerRaf = requestAnimationFrame(() => {
      pointerRaf = 0;
      crossfade?.setPointer(pointerX / window.innerWidth, 1 - pointerY / window.innerHeight, 1);
    });
  };
  const onLeave = () => {
    const pointer = crossfade?.pointerState;
    if (pointer) crossfade?.setPointer(pointer.x, pointer.y, 0);
  };
  const onVisibility = () => crossfade?.setVisible(!document.hidden);
  const interactivePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  void startCrossfade(
    controls,
    source,
    "main",
    profile.renderer.softwareFieldScale,
    1 / profile.renderer.softwareKeyframesPerSecond,
    () => {
      crossfade = null;
      applyCssFallback("crossfade-failed");
    },
    software,
  ).then((started) => {
    if (disposed) {
      started?.dispose();
      return;
    }
    if (!started) {
      applyCssFallback("crossfade-failed");
      return;
    }
    crossfade = started;
    window.addEventListener("resize", onResize);
    if (interactivePointer) {
      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointerout", onLeave);
    }
    document.addEventListener("visibilitychange", onVisibility);
  });

  const updateMotion = () => {
    const reduced = controls.isReduced();
    crossfade?.setReduced(reduced);
    if (crossfade) {
      canvas.dataset.backgroundMode = reduced ? "static" : "animated";
      canvas.dataset.backgroundFps = reduced ? "0" : String(BACKGROUND_TARGET_FPS);
    }
  };

  const teardown = () => {
    disposed = true;
    cancelAnimationFrame(resizeRaf);
    cancelAnimationFrame(pointerRaf);
    window.removeEventListener("resize", onResize);
    unsubscribeTheme();
    if (interactivePointer) {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerout", onLeave);
    }
    document.removeEventListener("visibilitychange", onVisibility);
    crossfade?.dispose();
    crossfade = null;
    painter.dispose();
  };
  return { teardown, updateMotion };
}

export function initializeMainThreadBackground(controls: BackgroundControls) {
  const { canvas, profile, applyCssFallback } = controls;
  const gl = canvas.getContext("webgl", {
    antialias: false,
    alpha: false,
    depth: false,
    stencil: false,
    powerPreference: profile.powerPreference,
  });
  if (!gl) {
    // Graceful CSS fallback when WebGL is unavailable.
    applyCssFallback("no-webgl");
    return { teardown: () => {}, updateMotion: () => {} };
  }

  let renderer: WaveRenderer;
  try {
    renderer = new WaveRenderer(gl, canvas, profile.renderer);
    renderer.setColors(readThemeColors());
    const initial = viewportSize();
    renderer.resize(initial.width, initial.height, initial.devicePixelRatio);
  } catch {
    applyCssFallback("webgl-init-failed");
    return { teardown: () => {}, updateMotion: () => {} };
  }

  // Software rendering (no GPU acceleration): the compositor crossfade keeps
  // 60 fps at a fraction of the CPU cost of a WebGL composite every frame.
  if (renderer.status.software && crossfadeSupported()) {
    const crossfade = initializeMainThreadCrossfade(controls, true);
    if (crossfade) {
      // The anchor canvas is never drawn in crossfade mode: free its context.
      renderer.dispose(true);
      return crossfade;
    }
  }

  const pacer = new FramePacer(profile.renderer.targetFps);
  let raf = 0;
  let requestedRaf = 0;
  let running = !document.hidden;
  let contextLost = false;
  let recoveryTimer = 0;
  let animationElapsed = 0;
  let previousTick = performance.now();

  const draw = () => {
    if (contextLost) return;
    const reduced = controls.isReduced();
    // Resize (if the guard asks for it) before drawing: changing the canvas
    // size clears it, so drawing first would show a blank frame.
    if (!reduced && pacer.isStruggling()) {
      pacer.resetMeasurements();
      if (renderer.reduceOutputResolution()) {
        canvas.dataset.backgroundRenderScale = String(
          Math.round(renderer.status.outputScale * 100) / 100,
        );
      } else {
        // Lowest resolution and still too slow: move to the much cheaper
        // compositor crossfade (same image, same 60 fps).
        window.setTimeout(switchToCrossfade, 0);
      }
    }
    renderer.render(animationElapsed / 1000, reduced);
  };

  const animate = (now: number) => {
    if (!running || controls.isReduced() || contextLost) {
      raf = 0;
      return;
    }
    raf = requestAnimationFrame(animate);
    animationElapsed = advanceAnimationTime(animationElapsed, now - previousTick);
    previousTick = now;
    if (pacer.shouldRender(now)) draw();
  };

  // One-off redraw for still frames (reduced motion, theme or pointer change).
  const requestRender = () => {
    if (!running || contextLost || raf || requestedRaf) return;
    requestedRaf = requestAnimationFrame(() => {
      requestedRaf = 0;
      draw();
    });
  };

  const startLoop = () => {
    if (raf || !running || contextLost || controls.isReduced()) return;
    previousTick = performance.now();
    pacer.resetMeasurements();
    raf = requestAnimationFrame(animate);
  };

  markWebgl(canvas, profile, "main", controls.isReduced(), renderer.status.outputScale);
  draw();
  startLoop();

  let resizeRaf = 0;
  const onResize = () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      // A lost context cannot allocate textures; the restored context
      // re-initialises at the current size anyway.
      if (contextLost) return;
      const size = viewportSize();
      renderer.resize(size.width, size.height, size.devicePixelRatio);
      canvas.dataset.backgroundRenderScale = String(
        Math.round(renderer.status.outputScale * 100) / 100,
      );
      // Draw in the same frame: resizing cleared the canvas.
      if (running) draw();
    });
  };
  window.addEventListener("resize", onResize);

  const onMove = (event: PointerEvent) => {
    if (event.pointerType === "touch") return;
    renderer.setPointer(event.clientX / window.innerWidth, 1 - event.clientY / window.innerHeight, 1);
    requestRender();
  };
  const onLeave = () => {
    renderer.setPointer(0.5, 0.5, 0);
    requestRender();
  };
  const interactivePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (interactivePointer) {
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerout", onLeave);
  }

  const updateMotion = () => {
    if (contextLost) return;
    cancelAnimationFrame(raf);
    cancelAnimationFrame(requestedRaf);
    raf = 0;
    requestedRaf = 0;
    const reduced = controls.isReduced();
    canvas.dataset.backgroundMode = reduced ? "static" : "animated";
    canvas.dataset.backgroundFps = reduced ? "0" : String(BACKGROUND_TARGET_FPS);
    if (reduced) requestRender();
    else startLoop();
  };

  const onContextLost = (event: Event) => {
    event.preventDefault();
    contextLost = true;
    running = false;
    cancelAnimationFrame(raf);
    cancelAnimationFrame(requestedRaf);
    raf = 0;
    requestedRaf = 0;
    applyCssFallback("context-lost");
    recoveryTimer = window.setTimeout(() => teardown(), 5_000);
  };
  const onContextRestored = () => {
    window.clearTimeout(recoveryTimer);
    controls.restart();
  };
  canvas.addEventListener("webglcontextlost", onContextLost);
  canvas.addEventListener("webglcontextrestored", onContextRestored);

  // Theme changes update immediately while the loop keeps the same waves moving.
  const unsubscribeTheme = subscribeToThemeChanges(() => {
    renderer.setColors(readThemeColors());
    if (!contextLost) draw();
  });

  const onVisibility = () => {
    if (contextLost) return;
    if (document.hidden) {
      running = false;
      cancelAnimationFrame(raf);
      cancelAnimationFrame(requestedRaf);
      raf = 0;
      requestedRaf = 0;
    } else if (!running) {
      running = true;
      if (controls.isReduced()) requestRender();
      else startLoop();
    }
  };
  document.addEventListener("visibilitychange", onVisibility);

  let tornDown = false;
  function teardown() {
    if (tornDown) return;
    tornDown = true;
    window.clearTimeout(recoveryTimer);
    canvas.removeEventListener("webglcontextlost", onContextLost);
    canvas.removeEventListener("webglcontextrestored", onContextRestored);
    running = false;
    cancelAnimationFrame(raf);
    cancelAnimationFrame(requestedRaf);
    cancelAnimationFrame(resizeRaf);
    window.removeEventListener("resize", onResize);
    if (interactivePointer) {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerout", onLeave);
    }
    document.removeEventListener("visibilitychange", onVisibility);
    unsubscribeTheme();
    renderer.dispose(false);
    // Free the GPU context once this canvas has left the page (profile change
    // or recovery). A canvas that stays mounted keeps its context for reuse.
    window.setTimeout(() => {
      if (!canvas.isConnected) gl?.getExtension("WEBGL_lose_context")?.loseContext();
    }, 0);
  }

  // Mutable so the caller always reaches the active pipeline after a switch.
  const handles = { teardown, updateMotion };
  let switched = false;
  function switchToCrossfade() {
    if (switched || tornDown || contextLost || !crossfadeSupported()) return;
    const crossfade = initializeMainThreadCrossfade(controls, false);
    if (!crossfade) return;
    switched = true;
    teardown();
    handles.teardown = crossfade.teardown;
    handles.updateMotion = crossfade.updateMotion;
  }
  return handles;
}
