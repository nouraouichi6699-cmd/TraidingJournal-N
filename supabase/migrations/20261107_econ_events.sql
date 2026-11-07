-- Economic calendar events persisted by the news function (service role writes only).
-- Authenticated users may select; no client writes.

create table if not exists public.econ_events (
  id          text        primary key,
  time        timestamptz not null,
  currency    text        not null,
  title       text        not null,
  impact      text        not null,
  previous    text        not null default '',
  forecast    text        not null default '',
  actual      text        not null default '',
  updated_at  timestamptz not null default now()
);

alter table public.econ_events enable row level security;

drop policy if exists econ_read on public.econ_events;
create policy econ_read on public.econ_events
  for select to authenticated using (true);
