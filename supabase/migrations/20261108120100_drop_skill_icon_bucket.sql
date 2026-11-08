-- Apply only after the release that stops selecting public.skill.icon_bucket
-- (lib/skills/data.server.ts) is live: earlier deployments still read it.
-- Skills icons are self-hosted (20260828121000_self_host_skill_icons.sql), so
-- the column has been empty and unused since then.

begin;

alter table public.skill drop column if exists icon_bucket restrict;

commit;
