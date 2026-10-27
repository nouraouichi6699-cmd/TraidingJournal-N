// The rules of the trader's strategies, both ways with the Telegram bot.
//  - Sent: "mizan-rules-bot" ({ lang, list: [{ id, name, rules }] }), the entry rules of each of the trader's strategies
//    (their own checklist, or a library strategy's), rebuilt whenever their strategies or the language change. The bot
//    asks after each new trade which of them were broken.
//  - Received: "mizan-trade-rules" ({ [trade key]: { s: strategy id, b: broken rule indexes, done } }), the answers.
// Both are synced settings.
import type { Lang, Trade } from "../types";
import { STRATEGIES, type Id, type StrategyText } from "./strategies";
import { readCustom, type CustomStrategy } from "./customStrategies";
import { readMine, type AnyId } from "./myStrategies";

export const BOT_KEY = "mizan-rules-bot", ANSWERS_KEY = "mizan-trade-rules";
export interface BotRules { lang: Lang; list: { id: string; name: string; rules: string[] }[] }
export interface RuleAnswer { s: string; b: number[]; at?: string; done?: boolean }

/** What the bot gets: each of the trader's strategies that has rules, in their order (8 at most). */
export function botRulesOf(lang: Lang, mine: AnyId[], custom: CustomStrategy[], text: Record<Id, StrategyText> | null): BotRules {
  const list = mine.map((id): BotRules["list"][number] | null => {
    const c = custom.find((x) => x.id === id);
    if (c) return { id: c.id, name: c.name, rules: c.check };
    const s = STRATEGIES.find((x) => x.id === id);
    return s && text ? { id: s.id, name: s.short, rules: text[s.id].check } : null;
  }).filter((x): x is BotRules["list"][number] => !!x && x.rules.length > 0).slice(0, 8);
  return { lang, list };
}

const textOf = (lang: Lang): Promise<Record<Id, StrategyText>> =>
  lang === "ar" ? import("./strategyText.ar").then((m) => m.AR) : lang === "fr" ? import("./strategyText.fr").then((m) => m.FR) : import("./strategyText.en").then((m) => m.EN);

/** Rebuilds what the bot gets (written only when it changed, so the sync sends it once). */
export async function publishBotRules(lang: Lang) {
  const mine = readMine(), custom = readCustom();
  const text = mine.some((id) => STRATEGIES.some((s) => s.id === id)) ? await textOf(lang) : null;
  const v = JSON.stringify(botRulesOf(lang, mine, custom, text));
  try { if (localStorage.getItem(BOT_KEY) !== v) localStorage.setItem(BOT_KEY, v); } catch { /* storage blocked: the bot keeps the last rules */ }
}

export function readAnswers(): Record<string, RuleAnswer> {
  try {
    const v = JSON.parse(localStorage.getItem(ANSWERS_KEY) ?? "null");
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    return Object.fromEntries(Object.entries(v as Record<string, RuleAnswer>).filter(([, a]) => a && typeof a.s === "string" && Array.isArray(a.b) && a.b.every((i) => Number.isInteger(i) && i >= 0)));
  } catch {
    return {};
  }
}

export interface Part { n: number; wins: number; net: number; winRate: number | null }
const part = (list: Trade[]): Part => {
  const wins = list.filter((t) => (t.pnl as number) > 0).length;
  return { n: list.length, wins, net: list.reduce((a, t) => a + (t.pnl as number), 0), winRate: list.length ? (wins / list.length) * 100 : null };
};

/** For one strategy, from the closed trades answered on Telegram: all rules kept, any rule broken, and each rule broken. */
export function ruleResults(id: string, trades: Trade[], answers: Record<string, RuleAnswer>, rules: number) {
  const closed = trades.filter((t) => t.status === "closed" && t.pnl != null && answers[t.key]?.s === id);
  const kept = closed.filter((t) => answers[t.key].done && !answers[t.key].b.length), broke = closed.filter((t) => answers[t.key].b.length > 0);
  const each = Array.from({ length: rules }, (_, i) => ({ i, ...part(broke.filter((t) => answers[t.key].b.includes(i))) })).filter((r) => r.n > 0).sort((a, b) => a.net - b.net || b.n - a.n);
  return { answered: kept.length + broke.length, kept: part(kept), broke: part(broke), each };
}
