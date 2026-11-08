import { expect, test } from "@playwright/test";
import {
  routes,
  publicSurfaceSelectors,
  adaptiveViewports,
} from "./helpers/public-pages";

// Layout across viewports, zoom levels, ultrawide screens and short windows.

test("mobile project repository stats stay readable inside the card", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/projects");

  const firstCard = page.locator(".projects-mobile-card-row").first();
  const stats = firstCard.locator(".projects-mobile-repo-stats");
  await expect(stats).toBeVisible();
  await expect(firstCard.locator(".projects-mobile-head")).toHaveText("HEAD");

  const geometry = await firstCard.evaluate((card) => {
    const panel = card.querySelector<HTMLElement>(".projects-mobile-repo-stats");
    const links = Array.from(card.querySelectorAll<HTMLElement>(".projects-mobile-repo-stat"));
    const boxes = links.map((link) => link.getBoundingClientRect());
    return {
      pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
      panelWidth: panel?.getBoundingClientRect().width ?? 0,
      linksFit: links.every((link) => link.scrollWidth <= link.clientWidth),
      linksAreHorizontal:
        boxes.length === 3
        && Math.max(...boxes.map((box) => box.top))
          - Math.min(...boxes.map((box) => box.top)) <= 1,
      linksHaveTouchHeight: boxes.every((box) => box.height >= 24),
    };
  });

  expect(geometry.pageOverflow).toBeLessThanOrEqual(1);
  expect(geometry.panelWidth).toBeGreaterThanOrEqual(220);
  expect(geometry.linksFit).toBe(true);
  expect(geometry.linksAreHorizontal).toBe(true);
  expect(geometry.linksHaveTouchHeight).toBe(true);
});

test("header adapts before navigation becomes cramped at common browser zoom levels", async ({ page }) => {
  const zoomProfiles = [
    { name: "1280 at 125%", effectiveWidth: 1024, compact: false },
    { name: "1280 at 150%", effectiveWidth: 853, compact: true },
    { name: "1280 at 200%", effectiveWidth: 640, compact: true },
    { name: "1366 at 150%", effectiveWidth: 911, compact: false },
    { name: "compact boundary", effectiveWidth: 899, compact: true },
    { name: "desktop boundary", effectiveWidth: 900, compact: false },
  ] as const;

  await page.goto("/contact");

  for (const profile of zoomProfiles) {
    await page.setViewportSize({ width: profile.effectiveWidth, height: 800 });
    const desktopNav = page.locator(".site-header > .site-header-nav");
    const menuButton = page.getByRole("button", { name: "Open menu" });

    if (profile.compact) {
      await expect(desktopNav, profile.name).toBeHidden();
      await expect(menuButton, profile.name).toBeVisible();
    } else {
      await expect(desktopNav, profile.name).toBeVisible();
      await expect(menuButton, profile.name).toBeHidden();
    }

    const geometry = await page.evaluate(() => {
      const header = document.querySelector<HTMLElement>(".site-header");
      if (!header) throw new Error("Header is missing");
      const rect = header.getBoundingClientRect();
      return {
        documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
        headerOverflow: header.scrollWidth - header.clientWidth,
        left: rect.left,
        right: rect.right,
      };
    });

    expect(geometry.documentOverflow, profile.name).toBeLessThanOrEqual(1);
    expect(geometry.headerOverflow, profile.name).toBeLessThanOrEqual(1);
    expect(geometry.left, profile.name).toBeGreaterThanOrEqual(0);
    expect(geometry.right, profile.name).toBeLessThanOrEqual(profile.effectiveWidth + 1);
  }

  await page.setViewportSize({ width: 853, height: 800 });
  const menuButton = page.getByRole("button", { name: "Open menu" });
  await menuButton.click();
  await expect(page.getByRole("dialog", { name: "Site navigation" })).toBeVisible();

  await page.setViewportSize({ width: 1024, height: 800 });
  await expect(page.locator('[role="dialog"][aria-hidden="true"]')).toHaveAttribute("inert", "");
});

test("all public pages remain bounded and centered on ultrawide displays", async ({ browser }) => {
  test.setTimeout(240_000);
  const profiles = [
    { name: "full-hd", width: 1920, height: 1080 },
    { name: "qhd", width: 2560, height: 1440 },
    { name: "ultrawide", width: 3440, height: 1440 },
    { name: "uhd", width: 3840, height: 2160 },
  ] as const;
  const maximumSurfaceWidths: Record<(typeof routes)[number], number> = {
    "/": 3000,
    "/skills": 2750,
    "/journey": 2800,
    "/projects": 3000,
    "/contact": 3400,
  };

  for (const profile of profiles) {
    const context = await browser.newContext({ viewport: profile });
    const testPage = await context.newPage();
    await testPage.emulateMedia({ reducedMotion: "reduce" });

    for (const route of routes) {
      const label = `${profile.name} ${route}`;
      await testPage.goto(`${route}${route.includes("?") ? "&" : "?"}audit=performance`);
      const surface = testPage.locator(publicSurfaceSelectors[route]).first();
      await expect(surface, label).toBeVisible();
      if (route === "/skills") {
        const expectedSkillsSize = profile.width >= 3200 && profile.height >= 1500
          ? "ultra-wide"
          : profile.width >= 2200 && profile.height >= 1100
            ? "extra-wide"
            : profile.width >= 1000 && profile.width / profile.height >= 8 / 5
              ? "wide"
              : "default";
        await expect(testPage.locator(".skills-stage"), label).toHaveAttribute(
          "data-skills-size",
          expectedSkillsSize,
        );
      }

      const geometry = await surface.evaluate((element) => {
        const header = document.querySelector<HTMLElement>(".site-header");
        const nav = header?.querySelector<HTMLElement>(".site-header-nav");
        const surfaceRect = element.getBoundingClientRect();
        const headerRect = header?.getBoundingClientRect();
        const navRect = nav?.getBoundingClientRect();
        return {
          documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
          headerLeft: headerRect?.left ?? -1,
          headerRight: headerRect?.right ?? -1,
          headerWidth: headerRect?.width ?? -1,
          navRightGap: navRect ? window.innerWidth - navRect.right : -1,
          surfaceLeft: surfaceRect.left,
          surfaceRight: surfaceRect.right,
          surfaceWidth: surfaceRect.width,
          surfaceCentreDelta: Math.abs(
            ((surfaceRect.left + surfaceRect.right) / 2) - (window.innerWidth / 2),
          ),
          viewportWidth: window.innerWidth,
        };
      });

      expect(geometry.documentOverflow, label).toBeLessThanOrEqual(1);
      expect(geometry.headerLeft, label).toBeGreaterThanOrEqual(0);
      expect(geometry.headerRight, label).toBeLessThanOrEqual(profile.width + 1);
      expect(Math.abs(geometry.headerWidth - profile.width), label).toBeLessThanOrEqual(1);
      expect(geometry.surfaceLeft, label).toBeGreaterThanOrEqual(0);
      expect(geometry.surfaceRight, label).toBeLessThanOrEqual(profile.width + 1);
      expect(geometry.surfaceWidth, label).toBeLessThanOrEqual(maximumSurfaceWidths[route] + 1);
      if (route === "/journey") {
        await expect.poll(async () => {
          const last = await testPage.locator(".commit-row").last().boundingBox();
          return last ? last.y + last.height : Number.POSITIVE_INFINITY;
        }, { message: label }).toBeLessThanOrEqual(profile.height + 1);
      }
      if (route === "/contact") {
        await expect(
          testPage.locator(".contact-adaptive-layout .contact-send-button button"),
          label,
        ).toBeInViewport();
      }
      if (profile.width >= 2200) {
        expect(Math.abs(geometry.navRightGap - 12), label).toBeLessThanOrEqual(4);
        expect(geometry.surfaceWidth / profile.width, label).toBeGreaterThanOrEqual(0.65);

        if (route === "/contact") {
          const portraitCoverage = await testPage.evaluate(() => {
            const panel = document.querySelector<HTMLElement>(".contact-profile-portrait-row")
              ?.getBoundingClientRect();
            const portrait = document.querySelector<HTMLImageElement>(".contact-portrait-frame img")
              ?.getBoundingClientRect();
            if (!panel || !portrait) throw new Error("Contact portrait geometry is missing");
            return {
              width: portrait.width / panel.width,
              height: portrait.height / panel.height,
            };
          });
          expect(portraitCoverage.width, label).toBeGreaterThanOrEqual(0.65);
          expect(portraitCoverage.height, label).toBeGreaterThanOrEqual(1);
        }
      }
      expect(geometry.surfaceCentreDelta, label).toBeLessThanOrEqual(2);
    }

    await context.close();
  }
});

test("layout follows CSS viewport size instead of physical pixel density", async ({ browser }) => {
  const layouts: Array<Record<string, { width: number; left: number }>> = [];

  for (const deviceScaleFactor of [1, 2]) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      screen: { width: 2560, height: 1440 },
      deviceScaleFactor,
    });
    const testPage = await context.newPage();
    await testPage.emulateMedia({ reducedMotion: "reduce" });
    const layout: Record<string, { width: number; left: number }> = {};

    for (const route of routes) {
      await testPage.goto(`${route}?audit=performance`);
      const selector = publicSurfaceSelectors[route];
      const surface = testPage.locator(selector).first();
      await expect(surface, `${route} at DPR ${deviceScaleFactor}`).toBeVisible();

      // The fitted Skills/Journey surfaces replace their SSR fallback scale
      // during hydration. Compare DPRs only after two consecutive layout
      // samples agree, otherwise this test can compare the fallback with the
      // final CSS-pixel geometry under parallel CI load.
      await expect.poll(async () => {
        const first = await surface.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return { left: rect.left, width: rect.width };
        });
        await testPage.evaluate(() => new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }));
        const second = await surface.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return { left: rect.left, width: rect.width };
        });
        return Math.max(
          Math.abs(first.left - second.left),
          Math.abs(first.width - second.width),
        );
      }, { message: `${route} at DPR ${deviceScaleFactor} should settle` }).toBeLessThanOrEqual(0.5);

      const box = await surface.boundingBox();
      expect(box, `${route} at DPR ${deviceScaleFactor}`).not.toBeNull();
      layout[route] = { width: box!.width, left: box!.x };
      expect(
        await testPage.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
        `${route} at DPR ${deviceScaleFactor}`,
      ).toBeLessThanOrEqual(1);
    }

    layouts.push(layout);
    await context.close();
  }

  for (const route of routes) {
    expect(Math.abs(layouts[0][route].width - layouts[1][route].width), route).toBeLessThanOrEqual(1);
    expect(Math.abs(layouts[0][route].left - layouts[1][route].left), route).toBeLessThanOrEqual(1);
  }
});

test("Samsung browser viewport keeps visible geometry and theme chrome in sync", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 360, height: 610 },
    screen: { width: 360, height: 800 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem("theme", "dark"));
  await page.goto("/");

  const viewport = await page.evaluate(() => ({
    inner: { width: innerWidth, height: innerHeight },
    client: {
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
    },
    visual: {
      width: visualViewport?.width,
      height: visualViewport?.height,
      scale: visualViewport?.scale,
    },
    screen: { width: screen.width, height: screen.height },
    devicePixelRatio,
  }));
  expect(viewport).toEqual({
    inner: { width: 360, height: 610 },
    client: { width: 360, height: 610 },
    visual: { width: 360, height: 610, scale: 1 },
    screen: { width: 360, height: 800 },
    devicePixelRatio: 2,
  });
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#0a0b10");

  const canvas = page.locator("canvas[data-background-fps]");
  await expect(canvas).toHaveAttribute("data-background-renderer", "webgl");
  await expect(canvas).toHaveAttribute("data-background-thread", "main");
  await expect(canvas).toHaveAttribute("data-background-profile", "continuous-mobile");
  await expect(canvas).toHaveAttribute("data-background-mode", "animated");
  await expect(canvas).toHaveAttribute("data-background-pipeline", /^(two-pass|crossfade)$/);
  await expect(canvas).toHaveAttribute("data-background-fps", "60");
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).toMatchObject({ x: 0, y: 0, width: 360, height: 610 });
  const firstWaveFrame = await canvas.screenshot();
  await page.waitForTimeout(350);
  const nextWaveFrame = await canvas.screenshot();
  expect(nextWaveFrame.equals(firstWaveFrame)).toBe(false);
  await expect(page.locator(".home-hero-actions")).toBeInViewport();

  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(page.locator("html")).toHaveClass(/light/);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#defaf5");
  const firstLightWaveFrame = await canvas.screenshot();
  await page.waitForTimeout(350);
  const nextLightWaveFrame = await canvas.screenshot();
  expect(nextLightWaveFrame.equals(firstLightWaveFrame)).toBe(false);

  await page.goto("/skills");
  await expect(page.locator(".skills-bento-grid")).toBeInViewport();

  await page.goto("/contact");
  await expect(page.locator(".contact-mobile-actions:visible")).toBeInViewport();
  await expect(page.locator(".site-footer")).toBeInViewport();
  await context.close();
});

test("journey and contact stay fully framed across compact laptops and portrait tablets", async ({ browser }) => {
  test.setTimeout(180_000);

  for (const profile of adaptiveViewports) {
    const context = await browser.newContext({
      viewport: { width: profile.width, height: profile.height },
    });
    const testPage = await context.newPage();
    await testPage.emulateMedia({ reducedMotion: "reduce" });
    await testPage.goto("/contact");
    await expect(testPage.locator(".contact-stage-surface")).toHaveAttribute(
      "style",
      /translate\(-50%, -50%\) scale/,
    );

    const layout = await testPage.evaluate(() => {
      const contactPage = document.querySelector<HTMLElement>(".contact-page");
      const shell = document.querySelector<HTMLElement>(".contact-repository-shell");
      const send = document.querySelector<HTMLElement>(
        ".contact-adaptive-layout .contact-send-button button",
      );
      const command = document.querySelector<HTMLElement>(
        ".contact-adaptive-layout .contact-command-strip",
      );
      const footer = document.querySelector<HTMLElement>(".contact-page .site-footer");
      const portraitRow = document.querySelector<HTMLElement>(".contact-profile-portrait-row");
      const portrait = document.querySelector<HTMLElement>(".contact-portrait-frame");
      if (!contactPage || !shell || !send || !command || !footer || !portraitRow || !portrait) {
        throw new Error("Contact layout is incomplete");
      }
      const shellRect = shell.getBoundingClientRect();
      const sendRect = send.getBoundingClientRect();
      const commandRect = command.getBoundingClientRect();
      const footerRect = footer.getBoundingClientRect();
      const portraitRowRect = portraitRow.getBoundingClientRect();
      const portraitRect = portrait.getBoundingClientRect();
      return {
        horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
        documentHeight: document.documentElement.scrollHeight,
        pageScrollOverflow: contactPage.scrollHeight - contactPage.clientHeight,
        shell: {
          left: shellRect.left,
          right: shellRect.right,
          top: shellRect.top,
          bottom: shellRect.bottom,
          height: shellRect.height,
        },
        send: { top: sendRect.top, bottom: sendRect.bottom },
        command: { top: commandRect.top, bottom: commandRect.bottom },
        footer: { top: footerRect.top, bottom: footerRect.bottom },
        portrait: {
          width: portraitRect.width,
          top: portraitRect.top,
          bottom: portraitRect.bottom,
          height: portraitRect.height,
          rowWidth: portraitRowRect.width,
          rowHeight: portraitRowRect.height,
          centreDelta: Math.abs(
            (portraitRect.top + portraitRect.bottom) / 2
              - (portraitRowRect.top + portraitRowRect.bottom) / 2,
          ),
        },
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
      };
    });

    expect(layout.horizontalOverflow, profile.name).toBeLessThanOrEqual(1);
    expect(layout.shell.left, profile.name).toBeGreaterThanOrEqual(0);
    expect(layout.shell.right, profile.name).toBeLessThanOrEqual(layout.viewportWidth + 1);
    expect(layout.shell.top, profile.name).toBeGreaterThanOrEqual(0);
    expect(layout.shell.bottom, profile.name).toBeLessThanOrEqual(layout.documentHeight + 1);
    expect(layout.send.top, profile.name).toBeGreaterThanOrEqual(layout.shell.top);
    expect(layout.send.bottom, profile.name).toBeLessThanOrEqual(layout.shell.bottom + 1);
    expect(layout.command.top, profile.name).toBeGreaterThanOrEqual(layout.shell.top);
    expect(layout.command.bottom, profile.name).toBeLessThanOrEqual(layout.shell.bottom + 1);
    expect(layout.shell.bottom, profile.name).toBeLessThanOrEqual(layout.footer.top + 1);
    expect(layout.footer.bottom, profile.name).toBeLessThanOrEqual(layout.documentHeight + 1);
    expect(layout.portrait.top, profile.name).toBeGreaterThanOrEqual(layout.shell.top);
    expect(layout.portrait.bottom, profile.name).toBeLessThanOrEqual(layout.shell.bottom + 1);
    expect(layout.portrait.centreDelta, profile.name).toBeLessThanOrEqual(2);

    expect(layout.footer.bottom, profile.name).toBeLessThanOrEqual(layout.viewportHeight + 1);
    expect(layout.pageScrollOverflow, profile.name).toBeLessThanOrEqual(1);

    if (profile.height <= 720) {
      expect(layout.shell.height, profile.name).toBeGreaterThanOrEqual(430);
      expect(layout.documentHeight, profile.name).toBeLessThanOrEqual(layout.viewportHeight + 1);
    }

    if (profile.height >= 1024) {
      expect(layout.shell.height, profile.name).toBeGreaterThanOrEqual(690);
      expect(layout.shell.bottom, profile.name).toBeLessThanOrEqual(layout.footer.top + 1);
      expect(layout.portrait.height, profile.name).toBeGreaterThanOrEqual(275);
      expect(Math.abs(layout.portrait.width - layout.portrait.rowWidth), profile.name).toBeLessThanOrEqual(1);
      expect(Math.abs(layout.portrait.height - layout.portrait.rowHeight), profile.name).toBeLessThanOrEqual(1);
    }

    await context.close();
  }

  const journeyContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const journeyPage = await journeyContext.newPage();
  await journeyPage.emulateMedia({ reducedMotion: "reduce" });
  await journeyPage.goto("/journey");
  const journeyRows = journeyPage.locator(".commit-row");
  await expect.poll(async () => journeyRows.count()).toBeGreaterThanOrEqual(6);
  expect(await journeyRows.count()).toBeLessThanOrEqual(7);

  const journeyLayout = await journeyPage.evaluate(() => {
    const main = document.querySelector<HTMLElement>(".journey-main");
    const rows = [...document.querySelectorAll<HTMLElement>(".commit-row")];
    if (!main || rows.length === 0) throw new Error("Journey layout is incomplete");
    const lastRect = rows.at(-1)!.getBoundingClientRect();
    return {
      horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
      mainOverflow: main.scrollHeight - main.clientHeight,
      lastBottom: lastRect.bottom,
      viewportHeight: window.innerHeight,
    };
  });

  expect(journeyLayout.horizontalOverflow).toBeLessThanOrEqual(1);
  expect(journeyLayout.mainOverflow).toBeLessThanOrEqual(1);
  expect(journeyLayout.lastBottom).toBeLessThanOrEqual(journeyLayout.viewportHeight + 1);
  await journeyContext.close();
});

test("all public pages keep their primary content visible or reachable in short browser windows", async ({ browser }) => {
  test.setTimeout(240_000);
  const shortProfiles = [
    { name: "wide-split-screen", width: 1723, height: 450 },
    { name: "wide-short-laptop", width: 1723, height: 608 },
    { name: "small-short-laptop", width: 1024, height: 600 },
    { name: "compact-short-laptop", width: 800, height: 600 },
  ] as const;

  for (const profile of shortProfiles) {
    const context = await browser.newContext({ viewport: profile });
    const page = await context.newPage();
    await page.emulateMedia({ reducedMotion: "reduce" });

    for (const route of routes) {
      const label = `${profile.name} ${route}`;
      await page.goto(`${route}?audit=performance`);
      await expect(page.locator(publicSurfaceSelectors[route]).first(), label).toBeVisible();

      const frame = await page.evaluate(() => {
        const header = document.querySelector<HTMLElement>(".site-header")?.getBoundingClientRect();
        return {
          horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
          headerTop: header?.top ?? -1,
          headerBottom: header?.bottom ?? -1,
          viewportHeight: innerHeight,
        };
      });
      expect(frame.horizontalOverflow, label).toBeLessThanOrEqual(1);
      expect(frame.headerTop, label).toBeGreaterThanOrEqual(0);
      expect(frame.headerBottom, label).toBeLessThanOrEqual(frame.viewportHeight + 1);

      if (route === "/") {
        await expect(page.locator("[data-home-actions]"), label).toBeInViewport();
        const capabilities = page.locator("[data-home-capability]:visible");
        if (await capabilities.count()) {
          await capabilities.last().scrollIntoViewIfNeeded();
          await expect(capabilities.last(), label).toBeInViewport();
        }
      } else if (route === "/skills") {
        const stage = page.locator(".skills-stage");
        const firstCard = page.locator(".skills-card-surface").first();
        const lastCard = page.locator(".skills-card-surface").last();
        await expect(firstCard, label).toBeInViewport();
        await expect(lastCard, label).toBeInViewport();
        const [stageBox, firstBox, lastBox] = await Promise.all([
          stage.boundingBox(), firstCard.boundingBox(), lastCard.boundingBox(),
        ]);
        expect(firstBox!.y, label).toBeGreaterThanOrEqual(stageBox!.y - 1);
        expect(lastBox!.y + lastBox!.height, label)
          .toBeLessThanOrEqual(stageBox!.y + stageBox!.height + 1);
      } else if (route === "/journey") {
        const main = page.locator(".journey-main");
        const lastCommit = page.locator(".commit-row").last();
        const mainBox = await main.boundingBox();
        expect(mainBox!.y + mainBox!.height, label).toBeLessThanOrEqual(profile.height + 1);
        await lastCommit.scrollIntoViewIfNeeded();
        await expect(lastCommit, label).toBeInViewport();
      } else if (route === "/projects") {
        const lastProject = page.locator(".projects-project-row:visible, .projects-mobile-card-wrap:visible").last();
        await lastProject.scrollIntoViewIfNeeded();
        await expect(lastProject, label).toBeInViewport();
      } else {
        await expect(page.locator(".site-footer"), label).toBeInViewport();
        await expect(
          page.locator(".contact-adaptive-layout .contact-send-button button"),
          label,
        ).toBeInViewport();
      }
    }

    await context.close();
  }
});
