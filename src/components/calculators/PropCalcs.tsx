// Prop challenges: the challenge plan and compound growth. The maths is in lib/calculators; this reads the journal
// (the account's active challenge, its closed trades, the current balance) into the fields and lays out the cards.
import { useId, useMemo, useState } from "react";
import { useSettings } from "../../useSettings";
import { balanceBefore, currentBalance } from "../../lib/balance";
import { challengeState, readChallenges } from "../../lib/challenge";
import { avgReturn, challengePlan, challengeRulesPct, compound, parseNum, pnlByMonth, readableTone, tradeEdge } from "../../lib/calculators";
import { todayFor } from "../challengeUi";
import { T, type L3 } from "./text";
import { AccountField, asField, fillIn, fmtN, fmtPct, Hint, InputsCard, JNumField, moneyFmt, NumField, Pair, ResultCard, Row, SafePill, say, Section, Seg, useAccount, useJField, useL, type Ctx } from "./ui";

const pos = (v: number) => Number.isFinite(v) && v > 0;
const lblCls = "flex flex-col gap-1 text-xs font-medium text-muted";

// ---------- Challenge plan ----------

export function PropBody({ ctx, glassBg }: { ctx: Ctx; glassBg: string }) {
  const L = useL(ctx.lang);
  const settings = useSettings();
  const { acc, cur } = useAccount(ctx);
  const J = ctx.journal;
  const today = todayFor(acc);
  // the challenges still running on this account, with their live state
  const active = useMemo(() => (!J || !acc ? [] : readChallenges().filter((c) => c.accountId === acc.id).map((c) => ({ c, st: challengeState(c, ctx.trades, today) })).filter((x) => x.st.status === "active")), [J, acc, ctx.trades, today]);
  const [chId, setChId] = useState("");
  const ch = active.find((x) => x.c.id === chId) ?? active[0] ?? null;
  const rules = ch ? challengeRulesPct(ch.c) : null;
  const edge = useMemo(() => (J && acc ? tradeEdge(ctx.trades.filter((t) => t.accountId === acc.id), settings.breakEven) : null), [J, acc, ctx.trades, settings.breakEven]);
  const accBal = useMemo(() => (J && acc ? currentBalance(acc, ctx.trades, ctx.balances[acc.id] ?? [], ctx.flows) : null), [J, acc, ctx.trades, ctx.balances, ctx.flows]);

  const accScope = acc?.id ?? "", chScope = `${accScope}:${ch?.c.id ?? ""}`;
  const fBal = useJField(J ? asField(ch ? ch.c.size : accBal) : null, chScope);
  const fTarget = useJField(J && rules ? asField(rules.target) : null, chScope);
  const fDaily = useJField(J && rules ? asField(rules.daily) : null, chScope);
  const fMax = useJField(J && rules ? asField(rules.max) : null, chScope);
  const fRisk = useJField(J ? settings.riskPct || null : null);
  const fRr = useJField(J && edge ? asField(edge.payoff) : null, accScope);
  const fWin = useJField(J && edge ? asField(edge.winRate, 1) : null, accScope);

  const bal = parseNum(fBal.value), target = parseNum(fTarget.value), daily = parseNum(fDaily.value), max = parseNum(fMax.value);
  const risk = parseNum(fRisk.value), rr = parseNum(fRr.value), win = parseNum(fWin.value);
  // with an active challenge, the safe risk is a third of the room it has left right now (as the size calculator says)
  const room = J && ch && ch.st.risk && ch.c.size > 0 ? ch.st.risk : null;
  const plan = useMemo(() => challengePlan({ target, daily, max, risk, rr, winRate: win, roomPct: room ? (room.amount / ch!.c.size) * 100 : null }), [target, daily, max, risk, rr, win, room, ch]);
  const money = moneyFmt(cur, ctx.hidden && fBal.fromJournal);
  const pm = (pct: number | null) => (pct == null || !Number.isFinite(pct) ? "-" : pos(bal) ? `${fmtPct(pct)} · ${money((pct * bal) / 100, { cents: false })}` : fmtPct(pct));

  const missing: L3[] = [];
  if (!pos(target)) missing.push(T.profitTarget);
  if (!pos(risk)) missing.push(T.riskPct);
  if (!pos(rr)) missing.push(T.rewardRisk);
  if (!(win >= 0 && win <= 100) || !Number.isFinite(win)) missing.push(T.winRate);
  const noEdge = !(plan.edge > 0);
  const amber = readableTone("#f59e0b", glassBg);
  const streakColor = plan.streak ? (plan.streak.level === "max" ? "var(--loss)" : plan.streak.level === "daily" ? amber : "var(--profit)") : undefined;
  const pctField = { lang: ctx.lang, suffix: "%" };

  return (
    <div className="grid items-start gap-4 md:grid-cols-2">
      <InputsCard>
        <Section label={L(T.secRules)}>
          <AccountField ctx={ctx} />
          {J && active.length > 1 && (
            <label className={lblCls}>{L(T.challenge)}
              <select className="field" value={ch?.c.id ?? ""} onChange={(e) => setChId(e.target.value)}>
                {active.map((x) => <option key={x.c.id} value={x.c.id}>{x.c.name}</option>)}
              </select>
            </label>
          )}
          {J && active.length === 1 && ch && <p className="text-xs text-muted">{L(T.challenge)}: <b className="text-text">{ch.c.name}</b></p>}
          {J && acc && !active.length && <Hint>{L(T.noChallenge)}</Hint>}
          <JNumField lang={ctx.lang} label={L(T.balance)} f={fBal} hidden={ctx.hidden} money />
          <JNumField {...pctField} label={L(T.profitTarget)} f={fTarget} />
          <Pair>
            <JNumField {...pctField} label={L(T.dailyLimit)} f={fDaily} />
            <JNumField {...pctField} label={L(T.maxLimit)} f={fMax} />
          </Pair>
        </Section>
        <Section label={L(T.secYou)}>
          <JNumField {...pctField} label={L(T.riskPct)} f={fRisk} hint={J && fRisk.fromJournal ? L(T.fromSettings) : undefined} />
          <Pair>
            <JNumField lang={ctx.lang} label={L(T.rewardRisk)} f={fRr} />
            <JNumField {...pctField} label={L(T.winRate)} f={fWin} />
          </Pair>
          {J && edge && edge.n > 0 && <Hint>{say(L(T.fromTrades), { n: fmtN(edge.n, 0) })}</Hint>}
        </Section>
      </InputsCard>
      <ResultCard
        lang={ctx.lang} color={ctx.color} tone={ctx.tone} missing={missing.length ? fillIn(ctx.lang, missing) : undefined}
        big={noEdge ? "-" : fmtN(plan.trades as number, 0)} unit={noEdge ? undefined : L(T.tradesApprox)}
        pill={plan.overSafe != null ? <SafePill lang={ctx.lang} safe={!plan.overSafe} /> : undefined}
        sentence={noEdge ? L(T.noEdge) : say(L(T.propSay), { target: fmtPct(target), risk: fmtPct(risk), win: fmtPct(win, 1) })}
        rows={
          <>
            <Row label={L(T.safeRisk)} value={pm(plan.safe)} />
            <Row label={L(T.yourRisk)} value={pm(risk)} />
            {room && <Row label={L(T.roomLeft)} value={money(room.amount, { cents: false })} />}
            <Row label={L(T.toDaily)} value={plan.lossesDaily ?? "-"} />
            <Row label={L(T.toMax)} value={plan.lossesMax ?? "-"} />
            <Row label={L(T.expectancy)} value={Number.isFinite(plan.edge) ? `${plan.edge > 0 ? "+" : ""}${pm(plan.edge)}` : "-"} color={plan.edge > 0 ? "var(--profit)" : plan.edge < 0 ? "var(--loss)" : undefined} />
            {plan.streak && <Row label={say(L(T.streakRow), { n: fmtN(plan.streak.n, 0) })} value={say(L(T.streakVal), { k: fmtN(plan.streak.k, 0), cost: fmtPct(plan.streak.cost) })} color={streakColor} words />}
          </>
        }
      />
    </div>
  );
}

// ---------- Compound growth ----------

type Period = "month" | "week" | "trade";
const UNIT: Record<Period, L3> = {
  month: { en: "months", ar: "شهر", fr: "mois" },
  week: { en: "weeks", ar: "أسبوع", fr: "semaines" },
  trade: { en: "trades", ar: "صفقة", fr: "trades" },
};

/** The balance across the periods, as a small line in the theme's chart colours. */
function Curve({ values, label }: { values: number[]; label: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  if (values.length < 2) return null;
  const W = 600, H = 140, P = 8;
  const lo = Math.min(...values), hi = Math.max(...values);
  const X = (i: number) => (i / (values.length - 1)) * W, Y = (v: number) => P + (1 - (v - lo) / (hi - lo || 1)) * (H - 2 * P);
  const d = values.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("");
  return (
    <div dir="ltr" className="h-28">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full overflow-visible" role="img" aria-label={label}>
        <defs>
          <linearGradient id={`${id}g`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity="0.26" /><stop offset="100%" stopColor="var(--primary)" stopOpacity="0" /></linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => <line key={f} x1={0} x2={W} y1={H * f} y2={H * f} stroke="var(--chart-grid)" strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
        <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} stroke="var(--chart-axis)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <path d={`${d}L${W},${H}L0,${H}Z`} fill={`url(#${id}g)`} />
        <path d={d} fill="none" stroke="var(--primary)" strokeWidth={2.2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

const SHOWN = 12;

export function CompBody({ ctx }: { ctx: Ctx }) {
  const L = useL(ctx.lang);
  const { acc, cur } = useAccount(ctx);
  const J = ctx.journal;
  const accBal = useMemo(() => (J && acc ? currentBalance(acc, ctx.trades, ctx.balances[acc.id] ?? [], ctx.flows) : null), [J, acc, ctx.trades, ctx.balances, ctx.flows]);
  const fStart = useJField(J ? asField(accBal) : null, acc?.id);
  const [rateT, setRateT] = useState(""), [nT, setNT] = useState("12"), [period, setPeriod] = useState<Period>("month"), [depT, setDepT] = useState("");
  const [all, setAll] = useState(false);
  // the account's average month: each month's closed result over the balance it started with
  const avg = useMemo(() => {
    if (!J || !acc) return null;
    const mine = ctx.trades.filter((t) => t.accountId === acc.id);
    const rows = pnlByMonth(mine).map((m) => ({ start: balanceBefore(acc, ctx.trades, `${m.month}-01`, ctx.balances[acc.id] ?? [], ctx.flows), pnl: m.pnl }));
    const r = avgReturn(rows);
    return r == null ? null : { r, n: rows.length };
  }, [J, acc, ctx.trades, ctx.balances, ctx.flows]);

  const start = parseNum(fStart.value), rate = parseNum(rateT), n = parseNum(nT), dep = depT.trim() ? parseNum(depT) : 0;
  const res = useMemo(() => compound(start, rate, n, dep), [start, rate, n, dep]);
  const money = moneyFmt(cur, ctx.hidden && fStart.fromJournal);
  const unit = UNIT[period][ctx.lang];

  const missing: L3[] = [];
  if (!(Number.isFinite(start) && start >= 0)) missing.push(T.startBalance);
  if (!(Number.isFinite(rate) && rate > -100)) missing.push(T.ratePer);
  if (!(Number.isInteger(n) && n >= 1 && n <= 1200)) missing.push(T.periods);
  if (depT.trim() && !Number.isFinite(dep)) missing.push(T.deposit);
  const rows = res?.rows ?? [];

  return (
    <div className="grid items-start gap-4 md:grid-cols-2">
      <InputsCard>
        <Section label={L(T.secAccount)}>
          <AccountField ctx={ctx} />
          <JNumField lang={ctx.lang} label={L(T.startBalance)} f={fStart} hidden={ctx.hidden} money />
        </Section>
        <Section label={L(T.secGrowth)}>
          <div className="flex flex-col gap-1 text-xs font-medium text-muted">
            <span>{L(T.period)}</span>
            <Seg label={L(T.period)} value={period} onChange={setPeriod} options={[{ v: "month", label: L(T.month) }, { v: "week", label: L(T.week) }, { v: "trade", label: L(T.tradeP) }]} />
          </div>
          <Pair>
            <NumField lang={ctx.lang} label={L(T.ratePer)} value={rateT} onChange={setRateT} suffix="%" />
            <NumField lang={ctx.lang} label={L(T.periods)} value={nT} onChange={setNT} />
          </Pair>
          {avg && (
            <div className="flex flex-col items-start gap-1">
              <button type="button" className="calc-chip" aria-pressed={period === "month" && rateT === asField(avg.r)} onClick={() => { setRateT(asField(avg.r) ?? ""); setPeriod("month"); }}>
                {say(L(T.useAvg), { r: fmtPct(avg.r) })}
              </button>
              <Hint>{say(L(T.avgHint), { n: fmtN(avg.n, 0) })}</Hint>
            </div>
          )}
          <NumField lang={ctx.lang} label={L(T.deposit)} value={depT} onChange={setDepT} />
        </Section>
      </InputsCard>
      <ResultCard
        lang={ctx.lang} color={ctx.color} tone={ctx.tone} missing={missing.length ? fillIn(ctx.lang, missing) : !res ? "-" : undefined}
        big={res ? money(res.final, { cents: false }) : "-"}
        sentence={res ? say(L(T.compSay), { n: fmtN(n, 0), unit, rate: fmtPct(rate), start: money(start, { cents: false }), final: money(res.final, { cents: false }) }) : undefined}
        rows={res && (
          <>
            <Row label={L(T.gain)} value={money(res.gain, { cents: false, sign: true })} color={res.gain > 0 ? "var(--profit)" : res.gain < 0 ? "var(--loss)" : undefined} />
            {res.deposits !== 0 && <Row label={L(T.deposits)} value={money(res.deposits, { cents: false })} />}
            {start > 0 && <Row label={L(T.growth)} value={`×${fmtN(res.final / start, 2)}`} />}
          </>
        )}
      >
        {res && (
          <>
            <Curve values={[start, ...rows.map((x) => x.balance)]} label={L(T.curve)} />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] text-muted">
                    <th className="py-1.5 text-start font-medium">{L(T.colPeriod)}</th>
                    <th className="py-1.5 text-end font-medium">{L(T.colGain)}</th>
                    <th className="py-1.5 text-end font-medium">{L(T.colBalance)}</th>
                  </tr>
                </thead>
                <tbody className="calc-rows">
                  {(all ? rows : rows.slice(0, SHOWN)).map((x) => (
                    <tr key={x.i}>
                      <td className="tnum py-1.5 text-muted"><bdi dir="ltr">{x.i}</bdi></td>
                      <td className="tnum py-1.5 text-end"><bdi dir="ltr">{money(x.gain, { sign: true })}</bdi></td>
                      <td className="tnum py-1.5 text-end font-medium"><bdi dir="ltr">{money(x.balance)}</bdi></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > SHOWN && (
              <button type="button" className="self-start text-xs font-semibold text-icon hover:underline" onClick={() => setAll((a) => !a)}>
                {all ? L(T.showLess) : say(L(T.showAll), { n: fmtN(rows.length, 0) })}
              </button>
            )}
          </>
        )}
      </ResultCard>
    </div>
  );
}
