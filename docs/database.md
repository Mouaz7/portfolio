# Database

The app uses Supabase for Postgres and Storage files. All runtime content tables are covered by tracked migrations.

## Tracked Migrations

`supabase/migrations/20260705_create_project_table.sql` creates `public.project`.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key, generated with `gen_random_uuid()`. |
| `title` | `text` | Required project title. |
| `description` | `text` | Defaults to empty string. |
| `category` | `text` | Used for UI grouping. |
| `github_url` | `text` | Required and unique. |
| `languages` | `text[]` | Defaults to empty array. |
| `cover_image_href` | `text` | Optional local or remote icon path. |
| `is_active` | `boolean` | Controls visibility. |
| `sort_order` | `integer` | Primary display order. |
| `created_at` | `timestamptz` | UTC timestamp. |

The migration also creates an index on `(is_active, sort_order, created_at desc)`.

`supabase/migrations/20260727_dynamic_content_management.sql` adds data-managed Home profile, role and capability content, and adds safe ordering/visibility fields to Skills, Journey, contact links and projects. It is additive and preserves existing rows. It also created `site_cv` and `profile`, which the app no longer reads; `20261108120000_drop_unused_schema.sql` drops them.

The local `supabase/migrations/20260923185543_add_cpp_teaching_assistant_2026_2027.sql` adds a separate C++ Teaching Assistant appointment for September 2026 to June 2027 and Swedish/Arabic translations. It does not replace the September 2025 to June 2026 row. The seed includes both periods; this file's presence is not proof that the migration has run on a remote database.

## Runtime Tables

These tables are created by the dynamic-content migration.

| Table | Used by | Minimum fields read by code |
| --- | --- | --- |
| `skill` | `/api/skills` | `id`, `name`, `category`, `icon_path`, `icon_path_light`, `icon_alt`, `mono`, `created_at` |
| `skill_category` | `/api/skill-categories` | `name`, `title`, `blurb` |
| `journey_item` | `/api/journey` | `id`, `title`, `details`, `start_date`, `end_date`, `icon_bucket`, `icon_path`, `icon_alt` |
| `contact_social` | `/api/contact` | `id`, `name`, `href`, `svg_path`, `viewbox`, `is_active`, `sort_order` |
| `site_profile` | `/api/internal/health` | `id` |
| `content_translation` | Localized content APIs | `entity_type`, `entity_id`, `locale`, `fields` |

## Localized content

`supabase/migrations/20260811120000_add_content_translations.sql` adds Swedish (`sv`) and Arabic (`ar`) overrides for editable content. English remains in each source table. Fixed interface labels live in typed application dictionaries and therefore never add a database request to page rendering.

Translation rows use the source row ID and only the fields that can be localized. For example:

```sql
insert into public.content_translation (entity_type, entity_id, locale, fields)
values (
  'project',
  '<project uuid>',
  'sv',
  '{"title":"Projekttitel","description":"Projektbeskrivning"}'::jsonb
)
on conflict (entity_type, entity_id, locale) do update
set fields = excluded.fields, updated_at = timezone('utc', now());
```

Allowed entity types are `site_profile`, `home_role`, `home_capability`, `skill_category`, `project`, and `journey_item`. Public clients have read-only access through RLS; only the service role or a trusted database editor can write translations.

## Retired index cleanup

`supabase/migrations/20261024121521_remove_code_review_ai.sql` removes the retired AI index and its job locks. Apply it after deploying the application without the old routes and schedules. Historical migrations remain intact; portfolio content, private PDF storage and Contact security tables are preserved. A migration file in this repository is not proof of production application.

## Dropping the unused schema (2026-11)

Production was cleaned up on 2026-11-08, in one transaction in the SQL Editor:

- `20261024121521_remove_code_review_ai.sql` (the retired AI tables and functions; it had never run in production) and
- `20261108120000_drop_unused_schema.sql`: the unused tables `site_cv` and `profile`, the pgvector extension `vector`, the unused column `skill_category.accent_rgb` and three duplicate indexes (`skill_category_sort_idx` on `public.skill`, `journey_item_start_date_idx`, `contact_social_active_sort_idx`).

Both are recorded in `supabase_migrations.schema_migrations`. A private backup of every removed row was taken first and is kept outside the repository. The statements use `restrict`, so they stop instead of removing anything else that still depends on these objects.

**Still to run, after this release is deployed:** `20261108120100_drop_skill_icon_bucket.sql` drops `skill.icon_bucket`. Deployments before this release still select that column, so run it only once the new code is live, then record it:

```sql
insert into supabase_migrations.schema_migrations (version, name)
values ('20261108120100', 'drop_skill_icon_bucket');
```

**Migration history differs from the repository.** Several earlier migrations (for example the August to September 2026 Skills icon, Journey asset and contact-upload changes) are recorded under other names or not at all (they may have been applied by hand), so `supabase db push` would try to run them again. Apply new migrations by hand in the SQL Editor and record each one as above, or repair the history (`supabase migration repair`) before using `db push`.

## Storage

| Bucket/path | Purpose |
| --- | --- |
| `private-cv/cv/Cv .pdf` | Current private object downloaded by `/api/cv`; future replacements should use a versioned name. |
| `public/skill-icons/*` | Same-origin Skills icons; source and hash inventory is tracked in `docs/skill-icon-sources.json`. |
| Journey icon buckets | Optional logos used by `/api/journey`. |
| `contact-uploads` | Private, short-lived contact attachments uploaded with signed tokens. |

`/api/journey` can read optional Storage logos. Skills use same-origin paths and no external icon host at runtime. `/api/cv` requires the private bucket/object configured by `CV_STORAGE_BUCKET` and `CV_STORAGE_OBJECT`.

## Environment variables

[`.env.example`](../.env.example) is the maintained list. The app reads `SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_URL`, the publishable key (`SUPABASE_PUBLISHABLE_KEY`/`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) and the server-only `SUPABASE_SECRET_KEY`. Use the secret key only on the server or in CI, never in client code. Treat any credential found in Git, logs, screenshots or chats as compromised: revoke it at the provider before installing a fresh replacement.

## Private CV

`/api/cv` serves one PDF from the private bucket and object set by `CV_STORAGE_BUCKET` and `CV_STORAGE_OBJECT` (currently `private-cv` and `cv/Cv .pdf`). The PDF is never stored in Git. The server-only key downloads it; the bucket must have no public read policy. In Vercel, set the path separately for Preview and Production, without quotes, and redeploy after a change.

The route checks the `%PDF-` signature and returns `Content-Disposition: attachment; filename="Mouaz-Naji-CV.pdf"`, a strong SHA-256 `ETag`, `Last-Modified` and `Cache-Control: public, max-age=300, s-maxage=3600, stale-while-revalidate=86400`. Matching `If-None-Match` or `If-Modified-Since` requests get `304`.

To replace the CV without breaking rollback:

1. Upload the new PDF under a new, versioned object name.
2. Change `CV_STORAGE_OBJECT` in the deployment environment, deploy and invalidate the CDN cache.
3. Verify the download and a conditional request:

   ```bash
   curl -i https://mouazdev.vercel.app/api/cv
   curl -i -H 'If-None-Match: "<etag-from-first-response>"' https://mouazdev.vercel.app/api/cv
   ```

   The first must return a PDF, the second `304`.
4. Delete the previous object only after the new one is verified.

| Error | Fix |
| --- | --- |
| `Failed to fetch CV from storage` | Check Storage access and `SUPABASE_SECRET_KEY`. |
| `CV file not found` | Check the exact bucket and object path (case and spaces) in that environment. |
| `File is not a PDF` | Upload a real PDF whose bytes begin with `%PDF-`. |

## Project Sync

`npm run sync:projects` runs `scripts/sync-projects-from-github.mts`.

It fetches public repositories for `Mouaz7` and inserts newly discovered projects. Existing project title, description, category, order, visibility and icon fields remain owned by Supabase. `GITHUB_TOKEN` is optional but helps avoid GitHub rate limits.

How to refresh the site afterwards is described in [Deployment and CI](deployment.md#project-synchronization).

## Cache updates after Studio edits

Each content area has its own cache window (`REVALIDATE_SECONDS` in `lib/cache.ts`): projects and Home 30 minutes, skills and contact 60 minutes, journey 120 minutes. Every data-cache key also includes `CACHE_VERSION` (`lib/cached-loader.server.ts`), so a deploy that bumps it starts from fresh data. To publish a Supabase Studio edit immediately, create a Supabase Database Webhook that sends a `POST` request to `https://your-domain/api/internal/revalidate` with `Authorization: Bearer <REVALIDATE_SECRET>` and one of these payloads:

```json
{ "tags": ["home-content"] }
{ "tags": ["projects"] }
{ "tags": ["skills"] }
{ "tags": ["journey"] }
{ "tags": ["contact"] }
```

The endpoint accepts only these tags and rejects every request without the secret.
