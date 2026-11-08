// Shared fixtures for the public-page specs: routes, viewports and image
// helpers for the background checks.
import sharp from "sharp";

export const routes = [
  "/",
  "/skills",
  "/journey",
  "/projects",
  "/contact",
] as const;
export const publicSurfaceSelectors: Record<(typeof routes)[number], string> = {
  "/": ".home-main",
  "/skills": ".skills-bento-grid",
  "/journey": '[data-journey-fit="desktop"]',
  "/projects": ".projects-shell",
  "/contact": ".contact-repository-shell",
};
export const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
] as const;
export const adaptiveViewports = [
  { name: "reported-windows-split", width: 1723, height: 608 },
  { name: "compact-laptop-800", width: 800, height: 600 },
  { name: "compact-laptop-900", width: 900, height: 600 },
  { name: "compact-laptop-1024", width: 1024, height: 600 },
  { name: "small-laptop", width: 1024, height: 768 },
  { name: "short-desktop", width: 1280, height: 720 },
  { name: "standard-laptop", width: 1366, height: 768 },
  { name: "standard-desktop", width: 1440, height: 900 },
  { name: "galaxy-tab-s4", width: 712, height: 1138 },
  { name: "ipad-mini", width: 768, height: 1024 },
  { name: "zenbook-fold", width: 853, height: 1280 },
  { name: "surface-pro-7", width: 912, height: 1368 },
  { name: "surface-pro-10", width: 960, height: 1440 },
  { name: "ipad-pro-13", width: 1032, height: 1376 },
  { name: "nest-hub-max", width: 1280, height: 800 },
] as const;
export const visualOutput = "test-results/visual-actual";

export function routeName(route: (typeof routes)[number]) {
  // Preserve the approved screenshot filenames while exercising canonical URLs.
  return route === "/" ? "home" : route === "/journey" ? "journey" : `${route.slice(1)}-page`;
}

export async function waitUntil(startedAt: number, elapsedMs: number) {
  const remaining = elapsedMs - (Date.now() - startedAt);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
}

// The two-pass background keeps the full 60 fps on every device class; weak
// GPUs and software rendering pay for it with cheaper keyframes instead.
// Mirrors BACKGROUND_TARGET_FPS in lib/background/profile.ts.
export const EXPECTED_BACKGROUND_FPS = "60";

export async function backgroundSmoothness(png: Buffer) {
  const { data, info } = await sharp(png)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const luminance = new Uint16Array(info.width * info.height);

  for (let source = 0, pixel = 0; source < data.length; source += info.channels, pixel += 1) {
    luminance[pixel] = (
      (77 * data[source])
      + (150 * data[source + 1])
      + (29 * data[source + 2])
    ) >> 8;
  }

  let maxNeighborDelta = 0;
  let maxLaplacian = 0;
  for (let y = 1; y < info.height - 1; y += 1) {
    for (let x = 1; x < info.width - 1; x += 1) {
      const index = (y * info.width) + x;
      maxNeighborDelta = Math.max(
        maxNeighborDelta,
        Math.abs(luminance[index] - luminance[index + 1]),
        Math.abs(luminance[index] - luminance[index + info.width]),
      );
      maxLaplacian = Math.max(
        maxLaplacian,
        Math.abs(
          (4 * luminance[index])
          - luminance[index - 1]
          - luminance[index + 1]
          - luminance[index - info.width]
          - luminance[index + info.width]
        ),
      );
    }
  }

  return { maxLaplacian, maxNeighborDelta };
}

export async function backgroundFrameDelta(firstPng: Buffer, secondPng: Buffer) {
  const [first, second] = await Promise.all([
    sharp(firstPng).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(secondPng).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  if (
    first.info.width !== second.info.width
    || first.info.height !== second.info.height
    || first.info.channels !== second.info.channels
  ) {
    throw new Error("Background frames must have identical dimensions");
  }

  let totalDelta = 0;
  for (let index = 0; index < first.data.length; index += 1) {
    totalDelta += Math.abs(first.data[index] - second.data[index]);
  }
  return totalDelta / first.data.length;
}

export async function backgroundColorSignature(png: Buffer) {
  const { data, info } = await sharp(png)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixelCount = data.length / info.channels;
  const sums = [0, 0, 0];
  const squaredSums = [0, 0, 0];

  for (let source = 0; source < data.length; source += info.channels) {
    for (let channel = 0; channel < 3; channel += 1) {
      const value = data[source + channel];
      sums[channel] += value;
      squaredSums[channel] += value * value;
    }
  }

  const mean = sums.map((sum) => sum / pixelCount);
  const deviation = squaredSums.map((sum, channel) => (
    Math.sqrt((sum / pixelCount) - (mean[channel] * mean[channel]))
  ));
  return { deviation, mean };
}
