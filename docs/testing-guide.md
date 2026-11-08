# Testing Guide

Unit and component tests use Jest, React Testing Library and `jest-environment-jsdom` (`__tests__/`). Browser tests use Playwright with axe (`tests/e2e/`). Database policies are tested with pgTAP (`supabase/tests/`) in CI.

## Commands

```bash
npm run test:ci
npm run test:coverage
npm run verify        # lint (no warnings), tsc, knip, design lock, Jest with coverage
npm run verify:full   # verify + production build + Playwright
```

`npm run test` starts Jest in watch mode.

`npm run test:ci` enforces coverage thresholds in `jest.config.js`: per-directory floors for `lib/contact/`, `lib/security/`, `app/api/contact/` and `lib/i18n/`, plus a `global` floor that Jest applies only to the remaining files. Coverage is collected from `app/`, `components/`, `hooks/` and `lib/` (including `lib/background/`).

## Setup Files

| File | Purpose |
| --- | --- |
| `jest.config.js` | Next/Jest integration, path aliases, coverage collection. |
| `jest.setup.js` | Test environment variables and browser mocks. |
| `__tests__/` | Component, API, utility, and i18n dictionary tests. |

## Test Environment

`jest.setup.js` provides test defaults for:

- a test Supabase URL and read key
- `CONTACT_TO`
- browser APIs used by responsive and animated components

This keeps tests from requiring real production secrets.

## Dependency Overrides

The development-tool overrides replace Next ESLint's `fast-glob` dependency with `tinyglobby`, preserving its `globSync`/`onlyDirectories` API while removing the unpatched `braces` chain (GHSA-vfj7-8cjw-p6xm). The NYC config loader uses `js-yaml` 4.3.2 through its existing `load` API, removing the legacy `argparse`/`sprintf-js` chain. Tooling compatibility tests cover both overrides.

## What To Test

| Area | Good checks |
| --- | --- |
| Components | Render states, labels, navigation, responsive behavior. |
| API routes | Success shape, validation failures, missing backend errors. |
| Utilities | Pure mapping logic, validation, graph derivation. |
| i18n | Every locale has the English keys, no empty strings, and the same `{placeholder}` names per message. |

## Patterns

- Prefer accessible queries such as `getByRole` and `getByLabelText`.
- Mock network calls close to the component that owns them.
- Keep Supabase and SMTP calls out of unit tests unless explicitly mocked.
- Test pure helpers directly. `lib/journey/deriveGitGraph.ts` is a good example.

## Before Opening a PR

Run `npm run verify` and `git diff --check`. Together they match the CI `static` job (whitespace check, ESLint with no warnings, `tsc`, Knip, the design lock and Jest with coverage). `npm run verify:full` adds the production build and the Playwright suite; stop any dev or production server on port 3000 first.

## Before/after visual comparison

`npm run test:visual-compare` (`scripts/compare-visual.mjs`) screenshots the same pages from two running builds and reports every changed pixel. Start the baseline and candidate production servers against the same data, then run:

```bash
VISUAL_BASE_A=http://127.0.0.1:3101 VISUAL_BASE_B=http://127.0.0.1:3102 npm run test:visual-compare
```

Each route, locale (en/sv/ar), viewport and theme is captured twice: `content` mode hides the WebGL background, and `background` mode keeps it visible as a frozen reduced-motion frame. `VISUAL_ROUTES`, `VISUAL_LOCALES`, `VISUAL_VIEWPORTS`, `VISUAL_MODES` and `VISUAL_OUTPUT` narrow or redirect the run. It complements, and does not replace, the CI pixel lock (`npm run test:pixel-lock`).

## End-to-end tests

Install the browser engines once with `npx playwright install --with-deps chromium firefox webkit`. `npm run test:e2e` starts the production server (`npm start`) on port 3000, so run `npm run build` first.


`tests/e2e/fixtures.ts` exports `allowLoopbackHttp(page)`, which removes only the CSP `upgrade-insecure-requests` directive from navigations to the HTTP-only loopback server so WebKit can load local assets. Use it instead of copying the route handler into new specs.

## Browser Layout Matrix

Playwright specs live in `tests/e2e/`. Shared routes, viewports and image helpers are in `tests/e2e/helpers/public-pages.ts`.

| Spec | Covers |
| --- | --- |
| `accessibility.spec.ts` | axe checks, pixel-lock screenshots for every route and theme, 400 % reflow, forced colours, focus handling and the privacy page. |
| `responsive-layout.spec.ts` | Bounded layouts on ultrawide, short, zoomed and high-DPR screens. |
| `responsive-matrix.spec.ts` | Per-page fit across phone, tablet and desktop sizes. |
| `header-layout.spec.ts` | Header spacing, colours and compact navigation. |
| `contact.spec.ts` | Contact layout, validation and submission (network mocked; no mail is sent). |
| `skills.spec.ts`, `skills-first-paint.spec.ts` | Skills icons and first paint before hydration. |
| `skill-project-navigation.spec.ts` | Skill icons open the matching project category. |
| `projects-rtl.spec.ts` | Arabic Projects cards. |
| `localization.spec.ts` | Swedish and Arabic pages and language switching. |
| `background-appearance.spec.ts`, `background-lifecycle.spec.ts`, `weak-device.spec.ts` | The shared WebGL background on phones, tablets and desktops, theme switching, fallbacks and recovery. |
| `browser-compatibility.spec.ts` | Firefox/WebKit checks for background, menu and contact validation. |
| `legacy-mode.spec.ts` | Simple mode for old browsers and pages without JavaScript. |
| `legacy-routes.spec.ts` | Permanent redirects for old public URLs. |
| `routes-and-security.spec.ts` | Routing, navigation, server preloading and security headers. |

Together they protect the responsive layout:

- compact laptops: 800×600, 900×600, 1024×600, 1024×768, 1280×720, 1366×768;
- short and split-screen desktop windows: the reported Windows viewport at 1723×608 plus 1723×450, 1366×500/600, 1024×550, and 800×450;
- portrait tablets and foldables: 712×1138, 768×1024, 853×1280, 912×1368, 960×1440, 1032×1376;
- compact display: 1280×800;
- wide displays: 1920×1080, 2560×1440, 3440×1440, 3840×2160;
- browser-zoom equivalents: 853 px at 150%, 640 px at 200%, and 320 px reflow at 400%.

The matrix checks horizontal and document-height overflow, bounded and centered ultrawide content, light/dark theme stability, compact-header switching, accessible contact-form validation focus, and Windows High Contrast (`forced-colors`) focus visibility. Short-window checks assert that every page root remains inside the viewport, every Skills and Journey card remains inside its fitted stage, Projects keeps its intentional internal panels reachable, and Contact shows its portrait, send control, command strip, copyright, and logo without document scrolling. A live-resize regression changes Contact from `fit` to `accessible-overflow` and back without reloading. The 1366×600 short-window path is exercised in Chromium, Firefox, and WebKit. QHD, ultrawide and 4K surfaces must occupy at least 65% of the CSS viewport, and paired DPR 1/DPR 2 checks confirm that physical pixel density does not alter CSS geometry.

Large-display density profiles require both substantial width and height. They activate at 2200×1000 CSS pixels and step up again at 3200×1400. This keeps QHD/4K monitors at 100% scaling readable while a 4K monitor at 200% scaling (roughly a 1920 CSS-pixel viewport) correctly receives the standard desktop composition.

Skills has explicit large-display assertions in addition to the shared matrix. The wide, extra-wide, and ultra-wide profiles require progressively larger cards and square icon canvases at 1440, 1920, 2560, and 3840 px, while the phone/tablet checks keep every icon canvas equal, clipped, interactive, and free from horizontal overflow.

## Loading and background regression checks

Server-provided Skills, Journey and Projects data (including empty arrays) must render without a page loader or duplicate primary-data request. Client fallback requests show the existing loader only while pending; Skills waits for both categories and skills. No minimum-duration loading timer is used.

Contact submission and CV download retain their real pending states. Request-abort timeouts, success-message timers and visual animation timers do not impose a minimum loading duration.

The background regression checks include touch laptops at 1366×768 and a simulated four-core desktop. Every tier targets 60 FPS (`BACKGROUND_TARGET_FPS` in `lib/background/profile.ts`). The shader depends only on mobile versus desktop; constrained desktops keep the desktop shader with a smaller field and fewer keyframes. Background measurements in headless Chromium do not establish behavior on every physical GPU.

Background lifecycle tests cover live reduced-motion changes, profile changes in both directions, actual main-thread WebGL context loss/restoration and worker startup timeout with late-message rejection. Workers have a five-second startup/recovery deadline; failures release worker listeners and retain the themed CSS fallback. Motion and visibility listeners remain available for that fallback until unmount. Firefox/WebKit run the targeted compatibility suite; the full visual baseline remains Chromium-specific.

Skills retains its 900 ms animation and 120 ms card staggering on standard devices. Memoized cards avoid unrelated rerenders, and opacity/filter animation hints are released on completion, cancellation or motion-setting changes. Low-memory, four-core and data-saver profiles render the final layout immediately while suppressing animated blur: profiling confirmed that a delayed transform kept an ordinary card description out of the LCP candidate set until the entrance finished. The static card background and backdrop blur are unchanged. Low-power cards retain an identity transform because removing the compositing layer clipped text and icons inside the viewport-scaled stage in Chromium. Animated standard-device cards retain their transform hint for the same rasterization reason. The intentional visual entrance is separate from data loading.

Protected interactive requests must also terminate predictably: Turnstile script loading stops after eight seconds, and an invisible challenge stops after ten seconds. Tests must prove that these paths restore the button from its pending state instead of leaving an indefinite loader.

Run `PERF_BASE_URL=http://127.0.0.1:3000 npm run test:motion-performance` against a production server. It measures the canonical Home and Skills routes three times with motion enabled, 4× CPU slowdown, four-core/4 GB browser hints, 150 ms latency and 1.6 Mbit/s download throughput. The matching hardware hints are important: DevTools CPU throttling does not change `hardwareConcurrency` or `deviceMemory`, so omitting them would exercise the standard-power UI path while calling the result a constrained-device measurement. Reports include LCP, observed layout shifts, long tasks, excess long-task duration and frame intervals; the blocking metric covers the full observation window and is not Lighthouse TBT. Store a before report using `PERF_OUTPUT`, then pass it as `PERF_BASELINE` for comparison on the same machine and data. The comparison fails when the median LCP/blocking increase exceeds both 15% and 100 ms and all three candidate values are worse than all three baseline values. Overlapping three-run ranges are reported as inconclusive runner noise rather than a regression. Median CLS must remain at or below 0.05. Reports are stored outside Playwright's cleared output directory in `.performance-results/`.

The motion report also identifies the final LCP element and its header/main region, the first visible Skills grid frame, and encoded document/script/style/image resource sizes. `PERF_VIEWPORT=390x844 PERF_MOBILE=1` selects the mobile profile; compare reports with identical profile settings. Grid visibility uses the same 15%/100 ms regression thresholds and non-overlapping-run rule as LCP/blocking. Total emitted build JavaScript is distinct from the bytes transferred for one page.

Removing a large header label can change the winning LCP element without delaying page content. The relative LCP gate treats that narrow case as non-comparable only when the baseline header winner is stable and the new main-content winners have the same tag, class and positive area. Equal-area skill SVGs may alternate as the winner. Every candidate grid must appear earlier than every baseline grid, the grid median must improve by more than 15% and 100 ms, and every candidate LCP run must be at most 2,500 ms. It emits an explicit warning; blocking, grid and CLS gates remain enforced. Other LCP regressions retain the existing thresholds. Unit tests reproduce the CI measurements and verify that unrelated LCP, blocking, grid and CLS regressions still fail.

The CI baseline wrapper discovers the historical checkout's own security-secret names and supplies missing disposable values only to its build/server subprocesses. This lets older revisions build after configuration requirements have been retired, without restoring those settings to the current application or global CI environment. No secret values are logged.

Lighthouse audits the canonical Home, Skills, Projects and Contact routes with normal motion. Journey retains its existing reduced-motion diagnostic in a separately named report: its animated mobile graph produces `NO_LCP` in Lighthouse despite visible content. The separate normal-motion desktop measurement still requires an actual Journey LCP. The `?audit=performance` page mode is an animation-suppressed diagnostic; Lighthouse does not use it, and it must not stand in for normal page loading. `skills-first-paint.spec.ts` holds application scripts while streamed HTML and CSS render, compares pre-hydration geometry with the measured layout, and checks the hidden fallback in browsers without the required CSS support. It runs in Chromium, Firefox and WebKit, including Arabic RTL and short-phone overflow.

Physical Windows scaling (125 to 150%), native browser zoom and vendor-specific GPU behavior require a Windows/device check. CSS viewport emulation and CPU throttling are not substitutes for those checks.

CI builds the unchanged PR base (or the current commit's parent) in `.motion-baseline/`, then measures baseline and candidate sequentially on the same runner against the same isolated test data. A root commit has no historical reference and runs the candidate's absolute CLS gate. `PERF_RECORD_BASELINE=1` records an available historical reference without applying candidate-only absolute gates; the candidate still enforces CLS ≤ 0.05 and all available regression limits. Reports are retained. `PERF_SERVER_ROOT` selects an already-built baseline when using `node scripts/run-motion-ci.mjs` locally; it does not change which measurement script runs.

Each Supabase CI job prepares a private temporary work directory with a unique project ID and available API, database and shadow-database ports. It copies the repository migrations, pgTAP tests and seed without linked-project metadata. API, Auth and Storage remain enabled; unused Studio, mail capture, analytics, edge runtime and pooler services are disabled only in that temporary configuration. All CLI commands use the private work directory, resets explicitly target the local database, and final cleanup stops only that job's stack. A unit test occupies the original database port and simulates a second stack to verify isolation; the repository's local configuration remains unchanged.

## Design lock and pixel lock

`npm run test:design-lock` (`scripts/check-design-lock.mjs`, part of `npm run verify`) compares SHA-256 hashes of presentation components, page CSS, fonts and key images with approved values, and checks the Skills icons against `docs/skill-icon-sources.json`. A failure means a locked file changed; review it visually before updating the hash.

`npm run test:pixel-lock` (`scripts/check-pixel-lock.mjs`) checks the 30 Playwright screenshots written to `test-results/visual-actual/` by `accessibility.spec.ts` (every route, phone/tablet/desktop, light/dark). A screenshot passes when its exact hash, its perceptual hash or its geometry signature (small Hamming tolerance for SVG rasterization) matches. Only the live repository-statistics line on the first Projects card is masked, because it depends on GitHub. Refresh references only after the complete light/dark viewport set has passed the accessibility checks and been reviewed at native resolution, and keep masks and tolerances unchanged unless that review justifies it.

## Performance targets

Keep local smoke measurements and production field data apart.

- **Local navigation:** `npm run test:navigation-performance` clicks Skills, Journey, Projects and Contact five times against a local production server and reports median time to URL change (target under 200 ms) and to visible route content (target under 500 ms). `NAVIGATION_BASE_URL` points it at a deployed preview; `NAVIGATION_OUTPUT` writes a report file (default: stdout). These are local observations, not field data.
- **Production Core Web Vitals:** LCP ≤ 2.5 s, INP ≤ 200 ms and CLS ≤ 0.1 at p75, separately for mobile and desktop, over a rolling 28-day window of real-user data from Vercel Speed Insights. With too little traffic, report "insufficient field data"; Lighthouse results are diagnostics, not a substitute.
