import { localizedPath, type Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/types";
import { SITE_NAME, sharedSocialMetadata } from "@/lib/page-metadata";
import { GITHUB_OWNER } from "@/lib/projects/githubSync";
import { getSiteUrl } from "@/lib/site-url";

type StructuredDataProps = {
  locale: Locale;
  dictionary: Dictionary;
  nonce?: string;
};

// Mirrors the public profile links in the contact_social seed rows.
const LINKEDIN_URL = "https://www.linkedin.com/in/mouaz-naji";

// A short, stable subset of the skills listed in the skill seed rows.
const KNOWS_ABOUT = [
  "Software engineering",
  "Full-stack web development",
  "TypeScript",
  "JavaScript",
  "React",
  "Next.js",
  "Node.js",
  "Python",
  "Java",
  "C++",
  "Kotlin",
  "Flutter",
  "PostgreSQL",
  "Docker",
  "CI/CD",
  "Linux",
] as const;

function buildStructuredData(locale: Locale, dictionary: Dictionary) {
  const siteUrl = getSiteUrl();
  const personId = `${siteUrl}/#person`;
  const [socialImage] = sharedSocialMetadata(locale).openGraph.images;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        name: SITE_NAME,
        url: new URL(localizedPath("/", locale), siteUrl).toString(),
        description: dictionary.metadata.siteDescription,
        inLanguage: locale,
        publisher: { "@id": personId },
      },
      {
        "@type": "Person",
        "@id": personId,
        name: "Mouaz Naji",
        url: `${siteUrl}/`,
        jobTitle: "Software Developer",
        image: new URL(socialImage.url, siteUrl).toString(),
        sameAs: [`https://github.com/${GITHUB_OWNER}`, LINKEDIN_URL],
        knowsAbout: KNOWS_ABOUT,
        alumniOf: {
          "@type": "CollegeOrUniversity",
          name: "Blekinge Institute of Technology",
          url: "https://www.bth.se",
        },
        address: {
          "@type": "PostalAddress",
          addressCountry: "SE",
        },
      },
    ],
  };
}

/** Schema.org JSON-LD for search engines. Not executable, but carries the CSP nonce anyway. */
export default function StructuredData({ locale, dictionary, nonce }: StructuredDataProps) {
  const json = JSON.stringify(buildStructuredData(locale, dictionary)).replace(/</g, "\\u003c");

  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
