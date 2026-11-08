/**
 * @jest-environment node
 */

import { existsSync } from "node:fs";
import path from "node:path";
import manifest from "@/app/manifest";

describe("web app manifest", () => {
  it("describes the installable portfolio without overriding the dynamic theme color", () => {
    const value = manifest();

    expect(value).toMatchObject({
      name: "Mouaz Naji — Developer Portfolio",
      short_name: "Mouaz Naji",
      start_url: "/",
      display: "standalone",
      background_color: "#defaf5",
    });
    expect(value).not.toHaveProperty("theme_color");
  });

  it("only references icons that exist", () => {
    const icons = manifest().icons ?? [];
    expect(icons.length).toBeGreaterThan(0);

    for (const icon of icons) {
      const file = icon.src === "/icon.svg"
        ? path.join(process.cwd(), "app/icon.svg")
        : path.join(process.cwd(), "public", icon.src);
      expect(existsSync(file)).toBe(true);
    }
    expect(icons.find((icon) => icon.purpose === "maskable")?.sizes).toBe("512x512");
  });
});
