"use client";

import { useSyncExternalStore } from "react";
import { subscribeToThemeChanges } from "@/lib/theme/theme-store";

const DEFAULT_ACCENT_RGB = "25,227,194";

// Module-level store: one getComputedStyle read per theme change, shared by
// every consumer (e.g. each ProjectCard), on top of the shared theme observer.
const accentListeners = new Set<() => void>();
let unsubscribeTheme: (() => void) | null = null;
let accentRgb: string | null = null;

function readAccentRgb() {
  return getComputedStyle(document.documentElement)
    .getPropertyValue("--accent-rgb")
    .trim() || DEFAULT_ACCENT_RGB;
}

function refreshAccentRgb() {
  const next = readAccentRgb();
  if (next === accentRgb) return;
  accentRgb = next;
  accentListeners.forEach((listener) => listener());
}

function subscribeToAccentRgb(listener: () => void) {
  accentListeners.add(listener);
  if (!unsubscribeTheme) {
    // Re-read whenever the theme changes.
    unsubscribeTheme = subscribeToThemeChanges(refreshAccentRgb);
    // The value may have changed while nobody was observing.
    refreshAccentRgb();
  }
  return () => {
    accentListeners.delete(listener);
    if (accentListeners.size === 0) {
      unsubscribeTheme?.();
      unsubscribeTheme = null;
    }
  };
}

function getAccentRgbSnapshot() {
  if (accentRgb === null) accentRgb = readAccentRgb();
  return accentRgb;
}

const getServerAccentRgb = () => DEFAULT_ACCENT_RGB;

// Reads the --accent-rgb CSS variable ("r,g,b") from <html> and keeps it in
// sync with dark/light theme changes for canvas and JavaScript consumers.
export function useAccentRgb(): string {
  return useSyncExternalStore(subscribeToAccentRgb, getAccentRgbSnapshot, getServerAccentRgb);
}

// "25,227,194" -> "#19e3c2". For code/SVG that needs a solid hex string
// (e.g. accentColor props that build `${color}60` alpha suffixes).
export function rgbToHex(rgb: string): string {
  const parts = rgb.split(",").map((n) => Math.max(0, Math.min(255, parseInt(n.trim(), 10) || 0)));
  if (parts.length < 3) return "#19e3c2";
  return "#" + parts.slice(0, 3).map((n) => n.toString(16).padStart(2, "0")).join("");
}
