import { expect, test } from "@playwright/test";

// Skills page: icon interaction, loading stability, same-origin icons and constrained devices.

test("skills icons interact inside equal, clipped canvases without shadows", async ({ browser }) => {
  test.setTimeout(60_000);
  const touchProfiles = [
    { name: "small-phone", width: 320, height: 568 },
    { name: "ipad", width: 768, height: 1024 },
    { name: "ipad-pro", width: 1024, height: 1366 },
  ];

  for (const profile of touchProfiles) {
    const context = await browser.newContext({
      viewport: { width: profile.width, height: profile.height },
      deviceScaleFactor: 2,
      hasTouch: true,
      isMobile: true,
    });
    const testPage = await context.newPage();
    await testPage.goto("/skills?audit=performance");
    await expect(testPage.locator(".page-loading-stage"), profile.name).toHaveCount(0);
    await expect(testPage.locator(".skills-stage"), profile.name).toHaveAttribute(
      "data-skills-layout",
      profile.width >= 640 ? "desktop" : "phone",
    );
    await expect.poll(async () => Number(await testPage.locator(".skills-stage").getAttribute("data-viewport-scale"))).toBeLessThan(1);
    const viewportOverflow = await testPage.evaluate(() => ({
      horizontal: document.documentElement.scrollWidth - window.innerWidth,
      vertical: document.documentElement.scrollHeight - window.innerHeight,
    }));
    expect(viewportOverflow.horizontal, profile.name).toBeLessThanOrEqual(1);
    if (profile.width < 640) {
      expect(viewportOverflow.vertical, profile.name).toBeLessThanOrEqual(1);
    }
    const icon = testPage.locator("[data-skill-interaction]").first();
    await expect(icon, profile.name).toBeVisible();
    const canvas = testPage.locator("[data-skill-canvas]").first();
    const before = await canvas.boundingBox();
    const iconSizes = await testPage.locator("[data-skill-canvas]").evaluateAll((elements) => (
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      })
    ));

    const press = await icon.evaluate((element) => {
      element.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true,
        isPrimary: true,
        pointerType: "touch",
      }));
      return {
        pressed: element.dataset.touchPressed === "true",
        markAnimations: element.querySelector(".skill-icon")?.getAnimations().length ?? -1,
      };
    });
    expect(press.pressed, profile.name).toBe(true);
    expect(press.markAnimations, profile.name).toBe(0);
    await expect.poll(
      () => icon.evaluate((element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).a),
      { message: `${profile.name} touch press scale` },
    ).toBeGreaterThan(1.02);
    const after = await canvas.boundingBox();

    expect(Math.max(...iconSizes.map(({ width }) => width)) - Math.min(...iconSizes.map(({ width }) => width)), profile.name).toBeLessThan(0.1);
    expect(Math.max(...iconSizes.map(({ height }) => height)) - Math.min(...iconSizes.map(({ height }) => height)), profile.name).toBeLessThan(0.1);
    expect(after?.x, profile.name).toBeCloseTo(before?.x ?? 0, 4);
    expect(after?.y, profile.name).toBeCloseTo(before?.y ?? 0, 4);
    expect(after?.width, profile.name).toBeCloseTo(before?.width ?? 0, 4);
    expect(after?.height, profile.name).toBeCloseTo(before?.height ?? 0, 4);
    await icon.evaluate((element) => element.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      isPrimary: true,
      pointerType: "touch",
    })));
    await expect(icon, profile.name).toHaveAttribute("data-touch-pressed", "true");
    await expect(icon, profile.name).not.toHaveAttribute("data-touch-pressed");
    await expect.poll(
      () => icon.evaluate((element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).a),
      { message: `${profile.name} touch release scale` },
    ).toBeLessThan(1.001);
    const unlinkedIcons = testPage.locator('[data-skill-project-unavailable] [data-skill-interaction]');
    expect(await unlinkedIcons.count(), profile.name).toBeGreaterThan(0);
    const tapIcon = unlinkedIcons.first();
    await tapIcon.tap();
    await expect(tapIcon, profile.name).toHaveAttribute("data-touch-pressed", "true");
    await expect.poll(
      () => tapIcon.evaluate((element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).a),
      { message: `${profile.name} real tap scale` },
    ).toBeGreaterThan(1.02);
    await expect(tapIcon, profile.name).not.toHaveAttribute("data-touch-pressed");
    await context.close();
  }

  for (const profile of [
    {
      name: "desktop", width: 1440, height: 900,
      expectedSize: "wide", minimumCardWidth: 400, minimumIconWidth: 40,
    },
    {
      name: "large-desktop", width: 1920, height: 1080,
      expectedSize: "wide", minimumCardWidth: 590, minimumIconWidth: 60,
    },
    {
      name: "wide-desktop", width: 2560, height: 1440,
      expectedSize: "extra-wide", minimumCardWidth: 740, minimumIconWidth: 80,
    },
    {
      name: "uhd", width: 3840, height: 2160,
      expectedSize: "ultra-wide", minimumCardWidth: 880, minimumIconWidth: 90,
    },
  ]) {
    const context = await browser.newContext({
      viewport: { width: profile.width, height: profile.height },
    });
    const testPage = await context.newPage();
    await testPage.goto("/skills?audit=performance");
    const grid = testPage.locator(".skills-bento-grid");
    await expect(grid, profile.name).toBeInViewport();
    await expect(testPage.locator(".skills-stage"), profile.name).toHaveAttribute(
      "data-skills-size",
      profile.expectedSize,
    );
    const card = testPage.locator(".skills-card-surface").first();
    const cardBox = await card.boundingBox();
    const icon = testPage.locator("[data-skill-interaction]").first();
    const before = await icon.boundingBox();
    const beforeStyles = await icon.evaluate((element) => {
      const mark = element.querySelector<HTMLElement>(".skill-icon");
      const card = element.closest<HTMLElement>("[data-skills-category]");
      return {
        filter: mark ? getComputedStyle(mark).filter : "missing",
        shadow: card ? getComputedStyle(card).boxShadow : "missing",
        transform: getComputedStyle(element).transform,
      };
    });
    await icon.hover();
    await expect.poll(
      () => icon.evaluate((element) => getComputedStyle(element).transform),
      { message: `${profile.name} icon hover transform` },
    ).not.toBe(beforeStyles.transform);
    const after = await icon.boundingBox();
    const afterStyles = await icon.evaluate((element) => {
      const card = element.closest<HTMLElement>("[data-skills-category]");
      const canvas = element.closest<HTMLElement>("[data-skill-canvas]");
      const commitBar = card?.querySelector<HTMLElement>("[data-skill-commit-bar]");
      return {
        canvasOverflow: canvas ? getComputedStyle(canvas).overflow : "missing",
        canvasTop: canvas?.getBoundingClientRect().top ?? -1,
        commitBottom: commitBar?.getBoundingClientRect().bottom ?? -1,
        shadow: card ? getComputedStyle(card).boxShadow : "missing",
        transform: getComputedStyle(element).transform,
      };
    });
    const iconSizes = await testPage.locator("[data-skill-canvas]").evaluateAll((elements) => (
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      })
    ));
    expect(beforeStyles.filter, profile.name).not.toContain("drop-shadow");
    expect(afterStyles.shadow, profile.name).toBe(beforeStyles.shadow);
    expect(afterStyles.transform, profile.name).not.toBe(beforeStyles.transform);
    expect(afterStyles.canvasOverflow, profile.name).toBe("hidden");
    expect(afterStyles.canvasTop, profile.name).toBeGreaterThanOrEqual(afterStyles.commitBottom);
    expect(Math.max(...iconSizes.map(({ width }) => width)) - Math.min(...iconSizes.map(({ width }) => width)), profile.name).toBeLessThan(0.1);
    expect(Math.max(...iconSizes.map(({ height }) => height)) - Math.min(...iconSizes.map(({ height }) => height)), profile.name).toBeLessThan(0.1);
    expect(cardBox?.width ?? 0, profile.name).toBeGreaterThanOrEqual(profile.minimumCardWidth);
    expect(Math.min(...iconSizes.map(({ width }) => width)), profile.name).toBeGreaterThanOrEqual(profile.minimumIconWidth);
    expect(after?.y ?? 0, profile.name).toBeLessThan(before?.y ?? 0);
    expect(after?.width ?? 0, profile.name).toBeGreaterThan(before?.width ?? 0);
    expect(after?.height ?? 0, profile.name).toBeGreaterThan(before?.height ?? 0);
    const unlinkedIcon = testPage.locator('[data-skill-project-unavailable] [data-skill-interaction]').first();
    await expect(unlinkedIcon, profile.name).toBeVisible();
    await unlinkedIcon.hover();
    await expect.poll(
      () => unlinkedIcon.evaluate((element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).a),
      { message: `${profile.name} unlinked icon hover scale` },
    ).toBeGreaterThan(1.02);
    await context.close();
  }
});

test("skills remain stable while scripts load on phone and desktop", async ({ browser }) => {
  test.setTimeout(60_000);
  for (const viewport of [
    { width: 412, height: 823 },
    { width: 1440, height: 900 },
  ]) {
    const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
    const page = await context.newPage();
    const session = await context.newCDPSession(page);
    await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.route("**/_next/static/**/*.js", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    });
    await page.addInitScript(() => {
      const measured = window as unknown as { skillsLayoutShift: number };
      measured.skillsLayoutShift = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & { hadRecentInput: boolean; value: number };
          if (!shift.hadRecentInput) measured.skillsLayoutShift += shift.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
    });
    await page.goto("/skills?audit=performance");
    await expect(page.locator(".skills-card-surface").first()).toBeVisible();
    await page.waitForTimeout(1_000);
    const cls = await page.evaluate(() => (
      window as unknown as { skillsLayoutShift: number }
    ).skillsLayoutShift);
    expect(cls, `${viewport.width}x${viewport.height} Skills CLS`).toBeLessThanOrEqual(0.05);
    await context.close();
  }
});

test("public routes make no runtime request to legacy icon CDNs", async ({ page }) => {
  const externalIconRequests: string[] = [];
  page.on("request", (request) => {
    const hostname = new URL(request.url()).hostname;
    if (["icon.icepanel.io", "cdn.simpleicons.org", "api.iconify.design"].includes(hostname)) {
      externalIconRequests.push(request.url());
    }
  });

  for (const route of ["/", "/skills", "/journey", "/projects", "/contact", "/privacy"]) {
    await page.goto(`${route}?audit=performance`);
    await expect(page.locator("body")).toBeVisible();
    await page.waitForLoadState("networkidle");
  }

  expect(externalIconRequests).toEqual([]);
});

test("constrained computers render the final Skills state without delayed content", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "hardwareConcurrency", {
      configurable: true,
      value: 4,
    });
    Object.defineProperty(navigator, "deviceMemory", {
      configurable: true,
      value: 4,
    });
  });
  const page = await context.newPage();
  await page.goto("/skills");

  await expect(page.locator("html")).toHaveAttribute("data-performance-tier", "low");
  const animation = await page.locator(".animate-card").first().evaluate((element) => {
    const runningAnimation = element.getAnimations()[0];
    runningAnimation?.pause();
    if (runningAnimation) runningAnimation.currentTime = 100;
    const styles = getComputedStyle(element);
    return {
      duration: styles.animationDuration,
      filter: styles.filter,
      name: styles.animationName,
      opacity: styles.opacity,
      transform: styles.transform,
    };
  });

  expect(animation.name).toBe("none");
  expect(animation.duration).toBe("0s");
  expect(animation.filter).toBe("none");
  expect(animation.opacity).toBe("1");
  expect(animation.transform).toBe("matrix(1, 0, 0, 1, 0, 0)");
  await context.close();
});
