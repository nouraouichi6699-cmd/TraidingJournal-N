// Run: npx tsx src/lib/newsZones.test.ts
import { classifyZone, zoneDayStats, type ZoneNewsEvent, type ZoneSettings } from "./newsZones";
import type { Trade } from "../types";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${c ? "" : "  " + d}`); };

const W60: ZoneSettings = { windowMin: 60, countMedium: false, keyEventsOnly: false };
const W60med: ZoneSettings = { windowMin: 60, countMedium: true, keyEventsOnly: false };
const W60key: ZoneSettings = { windowMin: 60, countMedium: false, keyEventsOnly: true };
// "Retail Sales m/m" is a deliberately non-key title, so the impact-based tests below aren't accidentally
// affected if keyEventsOnly's matching is ever widened.
const ev = (time: string, currency = "USD", impact: ZoneNewsEvent["impact"] = "high", title = "Retail Sales m/m"): ZoneNewsEvent => ({ time, currency, impact, title });

// ---- at-release boundaries: exactly 5 min before, exactly 15 min after ----
const T0 = "2026-01-05T12:00:00Z";
ok("exactly 5 min before -> at release", classifyZone("EURUSD", "2026-01-05T11:55:00Z", "2026-01-05T11:56:00Z", [ev(T0, "USD")], W60).zone === "atRelease");
ok("exactly 15 min after -> at release", classifyZone("EURUSD", "2026-01-05T12:15:00Z", "2026-01-05T12:16:00Z", [ev(T0, "USD")], W60).zone === "atRelease");
ok("1 min before the 5-min cutoff -> before", classifyZone("EURUSD", "2026-01-05T11:54:00Z", "2026-01-05T11:56:00Z", [ev(T0, "USD")], W60).zone === "before");
ok("1 min after the 15-min cutoff -> after", classifyZone("EURUSD", "2026-01-05T12:16:00Z", "2026-01-05T12:17:00Z", [ev(T0, "USD")], W60).zone === "after");

// ---- window edges (60 min default) ----
ok("exactly at the window, before -> before", classifyZone("EURUSD", "2026-01-05T11:00:00Z", "2026-01-05T11:01:00Z", [ev(T0, "USD")], W60).zone === "before");
ok("1 min beyond the window, before -> normal", classifyZone("EURUSD", "2026-01-05T10:59:00Z", "2026-01-05T11:00:00Z", [ev(T0, "USD")], W60).zone === "normal");
ok("exactly at the window, after -> after", classifyZone("EURUSD", "2026-01-05T13:00:00Z", "2026-01-05T13:01:00Z", [ev(T0, "USD")], W60).zone === "after");
ok("1 min beyond the window, after -> normal", classifyZone("EURUSD", "2026-01-05T13:01:00Z", "2026-01-05T13:02:00Z", [ev(T0, "USD")], W60).zone === "normal");

// ---- held through: entry < event <= exit, highest priority ----
const held = classifyZone("EURUSD", "2026-01-05T11:00:00Z", "2026-01-05T12:30:00Z", [ev(T0, "USD")], W60);
ok("held through beats the window-boundary \"before\" match on entry", held.zone === "held");
ok("exactly at the exit -> still held (event <= exit)", classifyZone("EURUSD", "2026-01-05T11:00:00Z", T0, [ev(T0, "USD")], W60).zone === "held");
ok("the instant of entry itself does not count as held (entry < event, strict)", classifyZone("EURUSD", T0, "2026-01-05T12:30:00Z", [ev(T0, "USD")], W60).zone !== "held");

// ---- several events: most severe wins, then the closest one ----
const sevA = ev("2026-01-05T12:00:00Z", "USD"); // 50 min before a 12:50 entry -> "after" relative to A, far
const sevB = ev("2026-01-05T13:00:00Z", "USD"); // 10 min before a 12:50 entry -> "before" relative to B, 10 min away
const several = classifyZone("EURUSD", "2026-01-05T12:50:00Z", "2026-01-05T12:55:00Z", [sevA, sevB], W60);
ok("with two \"before/after\" events, the closer one decides the zone", several.zone === "before" && several.event === sevB, JSON.stringify(several));
const sevC = ev("2026-01-05T12:55:00Z", "USD"); // exactly 5 min before the 12:50 entry -> at release, outranks both
const withAtRelease = classifyZone("EURUSD", "2026-01-05T12:50:00Z", "2026-01-05T12:52:00Z", [sevA, sevB, sevC], W60);
ok("at release outranks before/after even when further away isn't a factor", withAtRelease.zone === "atRelease" && withAtRelease.event === sevC);

// ---- currency must belong to the symbol ----
ok("wrong currency for the symbol -> ignored, normal", classifyZone("EURUSD", T0, "2026-01-05T12:05:00Z", [ev(T0, "JPY")], W60).zone === "normal");
ok("USDJPY entry can match either side (JPY)", classifyZone("USDJPY", T0, "2026-01-05T12:05:00Z", [ev(T0, "JPY")], W60).zone === "atRelease");

// ---- unknown symbol: no zone at all ----
const unknown = classifyZone("AAPL", T0, "2026-01-05T12:05:00Z", [ev(T0, "USD")], W60);
ok("unknown symbol -> zone is null, not \"normal\"", unknown.zone === null && unknown.event === null);

// ---- impact thresholds ----
ok("medium impact not counted by default", classifyZone("EURUSD", T0, "2026-01-05T12:05:00Z", [ev(T0, "USD", "medium")], W60).zone === "normal");
ok("medium impact counted when the setting is on", classifyZone("EURUSD", T0, "2026-01-05T12:05:00Z", [ev(T0, "USD", "medium")], W60med).zone === "atRelease");
ok("low impact never counts, even with the setting on", classifyZone("EURUSD", T0, "2026-01-05T12:05:00Z", [ev(T0, "USD", "low")], W60med).zone === "normal");

// ---- keyEventsOnly: title decides instead of impact ----
ok("keyEventsOnly on: a high-impact non-key event no longer counts", classifyZone("EURUSD", T0, "2026-01-05T12:05:00Z", [ev(T0, "USD", "high", "Retail Sales m/m")], W60key).zone === "normal");
ok("keyEventsOnly on: a low-impact key event counts", classifyZone("EURUSD", T0, "2026-01-05T12:05:00Z", [ev(T0, "USD", "low", "Non-Farm Payrolls")], W60key).zone === "atRelease");
ok("keyEventsOnly on: FOMC counts", classifyZone("EURUSD", T0, "2026-01-05T12:05:00Z", [ev(T0, "USD", "medium", "FOMC Statement")], W60key).zone === "atRelease");
ok("keyEventsOnly on: currency filter still applies to a key event", classifyZone("EURUSD", T0, "2026-01-05T12:05:00Z", [ev(T0, "JPY", "high", "Non-Farm Payrolls")], W60key).zone === "normal");

// ---- no events at all -> normal (not null) ----
ok("no events -> normal", classifyZone("EURUSD", T0, "2026-01-05T12:05:00Z", [], W60).zone === "normal");

// ---- zoneDayStats ----
const mk = (id: number, entry: string, exit: string, pnl: number): Trade => ({ key: `a:${id}`, accountId: "a", no: id, symbol: "X", side: "long", qty: 1, entryTime: entry, entryPrice: 1, exitTime: exit, exitPrice: 1, pnl, returnPct: null, commission: 0, status: "closed" } as Trade);
const t1 = mk(1, "2026-01-05T11:00:00Z", "2026-01-05T11:10:00Z", 50);
const t2 = mk(2, "2026-01-05T11:05:00Z", "2026-01-05T11:15:00Z", -20);
const t3 = mk(3, "2026-01-05T12:00:00Z", "2026-01-05T12:10:00Z", 30);
const stats = zoneDayStats([{ trade: t1, zone: "before" }, { trade: t2, zone: "before" }, { trade: t3, zone: "normal" }]);
const beforeStat = stats.find((s) => s.zone === "before")!, normalStat = stats.find((s) => s.zone === "normal")!, heldStat = stats.find((s) => s.zone === "held")!;
ok("zoneDayStats: before has both trades, net and win rate", beforeStat.trades === 2 && beforeStat.net === 30 && beforeStat.winRate === 50, JSON.stringify(beforeStat));
ok("zoneDayStats: normal has the third trade", normalStat.trades === 1 && normalStat.net === 30 && normalStat.winRate === 100);
ok("zoneDayStats: an empty zone is zero trades, null win rate, zero net", heldStat.trades === 0 && heldStat.winRate === null && heldStat.net === 0);
ok("zoneDayStats: fixed display order", stats.map((s) => s.zone).join(",") === "before,atRelease,after,held,normal");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
