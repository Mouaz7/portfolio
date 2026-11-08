// Webpack loader: lowers syntax in Next.js' own precompiled client runtime to
// the browsers listed in package.json "browserslist".
//
// Next.js compiles application code for the browserslist targets, but ships
// parts of its client runtime (for example the root error boundary loaded on
// every page) precompiled with class static blocks. Safari/iOS before 16.4
// cannot parse those, so the whole page failed to hydrate on older iPhones.
// Only modules that contain a static block are transformed, using the SWC
// build that ships with Next.js; everything else passes through untouched.

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS webpack loader */
const { transform } = require("next/dist/build/swc");
const { browserslist } = require("../package.json");

const STATIC_BLOCK = /\bstatic\s*\{/;

module.exports = function legacySyntaxLoader(source, map) {
  if (!STATIC_BLOCK.test(source)) {
    this.callback(null, source, map);
    return;
  }
  const callback = this.async();
  transform(source, {
    filename: this.resourcePath,
    env: { targets: browserslist },
    jsc: { parser: { syntax: "ecmascript" } },
    isModule: "unknown",
    minify: false,
    sourceMaps: false,
  }).then((output) => callback(null, output.code), callback);
};
