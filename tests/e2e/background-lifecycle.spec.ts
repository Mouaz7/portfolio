import { expect, test } from "@playwright/test";

for (const failure of ["error", "transfer", "context"] as const) {
  test(`worker ${failure} failure is bounded and cleans up`, async ({ page }) => {
    await page.addInitScript((mode) => {
      const state = { created: 0, terminated: 0, posts: 0, emit: (_type: string) => {} };
      (window as unknown as { workerProbe: typeof state }).workerProbe = state;
      class TestWorker {
        onmessage: ((event: unknown) => void) | null = null;
        onerror: (() => void) | null = null;
        constructor() { state.created += 1; }
        postMessage(message: { type: string; generation: number }) {
          state.posts += 1;
          if (message.type !== "init") return;
          if (mode === "transfer") throw new Error("simulated transfer failure");
          state.emit = (type) => {
            if (type === "error") this.onerror?.();
            else this.onmessage?.({ data: { type, generation: message.generation } });
          };
          setTimeout(() => state.emit("ready"), 0);
        }
        terminate() { state.terminated += 1; }
      }
      window.Worker = TestWorker as unknown as typeof Worker;
    }, failure);
    await page.goto("/");
    const canvas = page.locator("canvas[data-background-fps]");
    const emit = (type: string) => page.evaluate((type) => {
      (window as unknown as { workerProbe: { emit: (type: string) => void } }).workerProbe.emit(type);
    }, type);
    if (failure !== "transfer") {
      await expect(canvas).toHaveAttribute("data-background-renderer", "webgl");
      await emit(failure === "error" ? "error" : "lost");
    }
    if (failure === "context") {
      await expect(canvas).toHaveAttribute("data-background-renderer", "css");
      await expect(canvas).toHaveAttribute("data-background-profile", "css-soft");
      await expect(canvas).toHaveAttribute("data-background-device-tier", /desktop/);
    } else {
      // A failed worker has already taken the canvas, so the background moves
      // to a fresh canvas on the main thread instead of the CSS fallback.
      await expect(canvas).toHaveAttribute("data-background-generation", "1");
      await expect(canvas).toHaveAttribute("data-background-thread", "main");
      await expect(canvas).toHaveAttribute("data-background-renderer", "webgl");
      await expect(canvas).toHaveAttribute("data-background-profile", "layered-desktop");
      await expect(canvas).toHaveAttribute("data-background-device-tier", /desktop/);
    }
    if (failure === "context") {
      await emit("restored");
      await expect(canvas).toHaveAttribute("data-background-generation", "1");
      await expect(canvas).toHaveAttribute("data-background-renderer", "webgl");
      await emit("lost");
      await expect(canvas).toHaveAttribute("data-background-renderer", "css");
      await emit("restored");
      await expect(canvas).toHaveAttribute("data-background-generation", "2");
      await expect(canvas).toHaveAttribute("data-background-renderer", "css");
    }
    const probe = () => page.evaluate(() => {
      const { created, terminated, posts } = (window as unknown as {
        workerProbe: { created: number; terminated: number; posts: number };
      }).workerProbe;
      return { created, terminated, posts };
    });
    const before = await probe();
    expect(before.terminated).toBe(before.created);
    await page.setViewportSize({ width: 1200, height: 700 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(canvas).toHaveAttribute("data-background-mode", "static");
    expect(await probe()).toEqual(before);
    await expect(canvas).toHaveCount(1);
  });
}

test("live motion preferences pause and resume the background", async ({ page }) => {
  await page.goto("/");
  const canvas = page.locator("canvas[data-background-fps]");
  await expect(canvas).toHaveAttribute("data-background-mode", "animated");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(canvas).toHaveAttribute("data-background-mode", "static");
  await expect(canvas).toHaveAttribute("data-background-fps", "0");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(canvas).toHaveAttribute("data-background-mode", "animated");
  await expect(canvas).toHaveCount(1);
});

test("profile changes replace a transferred canvas in both directions", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/");
  const canvas = page.locator("canvas[data-background-fps]");
  await expect(canvas).toHaveAttribute("data-background-device-tier", /desktop/);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(canvas).toHaveAttribute("data-background-device-tier", "mobile");
  await expect(canvas).toHaveAttribute("data-background-generation", "1");
  await page.setViewportSize({ width: 1366, height: 768 });
  await expect(canvas).toHaveAttribute("data-background-device-tier", /desktop/);
  await expect(canvas).toHaveAttribute("data-background-generation", "2");
  await expect(canvas).toHaveCount(1);
});

test("main-thread WebGL context loss falls back and restoration recreates resources", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, "transferControlToOffscreen", { value: undefined });
    // Keep the WebGL composite pipeline even though CI renders in software
    // (where the compositor crossfade would otherwise be used).
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function patched(this: HTMLCanvasElement, id: string, options?: unknown) {
      if (id === "bitmaprenderer") return null;
      return getContext.call(this, id, options as never);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  await page.goto("/");
  const canvas = page.locator("canvas[data-background-fps]");
  await expect(canvas).toHaveAttribute("data-background-renderer", "webgl");
  const supported = await canvas.evaluate((element: HTMLCanvasElement) => {
    const extension = element.getContext("webgl")?.getExtension("WEBGL_lose_context");
    if (!extension) return false;
    (window as unknown as { restoreBackground: () => void }).restoreBackground = () => extension.restoreContext();
    extension.loseContext();
    return true;
  });
  test.skip(!supported, "Browser does not expose the context-loss test extension");
  await expect(canvas).toHaveAttribute("data-background-renderer", "css");
  await page.evaluate(() => (window as unknown as { restoreBackground: () => void }).restoreBackground());
  await expect(canvas).toHaveAttribute("data-background-generation", "1");
  await expect(canvas).toHaveAttribute("data-background-renderer", "webgl");
  // A second loss/restoration must stop retrying rather than loop forever.
  await canvas.evaluate((element: HTMLCanvasElement) => {
    const extension = element.getContext("webgl")!.getExtension("WEBGL_lose_context")!;
    (window as unknown as { restoreBackground: () => void }).restoreBackground = () => extension.restoreContext();
    extension.loseContext();
  });
  await expect(canvas).toHaveAttribute("data-background-renderer", "css");
  await page.evaluate(() => (window as unknown as { restoreBackground: () => void }).restoreBackground());
  await expect(canvas).toHaveAttribute("data-background-generation", "2");
  await expect(canvas).toHaveAttribute("data-background-renderer", "css");
});

test("CSS fallback pauses while hidden and follows live motion settings", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, "transferControlToOffscreen", { value: undefined });
    HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
  });
  await page.goto("/");
  const canvas = page.locator("canvas[data-background-fps]");
  await expect(canvas).toHaveAttribute("data-background-mode", "animated");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(canvas).toHaveCSS("animation-play-state", "paused");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(canvas).toHaveCSS("animation-play-state", "running");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(canvas).toHaveCSS("animation-name", "none");
});

test("worker startup timeout moves to the main thread and ignores late ready messages", async ({ page }) => {
  await page.addInitScript(() => {
    const state = { terminated: 0, posts: 0, lateReady: null as null | (() => void) };
    (window as unknown as { workerProbe: typeof state }).workerProbe = state;
    class SilentWorker {
      onmessage: ((event: unknown) => void) | null = null;
      onerror = null;
      postMessage(message: { type: string; generation: number }) {
        state.posts += 1;
        if (message.type === "init") setTimeout(() => {
          const listener = this.onmessage;
          state.lateReady = () => listener?.({ data: { type: "ready", generation: message.generation } });
        }, 0);
      }
      terminate() { state.terminated += 1; }
    }
    window.Worker = SilentWorker as unknown as typeof Worker;
  });
  await page.goto("/");
  const canvas = page.locator("canvas[data-background-fps]");
  await expect(canvas).toHaveAttribute("data-background-thread", "worker");
  await expect(canvas).toHaveAttribute("data-background-thread", "main", { timeout: 7000 });
  await expect(canvas).toHaveAttribute("data-background-renderer", "webgl");
  const before = await page.evaluate(() => {
    const state = (window as unknown as { workerProbe: { posts: number; terminated: number; lateReady: () => void } }).workerProbe;
    state.lateReady();
    return { posts: state.posts, terminated: state.terminated };
  });
  await page.setViewportSize({ width: 1200, height: 700 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(canvas).toHaveAttribute("data-background-mode", "static");
  await expect(canvas).toHaveAttribute("data-background-renderer", "webgl");
  await expect(canvas).toHaveAttribute("data-background-thread", "main");
  expect(await page.evaluate(() => {
    const state = (window as unknown as { workerProbe: { posts: number; terminated: number } }).workerProbe;
    return { posts: state.posts, terminated: state.terminated };
  })).toEqual(before);
  expect(before.terminated).toBe(1);
});

test("software rendering uses the compositor crossfade and keeps animating", async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto("/");
  const canvas = page.locator("canvas[data-background-fps]");
  await expect(canvas).toHaveAttribute("data-background-renderer", "webgl");
  // CI browsers render WebGL in software, which selects the crossfade pipeline.
  await expect(canvas).toHaveAttribute("data-background-pipeline", "crossfade");
  await expect(canvas).toHaveAttribute("data-background-fps", "60");
  await expect(page.locator("canvas[data-background-layer]")).toHaveCount(2);
  const first = await page.screenshot({ clip: { x: 0, y: 0, width: 200, height: 200 } });
  await page.waitForTimeout(300);
  const next = await page.screenshot({ clip: { x: 0, y: 0, width: 200, height: 200 } });
  expect(next.equals(first)).toBe(false);
  // Stays in the worker with the same canvas well past the 5 s startup
  // watchdog (switching pipelines must not look like a lost GPU context).
  await page.waitForTimeout(6_500);
  await expect(canvas).toHaveAttribute("data-background-thread", "worker");
  await expect(canvas).toHaveAttribute("data-background-generation", "0");
  await expect(canvas).toHaveAttribute("data-background-pipeline", "crossfade");
  await expect(page.locator("canvas[data-background-layer]")).toHaveCount(2);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(canvas).toHaveAttribute("data-background-mode", "static");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(canvas).toHaveAttribute("data-background-generation", "1");
  await expect(page.locator("canvas[data-background-layer]")).toHaveCount(2);
});
