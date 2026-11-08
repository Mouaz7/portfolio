/**
 * @jest-environment node
 */
import postcss from "postcss";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const viewportFallback = require("../../postcss/viewport-fallback.cjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const colorMixFallback = require("../../postcss/color-mix-fallback.cjs");

async function run(css: string) {
  return (await postcss([viewportFallback, colorMixFallback]).process(css, { from: undefined })).css;
}

describe("old-browser CSS fallbacks", () => {
  it("leaves every original declaration in place for modern browsers", async () => {
    const css = ".a{height:calc(100dvh - var(--h));border:1px solid color-mix(in srgb, var(--accent) 30%, transparent)}";
    const output = await run(css);
    expect(output.startsWith(css)).toBe(true);
  });

  it("puts viewport fallbacks in an @supports-not block (survives minification)", async () => {
    const output = await run(".a{height:100dvh}.b{--x:2svh}");
    expect(output).toContain("@supports not (height: 1dvh){.a{height:100vh}}");
    expect(output).toContain("@supports not (height: 1dvh){.b{--x:2vh}}");
  });

  it("uses exact rgba() for transparent mixes of colours with an rgb twin", async () => {
    const output = await run(".a{background:color-mix(in srgb, var(--page-panel) 86%, transparent)}");
    expect(output).toContain(
      "@supports not (color: color-mix(in srgb, red, red)){.a{background:rgba(var(--surface-rgb), 0.86)}}",
    );
  });

  it("generates rgb twins for the project's hex and alias colour tokens", async () => {
    // Real tokens from components/skills/SkillCard.module.css and
    // app/contact/contact-repository.css.
    const output = await run(":root{--git-accent:#58a6ff;--contact-gh-surface:var(--page-panel)}");
    expect(output).toMatch(/--git-accent:#58a6ff;--git-accent-rgb: ?88, 166, 255/);
    expect(output).toMatch(/--contact-gh-surface:var\(--page-panel\);--contact-gh-surface-rgb: ?var\(--surface-rgb\)/);
  });

  it("expands 3-digit hex colours correctly", async () => {
    const output = await run(".a{color:color-mix(in srgb, #fff 40%, transparent)}");
    expect(output).toContain("rgba(255, 255, 255, 0.4)");
  });

  it("does not touch rules inside matching @supports blocks", async () => {
    const css = "@supports (height:100dvh){.c{height:100dvh}}";
    expect(await run(css)).toBe(css);
  });

  it("gives Tailwind's /opacity utilities their translucent colour where color-mix is missing", async () => {
    const css = ".bg-black\\/40{background-color:var(--bg)}"
      + "@supports (color:color-mix(in lab,red,red)){.bg-black\\/40{background-color:color-mix(in oklab,var(--bg) 40%,transparent)}}";
    const output = await run(css);
    // Modern browsers: unchanged up to the end of Tailwind's own block.
    expect(output.startsWith(css)).toBe(true);
    expect(output.slice(css.length)).toBe(
      "@supports not (color:color-mix(in lab,red,red)){.bg-black\\/40{background-color:rgba(var(--bg-rgb), 0.4)}}",
    );
  });
});
