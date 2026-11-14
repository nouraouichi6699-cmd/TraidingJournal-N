-- GLORIA_RPG: gamification schema (characters, zones, challenges, quest progress, XP, player stats).
-- Reference tables (gloria_characters, gloria_zones, gloria_challenges) carry seed data below; it is placeholder
-- lore and thresholds (names, descriptions, win-rate/drawdown/RR gates, boss names, challenge list) pending the
-- real design sheet -- safe to replace with a follow-up migration that upserts over these ids.
-- User tables (gloria_character_assignments, gloria_quest_progress, gloria_xp_log, gloria_player_stats) get no
-- demo data; they fill up from real app usage only.
-- accounts.trade_mode is untouched by this migration (server-only, written by mt5-sync).
-- Not applied automatically: run it in the Supabase SQL editor.
-- Rollback (destructive, only if you want to remove the feature):
--   drop table if exists public.gloria_xp_log;
--   drop table if exists public.gloria_quest_progress;
--   drop table if exists public.gloria_character_assignments;
--   drop table if exists public.gloria_player_stats;
--   drop table if exists public.gloria_challenges;
--   drop table if exists public.gloria_zones;
--   drop table if exists public.gloria_characters;

-- ---------------------------------------------------------------------------
-- Reference data: characters
-- ---------------------------------------------------------------------------

create table if not exists public.gloria_characters (
  id                text primary key,
  name              text not null,
  name_ar           text not null,
  level             text not null check (level in ('negative', 'neutral', 'positive', 'legendary')),
  min_win_rate      numeric not null default 0,
  max_drawdown      numeric not null default 100,
  min_rr            numeric not null default 0,
  required_behavior text not null,
  description       text not null,
  description_ar    text not null,
  icon              text not null,
  stat_focus        text not null check (stat_focus in ('precision', 'speed', 'defense', 'wisdom', 'recovery', 'intelligence', 'power')),
  created_at        timestamptz not null default now()
);

alter table public.gloria_characters enable row level security;
drop policy if exists gloria_characters_read on public.gloria_characters;
create policy gloria_characters_read on public.gloria_characters for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Reference data: zones
-- ---------------------------------------------------------------------------

create table if not exists public.gloria_zones (
  id               text primary key,
  name             text not null,
  name_ar          text not null,
  difficulty       text not null check (difficulty in ('easy', 'medium', 'hard', 'extreme')),
  order_index      integer not null unique,
  boss_name        text not null,
  boss_name_ar     text not null,
  unlock_condition text not null,
  reward           text not null,
  created_at       timestamptz not null default now()
);

alter table public.gloria_zones enable row level security;
drop policy if exists gloria_zones_read on public.gloria_zones;
create policy gloria_zones_read on public.gloria_zones for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Reference data: challenges
-- ---------------------------------------------------------------------------

create table if not exists public.gloria_challenges (
  id                text primary key,
  zone_id           text not null references public.gloria_zones(id) on delete cascade,
  name              text not null,
  name_ar           text not null,
  description       text not null,
  description_ar    text not null,
  category          text not null check (category in ('streak', 'target', 'discipline', 'stats', 'tools', 'special')),
  condition_type    text not null,
  condition_value   jsonb not null default '{}'::jsonb,
  xp_reward         integer not null,
  difficulty        text not null check (difficulty in ('easy', 'medium', 'hard', 'extreme')),
  is_boss_challenge boolean not null default false,
  created_at        timestamptz not null default now()
);

create index if not exists gloria_challenges_zone_idx on public.gloria_challenges (zone_id);

alter table public.gloria_challenges enable row level security;
drop policy if exists gloria_challenges_read on public.gloria_challenges;
create policy gloria_challenges_read on public.gloria_challenges for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- User data: monthly character assignment
-- ---------------------------------------------------------------------------

create table if not exists public.gloria_character_assignments (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  character_id   text not null references public.gloria_characters(id) on delete restrict,
  month          date not null,
  is_primary     boolean not null default true,
  assigned_at    timestamptz not null default now(),
  stats_snapshot jsonb not null default '{}'::jsonb,
  unique (user_id, month, character_id)
);

create index if not exists gloria_character_assignments_user_idx on public.gloria_character_assignments (user_id, month);

alter table public.gloria_character_assignments enable row level security;
drop policy if exists own_rows on public.gloria_character_assignments;
create policy own_rows on public.gloria_character_assignments for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- User data: quest progress
-- ---------------------------------------------------------------------------

create table if not exists public.gloria_quest_progress (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  challenge_id  text not null references public.gloria_challenges(id) on delete cascade,
  status        text not null default 'locked' check (status in ('locked', 'active', 'completed', 'failed')),
  started_at    timestamptz,
  completed_at  timestamptz,
  current_value numeric not null default 0,
  target_value  numeric not null default 0,
  updated_at    timestamptz not null default now(),
  unique (user_id, challenge_id)
);

create index if not exists gloria_quest_progress_user_idx on public.gloria_quest_progress (user_id, status);

alter table public.gloria_quest_progress enable row level security;
drop policy if exists own_rows on public.gloria_quest_progress;
create policy own_rows on public.gloria_quest_progress for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- User data: XP log
-- ---------------------------------------------------------------------------

create table if not exists public.gloria_xp_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  xp_amount   integer not null,
  source_type text not null check (source_type in ('challenge', 'daily', 'boss', 'bonus')),
  source_id   text,
  earned_at   timestamptz not null default now()
);

create index if not exists gloria_xp_log_user_idx on public.gloria_xp_log (user_id, earned_at);

alter table public.gloria_xp_log enable row level security;
drop policy if exists own_rows on public.gloria_xp_log;
create policy own_rows on public.gloria_xp_log for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- User data: player stats
-- Rank thresholds (by total_xp): Beginner 0, Intermediate 500, Advanced 1500, Expert 4000, Master 10000, Legend 25000.
-- Computed client-side / by the awarding function from total_xp; current_rank is a cached label, not re-derived here.
-- ---------------------------------------------------------------------------

create table if not exists public.gloria_player_stats (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null unique references auth.users(id) on delete cascade,
  total_xp        integer not null default 0,
  current_rank    text not null default 'beginner' check (current_rank in ('beginner', 'intermediate', 'advanced', 'expert', 'master', 'legend')),
  current_zone_id text references public.gloria_zones(id) on delete set null,
  elf_meter       integer not null default 0 check (elf_meter between 0 and 100),
  radar_stats     jsonb not null default '{}'::jsonb,
  updated_at      timestamptz not null default now()
);

alter table public.gloria_player_stats enable row level security;
drop policy if exists own_rows on public.gloria_player_stats;
create policy own_rows on public.gloria_player_stats for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Seed data: characters (negative -> neutral -> positive -> legendary, Savage -> Elf)
-- ---------------------------------------------------------------------------

insert into public.gloria_characters (id, name, name_ar, level, min_win_rate, max_drawdown, min_rr, required_behavior, description, description_ar, icon, stat_focus) values
  ('savage',     'Savage',     'الهمجي',     'negative',  0,  100, 0.0, 'Oversized, revenge trades with no risk control', 'Trades on raw emotion, no plan, no limits.', 'يتداول بدافع العاطفة الخام، بلا خطة وبلا حدود.', 'Skull',         'power'),
  ('gambler',    'Gambler',    'المقامر',    'negative',  0,  60,  0.5, 'Impulsive entries without a plan',               'Chases every move, hoping the next trade fixes the last.', 'يطارد كل حركة، على أمل أن تعوّض الصفقة القادمة ما فاته.', 'Dice5',         'speed'),
  ('ghost',      'Ghost',      'الشبح',      'negative',  0,  40,  0.7, 'Disappears after losses, breaks own rules',      'Vanishes from the plan the moment it gets hard.', 'يغيب عن خطته في اللحظة التي تصعب فيها.', 'Ghost',         'recovery'),
  ('apprentice', 'Apprentice', 'المتدرب',    'neutral',   35, 30,  1.0, 'Learning the basics, inconsistent but trying',   'Still finding footing, but showing up and learning.', 'لا يزال يتعلم أساسياته، لكنه يحضر ويحاول.', 'GraduationCap', 'wisdom'),
  ('wanderer',   'Wanderer',   'المتجول',    'neutral',   40, 25,  1.2, 'Some structure, still searching for an edge',    'Has a routine forming, still hunting for a real edge.', 'بدأ يتشكّل لديه أسلوب، وما زال يبحث عن ميزة حقيقية.', 'Compass',       'intelligence'),
  ('warrior',    'Warrior',    'المحارب',    'positive',  45, 20,  1.5, 'Follows a plan, takes calculated risk',          'Executes the plan and accepts risk on its own terms.', 'يلتزم بخطته ويقبل المخاطرة بشروطه الخاصة.', 'Sword',         'defense'),
  ('strategist', 'Strategist', 'الاستراتيجي','positive',  50, 15,  1.8, 'Data-driven, consistent risk management',        'Lets the numbers lead, risk managed every time.', 'يترك الأرقام تقوده، ويضبط المخاطرة في كل مرة.', 'BookOpen',      'intelligence'),
  ('guardian',   'Guardian',   'الحارس',     'positive',  55, 12,  2.0, 'Protects capital first, disciplined under pressure', 'Capital comes first, composure holds under pressure.', 'يضع رأس ماله أولاً، ويحافظ على هدوئه تحت الضغط.', 'ShieldCheck',   'defense'),
  ('elf',        'Elf',        'الإلف',      'legendary', 60, 10,  2.5, 'Mastery of edge, risk and emotion together',     'Edge, risk and emotion, all finally in balance.', 'الميزة والمخاطرة والعاطفة، كلها في توازن تام أخيراً.', 'Sparkles',      'precision')
on conflict (id) do update set
  name = excluded.name, name_ar = excluded.name_ar, level = excluded.level,
  min_win_rate = excluded.min_win_rate, max_drawdown = excluded.max_drawdown, min_rr = excluded.min_rr,
  required_behavior = excluded.required_behavior, description = excluded.description, description_ar = excluded.description_ar,
  icon = excluded.icon, stat_focus = excluded.stat_focus;

-- ---------------------------------------------------------------------------
-- Seed data: zones (the seven-zone adventure map, escalating difficulty)
-- ---------------------------------------------------------------------------

insert into public.gloria_zones (id, name, name_ar, difficulty, order_index, boss_name, boss_name_ar, unlock_condition, reward) values
  ('forest_of_habits',     'Forest of Habits',     'غابة العادات',   'easy',   1, 'The Impulse Wolf',     'ذئب الاندفاع',   'Available from the start',       'Habit Tracker badge'),
  ('swamp_of_fear',        'Swamp of Fear',        'مستنقع الخوف',   'medium', 2, 'The Hesitation Serpent','ثعبان التردد',  'Complete Forest of Habits',       'Fear Ward badge'),
  ('desert_of_discipline', 'Desert of Discipline',  'صحراء الانضباط', 'medium', 3, 'The Mirage Trader',    'متداول السراب',  'Complete Swamp of Fear',          'Discipline Sigil'),
  ('mountains_of_risk',    'Mountains of Risk',     'جبال الخطر',     'hard',   4, 'The Avalanche Lord',   'سيد الانهيار',   'Complete Desert of Discipline',   'Risk Shield'),
  ('storm_coast',          'Storm Coast',           'ساحل العاصفة',   'hard',   5, 'The Volatility Kraken','كراكن التقلب',  'Complete Mountains of Risk',      'Storm Compass'),
  ('volcano_of_greed',     'Volcano of Greed',      'بركان الطمع',    'extreme',6, 'The Greed Phoenix',    'طائر الطمع',     'Complete Storm Coast',            'Ember of Restraint'),
  ('sanctuary_of_mastery', 'Sanctuary of Mastery',  'معبد الاحتراف',  'extreme',7, 'The Mirror Self',      'الذات المرآة',   'Complete Volcano of Greed',       'Elf Crown')
on conflict (id) do update set
  name = excluded.name, name_ar = excluded.name_ar, difficulty = excluded.difficulty, order_index = excluded.order_index,
  boss_name = excluded.boss_name, boss_name_ar = excluded.boss_name_ar, unlock_condition = excluded.unlock_condition, reward = excluded.reward;

-- ---------------------------------------------------------------------------
-- Seed data: challenges (5 per zone, the last of each zone is its boss challenge)
-- ---------------------------------------------------------------------------

insert into public.gloria_challenges (id, zone_id, name, name_ar, description, description_ar, category, condition_type, condition_value, xp_reward, difficulty, is_boss_challenge) values
  -- Forest of Habits
  ('f1', 'forest_of_habits', 'First Steps', 'الخطوات الأولى', 'Open the journal three days in a row.', 'افتح اليوميات ثلاثة أيام متتالية.', 'streak', 'login_streak', '{"days":3}', 50, 'easy', false),
  ('f2', 'forest_of_habits', 'Journal Habit', 'عادة التدوين', 'Log 5 trades with notes.', 'سجّل 5 صفقات مع ملاحظات.', 'discipline', 'journal_entries', '{"count":5}', 60, 'easy', false),
  ('f3', 'forest_of_habits', 'Risk Per Trade', 'المخاطرة بالصفقة', 'Keep risk at or under 2% on 10 trades.', 'حافظ على مخاطرة 2% أو أقل في 10 صفقات.', 'discipline', 'max_risk_per_trade', '{"percent":2,"trades":10}', 70, 'easy', false),
  ('f4', 'forest_of_habits', 'Steady Hands', 'أيدٍ ثابتة', 'Reach a 40% win rate over 10 trades.', 'حقّق نسبة فوز 40% خلال 10 صفقات.', 'stats', 'win_rate_min', '{"percent":40,"trades":10}', 80, 'medium', false),
  ('f5', 'forest_of_habits', 'Defeat the Impulse Wolf', 'هزيمة ذئب الاندفاع', 'Clear every challenge in the Forest of Habits.', 'أنجز كل تحديات غابة العادات.', 'special', 'boss_clear', '{"zone":"forest_of_habits","requires":["f1","f2","f3","f4"]}', 200, 'medium', true),
  -- Swamp of Fear
  ('s1', 'swamp_of_fear', 'Face the Chart', 'مواجهة الرسم البياني', 'Trade on 5 separate days without skipping.', 'تداول في 5 أيام مختلفة دون انقطاع.', 'streak', 'trading_days_streak', '{"days":5}', 80, 'medium', false),
  ('s2', 'swamp_of_fear', 'No Hesitation', 'بلا تردد', 'Enter 10 trades exactly as planned.', 'نفّذ 10 صفقات تماماً كما خُطط لها.', 'discipline', 'entry_within_plan', '{"count":10}', 90, 'medium', false),
  ('s3', 'swamp_of_fear', 'Stop Loss Always', 'وقف الخسارة دائماً', 'Set a stop loss on 15 trades in a row.', 'ضع وقف خسارة في 15 صفقة متتالية.', 'discipline', 'sl_set_rate', '{"percent":100,"trades":15}', 100, 'medium', false),
  ('s4', 'swamp_of_fear', 'Cut the Losers', 'قطع الصفقات الخاسرة', 'Keep average loss under 1.5% of balance.', 'حافظ على متوسط خسارة أقل من 1.5% من الرصيد.', 'stats', 'avg_loss_below', '{"percent":1.5}', 100, 'medium', false),
  ('s5', 'swamp_of_fear', 'Defeat the Hesitation Serpent', 'هزيمة ثعبان التردد', 'Clear every challenge in the Swamp of Fear.', 'أنجز كل تحديات مستنقع الخوف.', 'special', 'boss_clear', '{"zone":"swamp_of_fear","requires":["s1","s2","s3","s4"]}', 220, 'hard', true),
  -- Desert of Discipline
  ('d1', 'desert_of_discipline', 'Plan Every Trade', 'خطّط لكل صفقة', 'Write an entry plan before 15 trades.', 'اكتب خطة دخول قبل 15 صفقة.', 'discipline', 'plan_before_entry', '{"count":15}', 100, 'hard', false),
  ('d2', 'desert_of_discipline', 'RR Minimum', 'الحد الأدنى للمخاطرة/العائد', 'Keep a risk/reward of at least 1.5 on 10 trades.', 'حافظ على نسبة مخاطرة/عائد 1.5 على الأقل في 10 صفقات.', 'target', 'risk_reward_min', '{"ratio":1.5,"trades":10}', 110, 'hard', false),
  ('d3', 'desert_of_discipline', 'No Revenge', 'بلا ثأر', 'Go 10 days with no revenge trade after a loss.', 'اقضِ 10 أيام دون صفقة ثأر بعد خسارة.', 'discipline', 'no_revenge_trade', '{"days":10}', 110, 'hard', false),
  ('d4', 'desert_of_discipline', 'Tool User', 'مستخدم الأدوات', 'Use a calculator before 10 trades.', 'استخدم حاسبة قبل 10 صفقات.', 'tools', 'calculator_usage', '{"count":10}', 90, 'medium', false),
  ('d5', 'desert_of_discipline', 'Defeat the Mirage Trader', 'هزيمة متداول السراب', 'Clear every challenge in the Desert of Discipline.', 'أنجز كل تحديات صحراء الانضباط.', 'special', 'boss_clear', '{"zone":"desert_of_discipline","requires":["d1","d2","d3","d4"]}', 240, 'hard', true),
  -- Mountains of Risk
  ('m1', 'mountains_of_risk', 'Drawdown Cap', 'سقف التراجع', 'Keep drawdown under 15% for a month.', 'حافظ على تراجع أقل من 15% لمدة شهر.', 'stats', 'max_drawdown_below', '{"percent":15}', 130, 'extreme', false),
  ('m2', 'mountains_of_risk', 'Position Sizing', 'تحديد حجم المركز', 'Size 20 trades by the account risk rule.', 'حدّد حجم 20 صفقة وفق قاعدة مخاطرة الحساب.', 'discipline', 'position_size_rule', '{"count":20}', 120, 'hard', false),
  ('m3', 'mountains_of_risk', 'Win Streak 5', 'سلسلة فوز 5', 'Win 5 trades in a row.', 'اربح 5 صفقات متتالية.', 'streak', 'win_streak', '{"count":5}', 140, 'hard', false),
  ('m4', 'mountains_of_risk', 'Consistent RR', 'ثبات المخاطرة/العائد', 'Keep a risk/reward of at least 2 on 15 trades.', 'حافظ على نسبة مخاطرة/عائد 2 على الأقل في 15 صفقة.', 'target', 'risk_reward_min', '{"ratio":2,"trades":15}', 150, 'extreme', false),
  ('m5', 'mountains_of_risk', 'Defeat the Avalanche Lord', 'هزيمة سيد الانهيار', 'Clear every challenge in the Mountains of Risk.', 'أنجز كل تحديات جبال الخطر.', 'special', 'boss_clear', '{"zone":"mountains_of_risk","requires":["m1","m2","m3","m4"]}', 260, 'extreme', true),
  -- Storm Coast
  ('c1', 'storm_coast', 'Volatility Control', 'التحكم بالتقلب', 'Skip trading 10 days around high-impact news.', 'تجنّب التداول 10 أيام حول الأخبار عالية الأثر.', 'discipline', 'no_trade_high_impact_news', '{"days":10}', 140, 'hard', false),
  ('c2', 'storm_coast', 'Steady Equity', 'استقرار رأس المال', 'Keep the equity curve rising for 4 weeks.', 'حافظ على ارتفاع منحنى رأس المال لمدة 4 أسابيع.', 'stats', 'equity_curve_stability', '{"weeks":4}', 150, 'extreme', false),
  ('c3', 'storm_coast', 'Tool Mastery', 'احتراف الأدوات', 'Use the advisor 5 times.', 'استخدم المستشار 5 مرات.', 'tools', 'advisor_usage', '{"count":5}', 120, 'medium', false),
  ('c4', 'storm_coast', 'Win Rate 50', 'نسبة فوز 50', 'Reach a 50% win rate over 20 trades.', 'حقّق نسبة فوز 50% خلال 20 صفقة.', 'stats', 'win_rate_min', '{"percent":50,"trades":20}', 160, 'extreme', false),
  ('c5', 'storm_coast', 'Defeat the Volatility Kraken', 'هزيمة كراكن التقلب', 'Clear every challenge on the Storm Coast.', 'أنجز كل تحديات ساحل العاصفة.', 'special', 'boss_clear', '{"zone":"storm_coast","requires":["c1","c2","c3","c4"]}', 280, 'extreme', true),
  -- Volcano of Greed
  ('g1', 'volcano_of_greed', 'Take Profit Discipline', 'الالتزام بأخذ الربح', 'Respect the take-profit on 90% of 15 trades.', 'احترم أخذ الربح في 90% من 15 صفقة.', 'discipline', 'tp_respected_rate', '{"percent":90,"trades":15}', 160, 'extreme', false),
  ('g2', 'volcano_of_greed', 'No Overtrading', 'تجنّب الإفراط بالتداول', 'Cap trades at 5 per day for 10 days.', 'لا تتجاوز 5 صفقات يومياً لمدة 10 أيام.', 'discipline', 'max_trades_per_day', '{"max":5,"days":10}', 150, 'extreme', false),
  ('g3', 'volcano_of_greed', 'Profit Lock', 'تثبيت الربح', 'Reach a 5% monthly profit target.', 'حقّق هدف ربح شهري 5%.', 'target', 'monthly_profit_target', '{"percent":5}', 180, 'extreme', false),
  ('g4', 'volcano_of_greed', 'RR Excellence', 'امتياز المخاطرة/العائد', 'Keep a risk/reward of at least 2.5 on 15 trades.', 'حافظ على نسبة مخاطرة/عائد 2.5 على الأقل في 15 صفقة.', 'target', 'risk_reward_min', '{"ratio":2.5,"trades":15}', 190, 'extreme', false),
  ('g5', 'volcano_of_greed', 'Defeat the Greed Phoenix', 'هزيمة طائر الطمع', 'Clear every challenge in the Volcano of Greed.', 'أنجز كل تحديات بركان الطمع.', 'special', 'boss_clear', '{"zone":"volcano_of_greed","requires":["g1","g2","g3","g4"]}', 300, 'extreme', true),
  -- Sanctuary of Mastery
  ('e1', 'sanctuary_of_mastery', 'Full Discipline', 'الانضباط الكامل', 'Go 30 days without breaking a rule.', 'اقضِ 30 يوماً دون خرق أي قاعدة.', 'discipline', 'no_rule_break', '{"days":30}', 220, 'extreme', false),
  ('e2', 'sanctuary_of_mastery', 'Elite Win Rate', 'نسبة فوز النخبة', 'Reach a 60% win rate over 30 trades.', 'حقّق نسبة فوز 60% خلال 30 صفقة.', 'stats', 'win_rate_min', '{"percent":60,"trades":30}', 240, 'extreme', false),
  ('e3', 'sanctuary_of_mastery', 'Capital Guardian', 'حارس رأس المال', 'Keep drawdown under 10% for a month.', 'حافظ على تراجع أقل من 10% لمدة شهر.', 'stats', 'max_drawdown_below', '{"percent":10}', 230, 'extreme', false),
  ('e4', 'sanctuary_of_mastery', 'Mentor Mode', 'وضع الموجّه', 'Share one strategy with the community.', 'شارك استراتيجية واحدة مع المجتمع.', 'special', 'share_strategy', '{"count":1}', 150, 'medium', false),
  ('e5', 'sanctuary_of_mastery', 'Defeat the Mirror Self', 'هزيمة الذات المرآة', 'Clear every challenge in the Sanctuary of Mastery.', 'أنجز كل تحديات معبد الاحتراف.', 'special', 'boss_clear', '{"zone":"sanctuary_of_mastery","requires":["e1","e2","e3","e4"]}', 400, 'extreme', true)
on conflict (id) do update set
  zone_id = excluded.zone_id, name = excluded.name, name_ar = excluded.name_ar,
  description = excluded.description, description_ar = excluded.description_ar, category = excluded.category,
  condition_type = excluded.condition_type, condition_value = excluded.condition_value, xp_reward = excluded.xp_reward,
  difficulty = excluded.difficulty, is_boss_challenge = excluded.is_boss_challenge;
