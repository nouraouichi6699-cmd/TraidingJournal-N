// Risk planning (dd, ruin, streak, port) and System analysis (exp, wr, kelly, mc) calculators.
// Same layout conventions as TradeSetup.tsx and PropCalcs.tsx: inputs | result, glass cards, useL/say/Row/etc.
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { useSettings } from "../../useSettings";
import { balanceSeries, currentBalance } from "../../lib/balance";
import { accountDrawdown, buildPnlSample, drawdownRecovery, expectancy, kellyFull, needsPrice, needsRate, parseNum, pipSizeFor, pipsToDistance, quoteToAccountRate, requiredWinRate, riskOfRuin, runMonteCarlo, safeRiskForRuin, streakTable, symbolSpec, tradeEdge, likelyLongestRun, type McResult } from "../../lib/calculators";
import { usePipSizes } from "../../useCalculators";
import { T, type L3 } from "./text";
import {
  accountSymbols, AccountField, asField, fillIn, fmtN, fmtPct, Hint, InputsCard, JNumField, moneyFmt, NumField, Pair, ResultCard, Row,
  SafePill, say, Section, SymbolField, useAccount, useJField, useL, type Ctx,
} from "./ui";

const pos = (v: number) => Number.isFinite(v) && v > 0;
const pct = (v: number) => (Number.isFinite(v) ? fmtPct(v) : "-");

function Layout({ inputs, result }: { inputs: ReactNode; result: ReactNode }) {
  return <div className="grid items-start gap-4 md:grid-cols-2">{inputs}{result}</div>;
}

// ---------- Drawdown recovery ----------

const DD_BARS = [10, 20, 30, 40, 50];

export function DdBody({ ctx }: { ctx: Ctx }) {
  const L = useL(ctx.lang);
  const { acc } = useAccount(ctx);
  const series = useMemo(() => (ctx.journal && acc ? balanceSeries(acc, ctx.trades, ctx.balances[acc.id] ?? [], ctx.flows) : []), [ctx.journal, acc, ctx.trades, ctx.balances, ctx.flows]);
  const dd = useMemo(() => accountDrawdown(series), [series]);
  const jLoss = ctx.journal && Number.isFinite(dd.current) && dd.current > 0 ? asField(dd.current) : null;
  const fLoss = useJField(jLoss, acc?.id);
  const loss = parseNum(fLoss.value);
  const gain = drawdownRecovery(loss);

  return (
    <Layout
      inputs={
        <InputsCard>
          <Section label={L(T.secAccount)}>
            <AccountField ctx={ctx} />
          </Section>
          <Section label={L(T.secLoss)}>
            <JNumField lang={ctx.lang} label={L(T.lossInput)} f={fLoss} suffix="%" />
          </Section>
          {ctx.journal && Number.isFinite(dd.max) && dd.max > 0 && (
            <Hint>{L(T.maxDD)}: <bdi dir="ltr">{fmtPct(dd.max)}</bdi></Hint>
          )}
        </InputsCard>
      }
      result={
        <ResultCard
          lang={ctx.lang} color={ctx.color} tone={ctx.tone}
          missing={!Number.isFinite(loss) || loss <= 0 || loss >= 100 ? fillIn(ctx.lang, [T.lossInput]) : undefined}
          big={pct(gain)}
          sentence={say(L(T.ddSay), { loss: pct(loss), gain: pct(gain) })}
          rows={
            <>
              <Row label={L(T.gainNeeded)} value={pct(gain)} />
              {Number.isFinite(dd.max) && dd.max > 0 && <Row label={L(T.maxDD)} value={pct(dd.max)} />}
              {DD_BARS.map((b) => {
                const g = drawdownRecovery(b);
                const hl = Number.isFinite(loss) && Math.abs(loss - b) < 5;
                return (
                  <div key={b} className={`flex items-center gap-2 py-1.5 text-xs ${hl ? "font-bold" : ""}`} style={hl ? { color: ctx.tone } : undefined}>
                    <bdi dir="ltr" className="tnum w-8 text-muted">{b}%</bdi>
                    <div className="relative flex-1 overflow-hidden rounded-full bg-glass h-2.5">
                      <div className="absolute inset-y-0 start-0 rounded-full bg-loss" style={{ width: `${b}%` }} />
                    </div>
                    <bdi dir="ltr" className="tnum w-8 text-end">{fmtN(g, 1)}%</bdi>
                  </div>
                );
              })}
            </>
          }
        />
      }
    />
  );
}

// ---------- Risk of ruin ----------

function useDebounce<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const id = setTimeout(() => setDebounced(value), ms); return () => clearTimeout(id); }, [value, ms]);
  return debounced;
}

export function RuinBody({ ctx }: { ctx: Ctx }) {
  const L = useL(ctx.lang);
  const settings = useSettings();
  const { acc } = useAccount(ctx);
  const edge = useMemo(() => (ctx.journal && acc ? tradeEdge(ctx.trades.filter((t) => t.accountId === acc.id), settings.breakEven) : null), [ctx.journal, acc, ctx.trades, settings.breakEven]);
  const fWin = useJField(ctx.journal && edge ? asField(edge.winRate, 1) : null, acc?.id);
  const fRr = useJField(ctx.journal && edge ? asField(edge.payoff) : null, acc?.id);
  const fRisk = useJField(ctx.journal ? settings.riskPct || null : null);
  const [ruinT, setRuinT] = useState("50");
  const [nT, setNT] = useState("500");

  const winRate = parseNum(fWin.value), rr = parseNum(fRr.value), riskPct = parseNum(fRisk.value);
  const ruinLevel = parseNum(ruinT), nTrades = parseNum(nT);
  const inputs = useMemo(() => ({ winRate, rr, riskPct, ruinLevel, nTrades }), [winRate, rr, riskPct, ruinLevel, nTrades]);
  const dInputs = useDebounce(inputs, 250);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ruin: number; expR: number; safeRisk: number | null } | null>(null);
  const reqRef = useRef(0);

  useEffect(() => {
    const { winRate, rr, riskPct, ruinLevel, nTrades } = dInputs;
    if (!pos(rr) || !Number.isFinite(winRate) || winRate < 0 || winRate > 100 || !pos(riskPct) || !pos(ruinLevel) || ruinLevel >= 100 || !pos(nTrades)) { setResult(null); setLoading(false); return; }
    setLoading(true);
    const req = ++reqRef.current;
    setTimeout(() => {
      if (req !== reqRef.current) return;
      const ruin = riskOfRuin({ winRate, rr, riskPct, ruinLevel, nTrades });
      const expR = (winRate / 100) * rr - (1 - winRate / 100);
      const safeRisk = safeRiskForRuin({ winRate, rr, ruinLevel, nTrades });
      setResult({ ruin, expR, safeRisk });
      setLoading(false);
    }, 0);
  }, [dInputs]);

  const missing: L3[] = [];
  if (!Number.isFinite(winRate) || winRate < 0 || winRate > 100) missing.push(T.winRate);
  if (!pos(rr)) missing.push(T.rewardRisk);
  if (!pos(riskPct)) missing.push(T.riskPct);

  const ruinPct = result?.ruin ?? NaN;
  const ruinColor = !Number.isFinite(ruinPct) ? undefined : ruinPct < 1 ? "var(--profit)" : ruinPct < 10 ? "#f59e0b" : "var(--loss)";

  return (
    <Layout
      inputs={
        <InputsCard>
          <Section label={L(T.secAccount)}>
            <AccountField ctx={ctx} />
            {ctx.journal && edge && edge.n > 0 && <Hint>{say(L(T.fromTrades), { n: fmtN(edge.n, 0) })}</Hint>}
          </Section>
          <Section label={L(T.secRuinParams)}>
            <JNumField lang={ctx.lang} label={L(T.winRate)} f={fWin} suffix="%" />
            <Pair>
              <JNumField lang={ctx.lang} label={L(T.rewardRisk)} f={fRr} />
              <JNumField lang={ctx.lang} label={L(T.riskPct)} f={fRisk} suffix="%" />
            </Pair>
            <Pair>
              <NumField lang={ctx.lang} label={L(T.ruinLevel)} value={ruinT} onChange={setRuinT} suffix="%" hint={L(T.ruinLevelHint)} />
              <NumField lang={ctx.lang} label={L(T.nTrades)} value={nT} onChange={setNT} />
            </Pair>
          </Section>
        </InputsCard>
      }
      result={
        <ResultCard
          lang={ctx.lang} color={ctx.color} tone={ctx.tone}
          missing={loading ? L(T.calculating) : missing.length ? fillIn(ctx.lang, missing) : !result ? fillIn(ctx.lang, [T.ruinLevel, T.nTrades]) : undefined}
          big={result ? pct(ruinPct) : "-"} bigColor={ruinColor}
          sentence={result ? say(L(T.ruinSay), { x: fmtN(ruinPct, 1), level: pct(ruinLevel), n: fmtN(nTrades, 0) }) : undefined}
          rows={result && (
            <>
              <Row label={L(T.ruinExpR)} value={`${result.expR > 0 ? "+" : ""}${fmtN(result.expR, 3)} R`} color={result.expR > 0 ? "var(--profit)" : result.expR < 0 ? "var(--loss)" : undefined} />
              <Row label={L(T.ruinSafe)} value={result.safeRisk != null ? fmtPct(result.safeRisk) : "-"} />
            </>
          )}
        />
      }
    />
  );
}

// ---------- Losing streak ----------

export function StreakBody({ ctx }: { ctx: Ctx }) {
  const L = useL(ctx.lang);
  const settings = useSettings();
  const { acc } = useAccount(ctx);
  const edge = useMemo(() => (ctx.journal && acc ? tradeEdge(ctx.trades.filter((t) => t.accountId === acc.id), settings.breakEven) : null), [ctx.journal, acc, ctx.trades, settings.breakEven]);
  const fWin = useJField(ctx.journal && edge ? asField(edge.winRate, 1) : null, acc?.id);
  const fRisk = useJField(ctx.journal ? settings.riskPct || null : null);
  const [nT, setNT] = useState("100");
  const winRate = parseNum(fWin.value), riskPct = parseNum(fRisk.value), n = Math.round(parseNum(nT));
  const q = 1 - winRate / 100;
  const likelyK = useMemo(() => (pos(winRate) && winRate < 100 && n >= 1 ? likelyLongestRun(n, q) : null), [n, q, winRate]);
  const table = useMemo(() => (likelyK != null ? streakTable(n, q, pos(riskPct) ? riskPct : 0) : []), [n, q, riskPct, likelyK]);
  const realStreak = useMemo(() => {
    if (!ctx.journal || !acc) return null;
    const mine = ctx.trades.filter((t) => t.accountId === acc.id && t.status === "closed" && t.pnl != null);
    let best = 0, cur = 0;
    for (const t of mine) { if ((t.pnl as number) < 0) { cur++; best = Math.max(best, cur); } else cur = 0; }
    return best || null;
  }, [ctx.journal, acc, ctx.trades]);

  const missing: L3[] = [];
  if (!Number.isFinite(winRate) || winRate < 0 || winRate > 100) missing.push(T.winRate);
  if (!(n >= 1)) missing.push(T.nTrades);

  return (
    <Layout
      inputs={
        <InputsCard>
          <Section label={L(T.secAccount)}>
            <AccountField ctx={ctx} />
          </Section>
          <Section label={L(T.secStreakParams)}>
            <JNumField lang={ctx.lang} label={L(T.winRate)} f={fWin} suffix="%" />
            <Pair>
              <NumField lang={ctx.lang} label={L(T.nTrades)} value={nT} onChange={setNT} />
              <JNumField lang={ctx.lang} label={L(T.riskPct)} f={fRisk} suffix="%" />
            </Pair>
          </Section>
        </InputsCard>
      }
      result={
        <ResultCard
          lang={ctx.lang} color={ctx.color} tone={ctx.tone}
          missing={missing.length ? fillIn(ctx.lang, missing) : likelyK == null ? "-" : undefined}
          big={likelyK != null ? String(likelyK) : "-"}
          sentence={likelyK != null ? say(L(T.streakSay), { n: fmtN(n, 0), wr: pct(winRate), k: String(likelyK) }) : undefined}
          rows={
            <>
              {realStreak != null && <Row label={L(T.yourStreak)} value={String(realStreak)} />}
              {table.length > 0 && (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted">
                        <th className="py-1.5 text-start font-medium">k</th>
                        <th className="py-1.5 text-end font-medium">{L(T.streakProb)}</th>
                        {pos(riskPct) && <th className="py-1.5 text-end font-medium">{L(T.streakCost)}</th>}
                      </tr>
                    </thead>
                    <tbody className="calc-rows">
                      {table.map((row) => (
                        <tr key={row.k} className={row.k === likelyK ? "font-bold" : ""}>
                          <td className="tnum py-1.5 text-muted"><bdi dir="ltr">{`${row.k}+`}</bdi></td>
                          <td className="tnum py-1.5 text-end"><bdi dir="ltr">{pct(row.pAtLeast * 100)}</bdi></td>
                          {pos(riskPct) && <td className="tnum py-1.5 text-end"><bdi dir="ltr">{pct(row.cost)}</bdi></td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          }
        />
      }
    />
  );
}

// ---------- Portfolio risk ----------

interface PortRow { id: string; sym: string; lotsT: string; stopT: string; contractT: string; rateT: string; priceT: string; pipT: string; noStop: boolean }
let rowSeq = 0;
const newRow = (): PortRow => ({ id: String(++rowSeq), sym: "", lotsT: "1", stopT: "", contractT: "", rateT: "", priceT: "", pipT: "", noStop: false });

function usePortRows(ctx: Ctx, acc: ReturnType<typeof useAccount>["acc"], cur: string) {
  const [rows, setRows] = useState<PortRow[]>(() => [newRow()]);
  const prevAccRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!ctx.journal || !acc || acc.id === prevAccRef.current) return;
    prevAccRef.current = acc.id;
    const open = ctx.trades.filter((t) => t.accountId === acc.id && t.status === "open");
    if (!open.length) { setRows([newRow()]); return; }
    setRows(open.map((t) => {
      const sp = symbolSpec(t.symbol || "");
      const pip = sp.pip ?? 0.0001;
      let stopT = "";
      if (t.sl != null && Number.isFinite(t.sl) && Number.isFinite(t.entryPrice)) {
        const dist = Math.abs(t.entryPrice - t.sl);
        stopT = ctx.unit === "pips" && sp.pip ? String(Math.round(dist / pip)) : String(Math.round(dist * 100000) / 100000);
      }
      return { id: t.key, sym: t.symbol || "", lotsT: String(t.qty), stopT, contractT: "", rateT: "", priceT: "", pipT: "", noStop: t.sl == null };
    }));
  }, [ctx.journal, acc?.id, ctx.trades, ctx.unit]); // eslint-disable-line react-hooks/exhaustive-deps

  return { rows, setRows };
}

export function PortBody({ ctx }: { ctx: Ctx }) {
  const L = useL(ctx.lang);
  const { acc, cur } = useAccount(ctx);
  const { rows, setRows } = usePortRows(ctx, acc, cur);
  const [pipSizes, setPipSize] = usePipSizes();
  const [limitT, setLimitT] = useState("5");
  const bal = useMemo(() => (acc ? currentBalance(acc, ctx.trades, ctx.balances[acc.id] ?? [], ctx.flows) : NaN), [acc, ctx.trades, ctx.balances, ctx.flows]);
  const money = moneyFmt(cur, false);
  const inPips = ctx.unit === "pips";

  const risks = useMemo(() => rows.map((row) => {
    const sp = symbolSpec(row.sym);
    const lots = parseNum(row.lotsT);
    const contract = sp.contract ?? parseNum(row.contractT);
    const pip = pipSizeFor(sp, pipSizes[row.sym.toUpperCase()] ?? (sp.pip == null ? row.pipT : undefined));
    let stopDist: number;
    if (inPips) stopDist = pipsToDistance(Math.abs(parseNum(row.stopT)), pip);
    else stopDist = Math.abs(parseNum(row.stopT));
    const rate = quoteToAccountRate(sp, cur, inPips ? parseNum(row.priceT) : NaN, parseNum(row.rateT));
    const riskMoney = lots * contract * stopDist * rate;
    return { riskMoney: Number.isFinite(riskMoney) && riskMoney > 0 ? riskMoney : NaN, noStop: row.noStop || (!row.stopT.trim() && !row.noStop), sym: row.sym, needRate: needsRate(sp, cur) && sp.base !== cur, needPrice: inPips && needsPrice(sp, cur) };
  }), [rows, cur, inPips, pipSizes]);

  const totalMoney = risks.reduce((s, r) => (Number.isFinite(r.riskMoney) ? s + r.riskMoney : s), 0);
  const totalPct = pos(bal) ? (totalMoney / bal) * 100 : NaN;
  const limit = parseNum(limitT);
  const above = Number.isFinite(totalPct) && pos(limit) ? totalPct > limit + 1e-9 : null;
  const setRow = (id: string, patch: Partial<PortRow>) => setRows((r) => r.map((x) => x.id === id ? { ...x, ...patch } : x));
  const addRow = () => setRows((r) => [...r, newRow()]);
  const removeRow = (id: string) => setRows((r) => r.length > 1 ? r.filter((x) => x.id !== id) : r);

  return (
    <div className="grid items-start gap-4 md:grid-cols-2">
      <InputsCard>
        <Section label={L(T.secAccount)}>
          <AccountField ctx={ctx} />
        </Section>
        <Section label={L(T.secPortRows)}>
          {rows.map((row, i) => {
            const sp = symbolSpec(row.sym);
            const rk = risks[i];
            const symKey = row.sym.toUpperCase();
            return (
              <div key={row.id} className="flex flex-col gap-2 rounded-xl border border-border p-3">
                <div className="flex items-center gap-2">
                  <div className="flex-1"><SymbolField lang={ctx.lang} value={row.sym} onChange={(v) => setRow(row.id, { sym: v, noStop: false })} mine={accountSymbols(ctx.trades, acc?.id)} /></div>
                  {rows.length > 1 && <button type="button" onClick={() => removeRow(row.id)} className="shrink-0 text-xs text-muted hover:text-loss">✕</button>}
                </div>
                {row.noStop && <p className="text-xs font-semibold text-loss">{L(T.noStop)}</p>}
                <Pair>
                  <NumField lang={ctx.lang} label={L(T.lots)} value={row.lotsT} onChange={(v) => setRow(row.id, { lotsT: v })} />
                  <NumField lang={ctx.lang} label={inPips ? L(T.stopPips) : L(T.stop)} value={row.stopT} onChange={(v) => setRow(row.id, { stopT: v, noStop: false })} />
                </Pair>
                {sp.pip == null && row.sym.trim() !== "" && <NumField lang={ctx.lang} label={L(T.pipSize)} value={pipSizes[symKey] ?? ""} onChange={(v) => setPipSize(row.sym, v)} hint={L(T.pipHint)} />}
                {inPips && rk.needPrice && <NumField lang={ctx.lang} label={L(T.price)} value={row.priceT} onChange={(v) => setRow(row.id, { priceT: v })} />}
                {sp.contract == null && row.sym.trim() !== "" && <NumField lang={ctx.lang} label={L(T.contract)} value={row.contractT} onChange={(v) => setRow(row.id, { contractT: v })} hint={L(T.contractHint)} />}
                {rk.needRate && <NumField lang={ctx.lang} label={<bdi dir="ltr">1 {sp.quote} = ? {cur}</bdi>} value={row.rateT} onChange={(v) => setRow(row.id, { rateT: v })} />}
                {Number.isFinite(rk.riskMoney) && <div className="text-end text-xs text-muted"><bdi dir="ltr">{money(rk.riskMoney)}</bdi></div>}
              </div>
            );
          })}
          <button type="button" onClick={addRow} className="calc-chip self-start text-xs">{L(T.addRow)}</button>
        </Section>
        <Section label={L(T.secPortTotal)}>
          <NumField lang={ctx.lang} label={L(T.portLimit)} value={limitT} onChange={setLimitT} suffix="%" />
        </Section>
      </InputsCard>
      <ResultCard
        lang={ctx.lang} color={ctx.color} tone={ctx.tone}
        missing={risks.length === 0 ? fillIn(ctx.lang, [T.lots, T.stop]) : undefined}
        big={Number.isFinite(totalPct) ? pct(totalPct) : money(totalMoney)}
        pill={above != null ? <SafePill lang={ctx.lang} safe={!above} /> : undefined}
        sentence={Number.isFinite(totalPct) && pos(limit) ? say(L(T.portSay), { total: pct(totalPct), limit: pct(limit) }) : undefined}
        rows={
          <>
            <Row label={L(T.portRiskMoney)} value={money(totalMoney)} />
            {Number.isFinite(totalPct) && <Row label={L(T.portRiskPct)} value={pct(totalPct)} />}
            {pos(bal) && <Row label={L(T.balance)} value={money(bal, { cents: false })} />}
            {risks.map((r, i) => r.sym && Number.isFinite(r.riskMoney) && <Row key={rows[i].id} label={rows[i].sym} value={money(r.riskMoney)} />)}
          </>
        }
      />
    </div>
  );
}

// ---------- Expectancy ----------

export function ExpBody({ ctx }: { ctx: Ctx }) {
  const L = useL(ctx.lang);
  const settings = useSettings();
  const { acc, cur } = useAccount(ctx);
  const edge = useMemo(() => (ctx.journal && acc ? tradeEdge(ctx.trades.filter((t) => t.accountId === acc.id), settings.breakEven) : null), [ctx.journal, acc, ctx.trades, settings.breakEven]);
  const jAvgWin = useMemo(() => {
    if (!ctx.journal || !acc) return null;
    const mine = ctx.trades.filter((t) => t.accountId === acc.id && t.status === "closed" && t.pnl != null && Number.isFinite(t.pnl) && (t.pnl as number) > settings.breakEven);
    if (!mine.length) return null;
    return mine.reduce((s, t) => s + (t.pnl as number), 0) / mine.length;
  }, [ctx.journal, acc, ctx.trades, settings.breakEven]);
  const jAvgLoss = useMemo(() => {
    if (!ctx.journal || !acc) return null;
    const mine = ctx.trades.filter((t) => t.accountId === acc.id && t.status === "closed" && t.pnl != null && Number.isFinite(t.pnl) && (t.pnl as number) < -settings.breakEven);
    if (!mine.length) return null;
    return Math.abs(mine.reduce((s, t) => s + (t.pnl as number), 0) / mine.length);
  }, [ctx.journal, acc, ctx.trades, settings.breakEven]);

  const fWin = useJField(ctx.journal && edge ? asField(edge.winRate, 1) : null, acc?.id);
  const fAW = useJField(ctx.journal ? asField(jAvgWin) : null, acc?.id);
  const fAL = useJField(ctx.journal ? asField(jAvgLoss) : null, acc?.id);

  const winRate = parseNum(fWin.value), avgWin = parseNum(fAW.value), avgLoss = parseNum(fAL.value);
  const res = expectancy(winRate, avgWin, avgLoss);
  const money = moneyFmt(cur, ctx.hidden && (fAW.fromJournal || fAL.fromJournal));

  const missing: L3[] = [];
  if (!Number.isFinite(winRate)) missing.push(T.winRate);
  if (!pos(avgWin)) missing.push(T.avgWin);
  if (!pos(avgLoss)) missing.push(T.avgLoss);

  return (
    <Layout
      inputs={
        <InputsCard>
          <Section label={L(T.secAccount)}>
            <AccountField ctx={ctx} />
            {ctx.journal && edge && edge.n > 0 && <Hint>{say(L(T.fromTrades), { n: fmtN(edge.n, 0) })}</Hint>}
          </Section>
          <Section label={L(T.secExpInput)}>
            <JNumField lang={ctx.lang} label={L(T.winRate)} f={fWin} suffix="%" />
            <Pair>
              <JNumField lang={ctx.lang} label={L(T.avgWin)} f={fAW} hidden={ctx.hidden} money />
              <JNumField lang={ctx.lang} label={L(T.avgLoss)} f={fAL} hint={undefined} hidden={ctx.hidden} money />
            </Pair>
          </Section>
        </InputsCard>
      }
      result={
        <ResultCard
          lang={ctx.lang} color={ctx.color} tone={ctx.tone}
          missing={missing.length ? fillIn(ctx.lang, missing) : undefined}
          big={Number.isFinite(res.e) ? money(res.e, { sign: true, cents: true }) : "-"}
          bigColor={Number.isFinite(res.e) ? (res.e > 0 ? "var(--profit)" : res.e < 0 ? "var(--loss)" : undefined) : undefined}
          sentence={Number.isFinite(res.e) ? say(L(T.expSay), { money: money(res.e) }) : undefined}
          rows={Number.isFinite(res.e) && (
            <>
              <Row label={L(T.expR)} value={`${res.eR > 0 ? "+" : ""}${fmtN(res.eR, 3)} R`} color={res.eR > 0 ? "var(--profit)" : res.eR < 0 ? "var(--loss)" : undefined} />
              <Row label={L(T.expBe)} value={pct(res.beWinRate)} />
              <Row label={L(T.expPer100)} value={money(res.per100, { sign: true })} />
            </>
          )}
        />
      }
    />
  );
}

// ---------- Required win rate ----------

const RR_TABLE = [0.5, 1, 1.5, 2, 2.5, 3, 4];

export function WrBody({ ctx }: { ctx: Ctx }) {
  const L = useL(ctx.lang);
  const [rrT, setRrT] = useState("2"), [targetT, setTargetT] = useState("0");
  const rr = parseNum(rrT), targetE = parseNum(targetT);
  const wr = requiredWinRate(rr, Number.isFinite(targetE) ? targetE : 0);

  return (
    <Layout
      inputs={
        <InputsCard>
          <Section label={L(T.secWrInput)}>
            <NumField lang={ctx.lang} label={L(T.rewardRisk)} value={rrT} onChange={setRrT} />
            <NumField lang={ctx.lang} label={L(T.targetE)} value={targetT} onChange={setTargetT} />
          </Section>
        </InputsCard>
      }
      result={
        <ResultCard
          lang={ctx.lang} color={ctx.color} tone={ctx.tone}
          missing={!pos(rr) ? fillIn(ctx.lang, [T.rewardRisk]) : undefined}
          big={pct(wr)}
          sentence={say(L(T.wrSay), { rr: fmtN(rr, 2), wr: pct(wr) })}
          rows={
            <>
              {RR_TABLE.map((r) => (
                <Row key={r} label={<bdi dir="ltr">1 : {r}</bdi>} value={pct(requiredWinRate(r, Number.isFinite(targetE) ? targetE : 0))} color={Math.abs(r - rr) < 1e-9 ? ctx.tone : undefined} />
              ))}
            </>
          }
        />
      }
    />
  );
}

// ---------- Kelly ----------

export function KellyBody({ ctx }: { ctx: Ctx }) {
  const L = useL(ctx.lang);
  const settings = useSettings();
  const { acc, cur } = useAccount(ctx);
  const edge = useMemo(() => (ctx.journal && acc ? tradeEdge(ctx.trades.filter((t) => t.accountId === acc.id), settings.breakEven) : null), [ctx.journal, acc, ctx.trades, settings.breakEven]);
  const fWin = useJField(ctx.journal && edge ? asField(edge.winRate, 1) : null, acc?.id);
  const fPay = useJField(ctx.journal && edge ? asField(edge.payoff) : null, acc?.id);
  const winRate = parseNum(fWin.value), payoff = parseNum(fPay.value);
  const res = kellyFull(winRate, payoff);

  const missing: L3[] = [];
  if (!Number.isFinite(winRate) || winRate < 0) missing.push(T.winRate);
  if (!pos(payoff)) missing.push(T.payoff);

  return (
    <Layout
      inputs={
        <InputsCard>
          <Section label={L(T.secAccount)}>
            <AccountField ctx={ctx} />
            {ctx.journal && edge && edge.n > 0 && <Hint>{say(L(T.fromTrades), { n: fmtN(edge.n, 0) })}</Hint>}
          </Section>
          <Section label={L(T.secKellyInput)}>
            <JNumField lang={ctx.lang} label={L(T.winRate)} f={fWin} suffix="%" />
            <JNumField lang={ctx.lang} label={L(T.payoff)} f={fPay} />
          </Section>
        </InputsCard>
      }
      result={
        <ResultCard
          lang={ctx.lang} color={ctx.color} tone={ctx.tone}
          missing={missing.length ? fillIn(ctx.lang, missing) : undefined}
          big={!res.ok ? "-" : pct(res.half * 100)} unit={res.ok ? undefined : undefined}
          sentence={res.ok ? say(L(T.kellySay), { wr: pct(winRate), pay: fmtN(payoff, 2), half: pct(res.half * 100) }) : L(T.kellyNoEdge)}
          rows={res.ok && (
            <>
              <Row label={L(T.kellyFull)} value={pct(res.f * 100)} />
              <Row label={L(T.kellyHalf)} value={pct(res.half * 100)} color={ctx.tone} />
              <Row label={L(T.kellyQuarter)} value={pct(res.quarter * 100)} />
            </>
          )}
        >
          {res.ok && (
            <button type="button" className="inline-flex items-center gap-1.5 text-xs font-semibold text-icon hover:underline" onClick={() => window.dispatchEvent(new CustomEvent("mizan-open-charts"))}>
              <ExternalLink size={12} aria-hidden />
              {L(T.openCharts)} › {L({ en: "Size", ar: "الحجم", fr: "Taille" })}
            </button>
          )}
        </ResultCard>
      }
    />
  );
}

// ---------- Monte Carlo ----------

function FanChart({ mc, label }: { mc: McResult; label: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  if (mc.steps.length < 2) return null;
  const W = 600, H = 160, P = 10;
  const lo = Math.min(...mc.p5), hi = Math.max(...mc.p95);
  const rng2 = hi - lo || 1;
  const X = (i: number) => P + (i / (mc.steps.length - 1)) * (W - 2 * P);
  const Y = (v: number) => P + (1 - (v - lo) / rng2) * (H - 2 * P);
  const bandD = mc.p5.map((v, i) => `${i === 0 ? "M" : "L"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("") +
    [...mc.p95].reverse().map((v, i) => `L${X(mc.p95.length - 1 - i).toFixed(1)},${Y(v).toFixed(1)}`).join("") + "Z";
  const medD = mc.p50.map((v, i) => `${i === 0 ? "M" : "L"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("");
  const baseline = Y(0), showBase = baseline >= P && baseline <= H - P;
  return (
    <div dir="ltr" className="h-28">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full overflow-visible" role="img" aria-label={label}>
        {showBase && <line x1={P} x2={W - P} y1={baseline} y2={baseline} stroke="var(--chart-axis)" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
        <path d={bandD} fill="var(--primary)" fillOpacity="0.15" />
        <path d={medD} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

export function McBody({ ctx }: { ctx: Ctx }) {
  const L = useL(ctx.lang);
  const settings = useSettings();
  const { acc, cur } = useAccount(ctx);
  const money = moneyFmt(cur, ctx.hidden && ctx.journal);
  const edge = useMemo(() => (ctx.journal && acc ? tradeEdge(ctx.trades.filter((t) => t.accountId === acc.id), settings.breakEven) : null), [ctx.journal, acc, ctx.trades, settings.breakEven]);

  // Journal: closed trade P&Ls
  const journalPnls = useMemo(() => (!ctx.journal || !acc ? [] : ctx.trades.filter((t) => t.accountId === acc.id && t.status === "closed" && t.pnl != null && Number.isFinite(t.pnl)).map((t) => t.pnl as number)), [ctx.journal, acc, ctx.trades]);

  // Manual fields
  const fWin = useJField(ctx.journal && edge ? asField(edge.winRate, 1) : null, acc?.id);
  const jAvgWin = useMemo(() => {
    if (!ctx.journal || !acc) return null;
    const wins = ctx.trades.filter((t) => t.accountId === acc.id && t.status === "closed" && t.pnl != null && (t.pnl as number) > settings.breakEven);
    return wins.length ? wins.reduce((s, t) => s + (t.pnl as number), 0) / wins.length : null;
  }, [ctx.journal, acc, ctx.trades, settings.breakEven]);
  const jAvgLoss = useMemo(() => {
    if (!ctx.journal || !acc) return null;
    const losses = ctx.trades.filter((t) => t.accountId === acc.id && t.status === "closed" && t.pnl != null && (t.pnl as number) < -settings.breakEven);
    return losses.length ? Math.abs(losses.reduce((s, t) => s + (t.pnl as number), 0) / losses.length) : null;
  }, [ctx.journal, acc, ctx.trades, settings.breakEven]);

  const fAW = useJField(ctx.journal ? asField(jAvgWin) : null, acc?.id);
  const fAL = useJField(ctx.journal ? asField(jAvgLoss) : null, acc?.id);
  const [nT, setNT] = useState("100");

  const pnls = useMemo(() => {
    if (ctx.journal) return journalPnls;
    const wr = parseNum(fWin.value), aw = parseNum(fAW.value), al = parseNum(fAL.value), n = Math.round(parseNum(nT));
    return buildPnlSample(wr, aw, al, n);
  }, [ctx.journal, journalPnls, fWin.value, fAW.value, fAL.value, nT]);

  const dPnls = useDebounce(pnls, 250);
  const mc: McResult | null = useMemo(() => runMonteCarlo(dPnls), [dPnls]);

  const missing: L3[] = [];
  if (!ctx.journal) {
    if (!Number.isFinite(parseNum(fWin.value))) missing.push(T.winRate);
    if (!pos(parseNum(fAW.value))) missing.push(T.avgWin);
    if (!pos(parseNum(fAL.value))) missing.push(T.avgLoss);
    if (!(Math.round(parseNum(nT)) >= 2)) missing.push(T.mcSample);
  } else if (journalPnls.length < 2) {
    missing.push({ en: "2 closed trades", ar: "صفقتان مغلقتان على الأقل", fr: "2 trades clôturés" });
  }

  return (
    <Layout
      inputs={
        <InputsCard>
          <Section label={L(T.secAccount)}>
            <AccountField ctx={ctx} />
            {ctx.journal && edge && edge.n > 0 && <Hint>{say(L(T.fromJournalTrades), { n: fmtN(edge.n, 0) })}</Hint>}
          </Section>
          {!ctx.journal && (
            <Section label={L(T.secMcInput)}>
              <JNumField lang={ctx.lang} label={L(T.winRate)} f={fWin} suffix="%" />
              <Pair>
                <JNumField lang={ctx.lang} label={L(T.avgWin)} f={fAW} hidden={ctx.hidden} money />
                <JNumField lang={ctx.lang} label={L(T.avgLoss)} f={fAL} hidden={ctx.hidden} money />
              </Pair>
              <NumField lang={ctx.lang} label={L(T.mcSample)} value={nT} onChange={setNT} />
            </Section>
          )}
        </InputsCard>
      }
      result={
        <ResultCard
          lang={ctx.lang} color={ctx.color} tone={ctx.tone}
          missing={missing.length ? fillIn(ctx.lang, missing) : !mc ? L(T.mcTooFew) : undefined}
          big={mc ? pct(mc.probProfit) : "-"}
          bigColor={mc ? (mc.probProfit >= 50 ? "var(--profit)" : "var(--loss)") : undefined}
          sentence={mc ? say(L(T.mcSay), { prob: pct(mc.probProfit) }) : undefined}
          rows={mc && (
            <>
              <Row label={L(T.mcMedian)} value={money(mc.finalP50, { sign: true })} />
              <Row label={L(T.mcP5)} value={money(mc.finalP5, { sign: true })} />
              <Row label={L(T.mcDdMedian)} value={money(mc.ddMedian)} />
              <Row label={L(T.mcDdP95)} value={money(mc.ddP95)} />
              <Row label="Paths" value={say(L(T.mcPaths), { n: fmtN(mc.paths, 0), h: fmtN(mc.horizon, 0) })} words />
            </>
          )}
        >
          {mc && <FanChart mc={mc} label={L(T.mcFanLabel)} />}
          <button type="button" className="inline-flex items-center gap-1.5 text-xs font-semibold text-icon hover:underline mt-1" onClick={() => window.dispatchEvent(new CustomEvent("mizan-open-charts"))}>
            <ExternalLink size={12} aria-hidden />
            {L(T.openCharts)} › {L({ en: "Monte Carlo", ar: "مونت كارلو", fr: "Monte-Carlo" })}
          </button>
        </ResultCard>
      }
    />
  );
}
