import { FramePacer, advanceAnimationTime } from "@/lib/background/renderer";
import {
  BACKGROUND_TARGET_FPS,
  MOBILE_RENDER_QUERY,
  SOFTWARE_OUTPUT_SCALE,
  selectBackgroundProfile,
} from "@/lib/background/profile";
import { performanceTierInitScript } from "@/lib/security/inline-scripts.cjs";

describe("selectBackgroundProfile", () => {
  it.each([
    {
      name: "phone",
      input: { mobileViewport: true, constrainedDevice: false, workerAvailable: true },
      tier: "mobile",
      thread: "main",
      shader: "mobile",
      profileName: "continuous-mobile",
      power: "low-power",
    },
    {
      name: "constrained phone",
      input: { mobileViewport: true, constrainedDevice: true, workerAvailable: true },
      tier: "mobile",
      thread: "main",
      shader: "mobile",
      profileName: "continuous-mobile",
      power: "low-power",
    },
    {
      name: "4-core / 4 GB desktop",
      input: { mobileViewport: false, constrainedDevice: true, workerAvailable: true },
      tier: "low-power-desktop",
      thread: "worker",
      shader: "desktop",
      profileName: "layered-desktop",
      power: "low-power",
    },
    {
      name: "desktop",
      input: { mobileViewport: false, constrainedDevice: false, workerAvailable: true },
      tier: "desktop",
      thread: "worker",
      shader: "desktop",
      profileName: "layered-desktop",
      power: "high-performance",
    },
    {
      name: "desktop without OffscreenCanvas",
      input: { mobileViewport: false, constrainedDevice: false, workerAvailable: false },
      tier: "desktop",
      thread: "main",
      shader: "desktop",
      profileName: "layered-desktop",
      power: "high-performance",
    },
  ])("$name", ({ input, tier, thread, shader, profileName, power }) => {
    const profile = selectBackgroundProfile(input);
    expect(profile.tier).toBe(tier);
    expect(profile.thread).toBe(thread);
    expect(profile.renderer.shader).toBe(shader);
    expect(profile.profileName).toBe(profileName);
    expect(profile.powerPreference).toBe(power);
    // Every device keeps the full 60 fps motion.
    expect(profile.renderer.targetFps).toBe(BACKGROUND_TARGET_FPS);
    expect(BACKGROUND_TARGET_FPS).toBe(60);
    // Software rendering keeps the original single-pass canvas resolution.
    expect(profile.renderer.softwareOutputScale).toBe(SOFTWARE_OUTPUT_SCALE[profile.tier]);
    // Keyframes are cheaper than the old 60 renders per second.
    expect(profile.renderer.fieldScale).toBeLessThanOrEqual(0.5);
    expect(profile.renderer.keyframesPerSecond).toBeLessThanOrEqual(15);
  });

  it("keeps the original software canvas scales", () => {
    expect(SOFTWARE_OUTPUT_SCALE).toEqual({
      mobile: 0.82,
      "low-power-desktop": 0.42,
      desktop: 0.52,
    });
  });

  it("matches the inline performance-tier script", () => {
    // The inline script and the profile must agree on what "constrained" means.
    expect(performanceTierInitScript).toContain("memory <= 4");
    expect(performanceTierInitScript).toContain("cores <= 4");
    expect(performanceTierInitScript).toContain("saveData");
    expect(MOBILE_RENDER_QUERY).toContain("(max-width: 675px)");
  });
});

describe("FramePacer", () => {
  function renderedFps(refreshHz: number, seconds = 2) {
    const pacer = new FramePacer(60);
    const vsync = 1000 / refreshHz;
    let rendered = 0;
    for (let frame = 0; frame < refreshHz * seconds; frame += 1) {
      if (pacer.shouldRender(frame * vsync)) rendered += 1;
    }
    return rendered / seconds;
  }

  it.each([
    [60, 60],
    [75, 75],
    [90, 90],
    [100, 100],
    [120, 60],
    [144, 72],
    [165, 82.5],
    [240, 60],
  ])("renders evenly on a %i Hz display (≈%d fps, never below 60)", (refresh, expected) => {
    expect(renderedFps(refresh)).toBeGreaterThanOrEqual(58);
    expect(Math.abs(renderedFps(refresh) - expected)).toBeLessThanOrEqual(2);
  });

  it("detects a device that cannot keep up", () => {
    const pacer = new FramePacer(60);
    for (let frame = 0; frame < 120; frame += 1) pacer.shouldRender(frame * 40);
    expect(pacer.isStruggling()).toBe(true);
    pacer.resetMeasurements();
    expect(pacer.isStruggling()).toBe(false);
  });

  it("does not flag an even 30 fps cap (Low Power Mode, energy saver)", () => {
    const pacer = new FramePacer(60);
    for (let frame = 0; frame < 200; frame += 1) pacer.shouldRender(frame * (1000 / 30));
    expect(pacer.isStruggling()).toBe(false);
  });

  it("flags uneven frames that average about 30 fps", () => {
    const pacer = new FramePacer(60);
    let now = 0;
    for (let frame = 0; frame < 200; frame += 1) {
      now += frame % 2 === 0 ? 25 : 45;
      pacer.shouldRender(now);
    }
    expect(pacer.isStruggling()).toBe(true);
  });

  it("does not flag a device running at the target", () => {
    const pacer = new FramePacer(60);
    for (let frame = 0; frame < 200; frame += 1) pacer.shouldRender(frame * (1000 / 60));
    expect(pacer.isStruggling()).toBe(false);
  });
});

describe("advanceAnimationTime", () => {
  const run = (fps: number, seconds: number) => {
    let elapsed = 0;
    for (let frame = 0; frame < fps * seconds; frame += 1) elapsed = advanceAnimationTime(elapsed, 1000 / fps);
    return elapsed / 1000;
  };

  it.each([60, 30, 24, 20, 15])("keeps wall-clock speed at %i fps", (fps) => {
    expect(run(fps, 10)).toBeCloseTo(10, 6);
  });

  it("does not jump after a long stall and ignores negative deltas", () => {
    expect(advanceAnimationTime(0, 2_000)).toBe(100);
    expect(advanceAnimationTime(50, -5)).toBe(50);
  });
});
