import type { Page } from "@playwright/test";

/**
 * WebKit upgrades loopback HTTP assets when the production CSP asks for
 * HTTPS. The local Next server is HTTP-only, so strip only the
 * `upgrade-insecure-requests` directive from loopback navigations and keep
 * every other CSP rule intact. Real preview/production checks use HTTPS and
 * need no such harness adjustment.
 *
 * Non-matching requests use `route.fallback()` so handlers registered earlier
 * on the same page still run.
 */
export async function allowLoopbackHttp(page: Page): Promise<void> {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (!route.request().isNavigationRequest() || url.protocol !== "http:" || url.hostname !== "127.0.0.1") {
      await route.fallback();
      return;
    }
    const response = await route.fetch();
    const headers = response.headers();
    if (headers["content-security-policy"]) {
      headers["content-security-policy"] = headers["content-security-policy"].replace(/upgrade-insecure-requests;?/g, "");
    }
    await route.fulfill({ response, headers });
  });
}

/**
 * Headless Chromium has no GPU, so the site switches to its software render
 * mode (app/styles/performance-tier.css). Visual locks capture what devices
 * with a GPU see, so this keeps that switch from taking effect.
 */
export async function keepGpuRenderMode(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // Observe the whole document: the final <html> element does not exist yet
    // when init scripts run.
    new MutationObserver(() => {
      if (document.documentElement.hasAttribute("data-render-mode")) {
        document.documentElement.removeAttribute("data-render-mode");
      }
    }).observe(document, { attributes: true, attributeFilter: ["data-render-mode"], subtree: true });
  });
}
