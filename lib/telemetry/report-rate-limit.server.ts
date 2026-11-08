import "server-only";

// In-memory limits for anonymous error reports, per server instance. Reports
// are only logged, so a lost count after a cold start is harmless; nothing is
// written to the database.
const CLIENT_WINDOW_MS = 10 * 60_000;
const CLIENT_LIMIT = 10;
const GLOBAL_WINDOW_MS = 60_000;
const GLOBAL_LIMIT = 30;
const MAX_TRACKED_CLIENTS = 5_000;

const clients = new Map<string, { count: number; resetAt: number }>();
let global = { count: 0, resetAt: 0 };

function pruneExpired(now: number) {
  for (const [key, entry] of clients) {
    if (now >= entry.resetAt) clients.delete(key);
  }
}

/** Returns false when this client (a hashed identity) or the instance is over its limit. */
export function takeReportSlot(clientKey: string, now = Date.now()): boolean {
  if (now >= global.resetAt) {
    global = { count: 0, resetAt: now + GLOBAL_WINDOW_MS };
    // At most once a minute (on the next report), forget expired clients so
    // hashed identities do not pile up in memory.
    pruneExpired(now);
  }
  if (global.count >= GLOBAL_LIMIT) return false;

  let entry = clients.get(clientKey);
  if (!entry || now >= entry.resetAt) {
    if (!entry && clients.size >= MAX_TRACKED_CLIENTS) {
      pruneExpired(now);
      if (clients.size >= MAX_TRACKED_CLIENTS) return false;
    }
    entry = { count: 0, resetAt: now + CLIENT_WINDOW_MS };
    clients.set(clientKey, entry);
  }
  if (entry.count >= CLIENT_LIMIT) return false;
  entry.count += 1;
  global.count += 1;
  return true;
}
