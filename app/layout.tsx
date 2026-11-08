import "./global.css";
import "./styles/home-and-skills.css";
import "./styles/projects-and-contact.css";
import "./styles/adaptive-and-motion.css";
import "./i18n.css";
import "./styles/performance-tier.css";
import { urbanist } from "./fonts";
import SiteBackground from "@/components/ui/SiteBackground";
import BackgroundErrorBoundary from "@/components/ui/BackgroundErrorBoundary";
import ErrorReporter from "@/components/ui/ErrorReporter";
import { getSiteUrl } from "@/lib/site-url";
import { sharedSocialMetadata } from "@/lib/page-metadata";
import type { Viewport } from "next";
import { headers } from "next/headers";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { I18nProvider } from "@/components/i18n/I18nProvider";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { getRequestLocale } from "@/lib/i18n/request-locale";
import { localeDirection } from "@/lib/i18n/config";
import { NavigationExperienceProvider } from "@/components/navigation/NavigationExperienceProvider";
import StructuredData from "@/components/seo/StructuredData";
import { inlineHeadScripts } from "@/lib/security/inline-scripts.cjs";

const siteUrl = getSiteUrl();

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  // The site ships its own dark and light themes. Declaring both stops
  // browsers from applying an automatic "forced dark" filter on top of them.
  colorScheme: "dark light",
};

export async function generateMetadata() {
  const locale = await getRequestLocale();
  const dictionary = await getDictionary(locale);
  const title = dictionary.metadata.siteTitle;
  const description = dictionary.metadata.siteDescription;
  const social = sharedSocialMetadata(locale);

  return {
  metadataBase: new URL(siteUrl),
  title,
  description,
  keywords: [
    "portfolio",
    "software engineer",
    "full stack developer",
    "React",
    "Next.js",
    "TypeScript",
    "Tailwind CSS",
    "web development",
    "Mouaz Naji",
  ],
  authors: [{ name: "Mouaz Naji" }],
  creator: "Mouaz Naji",
  openGraph: { ...social.openGraph, url: siteUrl, title, description },
  twitter: { ...social.twitter, title, description },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  // Icons come from the app/favicon.ico, app/icon.svg and app/apple-icon.png
  // file conventions; declaring them here as well would duplicate the tags.
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const requestHeaders = await headers();
  const nonce = requestHeaders.get("x-nonce") ?? undefined;
  const locale = await getRequestLocale();
  const dictionary = await getDictionary(locale);
  return (
    // Make the root viewport-height and non-scrollable
    <html
      lang={locale}
      dir={localeDirection(locale)}
      className={`${urbanist.variable} h-dvh`}
      suppressHydrationWarning
    >
      <head>
        {/* The site has its own dark theme; Dark Reader would invert it. */}
        <meta name="darkreader-lock" />
        {/* Without JavaScript the streamed page stays in a hidden container and
            only the loading stage shows. Reveal the content instead; this
            never applies when JavaScript runs. */}
        <noscript
          dangerouslySetInnerHTML={{
            // The layered copy beats Tailwind's layered [hidden] rule; the plain
            // one covers browsers without cascade layers.
            // The typed hero text and the Hello badge are shown in full, and the
            // contact page explains that its form needs JavaScript.
            __html: '<style>.page-loading-stage{display:none!important}div[hidden][id^="S:"]{display:contents!important}@layer base{div[hidden][id^="S:"]{display:contents!important}}[data-full-text]:empty::after{content:attr(data-full-text)}.home-hello-badge{opacity:1!important;transform:none!important}.contact-js-notice{display:block!important}</style>',
          }}
        />
        {/* Same list and order as the CSP hashes in next.config.js. */}
        {inlineHeadScripts.map((source, index) => (
          <script
            key={index}
            nonce={nonce}
            suppressHydrationWarning
            dangerouslySetInnerHTML={{ __html: source }}
          />
        ))}
        <StructuredData locale={locale} dictionary={dictionary} nonce={nonce} />
      </head>
      <body
        suppressHydrationWarning
        className="antialiased h-full overflow-hidden bg-[var(--bg)] text-[var(--fg)]"
      >
        {/* Keyboard users can jump past the navigation. Invisible until focused. */}
        <a href="#main-content" className="skip-link">
          {dictionary.common.skipToContent}
        </a>
        {/* Single shared WebGL nebula backdrop behind every page (dark + light) */}
        <I18nProvider locale={locale} dictionary={dictionary}>
          <NavigationExperienceProvider>
            <BackgroundErrorBoundary>
              <SiteBackground />
            </BackgroundErrorBoundary>
            {/* Anonymous reports of uncaught errors; renders nothing. */}
            <ErrorReporter />
            {children}
            {process.env.VERCEL === "1" && (
              <>
                <Analytics />
                <SpeedInsights />
              </>
            )}
          </NavigationExperienceProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
