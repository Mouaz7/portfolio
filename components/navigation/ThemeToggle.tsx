"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { isLightTheme, notifyThemeChange, subscribeToThemeChanges } from "@/lib/theme/theme-store";

type Theme = "dark" | "light";

const getIsLight = isLightTheme;
// Every theme button must flip within the click, so they listen immediately.
const subscribeImmediately = (listener: () => void) => subscribeToThemeChanges(listener, { immediate: true });
// The server (and hydration) render shows the sun icon with the "switch to
// light" label; the real theme is applied right after hydration.
const getServerIsLight = () => false;

/**
 * Dark / light theme switch. Toggles the `light` class on <html> and persists
 * the choice in localStorage. The initial class is applied pre-paint by the
 * inline script in app/layout.tsx, so this only syncs React state on mount.
 */
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const { dictionary } = useI18n();
  const isLight = useSyncExternalStore(subscribeImmediately, getIsLight, getServerIsLight);
  const transitionRaf = useRef(0);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(transitionRaf.current);
      delete document.documentElement.dataset.themeSwitching;
    };
  }, []);

  const toggle = useCallback(() => {
    const root = document.documentElement;
    const next: Theme = root.classList.contains("light") ? "dark" : "light";

    // Apply the DOM theme synchronously. Temporarily suppressing color
    // transitions prevents hundreds of descendants from repainting for 300ms.
    root.dataset.themeSwitching = "true";
    root.classList.toggle("light", next === "light");
    document
      .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
      ?.setAttribute("content", next === "light" ? "#defaf5" : "#0a0b10");
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* ignore */
    }
    // The shared observer would also catch this, but notify synchronously so
    // every instance updates within the click.
    notifyThemeChange();

    cancelAnimationFrame(transitionRaf.current);
    transitionRaf.current = requestAnimationFrame(() => {
      transitionRaf.current = requestAnimationFrame(() => {
        delete root.dataset.themeSwitching;
      });
    });
  }, []);

  const toggleLabel = isLight ? dictionary.theme.dark : dictionary.theme.light;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={toggleLabel}
      title={toggleLabel}
      className={[
        "relative inline-flex h-9 w-9 items-center justify-center rounded-xl",
        "border border-[var(--surface-border)] bg-[rgba(var(--bg-rgb),0.18)] text-[var(--fg)] backdrop-blur-md",
        "transition-colors duration-300 ease-[cubic-bezier(.22,1,.36,1)]",
        "hover:text-accent hover:border-accent/50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
        className,
      ].join(" ")}
    >
      {/* Hydration renders the sun (server snapshot) to match the server HTML */}
      {isLight ? (
        // Moon (click → go dark)
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        // Sun (click → go light)
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      )}
    </button>
  );
}
