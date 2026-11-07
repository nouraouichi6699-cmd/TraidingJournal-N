-- Per-user economic calendar history read from MetaTrader 5 by the MizanSync EA (mt5-sync, "calendar" action).
-- MetaQuotes calendar data is scoped to the MT5 terminal that reported it: never shown to another user.
-- Writes come only from the mt5-sync function (service role, which bypasses RLS); there is no client write policy.

create table if not exists public.econ_events_mt5 (
  user_id     uuid        not null references auth.users(id) on delete cascade,
  id          text        not null,
  time        timestamptz not null,
  currency    text        not null,
  title       text        not null,
  impact      text        not null,
  previous    text        not null default '',
  forecast    text        not null default '',
  actual      text        not null default '',
  updated_at  timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists econ_events_mt5_user_time_idx on public.econ_events_mt5 (user_id, time);

alter table public.econ_events_mt5 enable row level security;

drop policy if exists econ_events_mt5_read on public.econ_events_mt5;
create policy econ_events_mt5_read on public.econ_events_mt5
  for select to authenticated using (auth.uid() = user_id);
