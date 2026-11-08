/**
 * @jest-environment node
 */

import sitemap from "@/app/sitemap";

describe("sitemap", () => {
  const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  beforeAll(() => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
  });

  afterAll(() => {
    if (originalSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
  });

  it("lists every page in every language with x-default pointing to English", () => {
    const entries = sitemap();
    const urls = entries.map((entry) => entry.url);

    expect(entries).toHaveLength(18);
    expect(urls).toEqual(expect.arrayContaining([
      "https://example.test/",
      "https://example.test/sv",
      "https://example.test/ar",
      "https://example.test/projects",
      "https://example.test/sv/projects",
      "https://example.test/ar/privacy",
    ]));

    const svProjects = entries.find((entry) => entry.url === "https://example.test/sv/projects");
    expect(svProjects?.alternates?.languages).toEqual({
      en: "https://example.test/projects",
      sv: "https://example.test/sv/projects",
      ar: "https://example.test/ar/projects",
      "x-default": "https://example.test/projects",
    });
  });

  it("gives every entry the same build-time lastModified date", () => {
    const entries = sitemap();
    const [first] = entries;

    expect(first.lastModified).toBeInstanceOf(Date);
    expect(entries.every((entry) => entry.lastModified === first.lastModified)).toBe(true);
    expect(sitemap()[0].lastModified).toBe(first.lastModified);
  });
});
