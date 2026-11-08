/// <reference lib="webworker" />

import {
  FramePacer,
  WaveRenderer,
  advanceAnimationTime,
  createKeyframePainter,
  type BackgroundColors,
  type KeyframePainter,
  type RendererSettings,
} from "./renderer";

type WorkerMessage =
  | {
      type: "init";
      generation: number;
      visible: boolean;
      canvas: OffscreenCanvas;
      width: number;
      height: number;
      devicePixelRatio: number;
      settings: RendererSettings;
      colors: BackgroundColors;
      reduced: boolean;
      powerPreference: WebGLPowerPreference;
      /** Switch to keyframes for the crossfade pipeline on software rendering. */
      crossfade: boolean;
    }
  | { type: "keyframe"; id: number; time: number; width: number; height: number }
  | { type: "crossfade" }
  | { type: "colors"; colors: BackgroundColors }
  | { type: "resize"; width: number; height: number; devicePixelRatio: number }
  | { type: "pointer"; x: number; y: number; amount: number }
  | { type: "visibility"; visible: boolean }
  | { type: "motion"; reduced: boolean }
  | { type: "dispose" };

const scope = self as unknown as DedicatedWorkerGlobalScope;
let renderer: WaveRenderer | null = null;
let pacer: FramePacer | null = null;
let reduced = false;
let running = false;
let targetFps = 60;
let animationElapsed = 0;
let previousTick = performance.now();
let raf = 0;
let timer = 0;
let generation = 0;
let contextLost = false;
let settings: RendererSettings | null = null;
let colors: BackgroundColors | null = null;
let painter: KeyframePainter | null = null;

function post(message: Record<string, unknown>) {
  scope.postMessage({ ...message, generation });
}

function draw(now: number) {
  if (!renderer || contextLost) return;
  // Resize before drawing: changing the canvas size clears it.
  if (!reduced && pacer?.isStruggling()) {
    pacer.resetMeasurements();
    if (renderer.reduceOutputResolution()) {
      post({ type: "scale", outputScale: renderer.status.outputScale });
    } else {
      // Already at the lowest output resolution and still too slow: ask the
      // main thread to move to the much cheaper crossfade pipeline.
      post({ type: "struggling" });
    }
  }
  renderer.render(animationElapsed / 1000, reduced);
  previousTick = now;
}

function cancelFrame() {
  if (raf && typeof scope.cancelAnimationFrame === "function") scope.cancelAnimationFrame(raf);
  if (timer) scope.clearTimeout(timer);
  raf = 0;
  timer = 0;
}

function scheduleFrame() {
  if (!running || reduced || contextLost || !renderer) return;
  if (typeof scope.requestAnimationFrame === "function") {
    raf = scope.requestAnimationFrame(tick);
  } else {
    timer = scope.setTimeout(() => tick(performance.now()), 1000 / targetFps);
  }
}

function tick(now: number) {
  raf = 0;
  timer = 0;
  if (!running || reduced) return;
  animationElapsed = advanceAnimationTime(animationElapsed, now - previousTick);
  previousTick = now;
  if (!pacer || pacer.shouldRender(now)) draw(now);
  scheduleFrame();
}

function dispose() {
  running = false;
  cancelFrame();
  painter?.dispose();
  painter = null;
  renderer?.dispose();
  renderer = null;
}

/**
 * Stops the WebGL composite loop and serves keyframes for the crossfade
 * pipeline instead (see crossfade.ts).
 */
function enterCrossfade(announce: boolean) {
  if (!settings) throw new Error("Not initialised");
  running = false;
  cancelFrame();
  // Keep the transferred canvas's context alive: losing it on purpose would
  // fire webglcontextlost and make the main thread tear the background down.
  renderer?.dispose(false);
  renderer = null;
  painter = createKeyframePainter(settings.shader);
  if (!painter) throw new Error("Keyframe painter unavailable");
  if (announce) post({
    type: "crossfade",
    fieldScale: settings.softwareFieldScale,
    keyframeSeconds: 1 / settings.softwareKeyframesPerSecond,
  });
}

async function paintKeyframe(message: Extract<WorkerMessage, { type: "keyframe" }>) {
  if (!painter || !colors) {
    post({ type: "keyframe", id: message.id, bitmap: null });
    return;
  }
  painter.paint(message.time, colors, message.width, message.height);
  const bitmap = await painter.bitmap();
  scope.postMessage({ type: "keyframe", id: message.id, bitmap, generation }, [bitmap]);
}

function initialize(message: Extract<WorkerMessage, { type: "init" }>) {
  settings = message.settings;
  colors = message.colors;
  generation = message.generation;
  const canvas = message.canvas;
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    // In crossfade mode this canvas is no longer drawn; only the keyframe
    // painter's own context matters (its loss surfaces as a keyframe error).
    if (painter) return;
    contextLost = true;
    running = false;
    cancelFrame();
    post({ type: "lost" });
  });
  canvas.addEventListener("webglcontextrestored", () => {
    post({ type: "restored" });
  });
  reduced = message.reduced;
  targetFps = message.settings.targetFps;
  const gl = canvas.getContext("webgl", {
    antialias: false,
    alpha: false,
    depth: false,
    stencil: false,
    powerPreference: message.powerPreference,
  });
  if (!gl) throw new Error("WebGL is unavailable");

  renderer = new WaveRenderer(gl, canvas, message.settings);
  post({ type: "compiled" });
  if (renderer.status.software && message.crossfade) {
    enterCrossfade(false);
    post({ type: "ready", software: true, outputScale: message.settings.softwareFieldScale, mode: "crossfade" });
    return;
  }
  pacer = new FramePacer(targetFps);
  renderer.setColors(message.colors);
  renderer.resize(message.width, message.height, message.devicePixelRatio);
  running = message.visible;
  previousTick = performance.now();
  renderer.render(0, reduced);
  // Complete the first GPU draw before telling the main thread that WebGL is
  // ready, so the CSS fallback is never replaced by an unfinished frame.
  gl.finish();
  scheduleFrame();
  post({
    type: "ready",
    software: renderer.status.software,
    outputScale: renderer.status.outputScale,
  });
}

scope.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;
  try {
    if (message.type === "init") initialize(message);
    else if (message.type === "keyframe") void paintKeyframe(message).catch(() => post({ type: "error" }));
    else if (message.type === "crossfade") enterCrossfade(true);
    else if (message.type === "colors") {
      colors = message.colors;
      renderer?.setColors(message.colors);
      if (renderer && !contextLost) renderer.render(animationElapsed / 1000, reduced);
    } else if (message.type === "resize") {
      // A lost context cannot allocate textures; the main thread restarts the
      // worker at the current size once the context is restored.
      if (contextLost) return;
      renderer?.resize(message.width, message.height, message.devicePixelRatio);
      if (renderer && !contextLost) renderer.render(animationElapsed / 1000, reduced);
      if (renderer) post({ type: "scale", outputScale: renderer.status.outputScale });
    } else if (message.type === "pointer") {
      renderer?.setPointer(message.x, message.y, message.amount);
      if (reduced && renderer && !contextLost) renderer.render(animationElapsed / 1000, true);
    } else if (message.type === "motion") {
      reduced = message.reduced;
      cancelFrame();
      previousTick = performance.now();
      pacer?.resetMeasurements();
      if (renderer && !contextLost) renderer.render(animationElapsed / 1000, reduced);
      if (running && !contextLost) scheduleFrame();
    } else if (message.type === "visibility") {
      running = message.visible && !contextLost;
      cancelFrame();
      previousTick = performance.now();
      pacer?.resetMeasurements();
      if (running && renderer) {
        renderer.render(animationElapsed / 1000, reduced);
        scheduleFrame();
      }
    } else if (message.type === "dispose") {
      dispose();
      scope.close();
    }
  } catch {
    dispose();
    post({ type: "error" });
  }
};

export {};
