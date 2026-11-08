/**
 * @jest-environment node
 */

import ar from "@/lib/i18n/dictionaries/ar";
import en from "@/lib/i18n/dictionaries/en";
import sv from "@/lib/i18n/dictionaries/sv";

type Leaves = Map<string, string>;

function collectLeaves(value: unknown, path: string, leaves: Leaves): Leaves {
  if (typeof value === "string") {
    leaves.set(path, value);
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => collectLeaves(item, `${path}[${index}]`, leaves));
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      collectLeaves(child, path ? `${path}.${key}` : key, leaves);
    }
  } else {
    // Numbers, booleans or functions are not translated copy; record them so
    // a type mismatch between locales still shows up as a missing leaf.
    leaves.set(path, String(value));
  }
  return leaves;
}

// Mirrors formatMessage in lib/i18n/types.ts.
function placeholders(message: string): string[] {
  return [...new Set(Array.from(message.matchAll(/\{(\w+)\}/g), (match) => match[1]))].sort();
}

const english = collectLeaves(en, "", new Map());
const translations = { sv: collectLeaves(sv, "", new Map()), ar: collectLeaves(ar, "", new Map()) };

describe("i18n dictionaries", () => {
  it("contain translatable copy", () => {
    expect(english.size).toBeGreaterThan(50);
  });

  it.each(Object.entries({ en: english, ...translations }))("%s has no empty leaves", (_locale, leaves) => {
    const empty = [...leaves].filter(([, message]) => message.trim() === "").map(([path]) => path);
    expect(empty).toEqual([]);
  });

  it.each(Object.entries(translations))("%s has exactly the English keys", (_locale, leaves) => {
    expect([...leaves.keys()].sort()).toEqual([...english.keys()].sort());
  });

  it.each(Object.entries(translations))("%s uses the same {placeholders} as English for every message", (_locale, leaves) => {
    const mismatches = [...english]
      .map(([path, message]) => ({
        path,
        en: placeholders(message),
        translated: placeholders(leaves.get(path) ?? ""),
      }))
      .filter((entry) => entry.en.join() !== entry.translated.join());
    expect(mismatches).toEqual([]);
  });
});
