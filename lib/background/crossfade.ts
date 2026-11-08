// Crossfade pipeline for the site background on devices without GPU
// acceleration (software WebGL) or GPUs that cannot keep up.
//
// The original wave field is still painted with the same shader, but only as
// small keyframes a few times per second. Two stacked canvases show keyframe k
// (bottom) and k + 1 (top); the top one fades in with a linear opacity
// animation lasting one keyframe interval. The browser compositor performs
// that fade, which is exactly the shader's mix(a, b, blend), so no JavaScript
// or WebGL runs per displayed frame and the motion stays at the screen's full
// rate even when the page is busy. In the prototype this used about a third of
// the CPU of the WebGL composite pass.

import type { BackgroundColors } from "./renderer";

/** Paints the field for `time` at `width × height` px and returns it. */
export type KeyframeSource = (
  time: number,
  width: number,
  height: number,
) => Promise<ImageBitmap | null>;

type CrossfadeOptions = {
  /** The background canvas; the layers are inserted right after it. */
  anchor: HTMLCanvasElement;
  source: KeyframeSource;
  keyframeSeconds: number;
  /** Keyframe resolution relative to CSS pixels. */
  fieldScale: number;
  reduced: boolean;
  visible: boolean;
  colors: BackgroundColors;
  /** Only the desktop shader has a pointer glow. */
  glow: boolean;
  /** Called once if keyframes stop arriving (e.g. the GPU context was lost). */
  onFailure: () => void;
};

const LAYER_CLASS = "site-background-layer pointer-events-none fixed inset-0 h-full w-full";

// Pointer glow of the original shader:
//   col += (accent + accent2) * amount * smoothstep(0.46, 0.0, d) * mix(0.10, 0.16, light) * 0.08
// with d the distance in normalised screen coordinates. It is drawn as a
// radial gradient whose stops follow that smoothstep.
const GLOW_STOPS = [[0, 1], [25, 0.844], [50, 0.5], [75, 0.156], [100, 0]] as const;

function close(bitmap: ImageBitmap | null | undefined) {
  try {
    bitmap?.close();
  } catch {
    // Already transferred or closed.
  }
}

export class CrossfadeController {
  private readonly anchor: HTMLCanvasElement;
  private readonly source: KeyframeSource;
  private readonly interval: number;
  private readonly fieldScale: number;
  private readonly onFailure: () => void;
  private readonly layers: [HTMLCanvasElement, HTMLCanvasElement];
  private readonly contexts: [ImageBitmapRenderingContext, ImageBitmapRenderingContext];
  private readonly glow: HTMLDivElement | null;
  private top: 0 | 1 = 1;
  private keyIndex = 0;
  private animation: Animation | null = null;
  private prefetch: Promise<ImageBitmap | null> | null = null;
  /** Document-timeline time at which the current fade started. */
  private fadeStart = Number.NaN;
  /** Document-timeline time at which the current fade was paused, or NaN. */
  private pausedAt = Number.NaN;
  private generation = 0;
  private reduced: boolean;
  private visible: boolean;
  private colors: BackgroundColors;
  private pointer = { x: 0.5, y: 0.5, amount: 0 };
  private requestedSize = "";
  private shown = false;
  private failed = false;
  private disposed = false;

  constructor(options: CrossfadeOptions) {
    this.anchor = options.anchor;
    this.source = options.source;
    this.interval = options.keyframeSeconds;
    this.fieldScale = options.fieldScale;
    this.onFailure = options.onFailure;
    this.reduced = options.reduced;
    this.visible = options.visible;
    this.colors = options.colors;

    const create = (zIndex: string) => {
      const layer = document.createElement("canvas");
      layer.className = LAYER_CLASS;
      layer.setAttribute("aria-hidden", "true");
      layer.dataset.backgroundLayer = "";
      layer.style.zIndex = zIndex;
      // Fixed size and nothing inside: let the browser skip layout and paint
      // work for the layer entirely and only composite it.
      layer.style.contain = "strict";
      const context = layer.getContext("bitmaprenderer");
      if (!context) throw new Error("bitmaprenderer is unavailable");
      return [layer, context] as const;
    };
    const [bottom, bottomContext] = create("-10");
    const [top, topContext] = create("-9");
    top.style.opacity = "0";
    this.layers = [bottom, top];
    this.contexts = [bottomContext, topContext];

    if (options.glow) {
      const glow = document.createElement("div");
      glow.className = "site-background-layer pointer-events-none fixed left-0 top-0";
      glow.setAttribute("aria-hidden", "true");
      // Normal blending and no forced compositing layer: a blend mode or a
      // promoted layer here would change how the browser rasterises all text
      // on the page. Out of the render tree entirely while there is no pointer.
      Object.assign(glow.style, {
        zIndex: "-9",
        width: "92vw",
        height: "92vh",
        display: "none",
      });
      this.glow = glow;
      this.updateGlowColor();
    } else {
      this.glow = null;
    }

    // Layers start invisible; the original canvas (and its CSS fallback) stays
    // visible until the first keyframes are on screen.
    bottom.style.opacity = "0";
    this.anchor.after(bottom, top, ...(this.glow ? [this.glow] : []));
  }

  private fieldSize() {
    return {
      width: Math.max(2, Math.floor(window.innerWidth * this.fieldScale)),
      height: Math.max(2, Math.floor(window.innerHeight * this.fieldScale)),
    };
  }

  private request(index: number) {
    const { width, height } = this.fieldSize();
    return this.source(index * this.interval, width, height).catch(() => null);
  }

  private show(layer: 0 | 1, bitmap: ImageBitmap) {
    const canvas = this.layers[layer];
    if (canvas.width !== bitmap.width) canvas.width = bitmap.width;
    if (canvas.height !== bitmap.height) canvas.height = bitmap.height;
    this.contexts[layer].transferFromImageBitmap(bitmap);
    if (!this.shown) {
      // The original canvas (opacity 0) keeps its data attributes for tests
      // and diagnostics but no longer shows anything.
      this.shown = true;
      this.anchor.style.opacity = "0";
    }
  }

  private discardPrefetch() {
    const stale = this.prefetch;
    this.prefetch = null;
    void stale?.then(close);
  }

  private fail() {
    if (this.failed || this.disposed) return;
    this.failed = true;
    this.dispose();
    this.onFailure();
  }

  private get bottom(): 0 | 1 {
    return this.top === 1 ? 0 : 1;
  }

  /** (Re)starts from keyframe `index`, e.g. after a theme change or resize. */
  async start(index = this.keyIndex) {
    const generation = ++this.generation;
    const size = this.fieldSize();
    this.requestedSize = `${size.width}x${size.height}`;
    this.animation?.cancel();
    this.animation = null;
    this.pausedAt = Number.NaN;
    this.discardPrefetch();
    this.keyIndex = index;
    if (this.reduced) {
      const still = await this.request(index);
      if (generation !== this.generation || this.disposed) {
        close(still);
        return;
      }
      if (!still) {
        this.fail();
        return;
      }
      this.layers[this.bottom].style.opacity = "1";
      this.show(this.bottom, still);
      this.layers[this.top].style.opacity = "0";
      return;
    }
    const [current, next] = await Promise.all([this.request(index), this.request(index + 1)]);
    if (generation !== this.generation || this.disposed) {
      close(current);
      close(next);
      return;
    }
    if (!current || !next) {
      close(current);
      close(next);
      this.fail();
      return;
    }
    this.layers[this.bottom].style.zIndex = "-10";
    this.layers[this.top].style.zIndex = "-9";
    this.layers[this.bottom].style.opacity = "1";
    this.show(this.bottom, current);
    this.show(this.top, next);
    this.fade(generation, 0);
  }

  /** Resolves false when the first keyframes could not be produced. */
  async ready() {
    await this.start();
    return !this.disposed && this.shown;
  }

  private fade(generation: number, offsetMs: number) {
    const layer = this.layers[this.top];
    const duration = this.interval * 1000;
    layer.style.opacity = "0";
    const animation = layer.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration,
      easing: "linear",
      fill: "forwards",
    });
    this.animation = animation;
    // Continue exactly where the previous fade ended, so the hand-off between
    // keyframes neither repeats nor skips a frame.
    const offset = Math.min(Math.max(offsetMs, 0), duration);
    if (offset > 0) animation.currentTime = offset;
    const now = this.now();
    this.fadeStart = now - offset;
    // A fade that is already complete must be allowed to finish; pausing it
    // would suppress its finish event and a later play() would rewind it.
    if (!this.visible && offset < duration) {
      animation.pause();
      this.pausedAt = now;
    }
    // Browsers can still deliver the finish event of a fade that a restart
    // has just cancelled; only the current fade may hand off.
    animation.onfinish = () => {
      if (animation === this.animation) void this.advance(generation, animation);
    };
    // Paint the next keyframe in a later task, so the compositor is already
    // running this fade while the main thread paints.
    const index = this.keyIndex + 2;
    this.prefetch = new Promise<void>((resolve) => { window.setTimeout(resolve, 0); })
      .then(() => (generation === this.generation && !this.disposed ? this.request(index) : null));
  }

  private now() {
    return Number(document.timeline.currentTime ?? performance.now());
  }

  private async advance(generation: number, animation: Animation) {
    if (generation !== this.generation || this.disposed) return;
    const pending = this.prefetch;
    const next = await pending;
    // A restart while this hand-off waited has already set up its own
    // prefetch; only clear the one this hand-off consumed.
    if (this.prefetch === pending) this.prefetch = null;
    if (generation !== this.generation || this.disposed || animation !== this.animation) {
      close(next);
      return;
    }
    if (!next) {
      this.fail();
      return;
    }
    // The top layer now fully shows keyframe k + 1: it becomes the bottom,
    // and the old bottom becomes the new top for keyframe k + 2. All in one
    // task, so no intermediate state is ever painted.
    const finishedTop = this.layers[this.top];
    this.animation?.cancel();
    finishedTop.style.opacity = "1";
    finishedTop.style.zIndex = "-10";
    this.top = this.bottom;
    const newTop = this.layers[this.top];
    newTop.style.opacity = "0";
    newTop.style.zIndex = "-9";
    this.show(this.top, next);
    this.keyIndex += 1;
    const overshoot = this.now() - (this.fadeStart + this.interval * 1000);
    this.fade(generation, overshoot);
  }

  setReduced(reduced: boolean) {
    if (reduced === this.reduced) return;
    this.reduced = reduced;
    void this.start();
  }

  setVisible(visible: boolean) {
    if (visible === this.visible) return;
    this.visible = visible;
    const animation = this.animation;
    if (!visible) {
      if (animation?.playState === "running") {
        animation.pause();
        this.pausedAt = this.now();
      }
      return;
    }
    // Hidden time is not part of the fade: shift its start so the next
    // hand-off does not treat it as lateness and skip a keyframe.
    if (!Number.isNaN(this.pausedAt)) {
      this.fadeStart += this.now() - this.pausedAt;
      this.pausedAt = Number.NaN;
    }
    if (animation?.playState === "paused") animation.play();
  }

  /** New theme colours: keyframes are repainted by the source. */
  setColors(colors: BackgroundColors) {
    this.colors = colors;
    this.updateGlowColor();
    void this.start();
  }

  resize() {
    const { width, height } = this.fieldSize();
    if (`${width}x${height}` === this.requestedSize) return;
    void this.start();
  }

  setPointer(x: number, y: number, amount: number) {
    this.pointer = { x, y, amount };
    if (!this.glow) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    // The glow element is 0.92 × the viewport (radius 0.46 in normalised
    // coordinates on each axis, like the shader); centre it on the pointer.
    const left = x * width - 0.46 * width;
    const top = (1 - y) * height - 0.46 * height;
    this.glow.style.transform = `translate(${left}px, ${top}px)`;
    this.glow.style.opacity = String(amount);
    this.glow.style.display = amount > 0 ? "block" : "none";
  }

  private updateGlowColor() {
    if (!this.glow) return;
    const { accent, accent2, light } = this.colors;
    // The shader adds (accent + accent2) × strength. With normal blending the
    // same small lift comes from the average accent colour at about twice that
    // opacity (the background sits roughly halfway to it).
    const strength = (0.10 + (0.16 - 0.10) * light) * 0.08;
    const channel = (index: number) => Math.round(((accent[index] + accent2[index]) / 2) * 255);
    const color = `${channel(0)}, ${channel(1)}, ${channel(2)}`;
    const stops = GLOW_STOPS.map(([at, weight]) => (
      `rgba(${color}, ${Math.round(strength * 2 * weight * 10_000) / 10_000}) ${at}%`
    ));
    this.glow.style.background = `radial-gradient(closest-side, ${stops.join(", ")})`;
  }

  /** Current pointer state, so a restart keeps the glow where it was. */
  get pointerState() {
    return this.pointer;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.generation += 1;
    this.animation?.cancel();
    this.animation = null;
    this.discardPrefetch();
    for (const layer of this.layers) layer.remove();
    this.glow?.remove();
    this.anchor.style.opacity = "";
  }
}

/** True when this browser can run the crossfade pipeline. */
export function crossfadeSupported() {
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") return false;
  const probe = document.createElement("canvas");
  return typeof probe.animate === "function" && Boolean(probe.getContext("bitmaprenderer"));
}
