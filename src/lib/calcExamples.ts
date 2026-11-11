// The worked example behind each calculator's "How to use" panel. Every number it shows is computed here with the
// calculator's real exported function (never typed in as a result), so a change to the maths changes the example, and
// calculators.test.ts compares the two. Pure: no React, no text; the words live in components/calculators/text.ts.
import {
  atrSize, buildPnlSample, challengePlan, compound, convertFx, convertUnits, drawdownRecovery, expectancy, kellyFull, likelyLongestRun, marginFor, moneyFor,
  percentCalc, pipValue, positionSize, profitLoss, requiredWinRate, riskOfRuin, riskRuleResult, riskReward, runMonteCarlo, stdPress, STD_START, swapCost, symbolSpec, tradeCost,
  type CalcKey, type StdKey,
} from "./calculators";

/** A value to show: a word, or a number with how to format it (n: plain, pct, money, lots, price) and its decimals. */
export type Fv = string | { v: number; k?: "n" | "pct" | "money" | "lots" | "price"; d?: number };
export interface CalcExample {
  /** The example inputs, in the order the panel lists them (text.ts gives each its label). */
  inputs: Fv[];
  /** Every number the written-out result uses, by the name its {key} has in text.ts (inputs echoed as well). */
  out: Record<string, Fv>;
}

const n = (v: number, d = 2): Fv => ({ v, k: "n", d });
const pct = (v: number, d = 2): Fv => ({ v, k: "pct", d });
const money = (v: number, d = 2): Fv => ({ v, k: "money", d });
const lots = (v: number): Fv => ({ v, k: "lots" });
const price = (v: number): Fv => ({ v, k: "price" });

/** The raw numbers of an example, so a test can hold them against the function called directly. */
export const EX = {
  size: { balance: 10000, riskPct: 1, stopPips: 20, pip: 0.0001, price: 1.1 },
  rr: { entry: 1.1, stop: 1.098, target: 1.104 },
  pl: { lots: 0.5, entry: 1.1, exit: 1.104 },
  pip: { lots: 0.5 },
  margin: { lots: 1, price: 1.1, leverage: 100 },
  atr: { balance: 10000, riskPct: 1, atr: 0.005, mult: 1.5, price: 1.1 },
  units: { lots: 0.5 },
  cost: { lots: 1, spreadPips: 1.2, commission: 7 },
  swap: { lots: 1, swapPerLot: -6.5, nights: 3 },
  dd: { loss: 20 },
  ruin: { winRate: 45, rr: 1.5, riskPct: 5, ruinLevel: 50, nTrades: 200 },
  streak: { trades: 26, lossRate: 0.46, risk: 0.5 },
  port: { balance: 10000, a: { lots: 0.5, pips: 20 }, b: { lots: 0.3, pips: 30 } },
  exp: { winRate: 54, avgWin: 182, avgLoss: 121 },
  wr: { rr: 2 },
  kelly: { winRate: 54, payoff: 1.504 },
  mc: { winRate: 54, avgWin: 182, avgLoss: 121, trades: 20 },
  prop: { winRate: 54, rr: 2, risk: 0.5, target: 8, daily: 5, max: 10 },
  comp: { start: 1000, rate: 5, months: 12 },
  std: { keys: ["1", "2", ".", "5", "*", "4", "="] as StdKey[] },
  fx: { amount: 100, from: "USD", to: "EUR", eurPerUsd: 0.92 },
  pct: { from: 10000, to: 11200 },
  riskmgmt: { balance: 10000, pct: 1 },
};

const EURUSD = symbolSpec("EURUSD");
const CONTRACT = EURUSD.contract as number;

export function calcExample(k: CalcKey): CalcExample {
  switch (k) {
    case "size": {
      const e = EX.size;
      const r = positionSize({ balance: e.balance, mode: "pct", pct: e.riskPct, amt: 0, spec: EURUSD, contract: CONTRACT, entry: 0, stop: 0, cur: "USD", rate: 1, dist: e.stopPips * e.pip, price: e.price, pip: e.pip });
      return { inputs: ["EURUSD", money(e.balance, 0), pct(e.riskPct), n(e.stopPips, 0)], out: { balance: money(e.balance, 0), pct: pct(e.riskPct), risk: money(r.riskMoney), pips: n(e.stopPips, 0), perLot: money(r.perLot), lots: lots(r.lots) } };
    }
    case "rr": {
      const e = EX.rr, r = riskReward(e.entry, e.stop, e.target);
      return { inputs: [price(e.entry), price(e.stop), price(e.target)], out: { risk: price(r.risk), reward: price(r.reward), rr: n(r.rr), be: pct(r.beWinRate, 1) } };
    }
    case "pl": {
      const e = EX.pl, r = profitLoss("buy", e.lots, e.entry, e.exit, CONTRACT, 1);
      return { inputs: ["EURUSD", lots(e.lots), price(e.entry), price(e.exit)], out: { lots: lots(e.lots), move: price(r.move), contract: n(CONTRACT, 0), money: money(r.money) } };
    }
    case "pip": {
      const e = EX.pip, r = pipValue(EURUSD.pip as number, CONTRACT, 1, e.lots);
      return { inputs: ["EURUSD", lots(e.lots), "USD"], out: { pip: price(EURUSD.pip as number), contract: n(CONTRACT, 0), perLot: money(r.perLot), lots: lots(e.lots), total: money(r.total) } };
    }
    case "margin": {
      const e = EX.margin, r = marginFor(EURUSD, "USD", e.lots, CONTRACT, e.price, e.leverage, 1);
      return { inputs: ["EURUSD", lots(e.lots), price(e.price), `1:${e.leverage}`], out: { lots: lots(e.lots), contract: n(CONTRACT, 0), price: price(e.price), notional: money(r.notional), lev: n(e.leverage, 0), margin: money(r.margin) } };
    }
    case "atr": {
      const e = EX.atr, r = atrSize({ balance: e.balance, riskPct: e.riskPct, atr: e.atr, mult: e.mult, spec: EURUSD, contract: CONTRACT, cur: "USD", price: e.price, rate: 1 });
      return { inputs: ["EURUSD", money(e.balance, 0), pct(e.riskPct), price(e.atr), n(e.mult, 1)], out: { atr: price(e.atr), mult: n(e.mult, 1), dist: price(r.dist), pips: n(r.pips ?? NaN, 0), risk: money(r.riskMoney), perLot: money(r.perLot), lots: lots(r.lots) } };
    }
    case "units": {
      const e = EX.units, r = convertUnits("lot", e.lots, CONTRACT);
      return { inputs: ["EURUSD", lots(e.lots)], out: { lots: lots(e.lots), contract: n(CONTRACT, 0), units: n(r.units, 0) } };
    }
    case "cost": {
      const e = EX.cost, r = tradeCost({ lots: e.lots, spreadPips: e.spreadPips, pip: EURUSD.pip as number, contract: CONTRACT, rate: 1, commissionPerLot: e.commission });
      return { inputs: ["EURUSD", lots(e.lots), n(e.spreadPips, 1), money(e.commission)], out: { lots: lots(e.lots), pv: money(r.pipValuePerLot), spreadPips: n(e.spreadPips, 1), spread: money(r.spread), commission: money(r.commission), total: money(r.total), be: n(r.breakevenPips, 1) } };
    }
    case "swap": {
      const e = EX.swap, r = swapCost(e.lots, e.swapPerLot, e.nights, true);
      return { inputs: [lots(e.lots), money(e.swapPerLot), n(e.nights, 0), "✓"], out: { lots: lots(e.lots), swap: money(e.swapPerLot), nights: n(e.nights, 0), eq: n(r.nightsEq, 0), perNight: money(r.perNight), total: money(r.total) } };
    }
    case "dd": {
      const r = drawdownRecovery(EX.dd.loss);
      return { inputs: [pct(EX.dd.loss, 0)], out: { loss: n(EX.dd.loss, 0), gain: pct(r) } };
    }
    case "ruin": {
      const e = EX.ruin, r = riskOfRuin(e);
      return { inputs: [pct(e.winRate, 0), n(e.rr), pct(e.riskPct), pct(e.ruinLevel, 0), n(e.nTrades, 0)], out: { level: pct(e.ruinLevel, 0), n: n(e.nTrades, 0), ruin: pct(r, 1) } };
    }
    case "streak": {
      const e = EX.streak, k = likelyLongestRun(e.trades, e.lossRate);
      return { inputs: [n(e.trades, 0), pct((1 - e.lossRate) * 100, 0), pct(e.risk)], out: { n: n(e.trades, 0), k: n(k, 0), risk: pct(e.risk), cost: pct(k * e.risk) } };
    }
    case "port": {
      const e = EX.port, a = moneyFor(e.a.pips * 0.0001, CONTRACT, e.a.lots, 1), b = moneyFor(e.b.pips * 0.0001, CONTRACT, e.b.lots, 1), total = a + b;
      return { inputs: [money(e.balance, 0), `EURUSD ${e.a.lots} / ${e.a.pips}`, `GBPUSD ${e.b.lots} / ${e.b.pips}`], out: { a: money(a), b: money(b), total: money(total), balance: money(e.balance, 0), pct: pct((total / e.balance) * 100) } };
    }
    case "exp": {
      const e = EX.exp, r = expectancy(e.winRate, e.avgWin, e.avgLoss);
      return { inputs: [pct(e.winRate, 0), money(e.avgWin, 0), money(e.avgLoss, 0)], out: { wr: n(e.winRate / 100), lr: n(1 - e.winRate / 100), win: money(e.avgWin, 0), loss: money(e.avgLoss, 0), e: money(r.e), per100: money(r.per100, 0), eR: n(r.eR, 3) } };
    }
    case "wr": {
      const r = requiredWinRate(EX.wr.rr);
      return { inputs: [n(EX.wr.rr, 0)], out: { rr: n(EX.wr.rr, 0), wr: pct(r, 1) } };
    }
    case "kelly": {
      const e = EX.kelly, r = kellyFull(e.winRate, e.payoff);
      return { inputs: [pct(e.winRate, 0), n(e.payoff, 3)], out: { p: n(e.winRate / 100), b: n(e.payoff, 3), f: pct(r.f * 100), half: pct(r.half * 100), quarter: pct(r.quarter * 100) } };
    }
    case "mc": {
      const e = EX.mc, r = runMonteCarlo(buildPnlSample(e.winRate, e.avgWin, e.avgLoss, e.trades));
      return { inputs: [pct(e.winRate, 0), money(e.avgWin, 0), money(e.avgLoss, 0), n(e.trades, 0)], out: { n: n(e.trades, 0), paths: n(r?.paths ?? NaN, 0), prob: pct(r?.probProfit ?? NaN, 1), median: money(r?.finalP50 ?? NaN, 0), dd: money(r?.ddP95 ?? NaN, 0) } };
    }
    case "prop": {
      const e = EX.prop, r = challengePlan({ target: e.target, daily: e.daily, max: e.max, risk: e.risk, rr: e.rr, winRate: e.winRate });
      return { inputs: [pct(e.winRate, 0), n(e.rr), pct(e.risk), pct(e.target, 0), pct(e.daily, 0), pct(e.max, 0)], out: { edge: pct(r.edge), target: pct(e.target, 0), trades: n(r.trades ?? NaN, 0), safe: pct(r.safe ?? NaN), daily: pct(e.daily, 0) } };
    }
    case "comp": {
      const e = EX.comp, r = compound(e.start, e.rate, e.months);
      return { inputs: [money(e.start, 0), pct(e.rate), n(e.months, 0)], out: { start: money(e.start, 0), rate: pct(e.rate), months: n(e.months, 0), final: money(r?.final ?? NaN), gain: money(r?.gain ?? NaN) } };
    }
    case "std": {
      let s = STD_START;
      for (const key of EX.std.keys) s = stdPress(s, key);
      return { inputs: [n(12.5, 1), "×", n(4, 0)], out: { a: n(12.5, 1), b: n(4, 0), r: n(Number(s.entry), 4) } };
    }
    case "fx": {
      const e = EX.fx, r = convertFx(e.amount, e.from, e.to, { USD: { rate: 1 }, EUR: { rate: e.eurPerUsd } });
      return { inputs: [n(e.amount, 0), e.from, e.to, n(e.eurPerUsd)], out: { amount: n(e.amount, 0), rate: n(e.eurPerUsd), r: n(r) } };
    }
    case "riskmgmt": {
      const e = EX.riskmgmt, r = riskRuleResult({ method: "pct", pct: e.pct }, e.balance);
      return { inputs: [money(e.balance, 0), pct(e.pct, 0)], out: { balance: money(e.balance, 0), pct: pct(e.pct, 0), risk: money(r.riskMoney) } };
    }
    case "pct": {
      const e = EX.pct, r = percentCalc("change", e.from, e.to);
      return { inputs: [money(e.from, 0), money(e.to, 0)], out: { from: money(e.from, 0), to: money(e.to, 0), r: pct(r.value ?? NaN) } };
    }
  }
}
