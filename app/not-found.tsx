import type { Metadata } from "next";
import Link from "next/link";
import Footer from "@/components/navigation/Footer";
import Header from "@/components/navigation/Header";
import { localizedPath } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { getRequestLocale } from "@/lib/i18n/request-locale";
import styles from "./privacy/privacy.module.css";

// The privacy module's link blue is too light on the light theme; the
// theme's text-safe accent reaches WCAG AA on both. Inline so it beats the
// unlayered module rule.
const ACCENT_TEXT = { color: "var(--navigation-accent)" } as const;

// Next.js answers unmatched URLs with this page and a 404 status, and adds
// <meta name="robots" content="noindex"> itself.
export async function generateMetadata(): Promise<Metadata> {
  const dictionary = await getDictionary(await getRequestLocale());
  return {
    title: dictionary.metadata.notFoundTitle,
    description: dictionary.notFound.body,
  };
}

export default async function NotFound() {
  const locale = await getRequestLocale();
  const dictionary = await getDictionary(locale);
  const copy = dictionary.notFound;

  return (
    <div className={styles.page} data-not-found-page>
      <Header disableRouteTouch />
      <main id="main-content" tabIndex={-1} className={styles.main}>
        <article className={styles.article} aria-labelledby="not-found-title">
          <header className={styles.intro}>
            <p className={styles.eyebrow} style={ACCENT_TEXT}>{copy.eyebrow}</p>
            <h1 id="not-found-title">{copy.title}</h1>
            <p>{copy.body}</p>
          </header>
          <Link className={styles.contactLink} style={ACCENT_TEXT} href={localizedPath("/", locale)}>
            {copy.home}
          </Link>
        </article>
      </main>
      <Footer className={styles.footer} />
    </div>
  );
}
