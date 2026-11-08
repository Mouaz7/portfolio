// Anonymous error reports from visitors' browsers: what may be sent and how it
// is cleaned. Shared by the browser sender and the /api/client-report route;
// the route always re-validates, so nothing here is trusted on its own.

export const CLIENT_REPORT_ENDPOINT = "/api/client-report";
export const CLIENT_REPORT_MAX_BYTES = 2048;
const CLIENT_REPORT_MESSAGE_MAX = 160;

const CLIENT_REPORT_KINDS = [
  "error",
  "unhandled-rejection",
  "background",
  "legacy-mode",
] as const;
export type ClientReportKind = (typeof CLIENT_REPORT_KINDS)[number];

export type ClientReport = {
  kind: ClientReportKind;
  page: string;
  message: string;
};

const PAGE_PATTERN = /^\/[A-Za-z0-9/_-]{0,95}$/;

/**
 * Makes free text safe to keep: no control characters, e-mail addresses,
 * links, tokens or long numbers, at most `max` characters.
 */
export function sanitizeReportText(value: unknown, max = CLIENT_REPORT_MESSAGE_MAX): string {
  if (typeof value !== "string") return "";
  return value
    .slice(0, 400)
    .normalize("NFKC")
    // Invisible formatting characters (bidi overrides, zero-width spaces).
    .replace(/[\p{Cc}\p{Cf}]+/gu, " ")
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]{2,}/gu, "[email]")
    .replace(/\S*%40\S*/gi, "[email]")
    .replace(/\b[a-z][a-z0-9+.-]{1,30}:\/\/\S*/gi, "[url]")
    .replace(/\b(?:blob|data|javascript):\S*/gi, "[url]")
    .replace(/\b(?:www\.|localhost)\S*/gi, "[url]")
    .replace(/\?\S*/g, "?[query]")
    .replace(/(?:[A-Za-z]:)?[\\/](?:Users|home|root)[\\/][^\\/\s]+/gi, "[path]")
    .replace(/\bBearer\s+\S+/gi, "[token]")
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[token]")
    .replace(/[A-Za-z0-9_-]{32,}/g, "[token]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[ip]")
    .replace(/\b[0-9a-f]{0,4}(?::[0-9a-f]{0,4}){2,7}\b/gi, (match) => (/[0-9a-f]{1,4}:[0-9a-f]{0,4}:/i.test(match) ? "[ip]" : match))
    .replace(/\+?\p{Nd}(?:[\s().-]?\p{Nd}){6,}/gu, "[n]")
    .replace(/\p{Nd}{5,}/gu, "[n]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** Only the path of a page on this site, never its query or fragment. */
export function sanitizeReportPage(value: unknown): string {
  if (typeof value !== "string") return "/unknown";
  const path = value.split(/[?#]/, 1)[0];
  return PAGE_PATTERN.test(path) ? path : "/unknown";
}

function isKind(value: unknown): value is ClientReportKind {
  return typeof value === "string" && (CLIENT_REPORT_KINDS as readonly string[]).includes(value);
}

/** Strict schema: unknown fields or wrong types reject the whole report. */
export function parseClientReport(body: Record<string, unknown>): ClientReport | null {
  const allowed = new Set(["kind", "page", "message"]);
  if (Object.keys(body).some((key) => !allowed.has(key))) return null;
  if (!isKind(body.kind)) return null;
  if (body.message !== undefined && typeof body.message !== "string") return null;
  return {
    kind: body.kind,
    page: sanitizeReportPage(body.page),
    message: sanitizeReportText(body.message),
  };
}
