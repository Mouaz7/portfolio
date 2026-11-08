# Privacy data inventory

Provider/deployment evidence date: 2026-09-13. Inventory updated for feature removal: 2026-10-24. Anonymous error reports added: 2026-11-07.

This inventory separates behavior proven by the repository from behavior that
still needs production or contractual evidence. It is the source for the
public `/privacy` copy; unverified retention promises and inactive recipients
must not be copied into the public notice.

| Data or identifier | Purpose | Storage / current recipient | Verified lifecycle | Evidence state |
| --- | --- | --- | --- | --- |
| Theme preference | Display the selected color theme | Browser `localStorage` | Remains until the visitor changes it or clears browser storage | Verified in code |
| Locale preference | Keep the selected language | First-party cookie | Cookie `maxAge` is one year | Verified in proxy |
| Signed security session | Bind protected requests to a browser session | HTTP-only first-party cookie; digest-derived server identifiers | Cookie `maxAge` is 24 hours; server quota/lease rows expire independently | Verified in code and migrations |
| Contact name, email and message | Deliver and protect a contact request | Private Supabase rows, then the configured SMTP service and recipient mailbox | Prepared submission validity is 15 minutes. A daily cleanup selects expired rows older than two hours in batches of 100. No guaranteed maximum deletion time is established. | Code verified; production schedule and backlog monitoring still require operational evidence |
| Hashed session/network identifiers | Abuse prevention and concurrency/rate controls | Private Supabase quota and lease rows | Rows carry expiries and expired rows are removed during protected database operations | Verified in code and migrations |
| Contact email after delivery | Receive and answer the message | Configured email service and recipient mailbox | No automated 12-month deletion rule is verified | Mailbox operation unverified |
| Technical page-performance data | Measure page performance | Vercel Speed Insights when `VERCEL=1` | No repository-controlled retention period is claimed | Production HTML and code presence verified; contractual retention not verified here |
| Vercel Web Analytics page views | Count visits to pages | Vercel Web Analytics when `VERCEL=1` (`<Analytics />` in `app/layout.tsx`) | No repository-controlled retention period is claimed | Code presence verified; described in the public `/privacy` notice |
| Anonymous error reports | Find failures on devices that cannot be tested directly | `POST /api/client-report` writes one `client.report` line to the server log (Vercel logs): error kind, cleaned message (max 160 chars; e-mail, URL, query, user path, IP, phone, token and long-number patterns removed), page path, browser family + major version and OS family derived server-side from the User-Agent. No database. The app fetch omits cookies and the referrer; the ES5 simple-mode notice (XHR, once per session) carries the browser's normal same-origin cookies and referrer, which the route does not read. The platform's own request log (IP, User-Agent, referrer) applies as for every request | Rate limiting keeps an HMAC (random per-instance key, IPv6 reduced to /64) in instance memory with a 10-minute window; expired entries are dropped on a later report and all entries disappear when the server instance stops. Log retention follows the hosting plan; no repository-controlled period is claimed | Verified in code and unit tests; production log retention not verified here |
| Contact attachments | Future contact delivery with quarantine and malware scanning | Private `contact-uploads` bucket and a future external scanner | Disabled unless the feature flag and scanner configuration are present. No scanner is an active recipient under this inventory. | Disabled-by-default code verified; vendor not selected |

## Release checks

- Verify the production environment and deployed HTML before naming an
  email, analytics, hosting or malware-scanning recipient publicly.
- Verify that the daily contact cleanup is enabled, monitored and keeping pace
  before publishing a maximum deletion promise.
- Verify a mailbox deletion rule or controlled manual process before publishing
  a fixed email-retention period.
- Update the public notice and this inventory before enabling an attachment
  scanner or another new recipient.
- Record the reviewer, date, evidence and any exception in the release record.

This document is operational evidence, not a substitute for legal review.
