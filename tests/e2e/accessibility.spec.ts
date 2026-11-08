import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { keepGpuRenderMode } from "./fixtures";
import {
  routes,
  viewports,
  visualOutput,
  routeName,
  waitUntil,
} from "./helpers/public-pages";

// Accessibility and visual capture of every public route: axe checks in both themes, the pixel-lock screenshots, 400 % reflow, forced colours, focus handling and the privacy page.

for (const viewport of viewports) {
  for (const theme of ["light", "dark"] as const) {
    test.describe(`${viewport.name} ${theme}`, () => {
      test.use({ viewport });
      for (const route of routes) {
        test(`${route} has no serious accessibility failures`, async ({ page }) => {
          await page.emulateMedia({ reducedMotion: "reduce" });
          await page.addInitScript((selectedTheme) => localStorage.setItem("theme", selectedTheme), theme);
          await keepGpuRenderMode(page);
          const startedAt = Date.now();
          await page.goto(route);
          const navigationFinishedAt = Date.now();
          await page.addStyleTag({
            content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}canvas{visibility:hidden!important}",
          });
          await mkdir(visualOutput, { recursive: true });
          await waitUntil(startedAt, 790);
          await page.screenshot({
            path: `${visualOutput}/${viewport.name}-${routeName(route)}-${theme}-before-800.png`,
          });
          await waitUntil(startedAt, 810);
          await page.screenshot({
            path: `${visualOutput}/${viewport.name}-${routeName(route)}-${theme}-after-800.png`,
          });
          await waitUntil(navigationFinishedAt, 5_000);
          if (route === "/skills") {
            await expect(page.locator(".skills-card-surface").first()).toBeVisible();
          }
          await page.evaluate(async () => {
            await document.fonts.ready;
            await Promise.all(Array.from(document.images, (image) => {
              if (image.complete) return Promise.resolve();
              return new Promise<void>((resolve) => {
                image.addEventListener("load", () => resolve(), { once: true });
                image.addEventListener("error", () => resolve(), { once: true });
              });
            }));
          });
          await expect(page.locator("body")).toBeVisible();
          await page.screenshot({
            path: `${visualOutput}/${viewport.name}-${routeName(route)}-${theme}.png`,
          });
          const results = await new AxeBuilder({ page }).analyze();
          const blocking = results.violations.filter(
            (item) => ["serious", "critical"].includes(item.impact ?? ""),
          );
          expect(blocking).toEqual([]);
        });
      }
    });
  }
}

test("privacy page remains accessible in both themes and at 400 percent reflow", async ({ browser }) => {
  test.setTimeout(90_000);

  for (const viewport of [
    { name: "400-percent-reflow", width: 320, height: 800 },
    { name: "desktop", width: 1440, height: 900 },
  ] as const) {
    for (const theme of ["light", "dark"] as const) {
      const context = await browser.newContext({ viewport });
      await context.addInitScript((selectedTheme) => localStorage.setItem("theme", selectedTheme), theme);
      const page = await context.newPage();
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/privacy");

      const label = `${viewport.name} ${theme}`;
      const privacyPage = page.locator("[data-privacy-page]");
      const privacyMain = privacyPage.locator("main");
      await expect(page.getByRole("heading", { name: "Privacy", level: 1 }), label).toBeVisible();
      await expect(page.locator(".site-footer"), label).toBeInViewport();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
        label,
      ).toBeLessThanOrEqual(1);

      await privacyMain.evaluate((element) => element.scrollTo(0, element.scrollHeight));
      await expect(page.getByRole("link", { name: "Go to Contact" }), label).toBeVisible();

      const results = await new AxeBuilder({ page }).analyze();
      const blocking = results.violations.filter(
        (item) => ["serious", "critical"].includes(item.impact ?? ""),
      );
      expect(blocking, label).toEqual([]);
      await context.close();
    }
  }
});

test("privacy page is localized in English, Swedish and Arabic", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });

  for (const entry of [
    { route: "/privacy", locale: "en", direction: "ltr", title: "Privacy" },
    { route: "/sv/privacy", locale: "sv", direction: "ltr", title: "Integritet" },
    { route: "/ar/privacy", locale: "ar", direction: "rtl", title: "الخصوصية" },
  ] as const) {
    await page.goto(entry.route);
    await expect(page.locator("html")).toHaveAttribute("lang", entry.locale);
    await expect(page.locator("html")).toHaveAttribute("dir", entry.direction);
    await expect(page.getByRole("heading", { name: entry.title, level: 1 })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
      entry.route,
    ).toBeLessThanOrEqual(1);
  }
});

test("mobile menu traps focus, closes with Escape and returns focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const opener = page.getByRole("button", { name: "Open menu" });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Site navigation" });
  const close = dialog.getByRole("button", { name: "Close menu" });
  await expect(close).toBeFocused();

  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("link", { name: "Contact" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
  await expect(page.locator('[role="dialog"][aria-hidden="true"]')).toHaveAttribute("inert", "");
});

test("Windows forced colors preserves keyboard focus and contact errors", async ({ browser }) => {
  const profiles = [
    { name: "400-percent-reflow", width: 320, height: 800 },
    { name: "compact-laptop", width: 800, height: 600 },
    { name: "desktop", width: 1366, height: 768 },
  ] as const;

  for (const profile of profiles) {
    const context = await browser.newContext({
      viewport: profile,
      forcedColors: "active",
    });
    const testPage = await context.newPage();
    await testPage.emulateMedia({ reducedMotion: "reduce" });
    await testPage.goto("/contact?audit=performance");

    const form = testPage.locator('form[aria-label="Contact form"]:visible');
    const name = form.getByPlaceholder("Name");
    const submit = form.getByRole("button", { name: /Commit & send|Send/ });
    await submit.evaluate((button) => (button as HTMLButtonElement).click());
    await expect(name, profile.name).toBeFocused();
    await expect(name, profile.name).toHaveAttribute("aria-invalid", "true");

    const state = await name.evaluate((element) => {
      const input = element as HTMLInputElement;
      const inputStyle = getComputedStyle(input);
      const alert = input.form?.querySelector<HTMLElement>('[role="alert"]');
      const alertStyle = alert ? getComputedStyle(alert) : null;
      return {
        forcedColors: matchMedia("(forced-colors: active)").matches,
        horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
        inputOutlineStyle: inputStyle.outlineStyle,
        inputOutlineWidth: parseFloat(inputStyle.outlineWidth),
        alertBorderWidth: alertStyle ? parseFloat(alertStyle.borderTopWidth) : 0,
      };
    });
    expect(state.forcedColors, profile.name).toBe(true);
    expect(state.horizontalOverflow, profile.name).toBeLessThanOrEqual(1);
    expect(state.inputOutlineStyle, profile.name).toBe("dashed");
    expect(state.inputOutlineWidth, profile.name).toBeGreaterThanOrEqual(2);
    expect(state.alertBorderWidth, profile.name).toBeGreaterThanOrEqual(2);

    await submit.focus();
    const buttonFocus = await submit.evaluate((button) => {
      const style = getComputedStyle(button);
      return {
        outlineStyle: style.outlineStyle,
        outlineWidth: parseFloat(style.outlineWidth),
      };
    });
    expect(buttonFocus.outlineStyle, profile.name).toBe("solid");
    expect(buttonFocus.outlineWidth, profile.name).toBeGreaterThanOrEqual(2);

    await context.close();
  }
});

test("all public pages reflow without horizontal scrolling at 400 percent", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 800 } });
  const testPage = await context.newPage();
  await testPage.emulateMedia({ reducedMotion: "reduce" });

  for (const route of routes) {
    await testPage.goto(`${route}${route.includes("?") ? "&" : "?"}audit=performance`);
    await expect(testPage.locator("body"), route).toBeVisible();
    await expect(testPage.getByRole("button", { name: "Open menu" }), route).toBeVisible();
    const geometry = await testPage.evaluate(() => ({
      documentOverflow: document.documentElement.scrollWidth - innerWidth,
      bodyOverflow: document.body.scrollWidth - innerWidth,
      viewportWidth: innerWidth,
    }));
    expect(geometry.viewportWidth, route).toBe(320);
    expect(geometry.documentOverflow, route).toBeLessThanOrEqual(1);
    expect(geometry.bodyOverflow, route).toBeLessThanOrEqual(1);
  }

  await context.close();
});
