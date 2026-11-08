import { reportClientEvent } from "@/lib/telemetry/report-client";

/**
 * Client-side fallback fetch for page data the server did not preload.
 * Rejects on network errors and non-2xx responses.
 */
export async function fetchJson<T>(url: string, timeoutMs = 15_000): Promise<T> {
  // A stalled network rejects after the timeout, so the page shows its
  // error and Retry instead of loading forever.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Sends an anonymous report for a failed page-data fetch (see /privacy). */
export function reportFetchFailure(what: string, error: unknown) {
  const reason = error instanceof Error ? error.message : "unknown error";
  reportClientEvent("error", `${what} fetch failed: ${reason}`);
}
