-- GLORIA_RPG: reseed gloria_characters to match the real character-assignment design sheet.
-- The first migration (20261114_gloria_rpg.sql) seeded 9 placeholder characters (Savage, Gambler, Ghost,
-- Apprentice, Wanderer, Warrior, Strategist, Guardian, Elf) pending that sheet. The real roster is:
--   negative: Savage | neutral: Rogue | positive: Warrior, Sniper, Tank, Healer, Mage, Assassin | legendary: Elf
-- This drops the ids that are not part of that roster and upserts the 9 real ones. The min_win_rate /
-- max_drawdown / min_rr columns are reference thresholds for display only -- the real, multi-metric matching
-- logic (profit factor, pair diversity, revenge trades, recovery from a prior losing month, etc.) lives in
-- src/services/gloriaCharacterService.ts, not in these columns.
-- Safe to run: no gloria_character_assignments rows exist yet for the dropped ids (the feature had no service
-- code until now), guarded below regardless.
-- Not applied automatically: run it in the Supabase SQL editor, after 20261114_gloria_rpg.sql.

delete from public.gloria_characters c
where c.id in ('gambler', 'ghost', 'apprentice', 'wanderer', 'strategist', 'guardian')
  and not exists (select 1 from public.gloria_character_assignments a where a.character_id = c.id);

insert into public.gloria_characters (id, name, name_ar, level, min_win_rate, max_drawdown, min_rr, required_behavior, description, description_ar, icon, stat_focus) values
  ('savage',   'Savage',   'الهمجي',        'negative',  0,  100, 0.0, 'WR<35%, DD>20%, RR<0.5 -- reckless, no plan, revenge trading',                       'Trades on raw emotion, no plan, no limits.',                     'يتداول بدافع العاطفة الخام، بلا خطة وبلا حدود.',          'Skull',      'power'),
  ('rogue',    'Rogue',    'المحتال',       'neutral',   40, 15,  0.8, 'Break-even month: WR 40-50%, DD 10-15%, RR 0.8-1.2',                                   'Still breaking even, no clear edge yet.',                        'لا يزال عند نقطة التعادل، بلا ميزة واضحة بعد.',           'Shuffle',    'wisdom'),
  ('warrior',  'Warrior',  'المحارب',       'positive',  50, 15,  1.0, 'High trade volume with consistent execution: WR>50%, RR>1.0, DD<15%',                 'Executes often and keeps the plan under volume.',                'ينفذ بكثافة وثبات، صفقة بعد صفقة.',                      'Sword',      'speed'),
  ('sniper',   'Sniper',   'القناص',        'positive',  55, 10,  2.0, 'Few, highly selective trades: WR>55%, RR>2.0, DD<10%',                                 'Few shots, each one chosen with precision.',                     'صفقات قليلة، كل واحدة مختارة بدقة.',                      'Crosshair',  'precision'),
  ('tank',     'Tank',     'الحارس الفولاذي','positive', 50, 5,   1.0, 'Capital protection above all: WR>50%, DD<5%, RR>1.0',                                  'Puts capital first, barely dents the drawdown.',                 'يضع حماية رأس المال فوق كل شيء.',                        'Shield',     'defense'),
  ('healer',   'Healer',   'المعالج',       'positive',  55, 20,  1.5, 'Recovered from a previous losing month: WR>55%, RR>1.5',                              'Came back from a losing month with renewed discipline.',          'عاد بعد شهر خاسر بانضباط متجدد.',                        'HeartPulse', 'recovery'),
  ('mage',     'Mage',     'الساحر',        'positive',  50, 15,  2.0, 'Profit factor > 2.5 with pair diversity: WR>50%, RR>2.0',                              'Reads many markets at once, edge backed by numbers.',             'يقرأ أسواقاً متعددة في آن واحد، بميزة تدعمها الأرقام.',  'Wand2',      'intelligence'),
  ('assassin', 'Assassin', 'القاتل الصامت', 'positive',  60, 8,   2.5, 'WR>60%, RR>2.5, DD<8% -- fast, precise, high-conviction strikes',                      'Fast, precise strikes with high conviction.',                     'ضربات سريعة ودقيقة بثقة عالية.',                         'Zap',        'speed'),
  ('elf',      'Elf',      'الإلف',         'legendary', 60, 5,   2.0, 'All radar stats > 70%: WR>60%, DD<5%, RR>2.0 -- edge, risk and emotion in balance',    'Edge, risk and emotion, all finally in balance.',                 'الميزة والمخاطرة والعاطفة، كلها في توازن تام أخيراً.',   'Sparkles',   'precision')
on conflict (id) do update set
  name = excluded.name, name_ar = excluded.name_ar, level = excluded.level,
  min_win_rate = excluded.min_win_rate, max_drawdown = excluded.max_drawdown, min_rr = excluded.min_rr,
  required_behavior = excluded.required_behavior, description = excluded.description, description_ar = excluded.description_ar,
  icon = excluded.icon, stat_focus = excluded.stat_focus;
