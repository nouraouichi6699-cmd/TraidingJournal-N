// Trade setup: position size, risk/reward, profit and loss, pip value, margin and ATR size. Each body reads its
// inputs, calls the maths in lib/calculators and lays out the two cards; nothing is worked out here.
import { useMemo, useState, type ReactNode } from "react";
import { usePipSizes, useSizeCalc } from "../../useCalculators";
import { readSettings } from "../../useSettings";
import { currentBalance } from "../../lib/balance";
import { pipSize } from "../../lib/pips";
import {
  atrSize, defaultPipSize, marginFor, moneyFor, needsPrice, needsRate, parseNum, pipSizeFor, pipsToDistance, pipValue, profitLoss, profitLossPips,
  quoteToAccountRate, rateKey, riskReward, riskRewardPips, symbolSpec, type SymbolSpec,
} from "../../lib/calculators";
import { T, type L3 } from "./text";
import {
  accountSymbols, AccountField, asField, fill, fillIn, fmtLots, fmtN, fmtPct, fmtPrice, Hint, InputsCard, JNumField, moneyFmt, NumField, Pair, ResultCard, Row,
  SafePill, say, Section, Seg, SymbolField, UnitSeg, useAccount, useJField, useL, type Ctx,
} from "./ui";

const pos = (v: number) => Number.isFinite(v) && v > 0;
/** A price distance as pips when there is a pip size (the symbol's, or the one counted in), else in price. */
const distTxt = (d: number, pip: number | null, L: (x: L3) => string) => (pip && d > 0 ? `${fmtN(d / pip, 1)} ${L(T.pips)}` : fmtPrice(d));
/** A number of pips as typed. */
const pipsTxt = (n: number, L: (x: L3) => string) => `${fmtN(n, 1)} ${L(T.pips)}`;
/** The pip size field of a symbol: what was typed for it, else its default (gold 0.1, silver 0.01, others empty). */
const pipFieldOf = (typed: Record<string, string>, sym: string, sp: SymbolSpec) => typed[sym.toUpperCase()] ?? String(defaultPipSize(sp) ?? "");

function Layout({ inputs, result }: { inputs: ReactNode; result: ReactNode }) {
  return <div className="grid items-start gap-4 md:grid-cols-2">{inputs}{result}</div>;
}

/** In pips: the pip size (any symbol but forex, remembered per symbol) and the current price, asked only when the
 *  conversion needs it (the account currency is the pair's base). */
function PipPrice({ ctx, sp, cur, sym, pip, setPip, price, setPrice }: { ctx: Ctx; sp: SymbolSpec; cur: string; sym: string; pip: string; setPip: (v: string) => void; price: string; setPrice: (v: string) => void }) {
  const L = useL(ctx.lang);
  return (
    <>
      {sp.pip == null && sym.trim() !== "" && <NumField lang={ctx.lang} label={L(T.pipSize)} value={pip} onChange={setPip} hint={L(T.pipHint)} />}
      {needsPrice(sp, cur) && <NumField lang={ctx.lang} label={L(T.price)} value={price} onChange={setPrice} hint={fill(L(T.priceHint), { cur })} />}
    </>
  );
}

/** The contract size and the quote-to-account rate, asked only when the symbol needs them. */
function ContractRate({ ctx, sp, cur, sym, contract, setContract, rate, setRate }: { ctx: Ctx; sp: SymbolSpec; cur: string; sym: string; contract: string; setContract: (v: string) => void; rate: string; setRate: (v: string) => void }) {
  const L = useL(ctx.lang);
  return (
    <>
      {sp.contract == null && sym.trim() !== "" && <NumField lang={ctx.lang} label={L(T.contract)} value={contract} onChange={setContract} hint={L(T.contractHint)} />}
      {needsRate(sp, cur) && <NumField lang={ctx.lang} label={<bdi dir="ltr">1 {sp.quote} = ? {cur}</bdi>} value={rate} onChange={setRate} />}
    </>
  );
}

// ---------- Position size ----------

export function SizeBody({ ctx }: { ctx: Ctx }) {
  const L = useL(ctx.lang);
  // a balance typed over the journal's (journal mode), or the balance itself (manual mode)
  const [own, setOwn] = useState<string | null>(null);
  const balance = ctx.journal ? (own == null ? undefined : parseNum(own)) : parseNum(own ?? "");
  const h = useSizeCalc(ctx, { balance, journal: ctx.journal, cur: ctx.cur });
  const { s, save, r, cur } = h;
  if (!r) return <p className="text-sm text-muted">{L(T.noAccount)}</p>;
  const money = moneyFmt(cur, ctx.hidden && ctx.journal);
  const fromJournal = ctx.journal && own == null;
  const symKey = h.sym.toUpperCase();

  const missing: L3[] = [];
  if (s.mode === "pct" && !pos(r.bal)) missing.push(T.balance);
  if (!pos(parseNum(s.mode === "pct" ? s.pct : s.amt))) missing.push(T.risk);
  if (!h.sym.trim()) missing.push(T.symbol);
  if (h.inPips) {
    if (!Number.isFinite(r.sPips)) missing.push(T.stopPips);
    if (h.sym.trim() && r.sp.pip == null && !pos(r.pip)) missing.push(T.pipSize);
    if (r.needPrice && !pos(r.px)) missing.push(T.price);
  } else {
    if (!Number.isFinite(r.e)) missing.push(T.entry);
    if (!Number.isFinite(r.st)) missing.push(T.stop);
  }
  if (h.sym.trim() && r.sp.contract == null && !pos(r.contract)) missing.push(T.contract);
  if (r.needRate && !pos(parseNum(s.rates[rateKey(r.sp, cur)] ?? ""))) missing.push(T.rate);
  const over = !!r.safe && r.ok && r.lots >= 0.01 && r.real > r.safe.v + 0.005;
  const dist = distTxt(r.dist, h.inPips ? r.pip : r.sp.pip, L);

  return (
    <Layout
      inputs={
        <InputsCard>
          <Section label={L(T.secAccount)}>
            <AccountField ctx={ctx} value={h.acc?.id} onChange={(id) => { save({ acc: id, sym: "" }); ctx.setAccId(id); if (ctx.journal) setOwn(null); }} />
            <NumField
              lang={ctx.lang} label={L(T.balance)} value={own ?? (ctx.journal ? asField(r.bal) ?? "" : "")} onChange={setOwn}
              journal={fromJournal} masked={fromJournal && ctx.hidden} onReset={ctx.journal && own != null ? () => setOwn(null) : undefined}
            />
          </Section>
          <Section label={L(T.secRisk)}>
            <div className="flex flex-col gap-1 text-xs font-medium text-muted">
              <span>{L(T.risk)}</span>
              <div className="flex items-center gap-2">
                <div className="flex-1" dir="ltr">
                  <input className="field tnum" inputMode="decimal" aria-label={L(T.risk)} value={s.mode === "pct" ? s.pct : s.amt} onChange={(e) => save(s.mode === "pct" ? { pct: e.target.value } : { amt: e.target.value })} />
                </div>
                <Seg label={L(T.risk)} value={s.mode} onChange={(m) => save({ mode: m })} options={[{ v: "pct", label: "%" }, { v: "amt", label: cur === "USD" ? "$" : cur }]} />
              </div>
              <span className="text-[11px] font-normal">{s.mode === "pct" ? L(T.pctOfBal) : L(T.amount)}{s.mode === "pct" && Number.isFinite(r.riskMoney) && <> · <bdi dir="ltr">{money(r.riskMoney)}</bdi></>}</span>
            </div>
          </Section>
          <Section label={L(T.secTrade)} aside={<UnitSeg lang={ctx.lang} value={h.inPips ? "pips" : "price"} onChange={(u) => save({ unit: u })} />}>
            <SymbolField lang={ctx.lang} value={h.sym} onChange={(v) => save({ sym: v })} mine={h.symbols} />
            {h.inPips ? (
              <>
                <NumField lang={ctx.lang} label={L(T.stopPips)} value={h.stopPips} onChange={h.setStopPips} />
                <PipPrice ctx={ctx} sp={r.sp} cur={cur} sym={h.sym} pip={h.pipField} setPip={h.setPipField} price={h.price} setPrice={h.setPrice} />
              </>
            ) : (
              <Pair>
                <NumField lang={ctx.lang} label={L(T.entry)} value={h.entry} onChange={h.setEntry} />
                <NumField lang={ctx.lang} label={L(T.stop)} value={h.stop} onChange={h.setStop} />
              </Pair>
            )}
            <ContractRate
              ctx={ctx} sp={r.sp} cur={cur} sym={h.sym}
              contract={s.contracts[symKey] ?? ""} setContract={(v) => save({ contracts: { ...s.contracts, [symKey]: v } })}
              rate={s.rates[rateKey(r.sp, cur)] ?? ""} setRate={(v) => save({ rates: { ...s.rates, [rateKey(r.sp, cur)]: v } })}
            />
          </Section>
        </InputsCard>
      }
      result={
        <ResultCard
          lang={ctx.lang} color={ctx.color} tone={ctx.tone}
          missing={missing.length ? fillIn(ctx.lang, missing) : r.dist === 0 ? L(h.inPips ? T.stopZero : T.stopAtEntry) : !r.ok ? "-" : r.lots < 0.01 ? <span className="text-loss">{L(T.tiny)}</span> : undefined}
          big={fmtLots(r.lots)} unit={L(T.lotsUnit)}
          pill={r.safe ? <SafePill lang={ctx.lang} safe={!over} /> : undefined}
          sentence={say(L(T.sizeSay), { risk: money(r.real), dist })}
          rows={
            <>
              <Row label={L(T.real)} value={money(r.real)} />
              <Row label={L(T.dist)} value={dist} />
              {pos(r.bal) && <Row label={L(T.balance)} value={money(r.bal, { cents: false })} />}
              {r.safe && <Row label={fill(L(T.safeRow), { n: r.safe.name })} value={money(r.safe.v)} />}
            </>
          }
        >
          {over && <p className="text-xs font-medium text-loss">{L(T.over)}</p>}
          <Hint>{L(T.stepNote)}</Hint>
        </ResultCard>
      }
    />
  );
}

// ---------- Risk / Reward ----------

export function RrBody({ ctx }: { ctx: Ctx }) {
  const L = useL(ctx.lang);
  const { acc, cur } = useAccount(ctx);
  const mine = useMemo(() => accountSymbols(ctx.trades, acc?.id), [ctx.trades, acc]);
  const inPips = ctx.unit === "pips";
  const [entry, setEntry] = useState(""), [stop, setStop] = useState(""), [target, setTarget] = useState("");
  const [stopP, setStopP] = useState(""), [targetP, setTargetP] = useState(""), [priceT, setPriceT] = useState("");
  const [sym, setSym] = useState(""), [lots, setLots] = useState(""), [contractT, setContractT] = useState(""), [rateT, setRateT] = useState("");
  const [pipSizes, setPipSize] = usePipSizes();
  const sp = symbolSpec(sym), contract = sp.contract ?? parseNum(contractT), pip = pipSizeFor(sp, pipSizes[sym.toUpperCase()]);
  const e = parseNum(entry);
  // in pips, risk and reward come back in pips: their price distances (for the money) are x the pip size
  const res = inPips ? riskRewardPips(parseNum(stopP), parseNum(targetP)) : riskReward(e, parseNum(stop), parseNum(target));
  const riskD = inPips ? pipsToDistance(res.risk, pip) : res.risk, rewardD = inPips ? pipsToDistance(res.reward, pip) : res.reward;
  const nLots = parseNum(lots), rate = quoteToAccountRate(sp, cur, inPips ? parseNum(priceT) : e, parseNum(rateT));
  const wantMoney = lots.trim() !== "";
  const mRisk = moneyFor(riskD, contract, nLots, rate), mReward = moneyFor(rewardD, contract, nLots, rate);
  const moneyOk = wantMoney && pos(mRisk) && pos(mReward);
  const money = moneyFmt(cur, false);
  const riskTxt = inPips ? pipsTxt(res.risk, L) : distTxt(res.risk, sp.pip, L), rewardTxt = inPips ? pipsTxt(res.reward, L) : distTxt(res.reward, sp.pip, L);

  const missing: L3[] = [];
  if (inPips) {
    if (!Number.isFinite(parseNum(stopP))) missing.push(T.stopPipsShort);
    if (!Number.isFinite(parseNum(targetP))) missing.push(T.targetPips);
  } else {
    if (!Number.isFinite(e)) missing.push(T.entry);
    if (!Number.isFinite(parseNum(stop))) missing.push(T.stop);
    if (!Number.isFinite(parseNum(target))) missing.push(T.target);
  }
  const moneyMissing: L3[] = [];
  if (wantMoney) {
    if (!pos(nLots)) moneyMissing.push(T.lots);
    if (!sym.trim()) moneyMissing.push(T.symbol);
    else if (sp.contract == null && !pos(contract)) moneyMissing.push(T.contract);
    if (inPips && sym.trim() && sp.pip == null && !pos(pip)) moneyMissing.push(T.pipSize);
    if (inPips && needsPrice(sp, cur) && !pos(parseNum(priceT))) moneyMissing.push(T.price);
    if (needsRate(sp, cur) && !pos(parseNum(rateT))) moneyMissing.push(T.rate);
  }
  const err = missing.length ? fillIn(ctx.lang, missing)
    : res.error === "stopAtEntry" ? L(inPips ? T.stopZero : T.stopAtEntry) : res.error === "targetAtEntry" ? L(inPips ? T.targetZero : T.targetAtEntry) : res.error === "sameSide" ? L(T.sameSide) : undefined;

  return (
    <Layout
      inputs={
        <InputsCard>
          <Section label={L(T.secTrade)} aside={<UnitSeg lang={ctx.lang} value={ctx.unit} onChange={ctx.setUnit} />}>
            {inPips ? (
              <Pair>
                <NumField lang={ctx.lang} label={L(T.stopPipsShort)} value={stopP} onChange={setStopP} />
                <NumField lang={ctx.lang} label={L(T.targetPips)} value={targetP} onChange={setTargetP} />
              </Pair>
            ) : (
              <>
                <NumField lang={ctx.lang} label={L(T.entry)} value={entry} onChange={setEntry} />
                <Pair>
                  <NumField lang={ctx.lang} label={L(T.stop)} value={stop} onChange={setStop} />
                  <NumField lang={ctx.lang} label={L(T.target)} value={target} onChange={setTarget} />
                </Pair>
                <Hint>{L(T.rrHint)}</Hint>
              </>
            )}
          </Section>
          <Section label={L(T.secMoney)}>
            <AccountField ctx={ctx} />
            <Pair>
              <SymbolField lang={ctx.lang} value={sym} onChange={setSym} mine={mine} />
              <NumField lang={ctx.lang} label={L(T.lots)} value={lots} onChange={setLots} />
            </Pair>
            {inPips && <PipPrice ctx={ctx} sp={sp} cur={cur} sym={sym} pip={pipFieldOf(pipSizes, sym, sp)} setPip={(v) => setPipSize(sym, v)} price={priceT} setPrice={setPriceT} />}
            <ContractRate ctx={ctx} sp={sp} cur={cur} sym={sym} contract={contractT} setContract={setContractT} rate={rateT} setRate={setRateT} />
          </Section>
        </InputsCard>
      }
      result={
        <ResultCard
          lang={ctx.lang} color={ctx.color} tone={ctx.tone} missing={err}
          big={`1 : ${fmtN(res.rr, 2)}`}
          sentence={say(L(T.rrSay), moneyOk ? { x: money(mRisk), y: money(mReward) } : { x: riskTxt, y: rewardTxt })}
          rows={
            <>
              {!inPips && <Row label={L(T.side)} value={res.side === "buy" ? L(T.buy) : L(T.sell)} words />}
              <Row label={L(T.riskDist)} value={riskTxt} />
              <Row label={L(T.rewardDist)} value={rewardTxt} />
              <Row label={L(T.beWin)} value={fmtPct(res.beWinRate, 1)} />
              {moneyOk && <Row label={L(T.moneyRisk)} value={money(mRisk)} />}
              {moneyOk && <Row label={L(T.moneyReward)} value={money(mReward)} />}
            </>
          }
        >
          {wantMoney && moneyMissing.length > 0 && <Hint>{fillIn(ctx.lang, moneyMissing)}</Hint>}
        </ResultCard>
      }
    />
  );
}

// ---------- Profit and loss ----------

export function PlBody({ ctx }: { ctx: Ctx }) {
  const L = useL(ctx.lang);
  const { acc, cur } = useAccount(ctx);
  const mine = useMemo(() => accountSymbols(ctx.trades, acc?.id), [ctx.trades, acc]);
  const [sym, setSym] = useState(() => mine[0] ?? ""), [side, setSide] = useState<"buy" | "sell">("buy"), [lots, setLots] = useState("");
  const [entry, setEntry] = useState(""), [exit, setExit] = useState(""), [contractT, setContractT] = useState(""), [rateT, setRateT] = useState("");
  const inPips = ctx.unit === "pips";
  const [resP, setResP] = useState(""), [priceT, setPriceT] = useState("");
  const [pipSizes, setPipSize] = usePipSizes();
  const sp = symbolSpec(sym), contract = sp.contract ?? parseNum(contractT), pip = pipSizeFor(sp, pipSizes[sym.toUpperCase()]);
  const e = parseNum(entry), x = parseNum(exit), n = parseNum(lots), pipsN = parseNum(resP);
  // converted at the exit price when the account currency is the pair's base (in pips: at the current price)
  const res = inPips
    ? profitLossPips(pipsN, pip, n, contract, quoteToAccountRate(sp, cur, parseNum(priceT), parseNum(rateT)))
    : profitLoss(side, n, e, x, contract, quoteToAccountRate(sp, cur, x, parseNum(rateT)));
  const money = moneyFmt(cur, false);

  const missing: L3[] = [];
  if (!sym.trim()) missing.push(T.symbol);
  if (!pos(n)) missing.push(T.lots);
  if (inPips) {
    if (!Number.isFinite(pipsN)) missing.push(T.resultPips);
    if (sym.trim() && sp.pip == null && !pos(pip)) missing.push(T.pipSize);
    if (needsPrice(sp, cur) && !pos(parseNum(priceT))) missing.push(T.price);
  } else {
    if (!Number.isFinite(e)) missing.push(T.entry);
    if (!Number.isFinite(x)) missing.push(T.exit);
  }
  if (sym.trim() && sp.contract == null && !pos(contract)) missing.push(T.contract);
  if (needsRate(sp, cur) && !pos(parseNum(rateT))) missing.push(T.rate);
  // the move in pips (as typed, or from the prices when the symbol has pips), else in price points
  const asPips = inPips || !!sp.pip;
  const mv = inPips ? pipsN : sp.pip ? res.move / sp.pip : res.move;
  const moveTxt = (signed: boolean) => `${signed && mv > 0 ? "+" : signed && mv < 0 ? "-" : ""}${asPips ? fmtN(Math.abs(mv), 1) : fmtPrice(Math.abs(mv))} ${asPips ? L(T.pips) : L(T.points)}`;
  const tpl = res.money > 0 ? T.plWin : res.money < 0 ? T.plLoss : inPips ? T.plFlatPips : T.plFlat;

  return (
    <Layout
      inputs={
        <InputsCard>
          <Section label={L(T.secTrade)} aside={<UnitSeg lang={ctx.lang} value={ctx.unit} onChange={ctx.setUnit} />}>
            <AccountField ctx={ctx} />
            <SymbolField lang={ctx.lang} value={sym} onChange={setSym} mine={mine} />
            {inPips ? (
              <>
                <Pair>
                  <NumField lang={ctx.lang} label={L(T.lots)} value={lots} onChange={setLots} />
                  <NumField lang={ctx.lang} label={L(T.resultPips)} value={resP} onChange={setResP} hint={L(T.resultPipsHint)} signed />
                </Pair>
                <PipPrice ctx={ctx} sp={sp} cur={cur} sym={sym} pip={pipFieldOf(pipSizes, sym, sp)} setPip={(v) => setPipSize(sym, v)} price={priceT} setPrice={setPriceT} />
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex flex-col gap-1 text-xs font-medium text-muted">
                    <span>{L(T.side)}</span>
                    <Seg label={L(T.side)} value={side} onChange={setSide} options={[{ v: "buy", label: L(T.buy) }, { v: "sell", label: L(T.sell) }]} />
                  </div>
                  <div className="min-w-[8rem] flex-1"><NumField lang={ctx.lang} label={L(T.lots)} value={lots} onChange={setLots} /></div>
                </div>
                <Pair>
                  <NumField lang={ctx.lang} label={L(T.entry)} value={entry} onChange={setEntry} />
                  <NumField lang={ctx.lang} label={L(T.exit)} value={exit} onChange={setExit} />
                </Pair>
              </>
            )}
            <ContractRate ctx={ctx} sp={sp} cur={cur} sym={sym} contract={contractT} setContract={setContractT} rate={rateT} setRate={setRateT} />
          </Section>
        </InputsCard>
      }
      result={
        <ResultCard
          lang={ctx.lang} color={ctx.color} tone={ctx.tone} missing={missing.length ? fillIn(ctx.lang, missing) : undefined}
          big={money(res.money, { sign: true })} bigColor={res.money > 0 ? "var(--profit)" : res.money < 0 ? "var(--loss)" : "var(--muted)"}
          sentence={say(L(tpl), { move: moveTxt(false), money: money(Math.abs(res.money)) })}
          rows={
            <>
              <Row label={L(T.move)} value={moveTxt(true)} />
              {!inPips && <Row label={L(T.side)} value={side === "buy" ? L(T.buy) : L(T.sell)} words />}
              <Row label={L(T.lots)} value={fmtLots(n)} />
            </>
          }
        />
      }
    />
  );
}

// ---------- Pip value ----------

export function PipBody({ ctx }: { ctx: Ctx }) {
  const L = useL(ctx.lang);
  const { acc, cur } = useAccount(ctx);
  const mine = useMemo(() => accountSymbols(ctx.trades, acc?.id), [ctx.trades, acc]);
  const [sym, setSym] = useState(() => mine[0] ?? ""), [lots, setLots] = useState("1"), [stepT, setStepT] = useState("");
  const [priceT, setPriceT] = useState(""), [contractT, setContractT] = useState(""), [rateT, setRateT] = useState("");
  const sp = symbolSpec(sym), forex = sp.pip != null;
  const step = forex ? (sp.pip as number) : stepT.trim() ? parseNum(stepT) : pipSize(sym);
  const contract = sp.contract ?? parseNum(contractT);
  const needPrice = !!sp.base && sp.base === cur && sp.quote !== cur;
  const n = parseNum(lots);
  const res = pipValue(step, contract, quoteToAccountRate(sp, cur, parseNum(priceT), parseNum(rateT)), n);
  const money = moneyFmt(cur, false);

  const missing: L3[] = [];
  if (!sym.trim()) missing.push(T.symbol);
  if (!pos(n)) missing.push(T.lots);
  if (!forex && !pos(step)) missing.push(T.step);
  if (sym.trim() && sp.contract == null && !pos(contract)) missing.push(T.contract);
  if (needPrice && !pos(parseNum(priceT))) missing.push(T.price);
  if (needsRate(sp, cur) && !pos(parseNum(rateT))) missing.push(T.rate);

  return (
    <Layout
      inputs={
        <InputsCard>
          <Section label={L(T.secPosition)}>
            <AccountField ctx={ctx} />
            <Pair>
              <SymbolField lang={ctx.lang} value={sym} onChange={setSym} mine={mine} />
              <NumField lang={ctx.lang} label={L(T.lots)} value={lots} onChange={setLots} />
            </Pair>
            {!forex && sym.trim() !== "" && <NumField lang={ctx.lang} label={L(T.step)} value={stepT} onChange={setStepT} placeholder={String(pipSize(sym))} hint={L(T.stepHint)} />}
            {needPrice && <NumField lang={ctx.lang} label={L(T.price)} value={priceT} onChange={setPriceT} hint={fill(L(T.priceHint), { cur })} />}
            <ContractRate ctx={ctx} sp={sp} cur={cur} sym={sym} contract={contractT} setContract={setContractT} rate={rateT} setRate={setRateT} />
          </Section>
        </InputsCard>
      }
      result={
        <ResultCard
          lang={ctx.lang} color={ctx.color} tone={ctx.tone} missing={missing.length ? fillIn(ctx.lang, missing) : undefined}
          big={money(res.total)}
          sentence={forex ? say(L(T.pipSay), { lots: fmtLots(n), money: money(res.total) }) : say(L(T.stepSay), { step: fmtPrice(step), lots: fmtLots(n), money: money(res.total) })}
          rows={
            <>
              <Row label={L(T.perLot)} value={money(res.perLot)} />
              <Row label={say(L(T.forLots), { lots: fmtLots(n) })} value={money(res.total)} />
              <Row label={forex ? L(T.pipSize) : L(T.step)} value={fmtPrice(step)} />
              <Row label={L(T.contract)} value={fmtN(contract, 2)} />
            </>
          }
        />
      }
    />
  );
}

// ---------- Margin ----------

const LEVERAGES = [30, 50, 100, 200, 500];

export function MarginBody({ ctx }: { ctx: Ctx }) {
  const L = useL(ctx.lang);
  const { acc, cur } = useAccount(ctx);
  const mine = useMemo(() => accountSymbols(ctx.trades, acc?.id), [ctx.trades, acc]);
  const [sym, setSym] = useState(() => mine[0] ?? ""), [lots, setLots] = useState("1"), [priceT, setPriceT] = useState(""), [levT, setLevT] = useState("100");
  const [contractT, setContractT] = useState(""), [rateT, setRateT] = useState("");
  const sp = symbolSpec(sym), contract = sp.contract ?? parseNum(contractT);
  const n = parseNum(lots), lev = parseNum(levT), price = parseNum(priceT);
  const res = marginFor(sp, cur, n, contract, price, lev, parseNum(rateT));
  const bal = useMemo(() => (acc ? currentBalance(acc, ctx.trades, ctx.balances[acc.id] ?? [], ctx.flows) : NaN), [acc, ctx.trades, ctx.balances, ctx.flows]);
  const money = moneyFmt(cur, false), balMoney = moneyFmt(cur, ctx.hidden);

  const missing: L3[] = [];
  if (!sym.trim()) missing.push(T.symbol);
  if (!pos(n)) missing.push(T.lots);
  if (res.needPrice && !pos(price)) missing.push(T.price);
  if (sym.trim() && sp.contract == null && !pos(contract)) missing.push(T.contract);
  if (res.needRate && !pos(parseNum(rateT))) missing.push(T.rate);
  if (!pos(lev)) missing.push(T.leverage);

  return (
    <Layout
      inputs={
        <InputsCard>
          <Section label={L(T.secPosition)}>
            <AccountField ctx={ctx} />
            <Pair>
              <SymbolField lang={ctx.lang} value={sym} onChange={setSym} mine={mine} />
              <NumField lang={ctx.lang} label={L(T.lots)} value={lots} onChange={setLots} />
            </Pair>
            {res.needPrice && <NumField lang={ctx.lang} label={L(T.price)} value={priceT} onChange={setPriceT} />}
            <ContractRate ctx={ctx} sp={sp} cur={cur} sym={sym} contract={contractT} setContract={setContractT} rate={rateT} setRate={setRateT} />
          </Section>
          <Section label={L(T.secLeverage)}>
            <NumField lang={ctx.lang} label={L(T.leverage)} value={levT} onChange={setLevT} suffix=":1" />
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={L(T.leverage)}>
              {LEVERAGES.map((v) => <button key={v} type="button" className="calc-chip tnum" aria-pressed={lev === v} onClick={() => setLevT(String(v))}><bdi dir="ltr">1:{v}</bdi></button>)}
            </div>
          </Section>
        </InputsCard>
      }
      result={
        <ResultCard
          lang={ctx.lang} color={ctx.color} tone={ctx.tone} missing={missing.length ? fillIn(ctx.lang, missing) : undefined}
          big={money(res.margin)}
          sentence={say(L(T.marginSay), { lots: fmtLots(n), lev: fmtN(lev, 0), money: money(res.margin) })}
          rows={
            <>
              <Row label={L(T.notional)} value={money(res.notional, { cents: false })} />
              <Row label={L(T.leverage)} value={`1:${fmtN(lev, 0)}`} />
              {pos(bal) && <Row label={L(T.balance)} value={balMoney(bal, { cents: false })} />}
              {pos(bal) && <Row label={L(T.ofBalance)} value={ctx.hidden ? "••••" : fmtPct((res.margin / bal) * 100)} />}
            </>
          }
        />
      }
    />
  );
}

// ---------- ATR size ----------

export function AtrBody({ ctx }: { ctx: Ctx }) {
  const L = useL(ctx.lang);
  const { acc, cur } = useAccount(ctx);
  const mine = useMemo(() => accountSymbols(ctx.trades, acc?.id), [ctx.trades, acc]);
  const jBal = useMemo(() => (acc ? currentBalance(acc, ctx.trades, ctx.balances[acc.id] ?? [], ctx.flows) : null), [acc, ctx.trades, ctx.balances, ctx.flows]);
  const fBal = useJField(ctx.journal ? asField(jBal) : null, acc?.id);
  const [riskT, setRiskT] = useState(() => readSettings().riskPct || "1"), [sym, setSym] = useState(() => mine[0] ?? "");
  const [atrT, setAtrT] = useState(""), [multT, setMultT] = useState("1.5"), [priceT, setPriceT] = useState(""), [contractT, setContractT] = useState(""), [rateT, setRateT] = useState("");
  const sp = symbolSpec(sym), contract = sp.contract ?? parseNum(contractT);
  const balance = parseNum(fBal.value), risk = parseNum(riskT), mult = parseNum(multT);
  const res = atrSize({ balance, riskPct: risk, atr: parseNum(atrT), mult, spec: sp, contract, cur, price: parseNum(priceT), rate: parseNum(rateT) });
  const money = moneyFmt(cur, ctx.hidden && fBal.fromJournal);

  const missing: L3[] = [];
  if (!pos(balance)) missing.push(T.balance);
  if (!pos(risk)) missing.push(T.riskPct);
  if (!sym.trim()) missing.push(T.symbol);
  if (!pos(parseNum(atrT))) missing.push(T.atr);
  if (!pos(mult)) missing.push(T.mult);
  if (res.needPrice && !pos(parseNum(priceT))) missing.push(T.price);
  if (sym.trim() && sp.contract == null && !pos(contract)) missing.push(T.contract);
  if (res.needRate && !pos(parseNum(rateT))) missing.push(T.rate);
  const distShow = `${fmtPrice(res.dist)}${res.pips != null ? ` · ${fmtN(res.pips, 1)} ${L(T.pips)}` : ""}`;

  return (
    <Layout
      inputs={
        <InputsCard>
          <Section label={L(T.secAccount)}>
            <AccountField ctx={ctx} />
            <JNumField lang={ctx.lang} label={L(T.balance)} f={fBal} hidden={ctx.hidden} money />
          </Section>
          <Section label={L(T.secRisk)}>
            <NumField lang={ctx.lang} label={L(T.riskPct)} value={riskT} onChange={setRiskT} suffix="%" />
          </Section>
          <Section label={L(T.secVol)}>
            <SymbolField lang={ctx.lang} value={sym} onChange={setSym} mine={mine} />
            <Pair>
              <NumField lang={ctx.lang} label={L(T.atr)} value={atrT} onChange={setAtrT} />
              <NumField lang={ctx.lang} label={L(T.mult)} value={multT} onChange={setMultT} suffix="×" />
            </Pair>
            <Hint>{L(T.atrHint)}</Hint>
            {res.needPrice && <NumField lang={ctx.lang} label={L(T.price)} value={priceT} onChange={setPriceT} hint={fill(L(T.priceHint), { cur })} />}
            <ContractRate ctx={ctx} sp={sp} cur={cur} sym={sym} contract={contractT} setContract={setContractT} rate={rateT} setRate={setRateT} />
          </Section>
        </InputsCard>
      }
      result={
        <ResultCard
          lang={ctx.lang} color={ctx.color} tone={ctx.tone}
          missing={missing.length ? fillIn(ctx.lang, missing) : !Number.isFinite(res.lots) ? "-" : res.lots < 0.01 ? <span className="text-loss">{L(T.tiny)}</span> : undefined}
          big={fmtLots(res.lots)} unit={L(T.lotsUnit)}
          sentence={say(L(T.atrSay), { mult: fmtN(mult, 2), dist: distShow, risk: money(res.riskMoney), lots: fmtLots(res.lots) })}
          rows={
            <>
              <Row label={L(T.dist)} value={distShow} />
              <Row label={L(T.moneyRisk)} value={money(res.riskMoney)} />
              <Row label={L(T.real)} value={money(res.real)} />
            </>
          }
        >
          <Hint>{L(T.stepNote)}</Hint>
        </ResultCard>
      }
    />
  );
}
