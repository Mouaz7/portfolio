// PostCSS plugin: classic viewport-unit fallbacks for older browsers.
//
// Dynamic/small/large viewport units (dvh, svh, lvh, dvw, …) need Chrome 108,
// Safari 15.4 and Firefox 101. Older browsers drop any declaration that uses
// them, which on this site removed the height of <html>, every page shell and
// the scroll containers ("the page cannot scroll"). Tailwind 4 has fixed browser
// targets and does not add fallbacks, and most of our CSS files never pass
// through Tailwind's optimiser at all.
//
// For every declaration that uses such a unit, an `@supports not (height: 1dvh)`
// copy of the rule with the classic unit (vh/vw/vmin/vmax) follows the rule;
// see fallback-block.cjs for why. Modern rendering is unchanged.

// eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS PostCSS plugin
const { addFallbackBlocks, insideSupports } = require("./fallback-block.cjs");

const MODERN_UNIT = /(\d*\.?\d+)(?:d|s|l)v(h|w|min|max|i|b)\b/g;
const HAS_MODERN_UNIT = /\d(?:d|s|l)v(?:h|w|min|max|i|b)\b/;

function classic(value) {
  return value.replace(MODERN_UNIT, (_match, number, axis) => {
    if (axis === "i") return `${number}vw`;
    if (axis === "b") return `${number}vh`;
    return `${number}v${axis}`;
  });
}

module.exports = () => ({
  postcssPlugin: "viewport-fallback",
  OnceExit(root, helpers) {
    addFallbackBlocks(root, helpers, "not (height: 1dvh)", (decl) => {
      if (!HAS_MODERN_UNIT.test(decl.value) || insideSupports(decl, HAS_MODERN_UNIT)) return null;
      return classic(decl.value);
    });
  },
});
module.exports.postcss = true;
