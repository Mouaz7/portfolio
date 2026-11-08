/**
 * @jest-environment node
 */

import { renderToStaticMarkup } from "react-dom/server";

jest.mock("server-only", () => ({}));
jest.mock("@/lib/i18n/request-locale", () => ({
  getRequestLocale: async () => "en",
}));

import StructuredData from "@/components/seo/StructuredData";
import en from "@/lib/i18n/dictionaries/en";
import sv from "@/lib/i18n/dictionaries/sv";

type GraphNode = Record<string, unknown> & { "@type": string };

function render(markup: string) {
  const match = markup.match(/^<script type="application\/ld\+json"(?: nonce="([^"]*)")?>([\s\S]*)<\/script>$/);
  if (!match) throw new Error(`Unexpected markup: ${markup}`);
  return { nonce: match[1], body: match[2] };
}

describe("StructuredData", () => {
  const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  beforeAll(() => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
  });

  afterAll(() => {
    if (originalSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
  });

  it("renders one valid JSON-LD graph with WebSite and Person", () => {
    const { nonce, body } = render(
      renderToStaticMarkup(<StructuredData locale="sv" dictionary={sv} nonce="abc123" />),
    );
    expect(nonce).toBe("abc123");

    const data = JSON.parse(body) as { "@context": string; "@graph": GraphNode[] };
    expect(data["@context"]).toBe("https://schema.org");
    const website = data["@graph"].find((node) => node["@type"] === "WebSite");
    const person = data["@graph"].find((node) => node["@type"] === "Person");
    expect(website).toMatchObject({
      name: "Mouaz Naji Portfolio",
      url: "https://example.test/sv",
      inLanguage: "sv",
    });
    expect(person).toMatchObject({
      name: "Mouaz Naji",
      url: "https://example.test/",
      jobTitle: "Software Developer",
      image: "https://example.test/brand/social-1200x630.png",
      sameAs: [
        "https://github.com/Mouaz7",
        "https://www.linkedin.com/in/mouaz-naji",
      ],
      alumniOf: {
        "@type": "CollegeOrUniversity",
        name: "Blekinge Institute of Technology",
        url: "https://www.bth.se",
      },
      address: { "@type": "PostalAddress", addressCountry: "SE" },
    });
    expect(person?.knowsAbout).toEqual(expect.arrayContaining(["TypeScript", "Next.js", "Python"]));
    expect(website?.publisher).toEqual({ "@id": person?.["@id"] });
  });

  it("escapes < so dictionary content cannot close the script element", () => {
    const hostile = {
      ...en,
      metadata: { ...en.metadata, siteDescription: "</script><script>alert(1)</script>" },
    };
    const { body } = render(renderToStaticMarkup(<StructuredData locale="en" dictionary={hostile} />));

    expect(body).not.toContain("<");
    expect(body).toContain("\\u003c/script>");
    const data = JSON.parse(body) as { "@graph": GraphNode[] };
    expect(data["@graph"][0].description).toBe("</script><script>alert(1)</script>");
  });
});
