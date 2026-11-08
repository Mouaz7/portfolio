// DOM-side state of the site background: theme colours read from CSS,
// viewport size, the data-* attributes that describe the active renderer,
// and starting the compositor crossfade. Shared by the worker host
// (worker-host.ts), the main-thread renderers (main-thread.ts) and the React
// component (components/ui/SiteBackground.tsx).

import { CrossfadeController, type KeyframeSource } from "./crossfade";
import { BACKGROUND_TARGET_FPS, type BackgroundProfile } from "./profile";
import type { BackgroundColors } from "./renderer";
import { isLightTheme } from "@/lib/theme/theme-store";

export const CSS_FALLBACK =
  "radial-gradient(ellipse at 14% 18%, rgba(var(--wave-foam-rgb),0.66) 0%, transparent 46%)," +
  "radial-gradient(ellipse at 82% 28%, rgba(var(--wave-cyan-rgb),0.58) 0%, transparent 48%)," +
  "radial-gradient(ellipse at 42% 78%, rgba(var(--wave-mint-rgb),0.46) 0%, transparent 50%)," +
  "radial-gradient(ellipse at 88% 90%, rgba(var(--wave-teal-rgb),0.52) 0%, transparent 46%)," +
  "linear-gradient(132deg, rgba(var(--wave-teal-rgb),0.28), rgba(var(--wave-foam-rgb),0.18) 48%, var(--bg))";

function readRgb(
  styles: CSSStyleDeclaration,
  name: string,
  fallback: [number, number, number],
): [number, number, number] {
  const raw = styles.getPropertyValue(name).trim();
  const parts = raw.split(",").map((n) => parseFloat(n));
  if (parts.length === 3 && parts.every((n) => !Number.isNaN(n))) {
    return [parts[0] / 255, parts[1] / 255, parts[2] / 255];
  }
  return fallback.map((n) => n / 255) as [number, number, number];
}

export function readThemeColors(): BackgroundColors {
  const styles = getComputedStyle(document.documentElement);
  return {
    bg: readRgb(styles, "--bg-rgb", [222, 250, 245]),
    accent: readRgb(styles, "--accent-rgb", [8, 185, 190]),
    accent2: readRgb(styles, "--accent-2-rgb", [146, 244, 212]),
    cyan: readRgb(styles, "--wave-cyan-rgb", [29, 207, 212]),
    teal: readRgb(styles, "--wave-teal-rgb", [0, 166, 171]),
    mint: readRgb(styles, "--wave-mint-rgb", [128, 246, 203]),
    foam: readRgb(styles, "--wave-foam-rgb", [250, 255, 253]),
    light: isLightTheme() ? 1 : 0,
  };
}

export function viewportSize() {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio || 1,
  };
}

export function workerSupported(canvas: HTMLCanvasElement) {
  return process.env.NODE_ENV === "production"
    && typeof Worker !== "undefined"
    && typeof canvas.transferControlToOffscreen === "function";
}

export function markWebgl(
  canvas: HTMLCanvasElement,
  profile: BackgroundProfile,
  thread: "worker" | "main",
  reduced: boolean,
  outputScale: number,
) {
  canvas.dataset.backgroundRenderer = "webgl";
  canvas.dataset.backgroundThread = thread;
  canvas.dataset.backgroundPipeline = "two-pass";
  canvas.dataset.backgroundMode = reduced ? "static" : "animated";
  canvas.dataset.backgroundFps = reduced ? "0" : String(BACKGROUND_TARGET_FPS);
  canvas.dataset.backgroundProfile = profile.profileName;
  canvas.dataset.backgroundDeviceTier = profile.tier;
  canvas.dataset.backgroundRenderScale = String(Math.round(outputScale * 100) / 100);
}

function markCrossfade(
  canvas: HTMLCanvasElement,
  profile: BackgroundProfile,
  thread: "worker" | "main",
  reduced: boolean,
  fieldScale: number,
  software: boolean,
) {
  markWebgl(canvas, profile, thread, reduced, fieldScale);
  canvas.dataset.backgroundPipeline = "crossfade";
  // Only without usable GPU acceleration does the page drop effects that cost
  // CPU on every frame (app/styles/performance-tier.css). A GPU that merely
  // struggled keeps the full look; only the background gets cheaper.
  if (software) document.documentElement.dataset.renderMode = "software";
}

/** Starts the crossfade pipeline; resolves null if no keyframe could be shown. */
export async function startCrossfade(
  controls: BackgroundControls,
  source: KeyframeSource,
  thread: "worker" | "main",
  fieldScale: number,
  keyframeSeconds: number,
  onFailure: () => void,
  /** True when WebGL renders in software (no GPU acceleration). */
  software: boolean,
) {
  const { canvas, profile } = controls;
  const initialColors = readThemeColors();
  let crossfade: CrossfadeController;
  try {
    crossfade = new CrossfadeController({
      anchor: canvas,
      source,
      keyframeSeconds,
      fieldScale,
      reduced: controls.isReduced(),
      visible: !document.hidden,
      colors: initialColors,
      glow: profile.renderer.shader === "desktop",
      onFailure,
    });
  } catch {
    return null;
  }
  if (!(await crossfade.ready())) {
    crossfade.dispose();
    return null;
  }
  // Catch up with anything that changed while the first keyframes were made.
  crossfade.setVisible(!document.hidden);
  crossfade.setReduced(controls.isReduced());
  const colors = readThemeColors();
  if (JSON.stringify(colors) !== JSON.stringify(initialColors)) crossfade.setColors(colors);
  markCrossfade(canvas, profile, thread, controls.isReduced(), fieldScale, software);
  return crossfade;
}

export type BackgroundControls = {
  canvas: HTMLCanvasElement;
  profile: BackgroundProfile;
  generation: number;
  isReduced: () => boolean;
  /** Shows the CSS background; a reason also sends an anonymous report. */
  applyCssFallback: (reason?: string) => void;
  /** GPU context restored: rebuild everything on a fresh canvas. */
  restart: () => void;
  /** The worker failed after the canvas was transferred: retry on the main thread. */
  retryOnMainThread: () => void;
};
