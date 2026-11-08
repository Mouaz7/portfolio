# Deployment and CI

The site runs on Vercel (region `dub1`, set in `vercel.json`) and deploys
through Vercel's Git integration. GitHub Actions validates every change but
never deploys and stores no Vercel token.

## Making a change

`main` is protected, so every change goes through a pull request:

1. Create a branch from `main` and commit the change.
2. Run `npm run verify` and `git diff --check` locally.
3. Open a pull request to `main`. Vercel builds a preview, and the five
   required checks run (see [GitHub repository settings](#github-repository-settings)).
4. When every check is green, squash-merge. The branch is deleted
   automatically.
5. Vercel deploys `main` to production. Run the checks in
   [Vercel](#vercel) (after a deployment).

## Environment

[`.env.example`](../.env.example) is the maintained variable reference; real
`.env*` files are ignored by Git. Production needs at least:

```bash
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
CONTACT_TO=
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
SMTP_SECURE=false
RATE_LIMIT_PEPPER=
SESSION_COOKIE_SECRET=
CRON_SECRET=
REVALIDATE_SECRET=
CV_STORAGE_BUCKET=private-cv
CV_STORAGE_OBJECT="cv/Cv .pdf"
```

The four security/automation secrets (`RATE_LIMIT_PEPPER`,
`SESSION_COOKIE_SECRET`, `CRON_SECRET`, `REVALIDATE_SECRET`) must be
independently generated, unique, non-placeholder values of at least 32 UTF-8
bytes (`openssl rand -hex 32`). `lib/security/production-config.ts` refuses to
start sensitive server modules otherwise; its errors name variables, never
values. Turnstile keys are optional. Contact attachments stay off unless
`CONTACT_ATTACHMENTS_ENABLED=true` and a scanner are configured (see
[Security](security.md#contact-attachments)).

## Vercel

1. Import the GitHub repository into Vercel and keep its Git integration
   linked.
2. Add the environment variables for Preview and Production separately.
   Preview and Production use separately scoped automation secrets.
3. Work on a branch, open a pull request and let the checks and the Vercel
   preview pass. Pushes to `main` create the production deployment; do not
   push to `main` directly.

`vercel.json` also registers the Production cron job
`/api/internal/contact-cleanup` at `0 3 * * *`, authenticated with
`Authorization: Bearer <CRON_SECRET>`.

After a deployment, check:

- `/api/health` returns `{ "ok": true }`;
- `/api/internal/health` rejects unauthenticated requests and passes the
  Supabase check with the `CRON_SECRET` bearer token;
- `/api/cv` serves the PDF with `ETag`/`Last-Modified` and returns `304` for
  matching validators ([Database](database.md#private-cv));
- the main routes load in all three languages. Keep the previous successful
  deployment available for rollback.

Recommended Vercel WAF rate limits (create in log mode, inspect traffic, then
enforce with HTTP 429):

| Route | Limit |
| --- | ---: |
| `/api/contact/prepare`, `/api/contact/send` | 10 requests/minute/IP |
| `/api/github/repo-stats` | 30 requests/minute/IP |
| `/api/health`, `/api/internal/health` | 60 requests/minute/IP |

### Other hosts

The app is a normal Next.js server app (`npm ci`, `npm run build`,
`npm run start` on Node 22.x); do not convert it to a static export, because
the API routes, CV download and contact email need a server. Vercel and
Netlify client-IP headers are recognized automatically. Behind another reverse
proxy, set `TRUSTED_PROXY_IP_HEADER` only when that proxy strips incoming
copies of the header and writes it itself.

## Continuous integration

Four workflows live in `.github/workflows/`.

### Quality (`ci-cd.yml`)

Runs on pushes to `main` and on pull requests to `main`. Superseded runs
are cancelled for pull requests only; every commit on `main` runs in its own
concurrency group and gets a complete verdict. Every job installs with `npm ci` on Node 22, and the Playwright
browsers are cached between runs.

| Job | What it checks |
| --- | --- |
| `database` | Resets an isolated Supabase database and runs the pgTAP policy tests in `supabase/tests/`. |
| `static` | `git diff --check`, ESLint (`--max-warnings=0`), TypeScript, Knip, the design lock and Jest with coverage thresholds. Same as `npm run verify`. |
| `security` | Production and full dependency audits, Gitleaks plus `scripts/scan-git-history.sh` over the reachable history, and the dependency-license inventory. |
| `quality` | Starts after `static`: isolated Supabase with random CI-only secrets, production build (with `.next/cache` restored), Playwright with accessibility and pixel-lock checks, Lighthouse CI and a motion comparison against the base commit on the same runner. |

Lighthouse gates: performance ≥ 0.80; accessibility, best practices and SEO
≥ 0.90; median LCP ≤ 2.5 s, TBT ≤ 250 ms, CLS ≤ 0.05. Screenshots, the
Playwright report, motion measurements and Lighthouse reports are kept as
private workflow artifacts for seven days. Details are in the
[testing guide](testing-guide.md).

### Other workflows

- `pr-checks.yml` validates semantic pull-request titles and reports the size
  of the change.
- `codeql.yml` runs CodeQL for JavaScript/TypeScript on pushes, pull requests
  and weekly. The analysis job is skipped while the repository is private.
- `uptime.yml` checks `https://mouazdev.vercel.app/api/health` every six
  hours; GitHub e-mails the owner when a scheduled run fails. GitHub pauses
  scheduled workflows after 60 days without repository activity.

Dependabot (`.github/dependabot.yml`) opens weekly pull requests for npm and
GitHub Actions; npm patch and minor updates are grouped, majors arrive one at a
time.

### Project synchronization

Projects are synchronized locally with `npm run sync:projects` (see
[Database](database.md#project-sync)). Afterwards, call
`/api/internal/revalidate` for the `projects` tag (or wait for the cache
window) so the site shows the new projects.

## GitHub repository settings

These are owner settings in GitHub, not code. Verify them rather than assume:

- protect `main`: require pull requests and these checks (branch protection
  matches the check names, not the job ids): `Isolated migrations and pgTAP`,
  `Lint, types, dead code, design lock and unit tests`, `Dependency audits,
  secret scans and licenses`, `Build, browser, Lighthouse and motion` and
  `Analyze JavaScript and TypeScript`; plus conversation resolution, no force
  pushes and no deletion;
- enable secret scanning and push protection;
- keep exactly one CodeQL setup: if the workflow is used, disable GitHub's
  Default setup;
- fork pull requests get read-only permissions and no secrets.
