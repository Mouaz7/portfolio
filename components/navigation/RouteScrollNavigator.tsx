"use client";

import { useEffect, useMemo, useRef, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useNavigationExperience } from "./NavigationExperienceProvider";
import { usePrefersReducedMotion } from "@/hooks/useMediaQuery";

type Props = {
  routes: string[];           // ordered list the paths to navigate
  cooldownMs?: number;        // min time between navigations
  wheelThreshold?: number;    // how much wheel delta before we act
  touchThreshold?: number;    // swipe distance (px) to navigate
  disableTouch?: boolean;
};

const INTERACTIVE_ROLES = new Set([
  "button",
  "checkbox",
  "combobox",
  "link",
  "menuitem",
  "option",
  "radio",
  "searchbox",
  "slider",
  "spinbutton",
  "switch",
  "textbox",
]);

export function isInteractiveKeyTarget(target: EventTarget | null) {
  let el = target instanceof Element ? target : null;

  while (el && el !== document.body && el !== document.documentElement) {
    if (el instanceof HTMLElement && el.isContentEditable) return true;

    const tag = el.tagName.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select" || tag === "button") {
      return true;
    }
    if (tag === "a" && (el as HTMLAnchorElement).href) return true;

    const role = el.getAttribute("role");
    if (role && INTERACTIVE_ROLES.has(role)) return true;

    el = el.parentElement;
  }

  return false;
}

// Wheel events closer together than this on the same target belong to one
// gesture and reuse the cached scroll-ancestor scan.
const WHEEL_GESTURE_GAP_MS = 200;
// Deliberate notch-by-notch mouse scrolling may pause longer between notches;
// only after this much quiet does the accumulated scroll start over.
const WHEEL_ACCUMULATOR_RESET_MS = 800;

// Wheel and navigation timing shared by every navigator instance. Each page
// renders its own header (and navigator), so per-instance state would start
// over on the new page while a touchpad flick is still sending momentum.
const wheelSession = {
  lastWheelAt: Number.NEGATIVE_INFINITY,
  awaitPause: false,
  lastNavigationAt: Number.NEGATIVE_INFINITY,
};

/** Starts from a clean wheel/navigation history (tests). */
export function resetWheelSession() {
  wheelSession.lastWheelAt = Number.NEGATIVE_INFINITY;
  wheelSession.awaitPause = false;
  wheelSession.lastNavigationAt = Number.NEGATIVE_INFINITY;
}

/**
 * Elements between `target` and <body> whose computed overflow-y lets them
 * scroll. Only this style walk is cached per gesture; scroll extents are
 * still read on every event because they change while the gesture scrolls.
 */
function collectOverflowAncestors(target: EventTarget | null): Element[] {
  const ancestors: Element[] = [];
  let el = target instanceof Element ? target : null;
  while (el && el !== document.body && el !== document.documentElement) {
    const overflowY = window.getComputedStyle(el).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") ancestors.push(el);
    el = el.parentElement;
  }
  return ancestors;
}

/** True while the page is pinch-zoomed in: panning then must not change routes. */
function isPinchZoomed() {
  return (window.visualViewport?.scale ?? 1) > 1.01;
}

// Only navigate if no scrollable ancestor can consume this scroll in that direction
function canAncestorScrollInDirection(ancestors: readonly Element[], deltaY: number) {
  for (const el of ancestors) {
    if (el.scrollHeight <= el.clientHeight) continue;
    if (deltaY > 0) {
      // scrolling down: if there's room below, let the element handle it
      if (Math.ceil(el.scrollTop + el.clientHeight) < el.scrollHeight) return true;
    } else if (deltaY < 0) {
      // scrolling up: if there's room above, let the element handle it
      if (el.scrollTop > 0) return true;
    }
  }
  return false;
}

/**
 * A headless route navigation helper that converts user scroll, key, and touch
 * wheel and touch gestures into Next.js route transitions across a linear list of routes.
 *
 * Behavior:
 * - Listens globally for:
 *   - Wheel events (vertical only; horizontal deltas ignored)
 *   - Touch swipe gestures (vertical)
 * - Accumulates wheel delta until a threshold is exceeded, then advances to the
 *   next or previous route.
 * - Prevents navigation if a scrollable ancestor element can still scroll in
 *   the intended direction (avoids hijacking inner scroll areas like modals,
 *   code blocks, feed containers, etc.).
 * - Applies a cooldown between navigations to avoid rapid accidental multi-skip.
 * - Respects the user's `prefers-reduced-motion` setting.
 *
 * Side Effects:
 * - Attaches global listeners to `window` for wheel, keyboard, and touch events.
 * - Cleans up all listeners on unmount or dependency changes.
 *
 * Accessibility:
 * - Does not install global keyboard shortcuts, preserving native keyboard behaviour.
 * - Respects reduced-motion preferences.
 * - Does not render UI; intended as an enhancement layered atop page structure.
 *
 * Performance:
 * - Minimal work per event (simple accumulation & bounds checks).
 * - The computed-style walk over ancestors runs once per gesture (touchstart,
 *   or the first wheel event of a burst on a target), not on every event.
 * - The non-passive touchmove listener exists only while an eligible touch is
 *   down, so other touch scrolling never waits on the main thread.
 * - Uses `performance.now()` for cooldown timing precision.
 *
 * Recommended Usage:
 * - Mount once per page (e.g., in a layout) with a stable `routes` array that
 *   reflects the vertical / chronological / narrative ordering you wish to
 *   traverse.
 * - Ensure routes array contains the current pathname, or the component will
 *   be inert (`index === -1`).
 *
 * Example:
 * ```tsx
 * <RouteScrollNavigator
 *   routes={["/", "/about", "/work", "/contact"]}
 *   cooldownMs={800}
 *   wheelThreshold={140}
 *   touchThreshold={70}
 * />
 * ```
 *
 * @component
 * @param routes Ordered list of route pathnames representing the scroll / swipe navigation sequence.
 * @param cooldownMs Minimum time (ms) between successive navigations to prevent rapid accidental multi-navigation. Default: 900.
 * @param wheelThreshold Accumulated vertical wheel delta required to trigger a route change. Higher values require more deliberate scrolling. Default: 120.
 * @param touchThreshold Vertical touch movement (in pixels) needed to trigger a route change on mobile / touch devices. Default: 60.
 * @returns null (non-visual utility component).
 */
export default function RouteScrollNavigator({
  routes,
  cooldownMs = 900,
  wheelThreshold = 120,
  touchThreshold = 60,
  disableTouch = false,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { markInternalNavigation } = useNavigationExperience();

  const index = useMemo(() => routes.indexOf(pathname ?? ""), [pathname, routes]);
  const accRef = useRef(0);
  const touchYRef = useRef<number | null>(null);
  const touchAncestorsRef = useRef<Element[]>([]);
  const wheelGestureRef = useRef<{
    target: EventTarget | null;
    lastAt: number;
    ancestors: Element[];
  } | null>(null);
  const navigationTargetRef = useRef<string | null>(null);
  const navigationTimerRef = useRef<number | null>(null);

  useEffect(() => {
    navigationTargetRef.current = null;
    if (navigationTimerRef.current !== null) {
      window.clearTimeout(navigationTimerRef.current);
      navigationTimerRef.current = null;
    }
  }, [pathname]);

  useEffect(() => () => {
    if (navigationTimerRef.current !== null) {
      window.clearTimeout(navigationTimerRef.current);
    }
  }, []);

  // Helpers -------------------------------------------------------
  const goTo = useCallback((i: number) => {
    const destination = routes[i];
    if (!destination || i === index || navigationTargetRef.current) return;
    navigationTargetRef.current = destination;
    markInternalNavigation(destination);
    router.prefetch?.(destination);
    router.push(destination);
    navigationTimerRef.current = window.setTimeout(() => {
      navigationTargetRef.current = null;
      navigationTimerRef.current = null;
    }, 2_000);
  }, [index, markInternalNavigation, routes, router]);

  const cooldown = useCallback(() => {
    // The first deliberate gesture works immediately (the history starts at
    // -Infinity); later ones wait for the cooldown, across page changes too.
    const now = performance.now();
    if (now - wheelSession.lastNavigationAt < cooldownMs) return true;
    wheelSession.lastNavigationAt = now;
    return false;
  }, [cooldownMs]);

  // Respect prefers-reduced-motion by default (and follow changes to it).
  const prefersReducedMotion = usePrefersReducedMotion();

  const enabled = !prefersReducedMotion;

  useEffect(() => {
    if (!enabled || index === -1) return;

    // WHEEL -------------------------------------------------------
    const onWheel = (e: WheelEvent) => {
      // Ctrl/Cmd + wheel and trackpad pinch are browser zoom, not navigation.
      if (e.ctrlKey || e.metaKey) return;
      // ignore horizontal scrolls
      if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
      if (isInteractiveKeyTarget(e.target)) return;

      const now = performance.now();
      const gap = now - wheelSession.lastWheelAt;
      wheelSession.lastWheelAt = now;
      // Small scrolls minutes apart must not add up to a page change.
      if (gap > WHEEL_ACCUMULATOR_RESET_MS) accRef.current = 0;
      // Touchpads keep sending momentum events after a flick; those belong to
      // the gesture that already navigated (possibly on the previous page)
      // and must not skip another page. A pause ends that gesture.
      if (gap > WHEEL_GESTURE_GAP_MS) wheelSession.awaitPause = false;
      if (wheelSession.awaitPause) return;
      let gesture = wheelGestureRef.current;
      if (!gesture || gesture.target !== e.target || now - gesture.lastAt > WHEEL_GESTURE_GAP_MS) {
        gesture = { target: e.target, lastAt: now, ancestors: collectOverflowAncestors(e.target) };
        wheelGestureRef.current = gesture;
      }
      gesture.lastAt = now;
      if (canAncestorScrollInDirection(gesture.ancestors, e.deltaY)) return;

      accRef.current += e.deltaY;

      if (Math.abs(accRef.current) >= wheelThreshold) {
        if (cooldown()) {
          accRef.current = 0;
          return;
        }
        const dir = accRef.current > 0 ? 1 : -1;
        goTo(index + dir);
        accRef.current = 0;
        wheelSession.awaitPause = true;
        // prevent the default scroll so we don't see a jump before routing
        e.preventDefault();
      }
    };

    // TOUCH (mobile) ---------------------------------------------
    // touchmove must be non-passive to allow preventDefault, but it is only
    // attached while a touch that may navigate is in progress.
    let touchMoveAttached = false;
    // A passive listener cannot cancel the move (calling preventDefault there
    // only logs a warning).
    let touchMovePassive = false;
    const detachTouchMove = () => {
      if (!touchMoveAttached) return;
      window.removeEventListener("touchmove", onTouchMove);
      touchMoveAttached = false;
    };
    const onTouchStart = (e: TouchEvent) => {
      // Two fingers (pinch) or panning a zoomed-in page is not a page swipe.
      if (e.touches.length > 1 || isPinchZoomed() || isInteractiveKeyTarget(e.target)) {
        touchYRef.current = null;
        detachTouchMove();
        return;
      }
      touchYRef.current = e.touches[0]?.clientY ?? null;
      // Touch events keep targeting the touchstart element for the whole
      // gesture, so its overflow ancestors can be resolved once here.
      touchAncestorsRef.current = collectOverflowAncestors(e.target);
      if (!touchMoveAttached) {
        // Inside a list that really scrolls, the browser must not wait for
        // this listener on every move; elsewhere it may cancel the swipe
        // (e.g. pull-to-refresh) once it navigates.
        const insideScroller = touchAncestorsRef.current.some((el) => el.scrollHeight > el.clientHeight);
        window.addEventListener("touchmove", onTouchMove, { passive: insideScroller });
        touchMoveAttached = true;
        touchMovePassive = insideScroller;
      }
    };
    function onTouchMove(e: TouchEvent) {
      // if a child can scroll, let it
      const startY = touchYRef.current;
      if (startY == null) return;
      if (e.touches.length > 1 || isPinchZoomed()) {
        touchYRef.current = null;
        return;
      }
      const dy = startY - (e.touches[0]?.clientY ?? startY);
      if (canAncestorScrollInDirection(touchAncestorsRef.current, dy)) return;

      if (Math.abs(dy) >= touchThreshold) {
        if (cooldown()) return;
        goTo(index + (dy > 0 ? 1 : -1));
        touchYRef.current = null;
        if (e.cancelable && !touchMovePassive) e.preventDefault();
      }
    }
    const onTouchEnd = () => {
      touchYRef.current = null;
      touchAncestorsRef.current = [];
      detachTouchMove();
    };

    // listeners (wheel must be non-passive to allow preventDefault)
    window.addEventListener("wheel", onWheel, { passive: false });
    if (!disableTouch) {
      window.addEventListener("touchstart", onTouchStart, { passive: true });
      window.addEventListener("touchend", onTouchEnd, { passive: true });
      window.addEventListener("touchcancel", onTouchEnd, { passive: true });
    }

    return () => {
      window.removeEventListener("wheel", onWheel);
      wheelGestureRef.current = null;
      if (!disableTouch) {
        window.removeEventListener("touchstart", onTouchStart);
        window.removeEventListener("touchend", onTouchEnd);
        window.removeEventListener("touchcancel", onTouchEnd);
        detachTouchMove();
      }
    };
  }, [enabled, index, routes, wheelThreshold, touchThreshold, cooldownMs, cooldown, goTo, disableTouch]);

  return null;
}
