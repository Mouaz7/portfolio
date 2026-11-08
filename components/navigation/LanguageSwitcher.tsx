"use client";

import { usePathname } from "next/navigation";
import { TranslateRegularIcon as TranslateIcon } from "@/components/icons/phosphor";
import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import {
  localeCookie,
  localeDirection,
  localeNames,
  locales,
  localizedPath,
  type Locale,
} from "@/lib/i18n/config";

export default function LanguageSwitcher() {
  const pathname = usePathname() ?? "/";
  const { locale, dictionary } = useI18n();
  const [open, setOpen] = useState(false);
  // Query string of the current URL (e.g. ?technology=...), captured when the
  // list opens so switching language keeps the active filters. Read from
  // window rather than useSearchParams so this layout-level component does
  // not force a Suspense boundary / client-side rendering bailout.
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Capture phase + stopPropagation: close only this list, not an
      // enclosing dialog (the mobile header panel also closes on Escape).
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (root && !root.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  const rememberLocale = (
    event: MouseEvent<HTMLAnchorElement>,
    nextLocale: Locale,
  ) => {
    document.cookie = `${localeCookie}=${nextLocale}; Path=/; Max-Age=31536000; SameSite=Lax`;
    // Refresh the query string at click time in case it changed while open.
    event.currentTarget.href = localizedPath(pathname, nextLocale) + window.location.search;
    setOpen(false);
  };

  return (
    <div
      ref={rootRef}
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-xl border border-[var(--surface-border)] bg-[rgba(var(--bg-rgb),0.18)] px-2 text-[var(--fg)] backdrop-blur-md transition-colors hover:border-accent/50 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
        // The spoken name contains the visible language code (WCAG 2.5.3).
        aria-label={`${dictionary.nav.chooseLanguage}: ${locale.toUpperCase()}`}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => {
          if (!open) setSearch(window.location.search);
          setOpen(!open);
        }}
      >
        <TranslateIcon size={18} aria-hidden="true" />
        <span className="text-xs font-bold uppercase">{locale}</span>
      </button>

      {open && (
        <div
          id={panelId}
          role="group"
          aria-label={dictionary.nav.chooseLanguage}
          className="absolute end-0 top-[calc(100%+0.5rem)] z-[110] min-w-36 overflow-hidden rounded-xl border border-[var(--surface-border)] bg-[rgba(var(--bg-rgb),0.96)] p-1.5 shadow-2xl backdrop-blur-xl"
        >
          {locales.map((nextLocale) => (
            <a
              key={nextLocale}
              href={localizedPath(pathname, nextLocale) + search}
              hrefLang={nextLocale}
              lang={nextLocale}
              dir={localeDirection(nextLocale)}
              aria-current={locale === nextLocale ? "true" : undefined}
              onClick={(event) => rememberLocale(event, nextLocale)}
              className="flex min-h-10 items-center justify-between gap-4 rounded-lg px-3 py-2 text-sm font-semibold text-[var(--fg)] transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
            >
              <span>{localeNames[nextLocale]}</span>
              {locale === nextLocale && <span aria-hidden="true">✓</span>}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
