import { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/site-url';
import { defaultLocale, locales, localizedPath } from '@/lib/i18n/config';

// The sitemap is generated once per build, so the build time is the last
// moment any page content could have changed in the deployed output.
const BUILD_TIME = new Date();

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getSiteUrl();
  const pages = [
    { path: "/", changeFrequency: "monthly", priority: 1 },
    { path: "/skills", changeFrequency: "monthly", priority: 0.8 },
    { path: "/journey", changeFrequency: "monthly", priority: 0.8 },
    { path: "/projects", changeFrequency: "weekly", priority: 0.9 },
    { path: "/contact", changeFrequency: "yearly", priority: 0.7 },
    { path: "/privacy", changeFrequency: "yearly", priority: 0.5 },
  ] as const;

  const absoluteUrl = (path: string) => new URL(path, baseUrl).toString();

  return pages.flatMap((page) => {
    const languages = {
      ...Object.fromEntries(
        locales.map((locale) => [locale, absoluteUrl(localizedPath(page.path, locale))]),
      ),
      "x-default": absoluteUrl(localizedPath(page.path, defaultLocale)),
    };
    return locales.map((locale) => ({
      url: absoluteUrl(localizedPath(page.path, locale)),
      lastModified: BUILD_TIME,
      changeFrequency: page.changeFrequency,
      priority: page.priority,
      alternates: { languages },
    }));
  });
}
