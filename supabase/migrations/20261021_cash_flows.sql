-- Cash flows: deposits, withdrawals, credits and adjustments per account (external money, never trading P&L).
-- Same sync / RLS pattern as the other row-synced tables. NOT applied automatically: run it in the Supabase SQL editor.
-- Rollback (destructive, only when you want to remove the feature): drop table if exists public.cash_flows;

create table if not exists public.cash_flows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  t text not null,                                   -- ISO timestamp, same text format as balance_points.t
  type text not null check (type in ('deposit','withdrawal','credit','adjustment')),
  amount numeric not null check (amount <> 0),       -- positive for deposit/withdrawal/credit; an adjustment may be negative
  note text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  synced_at timestamptz not null default clock_timestamp()
);

do $$ begin
  execute 'drop trigger if exists sync_guard on public.cash_flows';
  execute 'create trigger sync_guard before insert or update on public.cash_flows for each row execute function public.sync_guard()';
  execute 'create index if not exists cash_flows_pull_idx on public.cash_flows (user_id, synced_at)';
  execute 'alter table public.cash_flows enable row level security';
  execute 'drop policy if exists own_rows on public.cash_flows';
  execute 'create policy own_rows on public.cash_flows for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)';
end $$;
