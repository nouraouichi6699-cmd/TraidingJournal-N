-- The account's real MT5 trade mode, read by the MizanSync EA (MizanSync 1.07+) and stored by the mt5-sync function.
-- null = unknown (never synced by a 1.07+ EA, or a platform that has no such notion).
-- Written only by mt5-sync (service role); accounts created by hand or by a report import stay null.

alter table public.accounts add column if not exists trade_mode text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'accounts_trade_mode_check') then
    alter table public.accounts add constraint accounts_trade_mode_check
      check (trade_mode is null or trade_mode in ('demo', 'contest', 'real'));
  end if;
end $$;
