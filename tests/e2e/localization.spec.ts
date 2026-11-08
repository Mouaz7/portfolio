import { expect, test } from "@playwright/test";
import {
  routes,
} from "./helpers/public-pages";

// Swedish and Arabic: localized copy, RTL composition and viewport fit.

test("Arabic keeps the established home composition and reports no app errors", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  const readStableHomeComposition = async () => {
    const hero = page.locator("[data-home-hero]");
    const portrait = page.locator("[data-home-stage]");
    await expect(hero).toBeVisible();
    await expect(portrait).toBeVisible();
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(Array.from(document.images, (image) => {
        if (image.complete) return Promise.resolve();
        return new Promise<void>((resolve) => {
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => resolve(), { once: true });
        });
      }));
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
    });
    const [heroBox, portraitBox] = await Promise.all([
      hero.boundingBox(),
      portrait.boundingBox(),
    ]);
    expect(heroBox).not.toBeNull();
    expect(portraitBox).not.toBeNull();
    return { hero: heroBox!, portrait: portraitBox! };
  };

  await page.goto("/");
  const english = await readStableHomeComposition();

  await page.goto("/ar");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  const arabic = await readStableHomeComposition();

  expect(Math.abs(arabic.hero.x - english.hero.x)).toBeLessThan(2);
  expect(Math.abs(arabic.portrait.x - english.portrait.x)).toBeLessThan(2);
  expect(errors).toEqual([]);
});

test("Arabic is localized and remains inside the mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/ar");

  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("[data-home-role-sequence]")).toHaveAttribute(
    "data-home-role-sequence",
    "ماجستير في هندسة البرمجيات|مصمم|مطوّر|مطوّر ذكاء اصطناعي|مطوّر ويب|الأمن السيبراني|ماجستير في هندسة البرمجيات",
  );
  await expect(page.locator("[data-role-cycler-active]")).toHaveText("ماجستير في هندسة البرمجيات");
  await expect(page.getByRole("link", { name: /عرض المشاريع/ }).first()).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("localized compact landscape never falls back to English or overlaps the portrait", async ({ page }) => {
  await page.setViewportSize({ width: 790, height: 410 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/sv");

  await expect(page.locator("html")).toHaveAttribute("lang", "sv");
  await expect(page.locator("[data-home-role-sequence]")).toHaveAttribute(
    "data-home-role-sequence",
    "Master i programvaruteknik|Designer|Utvecklare|AI-utvecklare|Webbutvecklare|Cybersäkerhet|Master i programvaruteknik",
  );
  await expect(page.locator("[data-role-cycler-active]")).toHaveText("Master i programvaruteknik");
  await expect(page.locator("[data-home-stage]")).toBeHidden();

  await page.setViewportSize({ width: 648, height: 410 });
  await page.goto("/ar");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("[data-home-role-sequence]")).toHaveAttribute(
    "data-home-role-sequence",
    "ماجستير في هندسة البرمجيات|مصمم|مطوّر|مطوّر ذكاء اصطناعي|مطوّر ويب|الأمن السيبراني|ماجستير في هندسة البرمجيات",
  );
  await expect(page.locator("[data-role-cycler-active]")).toHaveText("ماجستير في هندسة البرمجيات");
  await expect(page.locator("[data-home-stage]")).toBeHidden();
});

test("language switching keeps localized content responsive", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("button", { name: "Choose language" }).click();
  await page.getByRole("link", { name: "العربية" }).click();

  await expect(page).toHaveURL(/\/ar$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.locator("[data-home-role-sequence]")).toHaveAttribute(
    "data-home-role-sequence",
    /ماجستير في هندسة البرمجيات/,
  );
});

test("Swedish and Arabic public routes stay localized without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });

  for (const locale of ["sv", "ar"] as const) {
    for (const route of routes) {
      const localizedRoute = route === "/" ? `/${locale}` : `/${locale}${route}`;
      await page.goto(localizedRoute);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.locator("html")).toHaveAttribute(
        "dir",
        locale === "ar" ? "rtl" : "ltr",
      );
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow, `${localizedRoute} overflow`).toBeLessThanOrEqual(1);
    }
  }
});
