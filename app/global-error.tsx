'use client';

import './global.css';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import {
  defaultLocale,
  isLocale,
  localeCookie,
  localeDirection,
  localizedPath,
  type Locale,
} from '@/lib/i18n/config';
import { reloadOnceAfterChunkError } from '@/lib/client/chunk-reload';
import { reportClientEvent } from '@/lib/telemetry/report-client';

/**
 * This boundary replaces the root layout, so the I18nProvider and the
 * dictionaries are not available. The copy is kept here, word for word the
 * same as common.* in lib/i18n/dictionaries (a test keeps them in sync).
 */
const GLOBAL_ERROR_COPY: Record<
  Locale,
  { title: string; body: string; retry: string; home: string }
> = {
  en: {
    title: 'Something went wrong',
    body: 'A critical error occurred. Reload the page or try again in a moment.',
    retry: 'Retry',
    home: 'Back to the home page',
  },
  sv: {
    title: 'Något gick fel',
    body: 'Ett allvarligt fel inträffade. Ladda om sidan eller försök igen om en stund.',
    retry: 'Försök igen',
    home: 'Tillbaka till startsidan',
  },
  ar: {
    title: 'حدث خطأ ما',
    body: 'حدث خطأ جسيم. أعد تحميل الصفحة أو حاول مرة أخرى بعد قليل.',
    retry: 'حاول مرة أخرى',
    home: 'العودة إلى الصفحة الرئيسية',
  },
};

type Theme = 'light' | 'dark';

function readCookie(name: string): string | null {
  for (const part of document.cookie.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return null;
}

/**
 * The URL's language prefix, then the page language, then the language
 * cookie, then the browser language. The URL comes first: when the root
 * layout fails on the server, the page's lang is this boundary's own.
 */
function detectErrorLocale(): Locale {
  try {
    const firstSegment = location.pathname.split('/')[1]?.toLowerCase();
    if (isLocale(firstSegment)) return firstSegment;
    // Unprefixed paths other than / are the default language.
    if (location.pathname !== '/') return defaultLocale;
    const documentLocale = document.documentElement.lang.toLowerCase().split('-')[0];
    if (isLocale(documentLocale)) return documentLocale;
    const cookieLocale = readCookie(localeCookie);
    if (isLocale(cookieLocale)) return cookieLocale;
    const browserLocale = navigator.language?.toLowerCase().split('-')[0];
    if (isLocale(browserLocale)) return browserLocale;
  } catch {
    // Fall through to the default.
  }
  return defaultLocale;
}

/** Same rule as themeInitScript in lib/security/inline-scripts.cjs. */
function detectErrorTheme(): Theme {
  try {
    return localStorage.getItem('theme') === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

const SERVER_SNAPSHOT = `${defaultLocale}|light`;
const subscribe = () => () => undefined;
const getSnapshot = () => `${detectErrorLocale()}|${detectErrorTheme()}`;
const getServerSnapshot = () => SERVER_SNAPSHOT;

export default function GlobalError({
  error,
  reset,
  retry,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  retry?: () => void;
}) {
  const [locale, theme] = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
    .split('|') as [Locale, Theme];
  const copy = GLOBAL_ERROR_COPY[locale];

  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    console.error('Global error boundary caught:', error);
    // A thrown value is not always an Error.
    const name = error instanceof Error ? error.name : typeof error;
    const message = error instanceof Error ? error.message : String(error);
    reportClientEvent('error', `global boundary ${name}: ${message}`);
    if (reloadOnceAfterChunkError(error)) return;
    // Move focus here so keyboard and screen-reader users notice the error.
    headingRef.current?.focus({ preventScroll: true });
  }, [error]);

  return (
    <html
      lang={locale}
      dir={localeDirection(locale)}
      className={theme === 'light' ? 'light' : undefined}
      suppressHydrationWarning
    >
      <head>
        <title>{copy.title}</title>
        <meta name="theme-color" content={theme === 'light' ? '#defaf5' : '#0a0b10'} />
      </head>
      <body className="antialiased h-full overflow-hidden bg-[var(--bg)] text-[var(--fg)]">
        {/* Fixed and scrollable, so nothing is cut off at high zoom; m-auto
            centres the content while it fits. */}
        <main id="main-content" className="fixed inset-0 flex flex-col overflow-y-auto p-4">
          <div className="m-auto max-w-md text-center">
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="mb-4 text-4xl font-bold text-[var(--navigation-accent)] outline-none"
            >
              {copy.title}
            </h1>
            <p className="mb-6 text-[var(--fg-70)]">{copy.body}</p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={retry ?? reset}
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--accent)] px-6 py-3 font-semibold text-[#04272d] transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fg)]"
              >
                {copy.retry}
              </button>
              {/* A full page load: the client router may be what failed. */}
              <a
                href={localizedPath('/', locale)}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--surface-border)] px-6 py-3 font-semibold text-[var(--fg)] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fg)]"
              >
                {copy.home}
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
