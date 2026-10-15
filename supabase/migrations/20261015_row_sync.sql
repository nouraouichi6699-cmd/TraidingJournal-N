-- Row-based sync tables. Safe to run once; the old user_data table is left untouched.

-- Shared guard: clamp future timestamps, ignore stale writes (newest updated_at wins per row).
create or replace function public.sync_guard() returns trigger
language plpgsql as $$
begin
  if new.updated_at is null or new.updated_at > now() then
    new.updated_at := now();
  end if;
  if tg_op = 'UPDATE' and new.updated_at <= old.updated_at then
    return null; -- stale or duplicate write: keep the existing row
  end if;
  new.synced_at := clock_timestamp(); -- server-side pull cursor
  return new;
end $$;

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null,
  name text not null,
  currency text not null default 'USD',
  start_balance numeric not null default 0,
  login text,
  server text,
  created_at_ms bigint,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  synced_at timestamptz not null default clock_timestamp()
);

create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  account_id uuid not null references public.accounts(id) on delete cascade,
  no integer,
  symbol text not null,
  side text not null check (side in ('long','short')),
  qty numeric,
  entry_time text,
  entry_price numeric,
  exit_time text,
  exit_price numeric,
  pnl numeric,
  return_pct numeric,
  commission numeric not null default 0,
  sl numeric,
  tp numeric,
  status text not null check (status in ('open','closed')),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  synced_at timestamptz not null default clock_timestamp(),
  unique (user_id, key)
);

create table if not exists public.balance_points (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  t text not null,
  balance numeric not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  synced_at timestamptz not null default clock_timestamp(),
  unique (user_id, account_id, t)
);

create table if not exists public.user_settings (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value jsonb,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  synced_at timestamptz not null default clock_timestamp(),
  primary key (user_id, key)
);

-- Triggers, pull indexes, RLS.
do $$
declare t text;
begin
  foreach t in array array['accounts','trades','balance_points','user_settings'] loop
    execute format('drop trigger if exists sync_guard on public.%I', t);
    execute format('create trigger sync_guard before insert or update on public.%I for each row execute function public.sync_guard()', t);
    execute format('create index if not exists %I on public.%I (user_id, synced_at)', t || '_pull_idx', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists own_rows on public.%I', t);
    execute format('create policy own_rows on public.%I for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
  end loop;
end $$;
