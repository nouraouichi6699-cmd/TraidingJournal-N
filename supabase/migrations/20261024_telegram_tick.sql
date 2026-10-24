-- Telegram alerts on a schedule: every 5 minutes pg_cron asks the "telegram" function to send what is due (MT5 sync
-- stopped with open trades, the day and week summaries, high-impact news 15 minutes ahead). Safe to run more than once.
-- The call carries no key: the function only sends what is due and runs at most every 4 minutes (the "tick" row below).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- The function's own state: the tick lock and the cached news calendar. RLS on and no policy: only the service role
-- (the function) can read or write it.
create table if not exists public.tg_state (
  id text primary key,
  at timestamptz not null default 'epoch',
  value jsonb
);
alter table public.tg_state enable row level security;
insert into public.tg_state (id) values ('tick'), ('calendar') on conflict (id) do nothing;

-- Same name again = the job is updated, not added twice.
select cron.schedule(
  'mizan-telegram-tick',
  '*/5 * * * *',
  $$ select net.http_post(
       url := 'https://lfdddmcktywktnrkthbx.supabase.co/functions/v1/telegram',
       headers := '{"Content-Type": "application/json"}'::jsonb,
       body := '{"action": "tick"}'::jsonb,
       timeout_milliseconds := 60000
     ) $$
);
