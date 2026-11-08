/**
 * @jest-environment node
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { CACHE_TAGS, REVALIDATE_SECONDS } from "@/lib/cache";

const ROOT = path.resolve(__dirname, "../..");

// Next.js reads `export const revalidate` by static analysis, so routes keep a
// numeric literal. These must match the data-cache window they serve.
const ROUTE_REVALIDATE: Array<[string, keyof typeof REVALIDATE_SECONDS]> = [
  ["app/api/contact/route.ts", "contact"],
  ["app/api/journey/route.ts", "journey"],
  ["app/api/project/route.ts", "projects"],
  ["app/api/skills/route.ts", "skills"],
  ["app/api/skill-categories/route.ts", "skills"],
];

function exportedRevalidateLiteral(file: string) {
  const source = readFileSync(path.join(ROOT, file), "utf8");
  const match = source.match(/^export const revalidate = (\d+);$/m);
  return match ? Number(match[1]) : null;
}

function listFiles(directory: string, pattern: RegExp): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = path.join(directory, entry);
    if (statSync(fullPath).isDirectory()) return listFiles(fullPath, pattern);
    return pattern.test(entry) ? [fullPath] : [];
  });
}

describe("cache configuration", () => {
  it.each(ROUTE_REVALIDATE)("%s exports the %s revalidate window as a literal", (file, key) => {
    expect(exportedRevalidateLiteral(file)).toBe(REVALIDATE_SECONDS[key]);
  });

  it("only uses known cache tags in data-cache calls", () => {
    const knownTags = new Set<string>(Object.values(CACHE_TAGS));
    const files = listFiles(path.join(ROOT, "lib"), /\.server\.tsx?$/);
    const literalTags = files.flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return [...source.matchAll(/tags:\s*\[([^\]]*)\]/g)]
        .flatMap((match) => [...match[1].matchAll(/["']([^"']+)["']/g)].map((tag) => tag[1]));
    });
    expect(literalTags.filter((tag) => !knownTags.has(tag))).toEqual([]);
  });

  it("keeps cache tags unique", () => {
    const tags = Object.values(CACHE_TAGS);
    expect(new Set(tags).size).toBe(tags.length);
  });
});
