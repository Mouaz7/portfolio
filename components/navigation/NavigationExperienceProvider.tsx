"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

type NavigationExperience = {
  markInternalNavigation: (href: string) => void;
  shouldEnterInstantly: (pathname: string) => boolean;
};

const FALLBACK_NAVIGATION_EXPERIENCE: NavigationExperience = {
  markInternalNavigation: () => undefined,
  shouldEnterInstantly: () => false,
};

const NavigationExperienceContext = createContext<NavigationExperience>(
  FALLBACK_NAVIGATION_EXPERIENCE,
);

function pathnameFromHref(href: string): string {
  try {
    return new URL(href, "http://portfolio.local").pathname;
  } catch {
    return href.split(/[?#]/, 1)[0] || "/";
  }
}

export function NavigationExperienceProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // A ref, not state: marking a navigation must not re-render every context
  // consumer. The destination page reads the ref during its first render
  // (see useRouteEntrance), which happens after the click that wrote it.
  const internalTargetRef = useRef<string | null>(null);
  const pathnameRef = useRef(pathname);
  const clearFrameRef = useRef(0);

  useEffect(() => {
    pathnameRef.current = pathname;
    if (internalTargetRef.current !== pathname) return;
    const frame = window.requestAnimationFrame(() => {
      if (internalTargetRef.current === pathname) internalTargetRef.current = null;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  useEffect(() => () => window.cancelAnimationFrame(clearFrameRef.current), []);

  const value = useMemo<NavigationExperience>(() => ({
    markInternalNavigation: (href: string) => {
      const target = pathnameFromHref(href);
      internalTargetRef.current = target;
      window.cancelAnimationFrame(clearFrameRef.current);
      // Marking the current route never produces a pathname change, so clear
      // it on the next frame like the pathname effect would.
      if (target === pathnameRef.current) {
        clearFrameRef.current = window.requestAnimationFrame(() => {
          if (internalTargetRef.current === target) internalTargetRef.current = null;
        });
      }
    },
    shouldEnterInstantly: (candidate: string) =>
      internalTargetRef.current === pathnameFromHref(candidate),
  }), []);

  return (
    <NavigationExperienceContext.Provider value={value}>
      {children}
    </NavigationExperienceContext.Provider>
  );
}

export function useNavigationExperience() {
  return useContext(NavigationExperienceContext);
}

export function useRouteEntrance(): "animated" | "instant" {
  const pathname = usePathname() ?? "/";
  const { shouldEnterInstantly } = useNavigationExperience();
  const [entrance] = useState<"animated" | "instant">(() =>
    shouldEnterInstantly(pathname) ? "instant" : "animated",
  );
  return entrance;
}
