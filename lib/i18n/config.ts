export const locales = ["en", "sv", "ar"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";
export const localeCookie = "portfolio-locale";

export const localeNames: Record<Locale, string> = {
  en: "English",
  sv: "Svenska",
  ar: "العربية",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && locales.includes(value as Locale);
}

export function localeDirection(locale: Locale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

export function localeTag(locale: Locale): string {
  if (locale === "sv") return "sv-SE";
  // Latin digits explicitly: older browsers (iOS 15–16, Samsung Internet
  // 20–21) default Arabic to Arabic-Indic digits while the server prints Latin
  // ones, and the mismatch makes React discard the server HTML.
  if (locale === "ar") return "ar-u-nu-latn";
  return "en-US";
}

export function stripLocaleFromPathname(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  if (isLocale(segments[0])) segments.shift();
  return `/${segments.join("/")}`.replace(/\/$/, "") || "/";
}

export function localizedPath(pathname: string, locale: Locale): string {
  const base = stripLocaleFromPathname(pathname);
  if (locale === defaultLocale) return base;
  return base === "/" ? `/${locale}` : `/${locale}${base}`;
}

export function detectLocale(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return defaultLocale;

  const requested = acceptLanguage
    .split(",")
    .map((entry) => {
      const [tag, quality = "q=1"] = entry.trim().split(";");
      const locale = tag.toLowerCase().split("-")[0];
      const score = Number(quality.replace(/^q=/, "")) || 0;
      return { locale, score };
    })
    .sort((left, right) => right.score - left.score);

  return requested.find((entry) => isLocale(entry.locale))?.locale as Locale
    ?? defaultLocale;
}

/** The `?locale=` query parameter of a request, or the default locale. */
export function localeFromQuery(url: string): Locale {
  const requested = new URL(url).searchParams.get("locale");
  return isLocale(requested) ? requested : defaultLocale;
}
