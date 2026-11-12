-- One-time prune of public.econ_events_mt5 (per-user MT5-synced calendar; the EA re-reports it, so this is re-syncable).
-- Never touches public.econ_events (the shared ForexFactory table).
--   1. delete every impact = 'low' row;
--   2. delete rows older than that user's earliest live trade (MIN(entry_time), deleted_at is null), per user.
-- A user with no live trades, or any live trade whose entry_time is null/unparseable, gets step 1 only (no guessed cutoff).
-- trades.entry_time is broker-local text, econ time is timestamptz: the cutoff is taken as UTC and backed off by one day
-- so a broker UTC offset can never remove an event on the first trading day.

create or replace function pg_temp.try_ts(s text) returns timestamp language plpgsql immutable as $$
begin
  if s is null or s !~ '^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?$' then return null; end if;
  return s::timestamp;
exception when others then return null;
end $$;

delete from public.econ_events_mt5 where impact = 'low';

delete from public.econ_events_mt5 e
using (
  select user_id, min(pg_temp.try_ts(entry_time)) as first_entry
  from public.trades
  where deleted_at is null
  group by user_id
  having bool_and(pg_temp.try_ts(entry_time) is not null)
) t
where e.user_id = t.user_id
  and e.time < (t.first_entry - interval '1 day') at time zone 'UTC';
