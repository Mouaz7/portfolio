import type { Metadata } from "next";
import { getSiteUrl } from "./site-url";
import { getRequestLocale } from "./i18n/request-locale";
import { getDictionary } from "./i18n/get-dictionary";
import { localizedPath, locales, type Locale } from "./i18n/config";

type MetadataPage = "home" | "skills" | "journey" | "projects" | "contact" | "privacy";

export const SITE_NAME = "Mouaz Naji Portfolio";

const OPEN_GRAPH_LOCALES: Record<Locale, string> = {
  en: "en_US",
  sv: "sv_SE",
  ar: "ar_AR",
};

const SOCIAL_IMAGE = { url: "/brand/social-1200x630.png", width: 1200, height: 630, alt: "Mouaz Naji" };

/**
 * Open Graph and Twitter fields shared by the root layout and every page.
 * Next.js replaces a parent segment's `openGraph`/`twitter` objects wholesale
 * when a page defines its own, so both must be built from this helper.
 */
export function sharedSocialMetadata(locale: Locale) {
  return {
    openGraph: {
      type: "website" as const,
      siteName: SITE_NAME,
      locale: OPEN_GRAPH_LOCALES[locale],
      alternateLocale: locales
        .filter((candidate) => candidate !== locale)
        .map((candidate) => OPEN_GRAPH_LOCALES[candidate]),
      images: [SOCIAL_IMAGE],
    },
    twitter: {
      card: "summary_large_image" as const,
      images: [SOCIAL_IMAGE],
    },
  } satisfies Pick<Metadata, "openGraph" | "twitter">;
}

export async function localizedPageMetadata(page: MetadataPage, path: string): Promise<Metadata> {
  const locale = await getRequestLocale();
  const dictionary = await getDictionary(locale);
  const metadata = dictionary.metadata;
  const title = page === "home" ? metadata.siteTitle : metadata[`${page}Title`];
  const description = page === "home" ? metadata.siteDescription : metadata[`${page}Description`];
  const baseUrl = getSiteUrl();
  const localizedUrl = (targetLocale: Locale) =>
    new URL(localizedPath(path, targetLocale), baseUrl).toString();
  const url = localizedUrl(locale);
  const social = sharedSocialMetadata(locale);

  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: {
        en: localizedUrl("en"),
        sv: localizedUrl("sv"),
        ar: localizedUrl("ar"),
        "x-default": localizedUrl("en"),
      },
    },
    openGraph: { ...social.openGraph, title, description, url },
    twitter: { ...social.twitter, title, description },
  };
}
