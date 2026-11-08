'use client';

import { useEffect, useRef } from 'react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { localizedPath } from '@/lib/i18n/config';
import { reloadOnceAfterChunkError } from '@/lib/client/chunk-reload';
import { reportClientEvent } from '@/lib/telemetry/report-client';

// Dark ink on the accent fill reaches WCAG AA in both themes (≥ 6.5:1).
const ACCENT_BUTTON_CLASS =
  'inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--accent)] px-6 py-3 font-semibold text-[#04272d] transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fg)]';
const OUTLINE_BUTTON_CLASS =
  'inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--surface-border)] px-6 py-3 font-semibold text-[var(--fg)] underline-offset-4 transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fg)]';

export default function Error({
  error,
  reset,
  retry,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  /** Next.js 16: refetches the segment before re-rendering it. */
  retry?: () => void;
}) {
  const { locale, dictionary } = useI18n();

  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    console.error('Error boundary caught:', error);
    // A thrown value is not always an Error.
    const name = error instanceof Error ? error.name : typeof error;
    const message = error instanceof Error ? error.message : String(error);
    reportClientEvent('error', `page boundary ${name}: ${message}`);

    if (reloadOnceAfterChunkError(error)) return;
    // Move focus here so keyboard and screen-reader users notice the error.
    mainRef.current?.focus({ preventScroll: true });
  }, [error]);

  return (
    // Fixed and scrollable, so nothing is cut off at high zoom; m-auto centres
    // the content while it fits.
    <main
      id="main-content"
      ref={mainRef}
      tabIndex={-1}
      className="fixed inset-0 z-10 flex flex-col overflow-y-auto bg-[var(--bg)] p-4 text-[var(--fg)] outline-none"
    >
      <div className="m-auto max-w-md text-center">
        {/* --navigation-accent is the text-safe accent of each theme. */}
        <h1 className="mb-4 text-4xl font-bold text-[var(--navigation-accent)]">
          {dictionary.common.somethingWentWrong}
        </h1>
        <p className="mb-6 text-[var(--fg-70)]">
          {dictionary.common.unexpectedError}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button type="button" onClick={retry ?? reset} className={ACCENT_BUTTON_CLASS}>
            {dictionary.common.retry}
          </button>
          {/* A full page load, which also works when the app's files changed. */}
          <a href={localizedPath('/', locale)} className={OUTLINE_BUTTON_CLASS}>
            {dictionary.common.backHome}
          </a>
        </div>
      </div>
    </main>
  );
}
