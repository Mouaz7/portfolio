// WebGL shaders for the shared site background (see SiteBackground.tsx).
//
// The background is drawn in two passes so it can stay at 60 fps on every
// device without changing how it looks:
//
// 1. FIELD shaders contain the original wave mathematics, unchanged. They are
//    rendered into a small texture a few times per second ("keyframes"). The
//    waves move slowly and have very soft edges, so a low-resolution keyframe
//    upscaled with bilinear filtering matches a full-resolution render to
//    within one or two colour levels out of 255.
// 2. COMPOSITE shaders run every displayed frame at the output resolution. They
//    blend the two keyframes around the current time, add the pointer glow and
//    apply per-pixel dithering, exactly like the original single-pass shader.
//
// Only the dithering moved from the field shaders into the composite shaders;
// the pointer glow is disabled in the field pass (u_mouseAmt = 0) and re-added
// in the composite pass with the same attenuation the field applies to it.

export const VERTEX_SHADER = `attribute vec2 a_pos; void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }`;

/** Original desktop wave field (multi-layer ribbons), without dithering. */
export const DESKTOP_FIELD_SHADER = `
precision highp float;

uniform vec2  u_res;
uniform float u_time;
uniform vec2  u_mouse;
uniform float u_mouseAmt;
uniform vec3  u_bg;
uniform vec3  u_accent;
uniform vec3  u_accent2;
uniform vec3  u_cyan;
uniform vec3  u_teal;
uniform vec3  u_mint;
uniform vec3  u_foam;
uniform float u_light;     // 1.0 in light mode, 0.0 in dark

float hash(vec2 p){
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}
float noise(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i + vec2(0.0, 0.0));
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++){
    v += amp * noise(p);
    p *= 2.0;
    amp *= 0.5;
  }
  return v;
}
mat2 rot(float a){
  float s = sin(a);
  float c = cos(a);
  return mat2(c, -s, s, c);
}

// Polynomial smooth maximum. A regular max() leaves a visible derivative
// seam where two translucent wave fields cross, which some mobile GPUs make
// especially obvious. This keeps the union continuous through the overlap.
float softUnion(float a, float b){
  const float softness = 0.16;
  float h = clamp(0.5 + 0.5 * (a - b) / softness, 0.0, 1.0);
  return mix(b, a, h) + softness * h * (1.0 - h);
}

float waveBand(vec2 p, float angle, float offset, float width, float blur, float phase, float amp, float freq){
  vec2 q = rot(angle) * p;
  q.x += 0.085 * sin(q.y * 2.25 + phase * 0.42);
  q.y += 0.045 * sin(q.x * 1.15 - phase * 0.30);
  float y = offset
    + amp * sin(q.x * freq + phase)
    + amp * 0.52 * sin(q.x * (freq * 1.72) - phase * 0.76)
    + amp * 0.24 * sin(q.x * (freq * 2.55) + phase * 1.18);
  return 1.0 - smoothstep(width, width + blur, abs(q.y - y));
}

float silkWaves(vec2 p, float angle, float density, float phase, float bend, float threshold){
  vec2 q = rot(angle) * p;
  q.x += 0.07 * sin(q.y * 2.4 - phase * 0.26);
  float stream = q.y
    + bend * sin(q.x * 1.22 + phase)
    + bend * 0.58 * sin(q.x * 2.10 - phase * 0.64)
    + bend * 0.22 * sin(q.x * 3.55 + phase * 1.2);
  float v = 0.5 + 0.5 * cos(stream * density + phase * 0.42);
  return smoothstep(threshold, 1.0, v);
}

float pocket(vec2 p, vec2 center, vec2 scale, float angle, float edge){
  vec2 d = rot(angle) * (p - center);
  d /= scale;
  return 1.0 - smoothstep(1.0, 1.0 + edge, length(d));
}

void main(){
  vec2 uv = gl_FragCoord.xy / u_res.xy;
  vec2 p = uv - 0.5;
  p.x *= u_res.x / u_res.y;

  float t = u_time * 0.095;
  vec2 flow = p + vec2(
    0.050 * sin(p.y * 4.2 + p.x * 1.4 + t * 1.7),
    0.046 * cos(p.x * 3.6 - p.y * 1.8 - t * 1.35)
  );
  flow += (fbm(p * 2.2 + vec2(t * 0.32, -t * 0.24)) - 0.5) * 0.105;

  float c1 = waveBand(flow, -0.72, -0.58, 0.105, 0.245, t * 1.05 + 0.2, 0.145, 1.10);
  float c2 = waveBand(flow, -0.82, -0.34, 0.095, 0.230, t * 0.86 + 2.1, 0.130, 1.34);
  float c3 = waveBand(flow, -0.68, -0.08, 0.105, 0.260, t * 1.18 + 4.0, 0.155, 1.02);
  float c4 = waveBand(flow, -0.88,  0.20, 0.090, 0.220, t * 0.78 + 1.3, 0.122, 1.48);
  float c5 = waveBand(flow, -0.76,  0.46, 0.110, 0.250, t * 0.92 + 3.3, 0.138, 1.18);

  float t1 = waveBand(flow, -0.58, -0.50, 0.100, 0.235, t * 0.82 + 5.4, 0.112, 1.42);
  float t2 = waveBand(flow, -0.66, -0.22, 0.095, 0.225, t * 1.10 + 0.7, 0.128, 1.22);
  float t3 = waveBand(flow, -0.54,  0.06, 0.090, 0.220, t * 0.95 + 2.8, 0.118, 1.58);
  float t4 = waveBand(flow, -0.62,  0.33, 0.100, 0.235, t * 0.74 + 4.6, 0.136, 1.26);

  float m1 = waveBand(flow, -1.02, -0.43, 0.075, 0.205, t * 0.90 + 1.7, 0.105, 1.68);
  float m2 = waveBand(flow, -0.98, -0.12, 0.080, 0.215, t * 1.16 + 3.9, 0.120, 1.36);
  float m3 = waveBand(flow, -1.08,  0.22, 0.078, 0.210, t * 0.84 + 0.4, 0.110, 1.54);
  float m4 = waveBand(flow, -0.94,  0.52, 0.080, 0.220, t * 1.02 + 2.5, 0.116, 1.30);

  float f1 = waveBand(flow, -0.79, -0.47, 0.052, 0.185, t * 1.25 + 0.9, 0.130, 1.24);
  float f2 = waveBand(flow, -0.86, -0.24, 0.050, 0.175, t * 1.04 + 2.7, 0.118, 1.44);
  float f3 = waveBand(flow, -0.76,  0.00, 0.056, 0.190, t * 1.18 + 4.4, 0.142, 1.16);
  float f4 = waveBand(flow, -0.92,  0.25, 0.052, 0.180, t * 0.92 + 1.6, 0.120, 1.52);
  float f5 = waveBand(flow, -0.70,  0.50, 0.055, 0.185, t * 1.10 + 3.6, 0.134, 1.20);
  float f6 = waveBand(flow, -1.14, -0.02, 0.046, 0.170, t * 0.88 + 5.2, 0.106, 1.64);

  float cyanField = clamp(softUnion(softUnion(softUnion(c1, c2), softUnion(c3, c4)), c5) * 0.56, 0.0, 1.0);
  float tealField = clamp(softUnion(softUnion(t1, t2), softUnion(t3, t4)) * 0.56, 0.0, 1.0);
  float mintField = clamp(softUnion(softUnion(m1, m2), softUnion(m3, m4)) * 0.52, 0.0, 1.0);
  float foamField = clamp(softUnion(softUnion(softUnion(f1, f2), softUnion(f3, f4)), softUnion(f5, f6)) * 0.46, 0.0, 1.0);

  float silkFoam = softUnion(
    silkWaves(flow + vec2(-0.03, 0.02), -0.80, 9.6, t * 1.12 + 0.8, 0.165, 0.68),
    silkWaves(flow + vec2(0.22, -0.04), -1.04, 8.2, t * 0.92 + 3.1, 0.135, 0.70)
  );
  float silkCyan = softUnion(
    silkWaves(flow + vec2(0.02, 0.00), -0.66, 7.8, t * 0.84 + 2.0, 0.185, 0.66),
    silkWaves(flow + vec2(-0.24, 0.06), -0.92, 6.7, t * 1.02 + 4.8, 0.150, 0.68)
  );
  float silkTeal = softUnion(
    silkWaves(flow + vec2(-0.18, -0.03), -0.52, 7.1, t * 0.76 + 1.4, 0.145, 0.68),
    silkWaves(flow + vec2(0.18, 0.05), -0.74, 8.8, t * 0.88 + 5.5, 0.155, 0.70)
  );
  float silkMint = silkWaves(flow + vec2(0.06, -0.10), -1.16, 7.4, t * 1.06 + 2.6, 0.125, 0.70);

  cyanField = clamp(softUnion(cyanField, silkCyan * 0.98), 0.0, 1.0);
  tealField = clamp(softUnion(tealField, silkTeal * 0.90), 0.0, 1.0);
  mintField = clamp(softUnion(mintField, silkMint * 0.88), 0.0, 1.0);
  foamField = clamp(softUnion(foamField, silkFoam), 0.0, 1.0);

  float haze = softUnion(
    pocket(flow, vec2(-0.52, -0.06), vec2(0.55, 0.95), -0.68, 0.95),
    pocket(flow, vec2(0.52, 0.10), vec2(0.48, 0.90), -0.70, 0.95)
  );
  float foamHaze = softUnion(
    pocket(flow, vec2(0.18, 0.42), vec2(0.36, 0.92), -0.78, 0.82),
    pocket(flow, vec2(-0.12, -0.46), vec2(0.30, 0.86), -0.92, 0.82)
  );

  // Pointer glow — gentle, softer in light mode so it never darkens.
  float md = distance(uv, u_mouse);
  float glow = u_mouseAmt * smoothstep(0.46, 0.0, md) * mix(0.10, 0.16, u_light);
  float grain = (fbm(p * 4.2 + vec2(t * 1.6, -t * 1.1)) - 0.5) * mix(0.022, 0.034, u_light);

  vec3 col = u_bg;
  col = mix(col, u_cyan, haze * mix(0.06, 0.32, u_light));
  col = mix(col, u_teal, tealField * mix(0.12, 0.72, u_light));
  col = mix(col, u_cyan, cyanField * mix(0.18, 0.82, u_light));
  col = mix(col, u_mint, mintField * mix(0.14, 0.62, u_light));
  col = mix(col, u_foam, foamHaze * mix(0.10, 0.30, u_light));
  col = mix(col, u_foam, foamField * mix(0.30, 0.86, u_light));
  col += (u_cyan * cyanField + u_mint * mintField + u_foam * foamField) * mix(0.075, 0.015, u_light);
  col += (u_accent + u_accent2) * glow * 0.08;
  col += grain;

  float night = 1.0 - u_light;
  float edgeDepth = smoothstep(0.12, 0.98, distance(uv, vec2(0.54, 0.48)));
  col = mix(col, u_bg * 0.62, edgeDepth * night * 0.48);
  col += (u_cyan + u_mint) * foamField * night * 0.035;

  // Keyframes are stored in 8 bits per channel. A sub-step dither before
  // that quantisation keeps the original smooth gradients (the composite
  // pass adds its own per-pixel dither on top, as the original shader did).
  col += (hash(gl_FragCoord.xy + vec2(41.7, 17.3)) - 0.5) / 255.0;

  gl_FragColor = vec4(col, 1.0);
}
`;

/**
 * Original mobile wave field. It contains no thresholded bands, pockets, field
 * unions, or cellular noise: every visible colour field is an analytic
 * sine/cosine gradient. This prevents the large moving facets seen in Samsung
 * Internet while preserving the same slow ocean motion and theme palette.
 */
export const MOBILE_FIELD_SHADER = `
precision highp float;

uniform vec2  u_res;
uniform float u_time;
uniform vec3  u_bg;
uniform vec3  u_accent2;
uniform vec3  u_cyan;
uniform vec3  u_teal;
uniform vec3  u_mint;
uniform vec3  u_foam;
uniform float u_light;

void main(){
  vec2 uv = gl_FragCoord.xy / u_res.xy;
  vec2 p = uv - 0.5;

  // Keep the field stable between narrow portrait and wide landscape phones.
  // Only coordinate scaling uses min/mix; visible fields remain threshold-free.
  float shortAspect = min(u_res.x / u_res.y, 1.0);
  p.x *= mix(0.82, 1.0, shortAspect);

  float t = u_time * 0.22;
  float bendX = sin(p.y * 2.40 + t * 0.55)
    + 0.38 * sin(p.y * 4.70 - t * 0.33 + 1.20);
  float bendY = cos(p.x * 2.60 - t * 0.43)
    + 0.34 * cos(p.x * 5.10 + t * 0.27 + 2.10);
  vec2 q = p + vec2(bendX, bendY) * 0.080;

  float waveA = 0.5 + 0.5 * sin(q.x * 5.10 + q.y * 3.80 + t * 0.52 + 0.30);
  float waveB = 0.5 + 0.5 * cos(q.x * 3.40 - q.y * 6.00 - t * 0.41 + 1.70);
  float waveC = 0.5 + 0.5 * sin((q.x + q.y) * 7.00 + t * 0.52 + 3.40);
  float waveD = 0.5 + 0.5 * cos(q.y * 5.50 - q.x * 4.30 - t * 0.36 + 5.10);

  // Squaring a sine field concentrates its highlight into a soft ribbon while
  // keeping the value and derivative continuous everywhere.
  float ribbonA = waveA * waveA * waveA;
  float ribbonB = waveB * waveB * waveB;
  float ribbonC = waveC * waveC;
  ribbonC *= ribbonC;
  float ribbonD = waveD * waveD * waveD;

  vec3 col = mix(u_bg, u_teal, mix(0.38, 0.10, u_light));
  col = mix(col, u_cyan, 0.08 + mix(0.26, 0.24, u_light) * ribbonA);
  col = mix(col, u_mint, 0.02 + mix(0.14, 0.16, u_light) * ribbonB);
  col = mix(col, u_accent2, 0.02 + mix(0.10, 0.12, u_light) * ribbonD);
  col = mix(col, u_foam, 0.035 + mix(0.42, 0.52, u_light) * ribbonC);

  // A continuous edge-depth curve retains dark-mode depth without contours.
  float radial = dot(p, p);
  col *= 1.0 - (1.0 - u_light) * radial * 0.12;

  // Match the desktop shader's measured color balance without borrowing its
  // thresholded geometry. The mobile field supplies only continuous luminance;
  // these two linear color curves reproduce desktop dark/light mean color and
  // contrast while keeping every mobile wave edge smooth.
  float sourceLuma = dot(col, vec3(0.2126, 0.7152, 0.0722));

  float desktopDarkLuma = 0.46599516
    + (sourceLuma - 0.44953252) * 1.41685879;
  vec3 desktopDark = vec3(0.32208068, 0.50194421, 0.53366089)
    + vec3(0.88289137, 1.02491190, 1.09806512)
      * (desktopDarkLuma - 0.46599516);

  float desktopLightLuma = 0.91273683
    + (sourceLuma - 0.89104284) * 1.75637562;
  vec3 desktopLight = vec3(0.73512117, 0.96223999, 0.94537426)
    + vec3(2.51916747, 0.58039367, 0.68320557)
      * (desktopLightLuma - 0.91273683);

  col = mix(desktopDark, desktopLight, u_light);

  // Sub-step dither before the 8-bit keyframe quantisation (see desktop).
  col += (fract(sin(dot(gl_FragCoord.xy, vec2(39.3468, 11.135))) * 14375.5964) - 0.5) / 255.0;

  gl_FragColor = vec4(col, 1.0);
}
`;

/**
 * Desktop output pass. In the original shader the pointer glow was added before
 * the dark-mode edge vignette, so the vignette also dimmed the glow:
 * mix(col + g, bg * 0.62, e) = mix(col, bg * 0.62, e) + g * (1 - e).
 * The field texture already contains mix(col, bg * 0.62, e); this pass adds
 * g * (1 - e) and the identical dithering.
 */
export const DESKTOP_COMPOSITE_SHADER = `
precision highp float;

uniform sampler2D u_from;
uniform sampler2D u_to;
uniform float u_blend;
uniform vec2  u_res;
uniform vec2  u_mouse;
uniform float u_mouseAmt;
uniform vec3  u_accent;
uniform vec3  u_accent2;
uniform float u_light;

float hash(vec2 p){
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

void main(){
  vec2 uv = gl_FragCoord.xy / u_res.xy;
  vec3 col = mix(texture2D(u_from, uv).rgb, texture2D(u_to, uv).rgb, u_blend);

  float md = distance(uv, u_mouse);
  float glow = u_mouseAmt * smoothstep(0.46, 0.0, md) * mix(0.10, 0.16, u_light);
  float night = 1.0 - u_light;
  float edgeDepth = smoothstep(0.12, 0.98, distance(uv, vec2(0.54, 0.48)));
  col += (u_accent + u_accent2) * glow * 0.08 * (1.0 - edgeDepth * night * 0.48);

  float dither = (hash(gl_FragCoord.xy + vec2(19.19, 73.73)) - 0.5) * (0.75 / 255.0);
  col += dither;

  gl_FragColor = vec4(col, 1.0);
}
`;

/** Mobile output pass: keyframe blend plus the original mobile dithering. */
export const MOBILE_COMPOSITE_SHADER = `
precision highp float;

uniform sampler2D u_from;
uniform sampler2D u_to;
uniform float u_blend;
uniform vec2  u_res;

void main(){
  vec2 uv = gl_FragCoord.xy / u_res.xy;
  vec3 col = mix(texture2D(u_from, uv).rgb, texture2D(u_to, uv).rgb, u_blend);

  float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  col += (dither - 0.5) * (0.65 / 255.0);

  gl_FragColor = vec4(col, 1.0);
}
`;

/**
 * Some older mobile GPUs (early Mali/Adreno) cannot compile highp fragment
 * shaders. Retrying with mediump keeps WebGL instead of the CSS fallback.
 */
export function withMediumPrecision(source: string) {
  // fp16 cannot represent large pixel coordinates precisely enough for the
  // hash-based dither, so wrap them first (the dither stays sub-step noise).
  return source
    .replace("precision highp float;", "precision mediump float;")
    .replace(/hash\(gl_FragCoord\.xy/g, "hash(mod(gl_FragCoord.xy, 256.0)")
    .replace(/dot\(gl_FragCoord\.xy,/g, "dot(mod(gl_FragCoord.xy, 256.0),");
}
