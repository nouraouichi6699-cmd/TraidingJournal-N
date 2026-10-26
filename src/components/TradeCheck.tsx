// "Should I take this trade?" on the Advisor page: pick the market, the side, the hour and the day (the broker's clock),
// and the candle answers at once, go, careful or stop, with the reasons from your adopted rules, your plan, your history
// and today so far (the checks: lib/tradeCheck.ts).
import { useMemo, useState } from "react";
import { AlertTriangle, Ban, CircleCheck, Clock3, ScanSearch, ShieldCheck, Sparkles, TrendingDown, type LucideIcon } from "lucide-react";
import Mascot, { type Mood } from "./Mascot";
import { SectionHead, type Tone } from "./profileUi";
import { dly, tint } from "./AdvisorChat";
import type { Advice, Topic } from "../lib/advisor";
import { checkTrade, weekdayOf, type RuleRef, type Sign } from "../lib/tradeCheck";
import { fmtMoney, ltrNumbers } from "../lib/money";
import { offsetMs, parseModel, type TimeModel } from "../lib/path";
import { readClock } from "../lib/pathData";
import type { Account, Lang, Trade } from "../types";

type L = [string, string, string]; // en, ar, fr
const X = (en: string, ar: string, fr: string): L => [en, ar, fr];
const TXT = {
  title: X("Should I take this trade?", "هل آخذ هذه الصفقة؟", "Dois-je prendre ce trade ?"),
  sub: X("Pick the market, the side and the time: I check it against your rules and your history.", "اختر السوق والاتجاه والوقت: أقارنها بقواعدك وسجلك.", "Choisissez le marché, le sens et l'heure : je vérifie avec vos règles et votre historique."),
  market: X("Market", "السوق", "Marché"),
  side: X("Side", "الاتجاه", "Sens"),
  buy: X("Buy", "شراء", "Achat"),
  sell: X("Sell", "بيع", "Vente"),
  hour: X("Hour (broker's clock)", "الساعة (بتوقيت الوسيط)", "Heure (horloge du courtier)"),
  day: X("Day", "اليوم", "Jour"),
  today: X("today", "اليوم", "aujourd'hui"),
  none: X("No closed trades yet: the check needs your history.", "لا صفقات مغلقة بعد: يحتاج الفحص إلى سجلك.", "Aucun trade clôturé : la vérification a besoin de votre historique."),
  go: X("Go", "انطلق", "Allez-y"),
  goLine: X("Nothing against it in your rules or your history.", "لا شيء ضدها في قواعدك ولا في سجلك.", "Rien contre dans vos règles ni votre historique."),
  careful: X("Careful", "انتبه", "Prudence"),
  carefulLine: X("Your plan or your history warns about this trade.", "خطتك أو سجلك يحذّرانك من هذه الصفقة.", "Votre plan ou votre historique met en garde contre ce trade."),
  stop: X("Stop", "توقّف", "Stop"),
  stopLine: X("This trade breaks a rule you adopted.", "هذه الصفقة تكسر قاعدة تبنّيتها.", "Ce trade enfreint une règle que vous avez adoptée."),
  broken: X("Breaks your rule “{r}”", "تكسر قاعدتك «{r}»", "Enfreint votre règle « {r} »"),
  plan: X("Your plan says: {r}", "خطتك تقول: {r}", "Votre plan dit : {r}"),
  todayNet: X("Today so far: {v}", "يومك حتى الآن: {v}", "Aujourd'hui pour l'instant : {v}"),
  symbol: X("{s}: {nT}, {net}, {wr} won", "{s}: {nT}، {net}، ربحت {wr} منها", "{s} : {nT}, {net}, {wr} gagnants"),
  sideOn: X("Your {d} on {s}: {nT}, {net}, {wr} won", "صفقات {d} على {s}: {nT}، {net}، ربحت {wr} منها", "Vos {d} sur {s} : {nT}, {net}, {wr} gagnants"),
  hourAt: X("Entries at {h}: {nT}, {net}, {wr} won", "الدخول عند {h}: {nT}، {net}، ربحت {wr} منها", "Entrées à {h} : {nT}, {net}, {wr} gagnants"),
  dayOn: X("On {w}: {nT}, {net}, {wr} won", "يوم {w}: {nT}، {net}، ربحت {wr} منها", "Le {w} : {nT}, {net}, {wr} gagnants"),
  tipStop: X("Set your stop loss before you enter.", "ضع وقف الخسارة قبل أن تدخل.", "Placez votre stop avant d'entrer."),
};
const SIDES = { long: X("longs", "الشراء", "achats"), short: X("shorts", "البيع", "ventes") };
const VERDICT = {
  go: { tone: "emerald" as Tone, mood: "happy" as Mood, title: TXT.go, line: TXT.goLine },
  careful: { tone: "amber" as Tone, mood: "sad" as Mood, title: TXT.careful, line: TXT.carefulLine },
  stop: { tone: "rose" as Tone, mood: "angry" as Mood, title: TXT.stop, line: TXT.stopLine },
};

const GUESS: TimeModel = { base: 2, dst: "us" };
/** Now on the account's clock (the broker's for MT5, as on the Challenges page; the device's otherwise), as UTC fields. */
function wallNow(a: Account | undefined) {
  const now = Date.now();
  if (a?.platform !== "mt5") return new Date(now - new Date(now).getTimezoneOffset() * 6e4);
  const c = readClock(), m = (c.override && parseModel(c.override)) || (c.auto[a.id] && parseModel(c.auto[a.id].m)) || GUESS;
  return new Date(now + offsetMs(m, now));
}
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

export type CheckRule = RuleRef & { data: Advice["data"]; topic: Topic };
export default function TradeCheck({ lang, accounts, acc, trades, currency, adopted, plan, titleOf }: {
  lang: Lang; accounts: Account[]; acc: string; trades: Trade[]; currency: string | null; adopted: CheckRule[]; plan: CheckRule[];
  titleOf: (r: { id: string; data: Advice["data"] }) => string;
}) {
  const k = lang === "en" ? 0 : lang === "ar" ? 1 : 2, T = (x: L) => x[k];
  const account = accounts.find((a) => a.id === acc) ?? accounts.find((a) => a.platform === "mt5") ?? accounts[0];
  const now = useMemo(() => wallNow(account), [account]);
  const today = now.toISOString().slice(0, 10);
  const symbols = useMemo(() => {
    const n = new Map<string, number>();
    for (const t of trades) if (t.status === "closed") n.set(t.symbol, (n.get(t.symbol) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
  }, [trades]);
  const [pick, setPick] = useState<string | null>(null);
  const [side, setSide] = useState<"long" | "short">("long");
  const [hour, setHour] = useState(now.getUTCHours());
  const [ahead, setAhead] = useState(0); // 0 = today, then the next six days
  const symbol = pick && symbols.includes(pick) ? pick : symbols[0] ?? "";
  const day = addDays(today, ahead), weekday = weekdayOf(day);
  const res = useMemo(() => checkTrade({ day, hour, weekday, symbol, side }, trades, adopted, plan), [day, hour, weekday, symbol, side, trades, adopted, plan]);

  const loc = lang === "ar" ? "ar-u-nu-latn" : lang;
  const wd = (d: string) => new Intl.DateTimeFormat(loc, { weekday: "long", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
  const money = (v: number, sign = false) => fmtMoney(v, { sign, currency });
  const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
  const nTrades = (n: number) => (k === 1 ? (n === 1 ? "صفقة واحدة" : n === 2 ? "صفقتان" : n <= 10 ? `${n} صفقات` : `${n} صفقة`) : `${n} ${n === 1 ? "trade" : "trades"}`);
  const run = (n: number) => (k === 1 ? (n === 2 ? "خسارتان متتاليتان اليوم" : n <= 10 ? `${n} خسائر متتالية اليوم` : `${n} خسارة متتالية اليوم`) : k === 2 ? `${n} pertes d'affilée aujourd'hui` : `${n} losses in a row today`);
  const signText = (s: Sign) => {
    const v = { nT: nTrades(s.n), net: money(s.net, true), wr: `${s.wr.toFixed(0)}%`, s: symbol, d: T(SIDES[side]), h: `⁦${hh(hour)}–${hh((hour + 1) % 24)}⁩`, w: wd(day) };
    const tpl = s.kind === "symbol" ? TXT.symbol : s.kind === "side" ? TXT.sideOn : s.kind === "hour" ? TXT.hourAt : TXT.dayOn;
    return T(tpl).replace(/\{(\w+)\}/g, (_, key: string) => (v as Record<string, string>)[key] ?? "");
  };
  const reasons: { tone: Tone; icon: LucideIcon; text: string }[] = [
    ...res.broken.map((r) => ({ tone: "rose" as Tone, icon: Ban, text: T(TXT.broken).replace("{r}", titleOf(r)) })),
    ...res.plan.map((r) => ({ tone: "amber" as Tone, icon: Sparkles, text: T(TXT.plan).replace("{r}", titleOf(r)) })),
    ...(res.today.run >= 2 ? [{ tone: "amber" as Tone, icon: TrendingDown, text: run(res.today.run) }] : []),
    ...res.signs.filter((s) => !s.good).map((s) => ({ tone: "amber" as Tone, icon: AlertTriangle, text: signText(s) })),
    ...res.signs.filter((s) => s.good).map((s) => ({ tone: "emerald" as Tone, icon: CircleCheck, text: signText(s) })),
    ...(ahead === 0 && res.today.closed ? [{ tone: "slate" as Tone, icon: Clock3, text: T(TXT.todayNet).replace("{v}", money(res.today.net, true)) }] : []),
    ...(res.noStop >= 0.2 ? [{ tone: "slate" as Tone, icon: ShieldCheck, text: T(TXT.tipStop) }] : []),
  ];
  const V = VERDICT[res.verdict];
  const lbl = "flex flex-col gap-1.5 text-xs font-semibold text-muted";

  return (
    <section id="adv-check" className="tone-slate tone-panel adv-reveal scroll-mt-28 rounded-2xl p-4 sm:p-5">
      <SectionHead tone="emerald" icon={ScanSearch} title={T(TXT.title)} sub={T(TXT.sub)} />
      {!symbols.length ? <p className="mt-4 text-sm text-muted">{T(TXT.none)}</p> : (
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]">
          <div className="grid content-start gap-3.5 sm:grid-cols-2 lg:grid-cols-1">
            <label className={lbl}>{T(TXT.market)}
              <select className="field" value={symbol} onChange={(e) => setPick(e.target.value)}>{symbols.map((s) => <option key={s} value={s}>{s}</option>)}</select>
            </label>
            <div className={lbl}>{T(TXT.side)}
              <div className="grid grid-cols-2 gap-2" role="group" aria-label={T(TXT.side)}>
                {(["long", "short"] as const).map((s) => (
                  <button key={s} type="button" aria-pressed={side === s} onClick={() => setSide(s)} className={`${s === "long" ? "tone-emerald" : "tone-sky"} ${side === s ? "tone-solid" : "tone-btn"} rounded-lg px-3 py-2 text-sm font-semibold`}>
                    {T(s === "long" ? TXT.buy : TXT.sell)}
                  </button>
                ))}
              </div>
            </div>
            <label className={lbl}>{T(TXT.hour)}
              <select className="field" value={hour} onChange={(e) => setHour(Number(e.target.value))} dir="ltr">{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hh(h)}</option>)}</select>
            </label>
            <label className={lbl}>{T(TXT.day)}
              <select className="field" value={ahead} onChange={(e) => setAhead(Number(e.target.value))}>
                {Array.from({ length: 7 }, (_, i) => <option key={i} value={i}>{wd(addDays(today, i))}{i === 0 ? ` (${T(TXT.today)})` : ""}</option>)}
              </select>
            </label>
          </div>

          <div key={`${res.verdict}|${symbol}|${side}|${hour}|${ahead}`} aria-live="polite" className={`tone-${V.tone} tone-panel adv-pop rounded-2xl p-4 sm:p-5`}>
            <div className="flex items-center gap-4">
              <span className="grid h-[84px] w-[76px] shrink-0 place-items-center rounded-2xl" style={{ background: "radial-gradient(circle at 50% 62%, color-mix(in srgb, var(--tone) 26%, transparent), transparent 70%)" }}>
                <Mascot mood={V.mood} className="h-[74px] w-[63px]" />
              </span>
              <div className="min-w-0">
                <p className="tone-text font-heading text-2xl font-bold leading-tight">{T(V.title)}</p>
                <p className="mt-0.5 text-sm text-muted">{T(V.line)}</p>
              </div>
            </div>
            {reasons.length > 0 && (
              <ul className="mt-4 space-y-2">
                {reasons.map((r, i) => {
                  const Icon = r.icon;
                  return (
                    <li key={i} className={`tone-${r.tone} adv-pop flex items-start gap-2.5 text-sm leading-relaxed`} style={dly(120 + i * 60)}>
                      <span className="tone-tile mt-0.5 h-6 w-6 rounded-md"><Icon size={13} /></span>
                      <span className="adv-p min-w-0">{tint(ltrNumbers(r.text))}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
