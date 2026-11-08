// Next.js loads this configuration as CommonJS.
/* eslint-disable @typescript-eslint/no-require-imports */
const { PHASE_DEVELOPMENT_SERVER } = require("next/constants");
const { createHash } = require("node:crypto");
const { inlineHeadScripts } = require("./lib/security/inline-scripts.cjs");
const {
  buildContentSecurityPolicy,
  publicSupabaseOrigin,
} = require("./lib/security/csp.cjs");

const STATIC_ASSET_DIRECTORIES = [
  "brand",
  "contact",
  "home",
  "journey",
  "project-icons",
  "skill-icons",
];

function cspHash(source) {
  return `'sha256-${createHash("sha256").update(source).digest("base64")}'`;
}

function staticCspCandidate() {
  return buildContentSecurityPolicy({
    scriptSrc: `'self' ${inlineHeadScripts.map(cspHash).join(" ")}`,
    isDevelopment: process.env.NODE_ENV === "development",
    supabaseOrigin: publicSupabaseOrigin(process.env),
  });
}

const nextConfig = (phase) => ({
  // Next 16 already keeps dev output in `.next/dev`, but that still lives
  // inside the production `.next`: cleaning or replacing the production
  // build (Playwright, Lighthouse, CI cache restores) would wipe a running
  // dev server's state. A sibling `.next-dev` keeps the two fully separate.
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
  outputFileTracingRoot: __dirname,
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  // Browser extensions can reject promises in their isolated scripts. Keep
  // those third-party console messages in DevTools instead of forwarding them
  // into the Next.js terminal alongside application and server logs.
  logging: {
    browserToTerminal: false,
  },
  // Hash-based SRI remains opt-in until the exact pinned Next.js/webpack build
  // has passed local, cross-browser and deployed-preview verification.
  experimental: {
    // Use the installed TypeScript compiler API directly. The CLI path emits a
    // truncated `tsc --showConfig` payload in constrained build environments.
    useTypeScriptCli: false,
    ...(process.env.NEXT_EXPERIMENTAL_SRI === "1"
      ? { sri: { algorithm: "sha256" } }
      : {}),
  },
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
  ],
  webpack(config, { isServer }) {
    if (!isServer) {
      // Next.js ships some client runtime precompiled with class static blocks,
      // which Safari/iOS < 16.4 cannot parse. Lower them to our browserslist.
      config.module.rules.push({
        test: /\.m?js$/,
        include: /[\\/]node_modules[\\/]next[\\/]dist[\\/]/,
        use: [{ loader: require.resolve("./tooling/legacy-syntax-loader.cjs") }],
      });
    }
    return config;
  },
  images: {
    remotePatterns: (() => {
      const origin = publicSupabaseOrigin(process.env);
      if (!origin) return [];
      const url = new URL(origin);
      return [{ protocol: "https", hostname: url.hostname, port: url.port, pathname: "/**" }];
    })(),
  },

  // Security headers
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "accelerometer=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          {
            key: "Cross-Origin-Resource-Policy",
            value: "same-origin",
          },
          {
            key: "Origin-Agent-Cluster",
            value: "?1",
          },
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "X-Permitted-Cross-Domain-Policies",
            value: "none",
          },
          ...(process.env.CSP_STATIC_REPORT_ONLY === "1"
            ? [{
              key: "Content-Security-Policy-Report-Only",
              value: staticCspCandidate(),
            }]
            : []),
        ],
      },
      ...(phase === PHASE_DEVELOPMENT_SERVER
        ? []
        : STATIC_ASSET_DIRECTORIES.map((directory) => ({
            source: `/${directory}/:path*`,
            headers: [{ key: "Cache-Control", value: "public, max-age=300, stale-while-revalidate=86400" }],
          }))),
    ];
  },
});

module.exports = nextConfig;
