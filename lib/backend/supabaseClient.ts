// lib/backend/supabaseClient.ts
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Public reads must never hang a render or route: a stalled Supabase request
// fails after 5 s so callers fall back instead of waiting indefinitely.
// PostgREST's own timeout aborts with an AbortError, which its retry policy
// never retries, so 5 s is the total wait. (A custom fetch using
// AbortSignal.timeout rejects with a TimeoutError, which IS retried, so a
// stalled read could take about 27 s.)
const READ_TIMEOUT_MS = 5000;

let client: SupabaseClient | undefined;

function readClient(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url) {
    throw new Error(
      "Missing Supabase URL. Set SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL.",
    );
  }

  if (!key) {
    throw new Error(
      "Missing Supabase read key. Set SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  client = createClient(url, key, {
    auth: { persistSession: false },
    db: { timeout: READ_TIMEOUT_MS },
  });
  return client;
}

/**
 * The shared read client, created on first use rather than at import. A
 * missing environment variable then throws inside the caller's own try/catch
 * (for example `supabase.from(...)` in a loader), so its fallback content is
 * served instead of the whole module graph failing to load.
 */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, property) {
    const instance = readClient();
    const value: unknown = Reflect.get(instance, property, instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
