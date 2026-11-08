// Shared Content-Security-Policy builder. CommonJS so next.config.js can
// require it; proxy.ts imports the same functions so the enforced (nonce) and
// report-only (hash) policies only ever differ in script-src.

/**
 * Origin of the public Supabase project, or "" when unset or invalid.
 *
 * NEXT_PUBLIC_SUPABASE_URL wins; an unset *or empty* value falls through to
 * SUPABASE_URL (`||`, not `??`), so a blank public variable does not silently
 * drop Supabase from img-src/connect-src.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {string}
 */
function publicSupabaseOrigin(env) {
  const value = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  if (!value) return "";
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

/**
 * @param {{ scriptSrc: string, isDevelopment: boolean, supabaseOrigin: string }} options
 *   scriptSrc: the sources after `script-src` and before the Turnstile origin,
 *   e.g. "'self' 'nonce-…' 'strict-dynamic'" or "'self' 'sha256-…'".
 * @returns {string}
 */
function buildContentSecurityPolicy({ scriptSrc, isDevelopment, supabaseOrigin }) {
  const supabaseWebSocket = supabaseOrigin.replace(/^https:/, "wss:");
  return [
    "default-src 'self'",
    `script-src ${scriptSrc} https://challenges.cloudflare.com${isDevelopment ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${supabaseOrigin ? ` ${supabaseOrigin}` : ""}`,
    "font-src 'self' data:",
    `connect-src 'self' https://challenges.cloudflare.com https://vitals.vercel-insights.com${supabaseOrigin ? ` ${supabaseOrigin} ${supabaseWebSocket}` : ""}`,
    "frame-src https://challenges.cloudflare.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDevelopment ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

module.exports = {
  buildContentSecurityPolicy,
  publicSupabaseOrigin,
};
