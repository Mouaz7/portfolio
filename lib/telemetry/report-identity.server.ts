import "server-only";
import crypto from "node:crypto";
import { isIPv4, isIPv6 } from "node:net";
import { clientAddress } from "@/lib/security/client-address.server";

// A random key that only exists in this server instance's memory: the hashed
// identities cannot be linked to an address, across instances or later.
const instanceKey = crypto.randomBytes(32);

/** The first 64 bits of an IPv6 address: one household or phone, not one of its many addresses. */
function ipv6Prefix(address: string) {
  const [head, tail = ""] = address.toLowerCase().split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = address.includes("::")
    ? [...left, ...Array(Math.max(8 - left.length - right.length, 0)).fill("0"), ...right]
    : left;
  return groups.slice(0, 4).map((group) => group.replace(/^0+(?=.)/, "")).join(":");
}

/**
 * Rate-limit identity for anonymous reports: a keyed hash of the visitor's
 * address (IPv6 reduced to its /64), or one shared bucket when the address is
 * unknown. Needs no database, cookie or configured secret.
 */
export function reportClientKey(req: Request): string {
  const address = clientAddress(req);
  if (!address) return "unknown";
  // IPv4-mapped IPv6 (::ffff:a.b.c.d) is one IPv4 client, not one shared /64.
  const mapped = address.toLowerCase().match(/^::ffff:(.+)$/)?.[1];
  const plain = mapped && isIPv4(mapped) ? mapped : address;
  const network = isIPv6(plain) ? `${ipv6Prefix(plain)}::/64` : plain;
  return crypto.createHmac("sha256", instanceKey).update(network).digest("base64url");
}
