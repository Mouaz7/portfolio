import { CrossfadeController, crossfadeSupported } from "@/lib/background/crossfade";
import type { BackgroundColors } from "@/lib/background/renderer";

const colors: BackgroundColors = {
  bg: [0.04, 0.04, 0.06],
  accent: [0.1, 0.89, 0.76],
  accent2: [0.43, 0.55, 1],
  cyan: [0.1, 0.89, 0.76],
  teal: [0.06, 0.79, 0.67],
  mint: [0.43, 0.55, 1],
  foam: [0.96, 0.96, 0.98],
  light: 0,
};

type FakeAnimation = {
  onfinish: (() => void) | null;
  currentTime: number;
  playState: AnimationPlayState;
  cancel: jest.Mock;
  pause: jest.Mock;
  play: jest.Mock;
  finish: () => void;
};

let animations: FakeAnimation[] = [];
let transferred: Array<{ canvas: HTMLCanvasElement; bitmap: { width: number; height: number } }> = [];

function bitmap(width = 10, height = 6) {
  return { width, height, close: jest.fn() } as unknown as ImageBitmap;
}

beforeEach(() => {
  animations = [];
  transferred = [];
  jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function getContext(
    this: HTMLCanvasElement,
    id: string,
  ) {
    if (id !== "bitmaprenderer") return null;
    return {
      transferFromImageBitmap: (image: { width: number; height: number }) => {
        transferred.push({ canvas: this, bitmap: image });
      },
    } as unknown as ImageBitmapRenderingContext;
  } as typeof HTMLCanvasElement.prototype.getContext);
  (HTMLElement.prototype as unknown as { animate: unknown }).animate = jest.fn(() => {
    const animation: FakeAnimation = {
      onfinish: null,
      currentTime: 0,
      playState: "running",
      cancel: jest.fn(() => { animation.playState = "idle"; }),
      pause: jest.fn(() => { animation.playState = "paused"; }),
      play: jest.fn(() => { animation.playState = "running"; }),
      finish() {
        this.playState = "finished";
        this.onfinish?.();
      },
    };
    animations.push(animation);
    return animation;
  });
  Object.defineProperty(document, "timeline", { configurable: true, value: { currentTime: 0 } });
  (globalThis as unknown as { createImageBitmap: unknown }).createImageBitmap = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = "";
});

function setup(overrides: Partial<ConstructorParameters<typeof CrossfadeController>[0]> = {}) {
  const anchor = document.createElement("canvas");
  document.body.appendChild(anchor);
  const source = jest.fn(async () => bitmap());
  const onFailure = jest.fn();
  const controller = new CrossfadeController({
    anchor,
    source,
    keyframeSeconds: 0.1,
    fieldScale: 0.25,
    reduced: false,
    visible: true,
    colors,
    glow: true,
    onFailure,
    ...overrides,
  });
  return { anchor, source, onFailure, controller };
}

// Two task turns: keyframes are prefetched in a task after each fade starts.
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const flush = async () => {
  await tick();
  await tick();
};

describe("CrossfadeController", () => {
  it("is supported when bitmaprenderer, animate and createImageBitmap exist", () => {
    expect(crossfadeSupported()).toBe(true);
  });

  it("shows two keyframes and fades the top one in, hiding the original canvas only then", async () => {
    const { anchor, source, controller } = setup();
    const layers = document.querySelectorAll<HTMLCanvasElement>("canvas[data-background-layer]");
    expect(layers).toHaveLength(2);
    expect(anchor.style.opacity).toBe("");
    expect(await controller.ready()).toBe(true);
    expect(anchor.style.opacity).toBe("0");
    expect(source).toHaveBeenCalledWith(0, expect.any(Number), expect.any(Number));
    expect(source).toHaveBeenCalledWith(expect.closeTo(0.1), expect.any(Number), expect.any(Number));
    expect(transferred).toHaveLength(2);
    expect(animations).toHaveLength(1);
    // The faded-in layer is drawn above the other one.
    expect(layers[1].style.zIndex).toBe("-9");
    expect(layers[0].style.zIndex).toBe("-10");
  });

  it("swaps the layers when a fade finishes and continues with the next keyframe", async () => {
    const { controller } = setup();
    await controller.ready();
    const layers = document.querySelectorAll<HTMLCanvasElement>("canvas[data-background-layer]");
    animations[0].finish();
    await flush();
    expect(animations).toHaveLength(2);
    expect(layers[1].style.opacity).toBe("1");
    expect(layers[1].style.zIndex).toBe("-10");
    expect(layers[0].style.zIndex).toBe("-9");
    expect(layers[0].style.opacity).toBe("0");
  });

  it("moves at wall-clock speed even when the screen only shows 30 fps", async () => {
    // Battery saver or a slow phone delivers fewer frames, so a fade can
    // finish late. The waves must keep their speed: each keyframe is painted
    // for its own point in time, every fade lasts one keyframe interval, and
    // a late finish is carried into the next fade instead of slowing down.
    const { source, controller } = setup({ keyframeSeconds: 0.1 });
    await controller.ready();
    await flush(); // the next keyframe is painted in a later task
    const animate = HTMLElement.prototype.animate as jest.Mock;
    const keyframeTimes = () => (source.mock.calls as unknown as Array<[number]>).map(([time]) => Math.round(time * 1000));
    expect(animate.mock.calls[0][1]).toMatchObject({ duration: 100, easing: "linear" });
    expect(keyframeTimes()).toEqual([0, 100, 200]);

    // The 100 ms fade is noticed one 33 ms frame late.
    (document.timeline as unknown as { currentTime: number }).currentTime = 133;
    animations[0].finish();
    await flush();
    expect(animate.mock.calls[1][1]).toMatchObject({ duration: 100 });
    expect(animations[1].currentTime).toBe(33);
    expect(keyframeTimes()).toEqual([0, 100, 200, 300]);
    controller.dispose();
  });

  it("falls back once and removes its layers when keyframes stop arriving", async () => {
    const source = jest.fn(async () => null);
    const { anchor, onFailure, controller } = setup({ source });
    expect(await controller.ready()).toBe(false);
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll("canvas[data-background-layer]")).toHaveLength(0);
    expect(anchor.style.opacity).toBe("");
  });

  it("treats a throwing keyframe source as a failure", async () => {
    const source = jest.fn(async () => {
      throw new Error("context lost");
    });
    const { onFailure, controller } = setup({ source });
    await controller.ready();
    expect(onFailure).toHaveBeenCalledTimes(1);
  });

  it("shows a single still keyframe with reduced motion", async () => {
    const { source, controller } = setup({ reduced: true });
    await controller.ready();
    expect(source).toHaveBeenCalledTimes(1);
    expect(animations).toHaveLength(0);
  });

  it("pauses while hidden and does not restart for an unchanged size", async () => {
    const { source, controller } = setup();
    await controller.ready();
    controller.setVisible(false);
    expect(animations[0].pause).toHaveBeenCalled();
    controller.setVisible(true);
    expect(animations[0].play).toHaveBeenCalled();
    await flush();
    const calls = source.mock.calls.length;
    controller.resize();
    await flush();
    expect(source.mock.calls.length).toBe(calls);
  });

  it("repaints on theme change and positions the pointer glow", async () => {
    const { source, controller } = setup();
    await controller.ready();
    const calls = source.mock.calls.length;
    controller.setColors({ ...colors, light: 1 });
    await flush();
    expect(source.mock.calls.length).toBeGreaterThan(calls);
    controller.setPointer(0.5, 0.5, 1);
    const glow = document.querySelector<HTMLDivElement>("div.site-background-layer")!;
    expect(glow.style.opacity).toBe("1");
    expect(glow.style.display).toBe("block");
    controller.setPointer(0.5, 0.5, 0);
    expect(glow.style.display).toBe("none");
    expect(glow.style.transform).toContain("translate(");
    expect(controller.pointerState).toEqual({ x: 0.5, y: 0.5, amount: 0 });
  });

  it("keeps running when a restart lands while a fade hand-off is still waiting", async () => {
    // Rotating a phone restarts the crossfade while the previous fade is
    // still waiting for its prefetched keyframe. The stale hand-off must not
    // discard the keyframe the new fade already requested.
    let releaseSlow!: () => void;
    const { source, controller, onFailure } = setup();
    source.mockImplementation(async () => bitmap());
    await controller.ready();
    await flush();
    // The keyframe prefetched for the first hand-off arrives late.
    source.mockImplementationOnce(() => new Promise<ImageBitmap>((resolve) => {
      releaseSlow = () => resolve(bitmap());
    }));
    animations[0].finish();
    await flush();
    animations[1].finish(); // waits for the slow keyframe
    controller.setColors({ ...colors, light: 1 }); // restart, e.g. rotation
    await flush();
    releaseSlow();
    await flush();
    const fades = animations.length;
    animations[fades - 1].finish();
    await flush();
    expect(onFailure).not.toHaveBeenCalled();
    expect(animations.length).toBe(fades + 1);
    controller.dispose();
  });

  it("ignores a late finish event from a fade that a restart cancelled", async () => {
    // Seen in Chromium when a phone rotates: the cancelled fade's finish
    // event still arrives and must not take the new fade's keyframe.
    const { controller, onFailure } = setup();
    await controller.ready();
    const cancelled = animations[0];
    controller.setColors({ ...colors, light: 1 });
    await flush();
    cancelled.finish();
    await flush();
    const fades = animations.length;
    animations[fades - 1].finish();
    await flush();
    expect(onFailure).not.toHaveBeenCalled();
    expect(animations.length).toBe(fades + 1);
    controller.dispose();
  });

  it("does not count time in a hidden tab as lateness", async () => {
    const timeline = document.timeline as unknown as { currentTime: number };
    const { controller } = setup({ keyframeSeconds: 0.1 });
    await controller.ready();
    await flush();
    timeline.currentTime = 50;
    controller.setVisible(false);
    timeline.currentTime = 60_050; // a minute in the background
    controller.setVisible(true);
    timeline.currentTime = 100;
    timeline.currentTime += 60_000;
    animations[0].finish();
    await flush();
    // The next fade starts from the beginning instead of being skipped.
    expect(animations[1].currentTime).toBe(0);
  });

  it("never rewinds a finished fade or hands off twice", async () => {
    const { controller, onFailure } = setup();
    await controller.ready();
    await flush();
    const first = animations[0];
    first.finish();
    // Hidden and shown again while the hand-off is in progress.
    controller.setVisible(false);
    controller.setVisible(true);
    expect(first.play).not.toHaveBeenCalled();
    first.finish(); // a duplicate finish event
    await flush();
    expect(animations).toHaveLength(2);
    expect(onFailure).not.toHaveBeenCalled();
  });

  it("has no pointer glow for the mobile shader", () => {
    setup({ glow: false });
    expect(document.querySelector("div.site-background-layer")).toBeNull();
  });

  it("cleans up on dispose", async () => {
    const { anchor, controller } = setup();
    await controller.ready();
    controller.dispose();
    expect(document.querySelectorAll(".site-background-layer")).toHaveLength(0);
    expect(anchor.style.opacity).toBe("");
    expect(animations[0].cancel).toHaveBeenCalled();
  });
});
