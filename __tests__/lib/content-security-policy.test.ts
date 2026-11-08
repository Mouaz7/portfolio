/**
 * @jest-environment node
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { inlineHeadScripts } from "@/lib/security/inline-scripts.cjs";

type Env = Record<string, string | undefined>;
type HeaderRule = { source: string; headers: Array<{ key: string; value: string }> };

const NONCE_UUID = "00000000-1111-2222-3333-444444444444";
const NONCE = NONCE_UUID.replaceAll("-", "");

const originalEnv = { ...process.env };

function applyEnv(env: Env) {
  process.env = { ...originalEnv, CSP_STATIC_REPORT_ONLY: "1" };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function enforcedPolicy(env: Env) {
  applyEnv(env);
  jest.resetModules();
  const { proxy } = require("@/proxy") as typeof import("@/proxy");
  return proxy(new NextRequest("https://portfolio.test/skills"))
    .headers.get("content-security-policy");
}

async function staticConfig(env: Env) {
  applyEnv(env);
  jest.resetModules();
  const nextConfig = require("../../next.config");
  const config = nextConfig("phase-production-build");
  const rules: HeaderRule[] = await config.headers();
  const policy = rules
    .find((rule) => rule.source === "/:path*")
    ?.headers.find((header) => header.key === "Content-Security-Policy-Report-Only")
    ?.value;
  return { policy, remotePatterns: config.images.remotePatterns };
}

const sha256 = (source: string) =>
  `'sha256-${createHash("sha256").update(source).digest("base64")}'`;
const STATIC_SCRIPT_HASHES = inlineHeadScripts.map(sha256).join(" ");

// Header strings captured from proxy.ts and next.config.js before the shared
// builder in lib/security/csp.cjs existed. The refactor must keep them
// byte-identical; only script-src differs between the two policies.
function expectedPolicy({
  scriptSrc,
  development,
  supabase,
}: { scriptSrc: string; development: boolean; supabase: string }) {
  const wss = supabase.replace(/^https:/, "wss:");
  return [
    "default-src 'self'",
    `script-src ${scriptSrc} https://challenges.cloudflare.com${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${supabase ? ` ${supabase}` : ""}`,
    "font-src 'self' data:",
    `connect-src 'self' https://challenges.cloudflare.com https://vitals.vercel-insights.com${supabase ? ` ${supabase} ${wss}` : ""}`,
    "frame-src https://challenges.cloudflare.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(development ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

const ENV_CASES: Array<[string, Env, string, unknown[]]> = [
  [
    "public Supabase URL wins over the server URL",
    { NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co", SUPABASE_URL: "https://other.supabase.co" },
    "https://abc.supabase.co",
    [{ protocol: "https", hostname: "abc.supabase.co", port: "", pathname: "/**" }],
  ],
  [
    "server Supabase URL is used when the public URL is unset",
    { NEXT_PUBLIC_SUPABASE_URL: undefined, SUPABASE_URL: "https://server.supabase.co/rest/v1" },
    "https://server.supabase.co",
    [{ protocol: "https", hostname: "server.supabase.co", port: "", pathname: "/**" }],
  ],
  [
    // Empty strings fall through to SUPABASE_URL (`||`, not `??`). The proxy
    // previously used `??` and dropped Supabase from the enforced policy here.
    "an empty public URL falls through to the server URL",
    { NEXT_PUBLIC_SUPABASE_URL: "", SUPABASE_URL: "https://fallback.supabase.co" },
    "https://fallback.supabase.co",
    [{ protocol: "https", hostname: "fallback.supabase.co", port: "", pathname: "/**" }],
  ],
  [
    "non-default ports are kept in the origin",
    { NEXT_PUBLIC_SUPABASE_URL: "https://db.example.com:8443/storage", SUPABASE_URL: undefined },
    "https://db.example.com:8443",
    [{ protocol: "https", hostname: "db.example.com", port: "8443", pathname: "/**" }],
  ],
  [
    "local http origins are not rewritten to wss",
    { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_URL: undefined },
    "http://127.0.0.1:54321",
    [{ protocol: "https", hostname: "127.0.0.1", port: "54321", pathname: "/**" }],
  ],
  [
    "an invalid URL adds no Supabase origin",
    { NEXT_PUBLIC_SUPABASE_URL: "not a url", SUPABASE_URL: "https://ignored.supabase.co" },
    "",
    [],
  ],
  [
    "no Supabase URL adds no Supabase origin",
    { NEXT_PUBLIC_SUPABASE_URL: undefined, SUPABASE_URL: undefined },
    "",
    [],
  ],
];

describe("content security policy", () => {
  beforeEach(() => {
    jest.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(NONCE_UUID);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  describe.each([
    ["development", true],
    ["production", false],
  ])("NODE_ENV=%s", (nodeEnv, development) => {
    it.each(ENV_CASES)("%s", async (_name, env, supabase, remotePatterns) => {
      const fullEnv = { ...env, NODE_ENV: nodeEnv };

      expect(enforcedPolicy(fullEnv)).toBe(expectedPolicy({
        scriptSrc: `'self' 'nonce-${NONCE}' 'strict-dynamic'`,
        development,
        supabase,
      }));

      const { policy, remotePatterns: patterns } = await staticConfig(fullEnv);
      expect(policy).toBe(expectedPolicy({
        scriptSrc: `'self' ${STATIC_SCRIPT_HASHES}`,
        development,
        supabase,
      }));
      expect(patterns).toEqual(remotePatterns);
    });

    it.each(ENV_CASES)("enforced and static policies differ only in script-src: %s", async (_name, env) => {
      const fullEnv = { ...env, NODE_ENV: nodeEnv };
      const withoutScriptSrc = (policy: string | null | undefined) =>
        (policy ?? "").split("; ").filter((directive) => !directive.startsWith("script-src "));

      const enforced = withoutScriptSrc(enforcedPolicy(fullEnv));
      const { policy } = await staticConfig(fullEnv);
      expect(enforced.length).toBeGreaterThan(5);
      expect(withoutScriptSrc(policy)).toEqual(enforced);
    });
  });
});
