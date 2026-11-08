import { expect, test } from "@playwright/test";

// A weak phone: mobile viewport, touch, and the main thread slowed down 6×.
// The background must keep moving (compositor crossfade or WebGL) without
// long main-thread stalls while the visitor is idle on the page.
test("background keeps animating on a weak phone without long main-thread stalls", async ({ browser }) => {
  test.setTimeout(60_000);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });
  await page.addInitScript(() => {
    const longTasks: number[] = [];
    (window as unknown as { __longTasks: number[] }).__longTasks = longTasks;
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) longTasks.push(entry.duration);
      }).observe({ type: "longtask", buffered: true });
    } catch {
      // longtask is Chromium-only.
    }
  });
  await page.goto("/");
  const canvas = page.locator("canvas[data-background-fps]");
  await expect(canvas).toHaveAttribute("data-background-renderer", "webgl", { timeout: 20_000 });
  await expect(canvas).toHaveAttribute("data-background-mode", "animated");
  // Headless Chromium renders WebGL in software, like a phone without usable
  // GPU acceleration: the compositor crossfade must take over.
  await expect(canvas).toHaveAttribute("data-background-pipeline", "crossfade", { timeout: 20_000 });
  // ...and the page drops its per-frame CPU effects (performance-tier.css).
  await expect(page.locator("html")).toHaveAttribute("data-render-mode", "software");
  const blur = await page.locator(".backdrop-blur-md").first().evaluate((element) => {
    const style = getComputedStyle(element);
    return style.backdropFilter || style.getPropertyValue("-webkit-backdrop-filter");
  });
  expect(blur).toBe("none");
  // Let start-up work finish, then measure an idle window.
  await page.waitForTimeout(4_000);
  await page.evaluate(() => { (window as unknown as { __longTasks: number[] }).__longTasks.length = 0; });
  const first = await page.screenshot({ clip: { x: 0, y: 0, width: 120, height: 120 } });
  await page.waitForTimeout(5_000);
  const next = await page.screenshot({ clip: { x: 0, y: 0, width: 120, height: 120 } });
  expect(next.equals(first), "background should keep moving").toBe(false);
  const fades = await page.evaluate(() => (
    document.getAnimations()
      .filter((animation) => (animation.effect as KeyframeEffect | null)?.target instanceof HTMLCanvasElement)
      .map((animation) => animation.playState)
  ));
  expect(fades, "crossfade animation").toContain("running");
  const longTasks = await page.evaluate(() => (window as unknown as { __longTasks: number[] }).__longTasks);
  expect(longTasks.filter((duration) => duration > 100), `long tasks: ${longTasks.join(", ")}`).toEqual([]);
  await context.close();
});
