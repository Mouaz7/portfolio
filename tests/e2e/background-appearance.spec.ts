import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import sharp from "sharp";
import {
  routes,
  visualOutput,
  routeName,
  EXPECTED_BACKGROUND_FPS,
  backgroundSmoothness,
  backgroundFrameDelta,
  backgroundColorSignature,
} from "./helpers/public-pages";

// The shared ocean background on phones, tablets and desktops: profiles, motion, colour balance, fallbacks and theme switching.

const phoneBackgroundProfiles: ReadonlyArray<{
  name: string;
  width: number;
  height: number;
  screenHeight?: number;
  dpr: number;
}> = [
  { name: "galaxy-fold", width: 280, height: 653, dpr: 3 },
  { name: "small-phone", width: 320, height: 568, dpr: 2 },
  { name: "narrow-fold", width: 344, height: 882, dpr: 3 },
  { name: "samsung-real-visible", width: 360, height: 610, screenHeight: 800, dpr: 2 },
  { name: "compact-android", width: 360, height: 740, dpr: 3 },
  { name: "galaxy-s20", width: 360, height: 800, dpr: 3 },
  { name: "iphone-se", width: 375, height: 667, dpr: 2 },
  { name: "modern-phone", width: 390, height: 844, dpr: 3 },
  { name: "pixel-5", width: 393, height: 851, dpr: 2.75 },
  { name: "galaxy-s20-ultra", width: 412, height: 915, dpr: 3 },
  { name: "iphone-pro-max", width: 430, height: 932, dpr: 3 },
  { name: "large-android", width: 480, height: 1040, dpr: 3 },
  { name: "phone-landscape", width: 844, height: 390, dpr: 2 },
  { name: "large-phone-landscape", width: 932, height: 430, dpr: 3 },
];

for (const profile of phoneBackgroundProfiles) {
  test(`mobile background stays animated for ${profile.name} across routes and themes`, async ({ browser }) => {
    test.setTimeout(120_000);

    for (const theme of ["light", "dark"] as const) {
      const context = await browser.newContext({
        viewport: { width: profile.width, height: profile.height },
        screen: { width: profile.width, height: profile.screenHeight ?? profile.height },
        deviceScaleFactor: profile.dpr,
        hasTouch: true,
        isMobile: true,
      });
      await context.addInitScript((selectedTheme) => {
        localStorage.setItem("theme", selectedTheme);
      }, theme);
      const page = await context.newPage();

      for (const route of routes) {
        const label = `${profile.name} ${theme} ${route}`;
        await page.goto(route);
        const canvas = page.locator("canvas[data-background-fps]");

        await expect(canvas, label).toHaveAttribute("data-background-renderer", "webgl");
        await expect(canvas, label).toHaveAttribute("data-background-thread", "main");
        await expect(canvas, label).toHaveAttribute(
          "data-background-profile",
          "continuous-mobile",
        );
        await expect(canvas, label).toHaveAttribute("data-background-mode", "animated");
        await expect(canvas, label).toHaveAttribute("data-background-fps", "60");
        await expect(canvas, label).toHaveAttribute("data-background-scale", "adaptive");

        const canvasBox = await canvas.boundingBox();
        expect(canvasBox, label).toMatchObject({
          x: 0,
          y: 0,
          width: profile.width,
          height: profile.height,
        });

        if (theme === "light") await expect(page.locator("html"), label).toHaveClass(/light/);
        else await expect(page.locator("html"), label).not.toHaveClass(/light/);

        const firstFrame = await canvas.screenshot();
        await page.waitForTimeout(250);
        const nextFrame = await canvas.screenshot();
        expect(nextFrame.equals(firstFrame), `${label} background should animate`).toBe(false);

        if (profile.name === "samsung-real-visible") {
          await mkdir(visualOutput, { recursive: true });
          await page.screenshot({
            path: `${visualOutput}/samsung-${routeName(route)}-${theme}-background.png`,
          });
        }
      }

      await context.close();
    }
  });
}



test("mobile background follows dynamic browser chrome and orientation changes", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 360, height: 610 },
    screen: { width: 360, height: 800 },
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
  });
  await context.addInitScript(() => localStorage.setItem("theme", "dark"));
  const page = await context.newPage();
  await page.goto("/");
  const canvas = page.locator("canvas[data-background-fps]");

  for (const viewport of [
    { width: 360, height: 740 },
    { width: 740, height: 360 },
    { width: 360, height: 610 },
  ]) {
    await page.setViewportSize(viewport);
    // Without GPU acceleration (as in CI) the background uses the crossfade
    // pipeline, whose visible layers hold the keyframes; with a GPU the
    // canvas itself is rendered at 0.82 of the CSS size.
    await expect.poll(async () => canvas.evaluate((element) => {
      const target = element as HTMLCanvasElement;
      const crossfade = target.dataset.backgroundPipeline === "crossfade";
      const shown = crossfade
        ? document.querySelector<HTMLCanvasElement>("canvas[data-background-layer]")!
        : target;
      const scale = crossfade ? Number(target.dataset.backgroundRenderScale) : 0.82;
      return {
        cssWidth: shown.getBoundingClientRect().width,
        cssHeight: shown.getBoundingClientRect().height,
        renderMatches: shown.width === Math.max(2, Math.floor(window.innerWidth * scale))
          && shown.height === Math.max(2, Math.floor(window.innerHeight * scale)),
      };
    })).toEqual({
      cssWidth: viewport.width,
      cssHeight: viewport.height,
      renderMatches: true,
    });
    await expect(canvas).toHaveAttribute("data-background-renderer", "webgl");
    await expect(canvas).toHaveAttribute("data-background-thread", "main");
    await expect(canvas).toHaveAttribute("data-background-profile", "continuous-mobile");
    const firstFrame = await canvas.screenshot();
    await page.waitForTimeout(250);
    const nextFrame = await canvas.screenshot();
    expect(nextFrame.equals(firstFrame), `${viewport.width}x${viewport.height} should animate`).toBe(false);
  }

  await context.close();
});

test("mobile background keeps moving with the soft fallback when WebGL is unavailable", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 360, height: 740 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function getContext(
      this: HTMLCanvasElement,
      contextId: string,
      options?: unknown,
    ) {
      if (contextId === "webgl") return null;
      return originalGetContext.call(this, contextId, options as never);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  await page.goto("/");

  const canvas = page.locator("canvas[data-background-fps]");
  await expect(canvas).toHaveAttribute("data-background-renderer", "css");
  await expect(canvas).toHaveAttribute("data-background-mode", "animated");
  await expect(canvas).toHaveAttribute("data-background-profile", "css-soft");
  await expect.poll(() => canvas.evaluate((element) => (
    element.getAnimations().some((animation) => animation.playState === "running")
  ))).toBe(true);
  const firstFrame = await canvas.screenshot();
  await page.waitForTimeout(500);
  const nextFrame = await canvas.screenshot();
  expect(nextFrame.equals(firstFrame), "CSS fallback should animate").toBe(false);

  await context.close();
});

test("touch laptops keep the desktop background while constrained desktops reduce GPU work", async ({ browser }) => {
  const profiles = [
    {
      name: "touch-laptop",
      cores: 8,
      expectedTier: "desktop",
      expectedScale: "0.52",
      expectedFps: "60",
    },
    {
      name: "constrained-touch-laptop",
      cores: 4,
      expectedTier: "low-power-desktop",
      expectedScale: "0.42",
      expectedFps: "60",
    },
  ] as const;

  for (const profile of profiles) {
    const context = await browser.newContext({
      viewport: { width: 1366, height: 768 },
      hasTouch: true,
      isMobile: false,
    });
    await context.addInitScript((cores) => {
      Object.defineProperty(navigator, "hardwareConcurrency", {
        configurable: true,
        value: cores,
      });
    }, profile.cores);
    const page = await context.newPage();
    await page.goto("/");

    const canvas = page.locator("canvas[data-background-fps]");
    await expect(canvas, profile.name).toHaveAttribute("data-background-renderer", "webgl");
    await expect(canvas, profile.name).toHaveAttribute("data-background-profile", "layered-desktop");
    await expect(canvas, profile.name).toHaveAttribute("data-background-device-tier", profile.expectedTier);
    await expect(canvas, profile.name).toHaveAttribute("data-background-pipeline", /^(two-pass|crossfade)$/);
    // The crossfade pipeline (no GPU, as in CI) reports its keyframe scale.
    const crossfade = await canvas.getAttribute("data-background-pipeline") === "crossfade";
    await expect(canvas, profile.name).toHaveAttribute(
      "data-background-render-scale",
      crossfade ? "0.25" : profile.expectedScale,
    );
    await expect(canvas, profile.name).toHaveAttribute("data-background-fps", profile.expectedFps);

    await context.close();
  }
});

test("mobile background has no hard facet seams across sizes, themes and animation frames", async ({ browser }) => {
  test.setTimeout(120_000);
  const profiles = [
    { name: "narrow", width: 280, height: 653 },
    { name: "samsung", width: 360, height: 610 },
    { name: "large", width: 430, height: 932 },
    { name: "landscape", width: 932, height: 430 },
  ] as const;

  for (const profile of profiles) {
    for (const theme of ["dark", "light"] as const) {
      const context = await browser.newContext({
        viewport: { width: profile.width, height: profile.height },
        deviceScaleFactor: 2,
        hasTouch: true,
        isMobile: true,
      });
      await context.addInitScript((selectedTheme) => {
        localStorage.setItem("theme", selectedTheme);
      }, theme);
      const page = await context.newPage();
      await page.goto("/");
      const canvas = page.locator("canvas[data-background-fps]");
      await expect(canvas).toHaveAttribute("data-background-renderer", "webgl");
      await expect(canvas).toHaveAttribute("data-background-profile", "continuous-mobile");
      await page.addStyleTag({
        content: "body>:not(canvas){display:none!important}",
      });

      let previousScreenshot: Buffer | null = null;
      for (let frame = 0; frame < 2; frame += 1) {
        const screenshot = await page.screenshot();
        const metrics = await backgroundSmoothness(screenshot);
        const label = `${profile.name} ${theme} frame ${frame + 1}`;
        expect(metrics.maxNeighborDelta, `${label} neighbor delta`).toBeLessThanOrEqual(4);
        expect(metrics.maxLaplacian, `${label} local edge curvature`).toBeLessThanOrEqual(8);
        if (previousScreenshot) {
          const meanDelta = await backgroundFrameDelta(previousScreenshot, screenshot);
          expect(meanDelta, `${label} visible animation delta`).toBeGreaterThan(0.2);
        }
        if (profile.name === "samsung" && frame === 0) {
          await mkdir(visualOutput, { recursive: true });
          await sharp(screenshot).toFile(
            `${visualOutput}/samsung-background-only-${theme}.png`,
          );
        }
        previousScreenshot = screenshot;
        await page.waitForTimeout(750);
      }

      await context.close();
    }
  }
});

test("mobile background matches desktop color balance in both themes", async ({ browser }) => {
  test.setTimeout(120_000);

  const expectColorParity = (
    mobile: Awaited<ReturnType<typeof backgroundColorSignature>>,
    desktop: Awaited<ReturnType<typeof backgroundColorSignature>>,
    label: string,
  ) => {
    for (let channel = 0; channel < 3; channel += 1) {
      expect(
        Math.abs(mobile.mean[channel] - desktop.mean[channel]),
        `${label} channel ${channel} mean`,
      ).toBeLessThanOrEqual(3);
      expect(
        Math.abs(mobile.deviation[channel] - desktop.deviation[channel]),
        `${label} channel ${channel} contrast`,
      ).toBeLessThanOrEqual(3);
    }
  };

  const colorDistance = (
    first: Awaited<ReturnType<typeof backgroundColorSignature>>,
    second: Awaited<ReturnType<typeof backgroundColorSignature>>,
  ) => Math.max(
    ...first.mean.map((value, channel) => Math.abs(value - second.mean[channel])),
    ...first.deviation.map((value, channel) => Math.abs(value - second.deviation[channel])),
  );

  for (const theme of ["dark", "light"] as const) {
    const signatures = new Map<"desktop" | "mobile", Awaited<ReturnType<typeof backgroundColorSignature>>>();

    // Capture mobile first so its synchronous main-thread frame can be used to
    // distinguish the desktop WebGL frame from the temporary CSS fallback.
    for (const profile of ["mobile", "desktop"] as const) {
      const mobile = profile === "mobile";
      const context = await browser.newContext({
        viewport: mobile ? { width: 360, height: 610 } : { width: 1440, height: 900 },
        deviceScaleFactor: mobile ? 2 : 1,
        hasTouch: mobile,
        isMobile: mobile,
        reducedMotion: "reduce",
      });
      await context.addInitScript((selectedTheme) => {
        localStorage.setItem("theme", selectedTheme);
      }, theme);
      const page = await context.newPage();
      await page.goto("/");
      const canvas = page.locator("canvas[data-background-fps]");
      await expect(canvas).toHaveAttribute("data-background-renderer", "webgl");
      await expect(canvas).toHaveAttribute(
        "data-background-profile",
        mobile ? "continuous-mobile" : "layered-desktop",
      );
      await expect(canvas).toHaveAttribute("data-background-mode", "static");
      await page.addStyleTag({
        content: "body>:not(canvas){display:none!important}",
      });
      let screenshot = await page.screenshot();
      let signature = await backgroundColorSignature(screenshot);

      if (!mobile) {
        const mobileReference = signatures.get("mobile");
        expect(mobileReference).toBeDefined();
        await expect.poll(async () => {
          screenshot = await page.screenshot();
          signature = await backgroundColorSignature(screenshot);
          return colorDistance(signature, mobileReference!);
        }, {
          message: `${theme} desktop WebGL frame should be composited`,
          timeout: 5_000,
        }).toBeLessThanOrEqual(3);
      }

      signatures.set(profile, signature);
      await mkdir(visualOutput, { recursive: true });
      await sharp(screenshot).toFile(
        `${visualOutput}/theme-parity-${profile}-${theme}.png`,
      );
      await context.close();
    }

    const desktop = signatures.get("desktop");
    const mobile = signatures.get("mobile");
    expect(desktop).toBeDefined();
    expect(mobile).toBeDefined();
    expectColorParity(mobile!, desktop!, `${theme} /`);

    const mobileContext = await browser.newContext({
      viewport: { width: 360, height: 610 },
      deviceScaleFactor: 2,
      hasTouch: true,
      isMobile: true,
      reducedMotion: "reduce",
    });
    await mobileContext.addInitScript((selectedTheme) => {
      localStorage.setItem("theme", selectedTheme);
    }, theme);
    const mobilePage = await mobileContext.newPage();

    for (const route of routes.slice(1)) {
      await mobilePage.goto(route);
      const canvas = mobilePage.locator("canvas[data-background-fps]");
      await expect(canvas).toHaveAttribute("data-background-renderer", "webgl");
      await expect(canvas).toHaveAttribute("data-background-profile", "continuous-mobile");
      await expect(canvas).toHaveAttribute("data-background-mode", "static");
      await mobilePage.addStyleTag({
        content: "body>:not(canvas){display:none!important}",
      });
      const screenshot = await mobilePage.screenshot();
      expectColorParity(
        await backgroundColorSignature(screenshot),
        desktop!,
        `${theme} ${route}`,
      );
      await sharp(screenshot).toFile(
        `${visualOutput}/theme-parity-mobile-${routeName(route)}-${theme}.png`,
      );
    }

    await mobileContext.close();
  }
});

test("theme switches synchronously across phone, landscape and desktop viewports", async ({ browser }) => {
  test.setTimeout(180_000);
  const profiles = [
    { name: "small-phone", width: 320, height: 568, dpr: 2, mobile: true },
    { name: "narrow-fold", width: 344, height: 882, dpr: 3, mobile: true },
    { name: "samsung-real-visible", width: 360, height: 610, dpr: 2, mobile: true },
    { name: "compact-android", width: 360, height: 740, dpr: 3, mobile: true },
    { name: "galaxy-s20-devtools", width: 360, height: 800, dpr: 3, mobile: true },
    { name: "iphone-se", width: 375, height: 667, dpr: 2, mobile: true },
    { name: "modern-phone", width: 390, height: 844, dpr: 3, mobile: true },
    { name: "pixel-5", width: 393, height: 851, dpr: 2.75, mobile: true },
    { name: "galaxy-s20-ultra-devtools", width: 412, height: 915, dpr: 3, mobile: true },
    { name: "large-android", width: 480, height: 1040, dpr: 3, mobile: true },
    { name: "phone-landscape", width: 844, height: 390, dpr: 2, mobile: true },
    { name: "desktop", width: 1366, height: 768, dpr: 1, mobile: false },
  ];

  for (const profile of profiles) {
    const context = await browser.newContext({
      viewport: { width: profile.width, height: profile.height },
      deviceScaleFactor: profile.dpr,
      hasTouch: profile.mobile,
      isMobile: profile.mobile,
    });
    await context.addInitScript(() => localStorage.setItem("theme", "dark"));
    const testPage = await context.newPage();
    await testPage.goto("/");

    const canvas = testPage.locator("canvas[data-background-fps]");
    const canvasBox = await canvas.boundingBox();
    expect(canvasBox, profile.name).toMatchObject({
      x: 0,
      y: 0,
      width: profile.width,
      height: profile.height,
    });
    if (profile.mobile) {
      await expect(canvas, profile.name).toHaveAttribute("data-background-renderer", "webgl");
      await expect(canvas, profile.name).toHaveAttribute("data-background-thread", /^(worker|main)$/);
      await expect(canvas, profile.name).toHaveAttribute("data-background-mode", "animated");
      await expect(canvas, profile.name).toHaveAttribute("data-background-fps", "60");
      await expect(canvas, profile.name).toHaveAttribute(
        "data-background-profile",
        "continuous-mobile",
      );
      const menuButton = testPage.getByRole("button", { name: "Open menu" });
      if (await menuButton.isVisible()) await menuButton.click();
    } else {
      await expect(canvas, profile.name).toHaveAttribute("data-background-thread", /^(worker|main)$/);
      await expect(canvas, profile.name).toHaveAttribute("data-background-mode", "animated");
      await expect(canvas, profile.name).toHaveAttribute(
        "data-background-profile",
        "layered-desktop",
      );
      await expect(canvas, profile.name).toHaveAttribute(
        "data-background-fps",
        EXPECTED_BACKGROUND_FPS,
      );
    }

    const firstFrame = await canvas.screenshot();
    await testPage.waitForTimeout(250);
    const nextFrame = await canvas.screenshot();
    expect(nextFrame.equals(firstFrame), `${profile.name} background should animate`).toBe(false);

    const result = await testPage
      .locator('button[aria-label="Switch to light mode"]:visible')
      .evaluate((button) => {
        const startedAt = performance.now();
        (button as HTMLButtonElement).click();
        const root = document.documentElement;
        return {
          elapsed: performance.now() - startedAt,
          light: root.classList.contains("light"),
          switching: root.dataset.themeSwitching,
          themeColor: document
            .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
            ?.content,
        };
      });

    expect(result.light, profile.name).toBe(true);
    expect(result.themeColor, profile.name).toBe("#defaf5");
    expect(result.switching, profile.name).toBe("true");
    expect(result.elapsed, profile.name).toBeLessThan(50);
    await testPage.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));
    await expect(testPage.locator("html"), profile.name).not.toHaveAttribute("data-theme-switching");
    await context.close();
  }
});

test("performance audit disables continuous motion without changing the rendered design", async ({ page }) => {
  await page.goto("/skills?audit=performance");
  await expect(page.locator(".animate-card").first()).toBeVisible();
  await expect.poll(
    () => page.locator(".animate-card").first().evaluate((element) => (
      getComputedStyle(element).animationName
    )),
  ).toBe("none");
  await expect(page.locator("canvas[data-background-fps]")).toHaveAttribute(
    "data-background-mode",
    "static",
  );
  await expect(page.locator("canvas[data-background-fps]")).toHaveAttribute(
    "data-background-fps",
    "0",
  );

  await page.goto("/skills");
  await expect(page.locator(".animate-card").first()).toBeVisible();
  const expectedCardAnimation = await page.locator("html").evaluate((element) => (
    element.dataset.performanceTier === "low" ? "none" : "cardBounceFadeIn"
  ));
  await expect.poll(
    () => page.locator(".animate-card").first().evaluate((element) => (
      getComputedStyle(element).animationName
    )),
  ).toBe(expectedCardAnimation);
  await expect(page.locator("canvas[data-background-fps]")).toHaveAttribute(
    "data-background-mode",
    "animated",
  );
  await expect(page.locator("canvas[data-background-fps]")).toHaveAttribute(
    "data-background-fps",
    EXPECTED_BACKGROUND_FPS,
  );
});
