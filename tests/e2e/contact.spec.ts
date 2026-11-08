import { expect, test } from "@playwright/test";
import {
  adaptiveViewports,
} from "./helpers/public-pages";

// Contact page: responsive profiles, validation, keyboard submission (network mocked; no mail is sent) and links.

test("contact recomputes its viewport profile when a window is resized both ways", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/contact?audit=performance");

  const root = page.locator('[data-viewport-page="contact"]');
  const stage = page.locator("[data-viewport-stage]");
  await expect(root).toHaveAttribute("data-viewport-profile", "fit");
  const roomyScale = Number(await stage.getAttribute("data-viewport-scale"));

  await page.setViewportSize({ width: 1723, height: 450 });
  await expect(root).toHaveAttribute("data-viewport-profile", "accessible-overflow");
  const shortScale = Number(await stage.getAttribute("data-viewport-scale"));
  expect(shortScale).toBeLessThan(roomyScale);
  await expect(page.locator(".contact-repository-shell")).toBeInViewport();
  await expect(page.locator(".site-footer")).toBeInViewport();

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(root).toHaveAttribute("data-viewport-profile", "fit");
  const restoredScale = Number(await stage.getAttribute("data-viewport-scale"));
  expect(restoredScale).toBeCloseTo(roomyScale, 2);
  expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(1);
});

test("light and dark contact themes stay responsive across all adaptive viewports", async ({ browser }) => {
  test.setTimeout(240_000);

  for (const profile of adaptiveViewports) {
    for (const theme of ["dark", "light"] as const) {
      const context = await browser.newContext({ viewport: profile });
      await context.addInitScript((selectedTheme) => {
        localStorage.setItem("theme", selectedTheme);
      }, theme);
      const testPage = await context.newPage();
      await testPage.emulateMedia({ reducedMotion: "reduce" });
      const label = `${profile.name} ${theme}`;
      await testPage.goto("/contact?audit=performance");
      const shell = testPage.locator(".contact-repository-shell");
      await expect(shell, label).toBeVisible();
      const before = await shell.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return {
          horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
          isLight: document.documentElement.classList.contains("light"),
          themeColor: document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content,
          width: rect.width,
          height: rect.height,
        };
      });

      expect(before.horizontalOverflow, label).toBeLessThanOrEqual(1);
      expect(before.isLight, label).toBe(theme === "light");
      expect(before.themeColor, label).toBe(theme === "light" ? "#defaf5" : "#0a0b10");

      const targetTheme = theme === "light" ? "dark" : "light";
      const toggleLabel = `Switch to ${targetTheme} mode`;
      let toggle = testPage.locator(`button[aria-label="${toggleLabel}"]:visible`);
      if (await toggle.count() === 0) {
        await testPage.getByRole("button", { name: "Open menu" }).click();
        toggle = testPage.locator(`button[aria-label="${toggleLabel}"]:visible`);
      }
      await toggle.evaluate((button) => (button as HTMLButtonElement).click());

      const after = await shell.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return {
          horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
          isLight: document.documentElement.classList.contains("light"),
          themeColor: document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content,
          width: rect.width,
          height: rect.height,
        };
      });
      expect(after.horizontalOverflow, label).toBeLessThanOrEqual(1);
      expect(after.isLight, label).toBe(targetTheme === "light");
      expect(after.themeColor, label).toBe(targetTheme === "light" ? "#defaf5" : "#0a0b10");
      expect(after.width, label).toBeCloseTo(before.width, 0);
      expect(after.height, label).toBeCloseTo(before.height, 0);

      await context.close();
    }
  }
});

test("contact validation focuses and identifies every invalid field at high zoom", async ({ browser }) => {
  test.setTimeout(90_000);
  const zoomProfiles = [
    { name: "150-percent", width: 853, height: 800 },
    { name: "200-percent", width: 640, height: 800 },
    { name: "400-percent-reflow", width: 320, height: 800 },
  ] as const;

  for (const profile of zoomProfiles) {
    const context = await browser.newContext({ viewport: profile });
    const testPage = await context.newPage();
    await testPage.emulateMedia({ reducedMotion: "reduce" });
    await testPage.goto("/contact?audit=performance");

    const form = testPage.locator('form[aria-label="Contact form"]:visible');
    const name = form.getByPlaceholder("Name");
    const email = form.getByPlaceholder("Email");
    const message = form.getByPlaceholder("Message");
    const submit = form.getByRole("button", { name: /Commit & send|Send/ });

    await submit.click();
    await expect(name, profile.name).toBeFocused();
    await expect(name, profile.name).toHaveAttribute("aria-invalid", "true");
    await expect(form.getByRole("alert"), profile.name).toBeVisible();

    await name.fill("Zoom Test");
    await submit.click();
    await expect(email, profile.name).toBeFocused();
    await expect(email, profile.name).toHaveAttribute("aria-invalid", "true");

    await email.fill("not-an-email");
    await message.fill("Validation must remain readable at high zoom.");
    await submit.click();
    await expect(email, profile.name).toBeFocused();
    await expect(email, profile.name).toHaveAttribute("aria-invalid", "true");
    await expect(form.getByRole("alert"), profile.name).toContainText("valid email");

    await email.fill("zoom@example.com");
    await message.fill("");
    await submit.click();
    await expect(message, profile.name).toBeFocused();
    await expect(message, profile.name).toHaveAttribute("aria-invalid", "true");
    await expect(message, profile.name).toHaveAttribute("aria-describedby", /-error$/);

    const errorGeometry = await form.getByRole("alert").evaluate((alert) => {
      const rect = alert.getBoundingClientRect();
      return {
        documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
        left: rect.left,
        right: rect.right,
        scrollWidth: alert.scrollWidth,
        clientWidth: alert.clientWidth,
        viewportWidth: window.innerWidth,
      };
    });
    expect(errorGeometry.documentOverflow, profile.name).toBeLessThanOrEqual(1);
    expect(errorGeometry.left, profile.name).toBeGreaterThanOrEqual(0);
    expect(errorGeometry.right, profile.name).toBeLessThanOrEqual(errorGeometry.viewportWidth + 1);
    expect(errorGeometry.scrollWidth, profile.name).toBeLessThanOrEqual(errorGeometry.clientWidth + 1);

    await context.close();
  }
});

test("contact is a keyboard-submittable JSON form", async ({ page }) => {
  const submissionId = "11111111-1111-4111-8111-111111111111";
  let preparedBody: Record<string, unknown> | null = null;
  let sentBody: Record<string, unknown> | null = null;
  await page.route("**/api/contact/prepare", async (route) => {
    preparedBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ok: true, submissionId, uploads: [] }),
    });
  });
  await page.route("**/api/contact/send", async (route) => {
    sentBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/contact");
  const form = page.locator('form[aria-label="Contact form"]:visible');
  await form.getByPlaceholder("Name").fill("Accessibility Test");
  await form.getByPlaceholder("Email").fill("test@example.com");
  await form.getByPlaceholder("Message").fill("Keyboard submission test");
  // Enter in a field submits the form, as with any native form.
  await form.getByPlaceholder("Email").press("Enter");
  // The thank-you note stays visible, and the status region announces it.
  await expect(form.locator(".contact-form-success")).toHaveText(/Thank you! Your message has been sent/);
  await expect(form.getByRole("status").filter({ hasText: /Thank you! Your message has been sent/ })).toHaveCount(1);
  expect(preparedBody).toMatchObject({
    email: "test@example.com",
    files: [],
    message: "Keyboard submission test",
    name: "Accessibility Test",
  });
  expect(sentBody).toEqual({ submissionId });
});

test("contact exposes the canonical Beacons profile without tracking parameters", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/contact");

  const beacons = page.getByRole("link", { name: "Beacons" });
  await expect(beacons).toBeVisible();
  await expect(beacons).toHaveAttribute("href", "https://beacons.ai/mouaz98");
  await expect(beacons).toHaveAttribute("rel", "noopener noreferrer");
});

test("very short desktop windows fit contact controls without document scrolling", async ({ browser }) => {
  for (const profile of [
    { name: "wide-450", width: 1723, height: 450 },
    { name: "desktop-500", width: 1366, height: 500 },
    { name: "laptop-550", width: 1024, height: 550 },
    { name: "compact-450", width: 800, height: 450 },
  ]) {
    const context = await browser.newContext({ viewport: profile });
    const page = await context.newPage();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/contact?audit=performance");
    await expect(page.locator(".contact-stage-surface")).toHaveAttribute(
      "style",
      /translate\(-50%, -50%\) scale/,
    );

    const geometry = await page.evaluate(() => {
      const contactPage = document.querySelector<HTMLElement>(".contact-page");
      const shell = document.querySelector<HTMLElement>(".contact-repository-shell");
      const send = document.querySelector<HTMLElement>(
        ".contact-adaptive-layout .contact-send-button button",
      );
      const command = document.querySelector<HTMLElement>(
        ".contact-adaptive-layout .contact-command-strip",
      );
      const footer = document.querySelector<HTMLElement>(".contact-page .site-footer");
      if (!contactPage || !shell || !send || !command || !footer) {
        throw new Error("Short contact layout is incomplete");
      }
      const shellRect = shell.getBoundingClientRect();
      const sendRect = send.getBoundingClientRect();
      const commandRect = command.getBoundingClientRect();
      const footerRect = footer.getBoundingClientRect();
      return {
        horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
        pageScrollOverflow: contactPage.scrollHeight - contactPage.clientHeight,
        documentHeight: document.documentElement.scrollHeight,
        viewportHeight: innerHeight,
        shell: { top: shellRect.top, bottom: shellRect.bottom },
        send: { top: sendRect.top, bottom: sendRect.bottom },
        command: { top: commandRect.top, bottom: commandRect.bottom },
        footer: { top: footerRect.top, bottom: footerRect.bottom },
      };
    });

    expect(geometry.horizontalOverflow, profile.name).toBeLessThanOrEqual(1);
    expect(geometry.pageScrollOverflow, profile.name).toBeLessThanOrEqual(1);
    expect(geometry.documentHeight, profile.name).toBeLessThanOrEqual(geometry.viewportHeight + 1);
    expect(geometry.send.top, profile.name).toBeGreaterThanOrEqual(geometry.shell.top);
    expect(geometry.send.bottom, profile.name).toBeLessThanOrEqual(geometry.shell.bottom + 1);
    expect(geometry.command.top, profile.name).toBeGreaterThanOrEqual(geometry.shell.top);
    expect(geometry.command.bottom, profile.name).toBeLessThanOrEqual(geometry.shell.bottom + 1);
    expect(geometry.footer.top, profile.name).toBeGreaterThanOrEqual(geometry.shell.bottom);
    await expect(page.locator(".contact-page .site-footer"), profile.name).toBeInViewport();
    await expect(
      page.locator(".contact-adaptive-layout .contact-send-button button"),
      profile.name,
    ).toBeInViewport();
    await context.close();
  }
});
