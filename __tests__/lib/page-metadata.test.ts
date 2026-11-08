/**
 * @jest-environment node
 */

import type { Locale } from "@/lib/i18n/config";

jest.mock("server-only", () => ({}));

let mockLocale: Locale = "en";
jest.mock("@/lib/i18n/request-locale", () => ({
  getRequestLocale: async () => mockLocale,
}));

import { localizedPageMetadata, SITE_NAME } from "@/lib/page-metadata";

const SOCIAL_IMAGE = {
  url: "/brand/social-1200x630.png",
  width: 1200,
  height: 630,
  alt: "Mouaz Naji",
};

describe("localizedPageMetadata social tags", () => {
  const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  beforeAll(() => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
  });

  afterAll(() => {
    if (originalSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
  });

  it.each([
    ["en", "en_US", ["sv_SE", "ar_AR"], "https://example.test/skills"],
    ["sv", "sv_SE", ["en_US", "ar_AR"], "https://example.test/sv/skills"],
    ["ar", "ar_AR", ["en_US", "sv_SE"], "https://example.test/ar/skills"],
  ] as const)("keeps site name, locale and the 1200x630 image for %s", async (locale, ogLocale, alternates, url) => {
    mockLocale = locale;
    const metadata = await localizedPageMetadata("skills", "/skills");

    expect(metadata.openGraph).toMatchObject({
      type: "website",
      siteName: SITE_NAME,
      locale: ogLocale,
      alternateLocale: alternates,
      url,
      images: [SOCIAL_IMAGE],
    });
    expect(metadata.openGraph?.title).toEqual(metadata.title);
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      images: [SOCIAL_IMAGE],
    });
  });

  it("uses the shared site name", () => {
    expect(SITE_NAME).toBe("Mouaz Naji Portfolio");
  });
});
