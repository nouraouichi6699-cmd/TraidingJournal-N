-- GLORIA_RPG: scheduled hero assignment. The hero used to be recomputed live from the current month's trades on
-- every page load; it is now computed on a schedule (weekly, and whenever a new calendar month starts) and
-- PERSISTED, so it stays fixed in between. See src/services/gloriaHeroSchedule.ts / gloriaHeroService.ts.
--
--   gloria_player_stats (extended)
--     active_character          the hero currently assigned (a gloria_characters id); null until the first sync
--     active_character_snapshot jsonb: { month, stats, radar, elfMeter, secondary, reason } -- what justified the pick
--     character_checked_at      when the last scheduled update ran; the due-check compares it to now (>= 7 days, or
--                               an earlier calendar month). It also serves as an optimistic-concurrency token:
--                               the client only writes when this still holds the value it read, so two tabs
--                               racing for the same update cannot both win (and cannot double-log history).
--     is_starter_character      true while the hero is the free Savage given to a player with no closed trades
--     character_reveal_pending  true after an update changed the hero, until the player dismisses the reveal
--     previous_character        the hero before the last change (shown in the reveal)
--
--   gloria_character_history (new): one row per scheduled update, the "trophy case".
--
-- Additive only: no existing column or row is changed or dropped. Existing players get their first assignment the
-- next time they open Gloria. Not applied automatically: run it in the Supabase SQL editor, after
-- 20261114_gloria_rpg.sql and 20261114_gloria_characters_reseed.sql.
-- Rollback (loses the hero history):
--   drop table if exists public.gloria_character_history;
--   alter table public.gloria_player_stats
--     drop column if exists active_character, drop column if exists active_character_snapshot,
--     drop column if exists character_checked_at, drop column if exists is_starter_character,
--     drop column if exists character_reveal_pending, drop column if exists previous_character;

alter table public.gloria_player_stats
  add column if not exists active_character          text references public.gloria_characters(id) on delete restrict,
  add column if not exists active_character_snapshot jsonb,
  add column if not exists character_checked_at      timestamptz,
  add column if not exists is_starter_character      boolean not null default false,
  add column if not exists character_reveal_pending  boolean not null default false,
  add column if not exists previous_character        text references public.gloria_characters(id) on delete restrict;

create table if not exists public.gloria_character_history (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  character_id       text not null references public.gloria_characters(id) on delete restrict,
  secondary_id       text references public.gloria_characters(id) on delete restrict,
  previous_id        text references public.gloria_characters(id) on delete restrict,
  kind               text not null check (kind in ('starter', 'initial', 'weekly', 'monthly')),
  changed            boolean not null default false,
  assigned_at        timestamptz not null default now(),
  stats_snapshot     jsonb not null default '{}'::jsonb
);

create index if not exists gloria_character_history_user_idx on public.gloria_character_history (user_id, assigned_at desc);

alter table public.gloria_character_history enable row level security;
drop policy if exists own_rows on public.gloria_character_history;
create policy own_rows on public.gloria_character_history for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
