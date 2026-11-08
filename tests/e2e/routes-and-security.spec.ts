import { expect, test } from "@playwright/test";

// Routing, navigation, removed routes, server preloading, security headers and hydration hygiene.

test("production responses keep the hardened browser security boundary", async ({ request }) => {
  const response = await request.get("/");
  expect(response.ok()).toBe(true);
  const headers = response.headers();

  expect(headers["strict-transport-security"]).toBe("max-age=63072000; includeSubDomains");
  expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
  expect(headers["cross-origin-resource-policy"]).toBe("same-origin");
  expect(headers["origin-agent-cluster"]).toBe("?1");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-permitted-cross-domain-policies"]).toBe("none");
  expect(headers["content-security-policy"]).toContain("object-src 'none'");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
});

test("Journey resolves its loader promptly and keeps its route", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/journey");
  await expect(page.getByText("Journey", { exact: true }).first()).toBeVisible({ timeout: 5_000 });
  await expect(page.locator(".la-status", { hasText: "Loading Journey..." })).toBeHidden();
  expect(page.url()).toContain("/journey");
});

test("server-preloaded routes do not add an artificial loading delay", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const duplicateDataRequests: string[] = [];
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (["/api/skills", "/api/skill-categories", "/api/journey", "/api/project"].includes(pathname)) {
      duplicateDataRequests.push(pathname);
    }
  });

  for (const { route, readySelector } of [
    { route: "/skills", readySelector: ".skills-bento-grid" },
    { route: "/journey", readySelector: ".commit-row" },
    { route: "/projects", readySelector: ".projects-shell" },
  ]) {
    await page.goto("/");
    await Promise.all([
      page.waitForURL(`**${route}`),
      page.locator(`a[href="${route}"]`).first().click(),
    ]);

    await expect(page.locator(readySelector).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator(".la-window")).toHaveCount(0);
  }
  expect(duplicateDataRequests).toEqual([]);
});

test("known Bitdefender marker is removed before React hydration", async ({ page }) => {
  await page.addInitScript(() => {
    const injector = new MutationObserver(() => {
      const target = document.querySelector("div");
      if (!target) return;
      target.setAttribute("bis_skin_checked", "1");
      injector.disconnect();
    });
    injector.observe(document, { childList: true, subtree: true });
  });

  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("/ar");
  await expect(page.locator("[bis_skin_checked]")).toHaveCount(0);
  expect(errors.filter((error) => /hydrated.*didn.t match/i.test(error))).toEqual([]);
});

test("removed routes stay gone", async ({ request }) => {
  for (const prefix of ["", "/sv", "/ar"]) {
    for (const path of ["/code-review", "/code-review-page", "/ai-page"]) {
      const response = await request.get(`${prefix}${path}`, { maxRedirects: 0 });
      expect(response.status(), `${prefix}${path}`).toBe(404);
    }
  }
  for (const path of [
    "/api/ai/code-review",
    "/api/ai/code-review/chat",
    "/api/ai/cv-chat",
    "/api/internal/rag/reindex",
  ]) {
    expect((await request.get(path)).status(), `GET ${path}`).toBe(404);
    expect((await request.post(path, { data: {} })).status(), `POST ${path}`).toBe(404);
  }
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.ok()).toBe(true);
  expect(await sitemap.text()).not.toMatch(/code-review|api\/ai/);
});

for (const locale of ["en", "sv", "ar"]) {
  for (const mobile of [false, true]) {
    test(`${locale} ${mobile ? "mobile" : "desktop"} navigation reaches every public page`, async ({ page }) => {
      await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
      const prefix = locale === "en" ? "" : `/${locale}`;
      await page.goto(prefix || "/");
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");

      if (mobile) await page.locator('button[aria-controls="mobile-menu"]').click();
      const navigation = mobile ? page.getByRole("dialog") : page.locator(".site-header-nav");
      for (const path of ["", "/skills", "/journey", "/projects", "/contact"]) {
        const href = `${prefix}${path}` || "/";
        await expect(navigation.locator(`a[href="${href}"]`)).toBeVisible();
      }
      await navigation.locator(`a[href="${prefix}/contact"]`).click();
      await expect(page).toHaveURL(new RegExp(`${prefix}/contact$`));
      await expect(page.locator(".contact-main")).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
}
