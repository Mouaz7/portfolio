"use client";

import {
  useCallback,
  useReducer,
  useState,
  useSyncExternalStore,
} from "react";
import { useIsomorphicLayoutEffect as useBrowserLayoutEffect } from "@/hooks/useIsomorphicLayoutEffect";

// One MediaQueryList per query, shared by every subscriber. The cache is
// dropped if window.matchMedia itself is replaced (tests swap it per case).
const mediaQueryLists = new Map<string, MediaQueryList>();
let cachedMatchMedia: typeof window.matchMedia | null = null;

function getMediaQueryList(query: string): MediaQueryList {
  if (cachedMatchMedia !== window.matchMedia) {
    mediaQueryLists.clear();
    cachedMatchMedia = window.matchMedia;
  }
  let mediaQuery = mediaQueryLists.get(query);
  if (!mediaQuery) {
    mediaQuery = window.matchMedia(query);
    mediaQueryLists.set(query, mediaQuery);
  }
  return mediaQuery;
}

/**
 * Returns `serverValue` for the server render and the hydration render, and
 * the live media query result from then on. When the two differ after
 * hydration, a layout effect forces a synchronous re-render so the real value
 * is committed before the first paint (useSyncExternalStore alone would only
 * re-check in a passive effect).
 */
export function useMediaQuery(query: string, serverValue = false) {
  const subscribe = useCallback((onChange: () => void) => {
    const mediaQuery = getMediaQueryList(query);
    mediaQuery.addEventListener("change", onChange);
    return () => mediaQuery.removeEventListener("change", onChange);
  }, [query]);
  const getSnapshot = useCallback(() => getMediaQueryList(query).matches, [query]);
  const getServerSnapshot = useCallback(() => serverValue, [serverValue]);

  const matches = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [, forceRender] = useReducer((count: number) => count + 1, 0);

  useBrowserLayoutEffect(() => {
    if (getSnapshot() !== matches) forceRender();
  }, [getSnapshot, matches]);

  return matches;
}

/**
 * False for the server render and the hydration render, true from the first
 * layout effect on. Use it to keep server HTML layout-agnostic (render every
 * variant and let CSS media queries pick one) until the screen is measured.
 */
export function useLayoutMeasured() {
  const [measured, setMeasured] = useState(false);
  useBrowserLayoutEffect(() => setMeasured(true), []);
  return measured;
}

export function usePrefersReducedMotion() {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}
