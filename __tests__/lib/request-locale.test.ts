/**
 * @jest-environment node
 */

const headerGet = jest.fn<string | null, [string]>();

jest.mock("next/headers", () => ({
  headers: async () => ({ get: (name: string) => headerGet(name) }),
}));

import { getRequestLocale } from "@/lib/i18n/request-locale";

describe("getRequestLocale", () => {
  beforeEach(() => headerGet.mockReset());

  it.each(["en", "sv", "ar"])("returns the supported x-locale header %s", async (locale) => {
    headerGet.mockReturnValue(locale);
    await expect(getRequestLocale()).resolves.toBe(locale);
    expect(headerGet).toHaveBeenCalledWith("x-locale");
  });

  it.each([
    ["missing", null],
    ["empty", ""],
    ["unsupported", "de"],
    ["region-tagged", "sv-SE"],
    ["differently cased", "SV"],
    ["injected", "en\r\nx-other: 1"],
  ])("falls back to the default locale for a %s header", async (_label, value) => {
    headerGet.mockReturnValue(value);
    await expect(getRequestLocale()).resolves.toBe("en");
  });
});
