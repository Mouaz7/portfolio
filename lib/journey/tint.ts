// Translucent journey colours that render identically with and without
// color-mix() support.
//
// color-mix(in srgb, C p%, transparent) is exactly C at alpha p, so for the
// theme hues (which have "-rgb" twins in app/global.css) it can be written as
// rgba(var(--x-rgb), p). Unlike color-mix(), rgba() also works in Safari < 16.2
// and Chrome < 111, where the journey badges and rail lines used to disappear.

const RGB_TWINS: Record<string, string> = {
  "var(--accent)": "var(--accent-rgb)",
  "var(--accent-2)": "var(--accent-2-rgb)",
  "var(--surface)": "var(--surface-rgb)",
};

const RGBA = /^rgba\((var\(--[\w-]+\)), ([\d.]+)\)$/;

function round(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

/** Equivalent of `color-mix(in srgb, <color> <percent>%, transparent)`. */
export function tint(color: string, percent: number): string {
  const twin = RGB_TWINS[color];
  if (twin) return `rgba(${twin}, ${round(percent / 100)})`;
  const rgba = color.match(RGBA);
  if (rgba) return `rgba(${rgba[1]}, ${round(Number(rgba[2]) * (percent / 100))})`;
  return `color-mix(in srgb, ${color} ${percent}%, transparent)`;
}
