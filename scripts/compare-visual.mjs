// Before/after visual comparison between two running builds of the site.
//
// The approved pixel-lock (scripts/check-pixel-lock.mjs) hides the WebGL
// background and needs CI's seeded database. This harness complements it: it
// renders the SAME pages from a baseline server and a candidate server against
// the same data, with the background both hidden ("content") and visible as a
// frozen reduced-motion frame ("background"), and reports every pixel that
// changed. Use it to prove that refactors are invisible before they reach CI.
//
//   VISUAL_BASE_A=http://127.0.0.1:3101 VISUAL_BASE_B=http://127.0.0.1:3102 \
//     node scripts/compare-visual.mjs
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

const baseA = process.env.VISUAL_BASE_A ?? "http://127.0.0.1:3101";
const baseB = process.env.VISUAL_BASE_B ?? "http://127.0.0.1:3102";
const output = process.env.VISUAL_OUTPUT ?? "test-results/visual-compare";
// Maximum per-channel difference treated as identical in "background" mode.
// The candidate may resample the WebGL field differently (two-pass renderer);
// measured worst case is 1–2 colour levels out of 255.
const backgroundTolerance = Number(process.env.VISUAL_BACKGROUND_TOLERANCE ?? 3);
const attempts = Number(process.env.VISUAL_ATTEMPTS ?? 3);
// Identical builds still differ by up to two colour levels in places (scaled
// stages rasterise text and borders slightly differently between runs), so the
// content comparison allows two levels, which is invisible.
const contentTolerance = Number(process.env.VISUAL_CONTENT_TOLERANCE ?? 2);

const routes = (process.env.VISUAL_ROUTES ?? "/,/skills,/journey,/projects,/contact,/privacy")
  .split(",").map((route) => route.trim()).filter(Boolean);
const locales = (process.env.VISUAL_LOCALES ?? ",/sv,/ar").split(",");
const viewports = [
  { name: "mobile", width: 390, height: 844, isMobile: true },
  { name: "tablet", width: 768, height: 1024, isMobile: false },
  { name: "desktop", width: 1440, height: 900, isMobile: false },
].filter((viewport) => !process.env.VISUAL_VIEWPORTS
  || process.env.VISUAL_VIEWPORTS.split(",").includes(viewport.name));
const themes = ["light", "dark"];
const modes = (process.env.VISUAL_MODES ?? "content,background").split(",");
// Headless Chromium renders WebGL in software, which switches the site into
// its software render mode (app/styles/performance-tier.css). "gpu" (default)
// suppresses that switch so captures show what devices with a GPU see;
// "software" keeps it, for a separate comparison of the software look.
const renderMode = process.env.VISUAL_RENDER_MODE ?? "gpu";

const freezeCss = {
  content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}canvas{visibility:hidden!important}",
  background: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}",
};

async function capture(browser, base, path, viewport, theme, mode) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.isMobile,
    hasTouch: viewport.isMobile,
    reducedMotion: "reduce",
    timezoneId: "UTC",
    locale: "en-US",
  });
  await context.addInitScript((selectedTheme) => {
    try { localStorage.setItem("theme", selectedTheme); } catch {}
  }, theme);
  if (renderMode === "gpu") {
    await context.addInitScript(() => {
      // Observe the whole document: the final <html> element does not exist
      // yet when init scripts run.
      new MutationObserver(() => {
        if (document.documentElement.hasAttribute("data-render-mode")) {
          document.documentElement.removeAttribute("data-render-mode");
        }
      }).observe(document, { attributes: true, attributeFilter: ["data-render-mode"], subtree: true });
    });
  }
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}${path}`, { waitUntil: "load", timeout: 90_000 });
  await page.addStyleTag({ content: freezeCss[mode] });
  await page.waitForTimeout(4_000);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images, (image) => (
      image.complete ? undefined : new Promise((resolve) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
      })
    )));
  });
  await page.waitForTimeout(500);
  const png = await page.screenshot();
  await context.close();
  return { png, errors };
}

async function diff(first, second) {
  const [a, b] = await Promise.all([
    sharp(first).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(second).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  if (a.info.width !== b.info.width || a.info.height !== b.info.height) {
    return { sizeMismatch: true, changedPixels: Infinity, maxDelta: 255 };
  }
  let changedPixels = 0;
  let maxDelta = 0;
  const mask = Buffer.alloc(a.info.width * a.info.height);
  for (let pixel = 0, index = 0; index < a.data.length; pixel += 1, index += 3) {
    const delta = Math.max(
      Math.abs(a.data[index] - b.data[index]),
      Math.abs(a.data[index + 1] - b.data[index + 1]),
      Math.abs(a.data[index + 2] - b.data[index + 2]),
    );
    if (delta > 0) {
      changedPixels += 1;
      mask[pixel] = Math.min(255, 64 + delta * 16);
    }
    maxDelta = Math.max(maxDelta, delta);
  }
  return { changedPixels, maxDelta, mask, width: a.info.width, height: a.info.height };
}

// Re-run only captures whose name matches this regular expression, e.g.
// VISUAL_ONLY="journey" or VISUAL_ONLY="^background-desktop".
const only = process.env.VISUAL_ONLY ? new RegExp(process.env.VISUAL_ONLY) : null;

await mkdir(output, { recursive: true });
let browser = await chromium.launch();

// A crashed or closed browser (out of memory, killed process) must not abort a
// long comparison run: relaunch it and retry the capture once.
async function captureSafely(base, path, viewport, theme, mode) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      if (!browser.isConnected()) browser = await chromium.launch();
      return await capture(browser, base, path, viewport, theme, mode);
    } catch (error) {
      if (attempt >= 1) throw error;
      console.warn(`retrying ${base}${path} after: ${error.message.split("\n")[0]}`);
      try { await browser.close(); } catch {}
      browser = await chromium.launch();
    }
  }
}
const report = [];
let failures = 0;
try {
  for (const mode of modes) {
    for (const viewport of viewports) {
      for (const theme of themes) {
        for (const locale of locales) {
          for (const route of routes) {
            const path = locale && route === "/" ? locale : `${locale}${route}`;
            const name = `${mode}-${viewport.name}-${theme}-${(path.replace(/\//g, "_") || "_home")}`;
            if (only && !only.test(name)) continue;
            // Some pages lay out with JavaScript-measured scaling and typed-in
            // text, so two renders of the SAME build can differ by sub-pixel
            // edge shifts. A real change differs on every attempt; a flake
            // disappears on a fresh pair of captures.
            const tolerance = mode === "background" ? backgroundTolerance : contentTolerance;
            let a;
            let b;
            let result;
            let pass = false;
            for (let attempt = 0; attempt < attempts && !pass; attempt += 1) {
              a = await captureSafely(baseA, path, viewport, theme, mode);
              b = await captureSafely(baseB, path, viewport, theme, mode);
              result = await diff(a.png, b.png);
              pass = !result.sizeMismatch && result.maxDelta <= tolerance;
            }
            if (!pass) {
              failures += 1;
              await writeFile(`${output}/${name}-a.png`, a.png);
              await writeFile(`${output}/${name}-b.png`, b.png);
              if (result.mask) {
                await sharp(result.mask, { raw: { width: result.width, height: result.height, channels: 1 } })
                  .png().toFile(`${output}/${name}-diff.png`);
              }
            }
            const newErrors = b.errors.filter((message) => !a.errors.includes(message));
            report.push({ name, pass, changedPixels: result.changedPixels, maxDelta: result.maxDelta, newErrors });
            console.log(`${pass ? "same" : "DIFF"}  ${name}  changed=${result.changedPixels} max=${result.maxDelta}${newErrors.length ? ` newErrors=${newErrors.length}` : ""}`);
          }
        }
      }
    }
  }
} finally {
  await browser.close();
}
await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
console.log(`\n${report.length - failures}/${report.length} captures identical (tolerance: content ${contentTolerance}, background ${backgroundTolerance}).`);
if (failures > 0) process.exitCode = 1;
