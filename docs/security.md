# Security

How the site protects itself, and the decisions a maintainer must know before
changing them. Request protection, secrets validation and HTTP headers are
described in [Architecture](architecture.md#security-architecture). To report
a vulnerability, see [`.github/SECURITY.md`](../.github/SECURITY.md).

## Content Security Policy

`proxy.ts` creates a nonce and enforces a per-request CSP on public pages
(`lib/security/csp.cjs`). Because the layout reads request headers, those pages
render dynamically. The CSP allows only the origins the app needs: the
configured Supabase HTTPS/WebSocket origin, Vercel Speed Insights, Cloudflare
Turnstile and self-hosted workers and assets.

The five stable inline head scripts live in `lib/security/inline-scripts.cjs`
(modern-syntax probe, simple-mode detection, theme, browser-extension
compatibility, performance tier). `style-src 'unsafe-inline'` is still needed
by the current UI; removing it is a separate, visually verified migration.

A static hash-based policy exists as a candidate only.
`CSP_STATIC_REPORT_ONLY=1` (preview only) emits it as
`Content-Security-Policy-Report-Only`, and `npm run test:csp-report-only`
inspects the reports; the command exits non-zero on any violation. It is
**not** ready to enforce: Next.js emits its own inline bootstrap scripts that
the five hashes do not cover. Until that is solved, keep the nonce policy, and
never add `unsafe-inline` to `script-src` to silence a report.

Next.js SRI (`NEXT_EXPERIMENTAL_SRI=1`) is experimental; use it only for an
isolated build and test run, not in production. SRI verifies downloaded
script bytes and does not replace CSP.

## Contact attachments

Attachments are off by default, and contact messages work without them. They
turn on only when `CONTACT_ATTACHMENTS_ENABLED=true` and
`CONTACT_MALWARE_SCANNER_ENDPOINT` (HTTPS) and `CONTACT_MALWARE_SCANNER_TOKEN`
are set (`CONTACT_MALWARE_SCANNER_TIMEOUT_MS` is optional). In that mode up to
five PDF, PNG, JPG/JPEG, WebP or TXT files (10 MB combined) are uploaded with
signed URLs into the private `contact-uploads` bucket, checked for count, size,
manifest, MIME type and byte signature, then sent one by one to the scanner
(`lib/contact/malware-scanner.server.ts`).

The scanner contract is small: multipart field `file` in,
`{"status":"clean"}` or `{"status":"infected"}` out. Only `clean` reaches
email; infected files, timeouts, bad responses and provider errors all fail
closed. No scanner vendor has been chosen. Before enabling attachments, choose
an EU-hosted provider with a signed DPA and no file retention, test it with
EICAR in isolation, and update [the privacy inventory](privacy-data-inventory.md)
and the public `/privacy` page first.

## Secrets and history

CI scans the full reachable Git history with pinned Gitleaks
(`npm run test:secrets:gitleaks`) and the project-specific
`scripts/scan-git-history.sh` (`npm run test:secrets`). Output is redacted to
finding type, object and path. Any credential found anywhere must be revoked
and rotated at the provider; rewriting history alone is not enough, because
old clones, forks and pull-request refs can keep old objects.

## Licenses and provenance

The code is publicly visible but proprietary ("All rights reserved" in
[`LICENSE`](../LICENSE), `"license": "UNLICENSED"` in `package.json`); do not
describe the repository as open source. Asset rights are in
[`ASSETS_LICENSE.md`](../ASSETS_LICENSE.md) and third-party material in
[`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md).

`npm run test:licenses` inventories every package in `package-lock.json` and
fails on a missing license or GPL, AGPL or SSPL. It is a screening step: new
fonts, images, icons or copied code still need a human check of origin and
license. Skills icons are recorded with source URL and SHA-256 in
[`skill-icon-sources.json`](skill-icon-sources.json), which the app also uses
as its icon allowlist.
