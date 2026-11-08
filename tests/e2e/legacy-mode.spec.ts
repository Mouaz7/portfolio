import { expect, test } from "@playwright/test";
import { allowLoopbackHttp } from "./fixtures";

// The HTTP-only loopback server cannot satisfy WebKit's HTTPS upgrades.
test.beforeEach(async ({ page }) => {
  await allowLoopbackHttp(page);
});

test("supported browsers never switch to simple mode", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("main")).toBeVisible();
  expect(await page.locator("html").getAttribute("data-legacy")).toBeNull();
  expect(await page.locator('link[href="/legacy.css"]').count()).toBe(0);
});

test("browsers without cascade layers load the flattened CSS and stay readable", async ({ page }) => {
  // Simulate an engine without @layer support (iOS < 15.4, Chrome < 99).
  await page.addInitScript(() => {
    delete (window as unknown as { CSSLayerBlockRule?: unknown }).CSSLayerBlockRule;
  });
  const legacyCss = page.waitForResponse((response) => response.url().endsWith("/legacy.css"));
  await page.goto("/sv");
  await expect(page.locator("html")).toHaveAttribute("data-legacy", "css");
  expect((await legacyCss).status()).toBe(200);
  // The flattened stylesheet comes before every other stylesheet.
  const firstStylesheet = await page.evaluate(() => (
    document.querySelector('link[rel="stylesheet"]')?.getAttribute("href")
  ));
  expect(firstStylesheet).toBe("/legacy.css");
  const banner = await page.evaluate(() => getComputedStyle(document.body, "::before").content);
  expect(banner).toContain("enkel version");
  await expect(page.locator("main")).toBeVisible();
  await expect(page.locator(".page-loading-stage")).toHaveCount(0);
});

test("browsers with too old JavaScript get the simple-mode notice", async ({ page }) => {
  await page.addInitScript(() => {
    delete (window as unknown as { structuredClone?: unknown }).structuredClone;
  });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-legacy", "js");
  expect(await page.locator('link[href="/legacy.css"]').count()).toBe(0);
  const banner = await page.evaluate(() => getComputedStyle(document.body, "::before").content);
  expect(banner).toContain("simple version");
});

test("pages stay readable with JavaScript turned off", async ({ browser }) => {
  // Streamed content arrives in hidden containers that a script normally
  // reveals; the noscript style must win over Tailwind's layered [hidden] rule.
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await allowLoopbackHttp(page);
  for (const path of ["/", "/sv/projects", "/journey"]) {
    await page.goto(path);
    await expect(page.locator("main").first(), path).toBeVisible();
    const hiddenStreams = await page.locator('div[hidden][id^="S:"]').evaluateAll((nodes) => (
      nodes.filter((node) => getComputedStyle(node).display === "none").length
    ));
    expect(hiddenStreams, path).toBe(0);
  }
  await context.close();
});
