import "server-only";
import { isIP } from "node:net";

function firstValidAddress(value: string | null): string | null {
  const address = value?.split(",", 1)[0]?.trim() ?? "";
  return isIP(address) ? address : null;
}

/**
 * The visitor's address from the hosting platform's trusted header, or null
 * when it is unknown. Client-supplied forwarding headers are never trusted in
 * production.
 */
export function clientAddress(req: Request): string | null {
  // Only the platform's own environment decides this: headers such as
  // x-vercel-id can be sent by anyone when the app is hosted elsewhere.
  if (process.env.VERCEL === "1") {
    return firstValidAddress(req.headers.get("x-vercel-forwarded-for"));
  }

  if (process.env.NETLIFY === "true") {
    return firstValidAddress(req.headers.get("x-nf-client-connection-ip"));
  }

  const configuredHeader = process.env.TRUSTED_PROXY_IP_HEADER?.trim().toLowerCase();
  if (configuredHeader && /^[a-z0-9-]{1,64}$/.test(configuredHeader)) {
    return firstValidAddress(req.headers.get(configuredHeader));
  }

  return process.env.NODE_ENV === "production"
    ? null
    : firstValidAddress(req.headers.get("x-real-ip")) ?? "127.0.0.1";
}
