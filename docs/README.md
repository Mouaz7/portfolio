<p align="center">
  <img src="../public/brand/mouaz-logo.svg" width="64" alt="Mouaz Naji logo" />
</p>

<h1 align="center">Documentation</h1>

<p align="center">
  Everything needed to understand, run and maintain the portfolio.<br />
  New here? Start with the <a href="../README.md">project README</a> for an overview and local setup.
</p>

---

## 📖 Guides

| | Document | Read it when you want to know about |
| :-: | :-- | :-- |
| 🏗️ | **[Architecture](architecture.md)** | How the site is built: routing and languages, rendering, the WebGL background, theme and styling, data flow, API routes and the security design. |
| 🗄️ | **[Database](database.md)** | Supabase tables, migrations, translations, the private CV, project sync, cache revalidation and the 2026-11 schema cleanup. |
| ☁️ | **[Deployment and CI](deployment.md)** | Environment variables, Vercel, checks after a deploy, the GitHub Actions workflows and repository settings. |
| 🧪 | **[Testing guide](testing-guide.md)** | Jest and Playwright, the design and pixel locks, visual comparisons, performance checks and targets. |
| 🔒 | **[Security](security.md)** | The Content Security Policy, contact attachments and malware scanning, secret scanning, licenses and provenance. |
| 🛡️ | **[Privacy data inventory](privacy-data-inventory.md)** | Every piece of data the site handles. It is the source for the public `/privacy` page. |

## 🧩 Data files

| File | What it is |
| :-- | :-- |
| [`skill-icon-sources.json`](skill-icon-sources.json) | Source URL and SHA-256 for every Skills icon. Read by the app and the design lock — it is data, not prose. |
| [`assets/`](assets) | Screenshots used in the project README. |

## ✅ Before you push

```bash
npm run verify        # lint, types, unused code, design lock and unit tests
npm run verify:full   # verify + production build + browser tests
```

<p align="center"><sub><a href="../README.md">← Back to the project README</a></sub></p>
