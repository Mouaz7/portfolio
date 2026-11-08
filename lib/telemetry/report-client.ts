import {
  CLIENT_REPORT_ENDPOINT,
  CLIENT_REPORT_MAX_BYTES,
  sanitizeReportText,
  type ClientReportKind,
} from "./client-report";

// Per page load: at most this many automatic reports, and never the same one
// twice. A broken device should not flood the log or its own network.
const MAX_AUTOMATIC_REPORTS = 3;
let automaticReports = 0;
const seen = new Set<string>();

// Leaving a page aborts its loads and workers; the failures that follow are
// not problems worth reporting. Back/forward-cache restores re-enable them.
let leaving = false;
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => { leaving = true; });
  window.addEventListener("pageshow", () => { leaving = false; });
}

/**
 * Sends an anonymous report to the site's own server. Text is cleaned before
 * it leaves the browser (the server cleans it again). Returns whether a
 * report was sent.
 */
export function reportClientEvent(
  kind: ClientReportKind,
  message = "",
): boolean {
  if (typeof window === "undefined" || typeof fetch !== "function") return false;
  if (process.env.NODE_ENV === "development") return false;
  const text = sanitizeReportText(message);
  if (leaving) return false;
  const key = `${kind}:${text}`;
  if (seen.has(key) || automaticReports >= MAX_AUTOMATIC_REPORTS) return false;
  seen.add(key);
  automaticReports += 1;
  const body = JSON.stringify({
    kind,
    page: window.location.pathname,
    message: text,
  });
  if (new TextEncoder().encode(body).byteLength > CLIENT_REPORT_MAX_BYTES) return false;
  try {
    // keepalive lets the report finish even if the page is being closed.
    void fetch(CLIENT_REPORT_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
      credentials: "omit",
      // The page URL (and its query) stays out of the request.
      referrerPolicy: "no-referrer",
    }).catch(() => {});
    return true;
  } catch {
    return false;
  }
}
