import type { RendererSettings } from "./renderer";

/**
 * Phones and small touch tablets. A coarse pointer by itself is not a mobile
 * signal: many Windows laptops expose a touchscreen alongside a full desktop
 * viewport.
 */
export const MOBILE_RENDER_QUERY =
  "(max-width: 675px), (max-width: 960px) and (hover: none), (max-width: 960px) and (pointer: coarse)";

export type BackgroundDeviceTier = "mobile" | "low-power-desktop" | "desktop";

export type BackgroundProfileInput = {
  /** Result of matchMedia(MOBILE_RENDER_QUERY). */
  mobileViewport: boolean;
  /** html[data-performance-tier="low"], set by the inline performance script. */
  constrainedDevice: boolean;
  /** Worker + OffscreenCanvas transfer are available in production. */
  workerAvailable: boolean;
};

export type BackgroundProfile = {
  tier: BackgroundDeviceTier;
  /** data-background-profile value while WebGL is active. */
  profileName: "continuous-mobile" | "layered-desktop";
  thread: "worker" | "main";
  powerPreference: WebGLPowerPreference;
  renderer: RendererSettings;
};

// Output resolutions used when the browser renders WebGL in software. They are
// the original single-pass canvas scales, so software-rendered devices (and the
// headless test browsers) see exactly the canvas size they always have.
export const SOFTWARE_OUTPUT_SCALE: Record<BackgroundDeviceTier, number> = {
  mobile: 0.82,
  "low-power-desktop": 0.42,
  desktop: 0.52,
};

export const BACKGROUND_TARGET_FPS = 60;

export function selectBackgroundProfile(input: BackgroundProfileInput): BackgroundProfile {
  const tier: BackgroundDeviceTier = input.mobileViewport
    ? "mobile"
    : input.constrainedDevice
      ? "low-power-desktop"
      : "desktop";

  // Samsung Internet can expose OffscreenCanvas transfer support while failing
  // to create WebGL inside the worker, and a transferred canvas cannot be
  // recovered for a main-thread retry. Phones therefore keep the renderer on
  // the main thread; desktops use the worker when it is available.
  const thread = tier !== "mobile" && input.workerAvailable ? "worker" : "main";

  const renderer: RendererSettings = tier === "mobile"
    ? {
      shader: "mobile",
      fieldScale: 0.5,
      keyframesPerSecond: 15,
      softwareOutputScale: SOFTWARE_OUTPUT_SCALE.mobile,
      softwareFieldScale: 0.41,
      softwareKeyframesPerSecond: 10,
      targetFps: BACKGROUND_TARGET_FPS,
    }
    : {
      shader: "desktop",
      fieldScale: tier === "desktop" ? 0.35 : 0.3,
      keyframesPerSecond: tier === "desktop" ? 15 : 12,
      softwareOutputScale: SOFTWARE_OUTPUT_SCALE[tier],
      softwareFieldScale: 0.25,
      softwareKeyframesPerSecond: 10,
      targetFps: BACKGROUND_TARGET_FPS,
    };

  return {
    tier,
    profileName: tier === "mobile" ? "continuous-mobile" : "layered-desktop",
    thread,
    powerPreference: tier === "desktop" ? "high-performance" : "low-power",
    renderer,
  };
}

/** Reads the tier the inline performance script stored on <html>. */
export function isConstrainedDocument(root: HTMLElement = document.documentElement) {
  return root.dataset.performanceTier === "low";
}
