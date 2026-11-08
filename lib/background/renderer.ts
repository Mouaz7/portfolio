// Two-pass WebGL renderer for the site background, shared by the main thread
// and the OffscreenCanvas worker. See shaders.ts for why the image
// is identical to the original single-pass shader.

import {
  DESKTOP_COMPOSITE_SHADER,
  DESKTOP_FIELD_SHADER,
  MOBILE_COMPOSITE_SHADER,
  MOBILE_FIELD_SHADER,
  VERTEX_SHADER,
  withMediumPrecision,
} from "./shaders";

export type BackgroundShaderProfile = "desktop" | "mobile";

export type BackgroundColors = {
  bg: number[];
  accent: number[];
  accent2: number[];
  cyan: number[];
  teal: number[];
  mint: number[];
  foam: number[];
  light: number;
};

export type RendererSettings = {
  shader: BackgroundShaderProfile;
  /** Keyframe resolution relative to CSS pixels. */
  fieldScale: number;
  /** Keyframes per second. Display frames are interpolated between them. */
  keyframesPerSecond: number;
  /** Output resolution relative to CSS pixels when rendering in software. */
  softwareOutputScale: number;
  /** Keyframe settings when rendering in software (no GPU acceleration). */
  softwareFieldScale: number;
  softwareKeyframesPerSecond: number;
  /** Displayed frames per second. */
  targetFps: number;
};

export type RendererStatus = {
  software: boolean;
  outputScale: number;
  renderer: string;
};

type Keyframe = { texture: WebGLTexture; framebuffer: WebGLFramebuffer; time: number };

// 3840×2160. Higher-density screens are still drawn at native resolution up to
// this many pixels; the composite pass is only two texture reads per pixel.
const MAX_OUTPUT_PIXELS = 3840 * 2160;
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/i;

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Unable to allocate shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function link(gl: WebGLRenderingContext, fragmentSource: string) {
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource)
    ?? compile(gl, gl.FRAGMENT_SHADER, withMediumPrecision(fragmentSource));
  if (!vertex || !fragment) {
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
    throw new Error("Shader compilation failed");
  }
  const program = gl.createProgram();
  if (!program) throw new Error("Unable to allocate WebGL program");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.bindAttribLocation(program, 0, "a_pos");
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    throw new Error("WebGL program linking failed");
  }
  return program;
}

function detectRenderer(gl: WebGLRenderingContext) {
  let name = "";
  try {
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    name = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? "");
  } catch {
    name = "";
  }
  return { name, software: SOFTWARE_RENDERER.test(name) };
}

export class WaveRenderer {
  private readonly gl: WebGLRenderingContext;
  private readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  private readonly settings: RendererSettings;
  private readonly field: WebGLProgram;
  private readonly composite: WebGLProgram;
  private readonly buffer: WebGLBuffer;
  private readonly fieldUniforms: Record<string, WebGLUniformLocation | null>;
  private readonly compositeUniforms: Record<string, WebGLUniformLocation | null>;
  readonly status: RendererStatus;

  private keyframes: Keyframe[] = [];
  private fieldWidth = 0;
  private fieldHeight = 0;
  private cssWidth = 0;
  private cssHeight = 0;
  private devicePixelRatio = 1;
  private outputScale = 1;
  private guardScale = Number.POSITIVE_INFINITY;
  private colors: BackgroundColors | null = null;
  private pointer = { x: 0.5, y: 0.5, amount: 0 };
  // Keyframe bookkeeping: keyframes[0] = time k, [1] = k + 1, [2] = being built.
  private keyIndex = Number.NaN;
  private buildBand = 0;
  private bands = 1;
  private staticTime = Number.NaN;
  private disposed = false;

  constructor(
    gl: WebGLRenderingContext,
    canvas: HTMLCanvasElement | OffscreenCanvas,
    settings: RendererSettings,
  ) {
    this.gl = gl;
    this.canvas = canvas;
    this.settings = settings;
    const detected = detectRenderer(gl);
    this.status = { software: detected.software, outputScale: 1, renderer: detected.name };

    this.field = link(gl, settings.shader === "desktop" ? DESKTOP_FIELD_SHADER : MOBILE_FIELD_SHADER);
    this.composite = link(
      gl,
      settings.shader === "desktop" ? DESKTOP_COMPOSITE_SHADER : MOBILE_COMPOSITE_SHADER,
    );
    const buffer = gl.createBuffer();
    if (!buffer) throw new Error("Unable to allocate WebGL buffer");
    this.buffer = buffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    const locate = (program: WebGLProgram, names: string[]) => Object.fromEntries(
      names.map((name) => [name, gl.getUniformLocation(program, name)]),
    );
    this.fieldUniforms = locate(this.field, [
      "u_res", "u_time", "u_mouse", "u_mouseAmt", "u_bg", "u_accent", "u_accent2",
      "u_cyan", "u_teal", "u_mint", "u_foam", "u_light",
    ]);
    this.compositeUniforms = locate(this.composite, [
      "u_from", "u_to", "u_blend", "u_res", "u_mouse", "u_mouseAmt", "u_accent", "u_accent2", "u_light",
    ]);
    gl.useProgram(this.composite);
    gl.uniform1i(this.compositeUniforms.u_from, 0);
    gl.uniform1i(this.compositeUniforms.u_to, 1);
  }

  /** Field and output settings in effect for the detected renderer. */
  private get fieldScale() {
    return this.status.software ? this.settings.softwareFieldScale : this.settings.fieldScale;
  }

  private get keyframeSeconds() {
    return 1 / (this.status.software
      ? this.settings.softwareKeyframesPerSecond
      : this.settings.keyframesPerSecond);
  }

  /**
   * Lowers the output resolution one step (native → 1× CSS pixels → the
   * software scale) when the frame-time guard says the device cannot keep up.
   * Returns false at the floor.
   */
  reduceOutputResolution() {
    const floor = this.settings.softwareOutputScale;
    if (this.outputScale <= floor) return false;
    this.guardScale = this.outputScale > 1 ? 1 : floor;
    this.outputScale = this.guardScale;
    this.applyCanvasSize();
    return true;
  }

  resize(cssWidth: number, cssHeight: number, devicePixelRatio: number) {
    this.cssWidth = Math.max(1, cssWidth);
    this.cssHeight = Math.max(1, cssHeight);
    this.devicePixelRatio = Math.max(1, devicePixelRatio || 1);
    if (this.status.software) {
      this.outputScale = this.settings.softwareOutputScale;
    } else {
      // Native resolution (capped at 4K pixel count), never above what the
      // frame-time guard allowed. Recomputed on every resize, so moving to a
      // window or screen with a different pixel ratio can raise it again.
      const cap = Math.sqrt(MAX_OUTPUT_PIXELS / (this.cssWidth * this.cssHeight));
      const native = Math.min(this.devicePixelRatio, Math.max(1, cap));
      this.outputScale = Math.min(native, this.guardScale);
    }
    this.applyCanvasSize();

    const width = Math.max(2, Math.floor(this.cssWidth * this.fieldScale));
    const height = Math.max(2, Math.floor(this.cssHeight * this.fieldScale));
    if (width !== this.fieldWidth || height !== this.fieldHeight || !this.keyframes.length) {
      this.fieldWidth = width;
      this.fieldHeight = height;
      this.allocateKeyframes();
    }
  }

  private applyCanvasSize() {
    const width = Math.max(2, Math.floor(this.cssWidth * this.outputScale));
    const height = Math.max(2, Math.floor(this.cssHeight * this.outputScale));
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    this.status.outputScale = this.outputScale;
  }

  private allocateKeyframes() {
    const gl = this.gl;
    for (const keyframe of this.keyframes) {
      gl.deleteFramebuffer(keyframe.framebuffer);
      gl.deleteTexture(keyframe.texture);
    }
    // Never keep deleted textures around if allocation below throws (for
    // example when the GPU context was lost): render() then does nothing.
    this.keyframes = [];
    this.keyframes = [0, 1, 2].map(() => {
      const texture = gl.createTexture();
      const framebuffer = gl.createFramebuffer();
      if (!texture || !framebuffer) throw new Error("Unable to allocate keyframe");
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(
        gl.TEXTURE_2D, 0, gl.RGBA, this.fieldWidth, this.fieldHeight, 0,
        gl.RGBA, gl.UNSIGNED_BYTE, null,
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error("Keyframe framebuffer is incomplete");
      }
      return { texture, framebuffer, time: Number.NaN };
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // Spread each keyframe over about half of its interval so building it never
    // causes a visible frame-time spike.
    const framesPerKeyframe = this.settings.targetFps * this.keyframeSeconds;
    this.bands = Math.max(1, Math.min(6, Math.floor(framesPerKeyframe / 2)));
    this.invalidate();
  }

  setColors(colors: BackgroundColors) {
    this.colors = colors;
    this.invalidate();
  }

  setPointer(x: number, y: number, amount: number) {
    this.pointer = { x, y, amount };
  }

  /** Forces every keyframe to be rebuilt on the next frame (theme change, resize). */
  invalidate() {
    this.keyIndex = Number.NaN;
    this.staticTime = Number.NaN;
  }

  private renderField(target: Keyframe, time: number, band?: { index: number; count: number }) {
    const gl = this.gl;
    const colors = this.colors;
    if (!colors) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.viewport(0, 0, this.fieldWidth, this.fieldHeight);
    gl.useProgram(this.field);
    const u = this.fieldUniforms;
    gl.uniform2f(u.u_res, this.fieldWidth, this.fieldHeight);
    gl.uniform1f(u.u_time, time);
    gl.uniform2f(u.u_mouse, 0.5, 0.5);
    gl.uniform1f(u.u_mouseAmt, 0);
    gl.uniform3fv(u.u_bg, colors.bg);
    gl.uniform3fv(u.u_accent, colors.accent);
    gl.uniform3fv(u.u_accent2, colors.accent2);
    gl.uniform3fv(u.u_cyan, colors.cyan);
    gl.uniform3fv(u.u_teal, colors.teal);
    gl.uniform3fv(u.u_mint, colors.mint);
    gl.uniform3fv(u.u_foam, colors.foam);
    gl.uniform1f(u.u_light, colors.light);
    if (band && band.count > 1) {
      const start = Math.floor((band.index * this.fieldHeight) / band.count);
      const end = Math.floor(((band.index + 1) * this.fieldHeight) / band.count);
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(0, start, this.fieldWidth, end - start);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disable(gl.SCISSOR_TEST);
    } else {
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    target.time = time;
  }

  private drawComposite(from: Keyframe, to: Keyframe, blend: number) {
    const gl = this.gl;
    const colors = this.colors;
    if (!colors) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.composite);
    const u = this.compositeUniforms;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, from.texture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, to.texture);
    gl.uniform1f(u.u_blend, blend);
    gl.uniform2f(u.u_res, this.canvas.width, this.canvas.height);
    gl.uniform2f(u.u_mouse, this.pointer.x, this.pointer.y);
    gl.uniform1f(u.u_mouseAmt, this.pointer.amount);
    gl.uniform3fv(u.u_accent, colors.accent);
    gl.uniform3fv(u.u_accent2, colors.accent2);
    gl.uniform1f(u.u_light, colors.light);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Draws one displayed frame for the given animation time in seconds. */
  render(time: number, still: boolean) {
    if (this.disposed || !this.colors || !this.keyframes.length) return;
    const [current] = this.keyframes;

    if (still) {
      if (this.staticTime !== time) {
        this.renderField(current, time);
        this.staticTime = time;
        this.keyIndex = Number.NaN;
      }
      this.drawComposite(current, current, 0);
      return;
    }
    this.staticTime = Number.NaN;

    const interval = this.keyframeSeconds;
    const index = Math.floor(time / interval);
    if (index === this.keyIndex + 1) {
      // Advance one keyframe: finish the one being built, then rotate.
      const building = this.keyframes[2];
      while (this.buildBand < this.bands) {
        this.renderField(building, (index + 1) * interval, { index: this.buildBand, count: this.bands });
        this.buildBand += 1;
      }
      this.keyframes = [this.keyframes[1], building, this.keyframes[0]];
      this.keyIndex = index;
      this.buildBand = 0;
    } else if (index !== this.keyIndex) {
      // First frame, invalidation or a time jump (tab resumed): rebuild now.
      this.renderField(this.keyframes[0], index * interval);
      this.renderField(this.keyframes[1], (index + 1) * interval);
      this.keyIndex = index;
      this.buildBand = 0;
    }

    // Build the next keyframe a band at a time while showing the current pair.
    if (this.buildBand < this.bands) {
      this.renderField(
        this.keyframes[2],
        (this.keyIndex + 2) * interval,
        { index: this.buildBand, count: this.bands },
      );
      this.buildBand += 1;
    }

    const blend = Math.min(1, Math.max(0, time / interval - this.keyIndex));
    this.drawComposite(this.keyframes[0], this.keyframes[1], blend);
  }

  dispose(loseContext = true) {
    if (this.disposed) return;
    this.disposed = true;
    const gl = this.gl;
    for (const keyframe of this.keyframes) {
      gl.deleteFramebuffer(keyframe.framebuffer);
      gl.deleteTexture(keyframe.texture);
    }
    this.keyframes = [];
    gl.deleteBuffer(this.buffer);
    gl.deleteProgram(this.field);
    gl.deleteProgram(this.composite);
    // Release the GPU context immediately; Safari in particular keeps old
    // contexts alive and eventually kills the tab on memory pressure.
    if (loseContext) gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}

/**
 * Frame pacing for a target rate on any refresh rate: an even cadence that is
 * never below the target (see shouldRender).
 */
/**
 * Paints single wave keyframes (the original field shader, unchanged) into
 * its own small canvas and hands them out as ImageBitmaps. Used by the
 * crossfade pipeline on devices without GPU acceleration, where blending the
 * keyframes on the browser compositor is far cheaper than a WebGL composite
 * pass every frame (see crossfade.ts).
 */
export class KeyframePainter {
  private readonly gl: WebGLRenderingContext;
  private readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  private readonly program: WebGLProgram;
  private readonly buffer: WebGLBuffer;
  private readonly uniforms: Record<string, WebGLUniformLocation | null>;
  private disposed = false;

  constructor(
    gl: WebGLRenderingContext,
    canvas: HTMLCanvasElement | OffscreenCanvas,
    shader: BackgroundShaderProfile,
  ) {
    this.gl = gl;
    this.canvas = canvas;
    this.program = link(gl, shader === "desktop" ? DESKTOP_FIELD_SHADER : MOBILE_FIELD_SHADER);
    const buffer = gl.createBuffer();
    if (!buffer) throw new Error("Unable to allocate WebGL buffer");
    this.buffer = buffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.useProgram(this.program);
    this.uniforms = Object.fromEntries([
      "u_res", "u_time", "u_mouse", "u_mouseAmt", "u_bg", "u_accent", "u_accent2",
      "u_cyan", "u_teal", "u_mint", "u_foam", "u_light",
    ].map((name) => [name, gl.getUniformLocation(this.program, name)]));
  }

  /** Paints the field for `time` (seconds) at width × height pixels. */
  paint(time: number, colors: BackgroundColors, width: number, height: number) {
    if (this.disposed) return;
    const gl = this.gl;
    // A lost context would silently produce blank keyframes; fail instead so
    // the caller can fall back.
    if (gl.isContextLost()) throw new Error("Keyframe painter context lost");
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.program);
    const u = this.uniforms;
    gl.uniform2f(u.u_res, width, height);
    gl.uniform1f(u.u_time, time);
    gl.uniform2f(u.u_mouse, 0.5, 0.5);
    gl.uniform1f(u.u_mouseAmt, 0);
    gl.uniform3fv(u.u_bg, colors.bg);
    gl.uniform3fv(u.u_accent, colors.accent);
    gl.uniform3fv(u.u_accent2, colors.accent2);
    gl.uniform3fv(u.u_cyan, colors.cyan);
    gl.uniform3fv(u.u_teal, colors.teal);
    gl.uniform3fv(u.u_mint, colors.mint);
    gl.uniform3fv(u.u_foam, colors.foam);
    gl.uniform1f(u.u_light, colors.light);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** The last painted keyframe as an ImageBitmap. */
  async bitmap(): Promise<ImageBitmap> {
    if ("transferToImageBitmap" in this.canvas) return this.canvas.transferToImageBitmap();
    return createImageBitmap(this.canvas);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.gl.deleteBuffer(this.buffer);
    this.gl.deleteProgram(this.program);
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}

/** Creates a KeyframePainter on its own canvas (OffscreenCanvas when available). */
export function createKeyframePainter(shader: BackgroundShaderProfile) {
  const canvas: HTMLCanvasElement | OffscreenCanvas = typeof OffscreenCanvas === "function"
    ? new OffscreenCanvas(2, 2)
    : document.createElement("canvas");
  const gl = canvas.getContext("webgl", {
    antialias: false,
    alpha: false,
    depth: false,
    stencil: false,
    powerPreference: "low-power",
  }) as WebGLRenderingContext | null;
  if (!gl) return null;
  try {
    return new KeyframePainter(gl, canvas, shader);
  } catch {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return null;
  }
}

/** Largest step the wave clock takes between two frames, in ms. */
const MAX_ANIMATION_STEP_MS = 100;

/**
 * Advances the wave clock by the real time since the previous frame. The
 * waves keep their speed at 30 fps (battery saver) or lower, while a long
 * stall (a busy main thread, a backgrounded tab) never makes them jump.
 */
export function advanceAnimationTime(elapsedMs: number, deltaMs: number) {
  return elapsedMs + Math.min(Math.max(deltaMs, 0), MAX_ANIMATION_STEP_MS);
}

export class FramePacer {
  private vsync = 1000 / 60;
  private vsyncMeasured = false;
  private lastTick = Number.NaN;
  private lastRender = Number.NaN;
  private readonly interval: number;
  private readonly frameTimes: number[] = [];
  private framesSinceCheck = 0;
  private struggling = false;

  constructor(targetFps: number) {
    this.interval = 1000 / targetFps;
  }

  /** Call on every animation frame; returns true when a frame should render. */
  shouldRender(now: number) {
    if (!Number.isNaN(this.lastTick)) {
      const delta = now - this.lastTick;
      // Real displays refresh at 50 Hz or faster. Clamping the estimate keeps a
      // device that delivers frames slowly from being mistaken for a slow
      // display, so the struggle check below still notices it.
      if (delta > 2 && delta < 50) {
        // Seed with the first measured interval, then smooth.
        this.vsync = Math.min(20, this.vsyncMeasured ? this.vsync * 0.9 + delta * 0.1 : delta);
        this.vsyncMeasured = true;
      }
    }
    this.lastTick = now;
    // Render every k-th vsync, with k the largest whole number of vsyncs that
    // still fits in the target interval: 60/90/100 Hz → every frame, 120/144/
    // 165 Hz → every 2nd, 240 Hz → every 4th. Never below the target rate and
    // always an even cadence.
    const k = Math.max(1, Math.floor(this.interval / this.vsync + 0.05));
    if (!Number.isNaN(this.lastRender) && now - this.lastRender < k * this.vsync - this.vsync / 2) {
      return false;
    }
    if (!Number.isNaN(this.lastRender)) {
      this.frameTimes.push(now - this.lastRender);
      if (this.frameTimes.length > 90) this.frameTimes.shift();
    }
    this.lastRender = now;
    return true;
  }

  /**
   * True when the device consistently misses the target (median frame time
   * more than 40% above target over the last 90 rendered frames).
   *
   * Evenly spaced 30 fps frames are not counted: that is a frame-rate cap
   * (iOS Low Power Mode, Chrome Energy Saver, battery savers and 30 Hz
   * screens all cap at 30 fps), and a lower resolution cannot make it faster.
   * Re-checked every 30 frames, so no array is sorted on every frame.
   */
  isStruggling() {
    if (this.frameTimes.length < 90) return false;
    if (this.framesSinceCheck++ % 30 !== 0) return this.struggling;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const median = sorted[45];
    const evenlyCapped = Math.abs(median - 1000 / 30) < 3
      && sorted[9] >= median * 0.9
      && sorted[80] <= median * 1.1;
    this.struggling = !evenlyCapped && median > Math.max(this.interval, this.vsync) * 1.4;
    return this.struggling;
  }

  resetMeasurements() {
    this.frameTimes.length = 0;
    this.lastRender = Number.NaN;
    this.framesSinceCheck = 0;
    this.struggling = false;
  }
}
