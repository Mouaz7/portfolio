-- Removes schema that nothing in the application uses any more.
--
-- * public.site_cv and public.profile: read only by the AI indexer removed in
--   20261024121521_remove_code_review_ai.sql (profile was never read). Export
--   both tables before running this in production (see docs/database.md).
-- * the pgvector extension: everything that used it (embeddings, the search
--   function and its index) was removed in the same migration.
-- * public.skill_category.accent_rgb: never read.
--   (public.skill.icon_bucket follows in 20261108120100 after the code that
--   stopped reading it is deployed.)
-- * three indexes duplicated by wider indexes on the same tables.
--
-- RESTRICT everywhere: if anything unexpected still depends on one of these
-- objects, the whole migration stops and nothing is removed.

begin;

drop table if exists public.site_cv restrict;
drop table if exists public.profile restrict;

drop extension if exists vector restrict;

alter table public.skill_category drop column if exists accent_rgb restrict;

-- Covered by skill_active_category_sort_order_idx (is_active, category, sort_order, created_at).
drop index if exists public.skill_category_sort_idx;
-- Covered by journey_item_active_date_idx (is_active, start_date desc, sort_order).
drop index if exists public.journey_item_start_date_idx;
-- Covered by contact_social_active_sort_order_idx (is_active, sort_order).
drop index if exists public.contact_social_active_sort_idx;

commit;
