// Next.js loads this configuration as CommonJS.
/* eslint-disable @typescript-eslint/no-require-imports */
const path = require("node:path");

// Local plugins are referenced by absolute path: both webpack (production
// build) and Turbopack (next dev) resolve absolute plugin paths, while a
// relative "./postcss/..." string only resolves under webpack.
module.exports = {
  plugins: {
    "@tailwindcss/postcss": {},
    // Fallbacks for older browsers; modern browsers keep the original values.
    [path.join(__dirname, "postcss/viewport-fallback.cjs")]: {},
    [path.join(__dirname, "postcss/color-mix-fallback.cjs")]: {},
  },
}
