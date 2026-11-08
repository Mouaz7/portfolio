// PostCSS plugin: fallbacks for color-mix() in browsers that lack it.
//
// color-mix() needs Chrome 111, Safari 16.2 and Firefox 113. Older browsers
// drop every declaration that uses it; inside a custom property the consumer
// becomes invalid instead, so panels turned transparent and borders and text
// changed colour ("weird colours" on older phones).
//
// Modern browsers are unaffected: fallbacks live in an @supports-not copy of
// the rule (see fallback-block.cjs). Tailwind's own "@supports (color-mix)"
// blocks get an "@supports not" sibling with the same fallbacks. The fallback
// values are:
//
//   color-mix(in srgb, var(--x) 40%, transparent) → rgba(var(--x-rgb), 0.4)
//     exact, whenever --x has an "-rgb" twin;
//   any other mix → its dominant colour (or transparent for faint tints).
//
// "-rgb" twins are generated automatically: the project CSS is scanned once,
// and every custom property whose definitions are all opaque hex colours, or
// aliases of such properties, gets "--x-rgb: r, g, b" (or "var(--y-rgb)")
// next to each of its definitions. Unused in modern browsers; exact colours
// in old ones.

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS PostCSS plugin */
const fs = require("node:fs");
const path = require("node:path");
const postcss = require("postcss");
const {
  addFallbackAfterSupportsBlocks,
  addFallbackBlocks,
  insideSupports,
} = require("./fallback-block.cjs");
/* eslint-enable @typescript-eslint/no-require-imports */

const SUPPORTS = "not (color: color-mix(in srgb, red, red))";

// Tokens with a hand-written "<name>-rgb" twin in app/global.css.
const RGB_TOKENS = new Map([
  ["--accent", "var(--accent-rgb)"],
  ["--accent-2", "var(--accent-2-rgb)"],
  ["--fg", "var(--fg-rgb)"],
  ["--bg", "var(--bg-rgb)"],
  ["--page-text", "var(--fg-rgb)"],
  ["--surface", "var(--surface-rgb)"],
  ["--surface-2", "var(--surface-2-rgb)"],
  ["--page-panel", "var(--surface-rgb)"],
  ["--page-panel-muted", "var(--surface-2-rgb)"],
  ["--field", "var(--field-rgb)"],
  ["--page-field", "var(--field-rgb)"],
  ["--navigation-accent", "var(--navigation-accent-rgb)"],
]);

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const ALIAS = /^var\(\s*(--[\w-]+)\s*\)$/;
const PROJECT_ROOT = path.join(__dirname, "..");
let twinCache = null;

function hexToRgb(value) {
  const match = value.match(HEX);
  if (!match) return null;
  const digits = match[1].length === 3 ? match[1].replace(/./g, "$&$&") : match[1];
  return [0, 2, 4].map((offset) => parseInt(digits.slice(offset, offset + 2), 16)).join(", ");
}

/** Names of custom properties that can have an exact "-rgb" twin. */
function twinnableTokens() {
  if (twinCache) return twinCache;
  const definitions = new Map();
  // "-rgb" properties written by hand. A generated twin must never replace
  // one of these (it could hold a different value), so such tokens are left
  // to the approximate fallback.
  const handWrittenTwins = new Set();
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.name.endsWith(".css")) {
        postcss.parse(fs.readFileSync(full, "utf8")).walkDecls((decl) => {
          if (!decl.prop.startsWith("--")) return;
          if (decl.prop.endsWith("-rgb")) {
            handWrittenTwins.add(decl.prop);
            return;
          }
          const values = definitions.get(decl.prop) ?? [];
          values.push(decl.value.trim());
          definitions.set(decl.prop, values);
        });
      }
    }
  };
  for (const directory of ["app", "components"]) visit(path.join(PROJECT_ROOT, directory));
  const memo = new Map();
  const twinnable = (name, seen = new Set()) => {
    if (memo.has(name)) return memo.get(name);
    if (seen.has(name)) return false;
    seen.add(name);
    const values = definitions.get(name);
    const result = Boolean(values?.length) && values.every((value) => {
      if (HEX.test(value)) return true;
      const alias = value.match(ALIAS);
      return Boolean(alias) && (RGB_TOKENS.has(alias[1]) || twinnable(alias[1], seen));
    });
    memo.set(name, result);
    return result;
  };
  twinCache = new Set([...definitions.keys()].filter((name) => (
    !RGB_TOKENS.has(name) && !handWrittenTwins.has(`${name}-rgb`) && twinnable(name)
  )));
  return twinCache;
}

/** Adds the generated "-rgb" twins next to each definition in this file. */
function addTwins(root) {
  const tokens = twinnableTokens();
  root.walkDecls((decl) => {
    if (!tokens.has(decl.prop) || decl.parent?.type !== "rule") return;
    const twin = `${decl.prop}-rgb`;
    if (decl.parent.some((node) => node.type === "decl" && node.prop === twin)) return;
    const value = decl.value.trim();
    const alias = value.match(ALIAS);
    const twinValue = alias
      ? (RGB_TOKENS.get(alias[1]) ?? `var(${alias[1]}-rgb)`)
      : hexToRgb(value);
    if (twinValue) decl.cloneAfter({ prop: twin, value: twinValue });
  });
}

function findClose(value, open) {
  let depth = 0;
  for (let index = open; index < value.length; index += 1) {
    if (value[index] === "(") depth += 1;
    else if (value[index] === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function splitTopLevel(value) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    else if (char === "," && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts;
}

function parseStop(stop) {
  const match = stop.match(/^(.*?)(?:\s+(\d*\.?\d+)%)?$/s);
  return { color: match[1].trim(), percent: match[2] === undefined ? null : Number(match[2]) };
}

function rgbOf(color) {
  const token = color.match(/^var\(\s*(--[\w-]+)\s*\)$/);
  if (token && RGB_TOKENS.has(token[1])) return RGB_TOKENS.get(token[1]);
  if (token && twinnableTokens().has(token[1])) return `var(${token[1]}-rgb)`;
  if (color === "white") return "255, 255, 255";
  if (color === "black") return "0, 0, 0";
  return hexToRgb(color);
}

function round(number) {
  return Math.round(number * 10000) / 10000;
}

function fallbackMix(inner) {
  const [, first, second] = splitTopLevel(inner);
  if (!first || !second) return "transparent";
  const a = parseStop(first);
  const b = parseStop(second);
  let pa = a.percent;
  let pb = b.percent;
  if (pa === null && pb === null) { pa = 50; pb = 50; }
  else if (pa === null) pa = 100 - pb;
  else if (pb === null) pb = 100 - pa;
  const total = pa + pb || 100;
  const weightA = pa / total;

  const translucent = (color, weight) => {
    const rgb = rgbOf(color);
    if (rgb) return `rgba(${rgb}, ${round(weight)})`;
    return weight >= 0.5 ? color : "transparent";
  };
  if (b.color === "transparent") return translucent(a.color, weightA);
  if (a.color === "transparent") return translucent(b.color, 1 - weightA);
  return weightA >= 0.5 ? a.color : b.color;
}

function replaceColorMix(value) {
  let output = "";
  let index = 0;
  for (;;) {
    const start = value.indexOf("color-mix(", index);
    if (start === -1) return output + value.slice(index);
    const open = start + "color-mix".length;
    const close = findClose(value, open);
    if (close === -1) return output + value.slice(index);
    // Resolve nested mixes first, then this one.
    const inner = replaceColorMix(value.slice(open + 1, close));
    output += value.slice(index, start) + fallbackMix(inner);
    index = close + 1;
  }
}

module.exports = () => ({
  postcssPlugin: "color-mix-fallback",
  OnceExit(root, helpers) {
    addTwins(root);
    addFallbackBlocks(root, helpers, SUPPORTS, (decl) => {
      if (!decl.value.includes("color-mix(") || insideSupports(decl, /color-mix/)) return null;
      return replaceColorMix(decl.value);
    });
    // Tailwind's "/opacity" utilities test color-mix() themselves and fall
    // back to the fully opaque colour; give those browsers the real
    // translucent colour instead.
    addFallbackAfterSupportsBlocks(root, helpers, /color-mix/, (decl) => (
      decl.value.includes("color-mix(") ? replaceColorMix(decl.value) : null
    ));
  },
});
module.exports.postcss = true;
module.exports.replaceColorMix = replaceColorMix;
