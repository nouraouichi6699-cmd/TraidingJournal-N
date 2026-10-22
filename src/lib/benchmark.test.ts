// Run: npx tsx src/lib/benchmark.test.ts
// Expected values were computed independently in plain Python (scratch script), not with this code.
import { accountDays, alignWithBenchmark, atrPct, benchStats, cellTime, marketContext, parseOhlcCsv, parseYahooChart, tickerFor, type Bar, type Pair } from "./benchmark";
import type { CashFlow } from "./cashflow";
import type { Trade } from "../types";
let pass = 0, fail = 0;
const near = (a: number | null | undefined, b: number | null, tol = 0.01) => (a == null || b == null ? a === b : Math.abs(a - b) <= tol);
const t = (name: string, got: number | null | undefined, exp: number | null, tol = 0.01) => { const ok = near(got, exp, tol); ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  got ${got}, expected ${exp}`}`); };
const is = (name: string, c: boolean, d = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${c ? "" : "  " + d}`); };
let k = 0;
const T = (symbol: string, side: "long" | "short", entry: string, exit: string, entryPrice: number, pnl: number): Trade => ({ key: `a:${++k}`, accountId: "a", no: k, symbol, side, qty: 1, entryTime: entry, entryPrice, exitTime: exit, exitPrice: entryPrice, pnl, returnPct: null, commission: 0, status: "closed" });
const dayN = (start: string, i: number) => new Date(Date.parse(`${start}T00:00:00Z`) + i * 864e5).toISOString().slice(0, 10);

console.log("-- Account daily returns (start 10,000)");
{ const tr = [T("X", "long", "2026-01-05T09:00", "2026-01-05T10:00", 1, 100), T("X", "long", "2026-01-06T09:00", "2026-01-06T10:00", 1, -202), T("X", "long", "2026-01-07T09:00", "2026-01-07T10:00", 1, 110)];
  const dep: CashFlow[] = [{ id: "d", accountId: "a", t: "2026-01-07 08:00", type: "deposit", amount: 1000 }];
  const m = accountDays(tr, 10000, dep, "2026-01-05", "2026-01-08")!;
  t("day 1: +100 / 10,000", m.get("2026-01-05"), 0.01, 1e-12);
  t("day 2: -202 / 10,100", m.get("2026-01-06"), -0.02, 1e-12);
  t("day 3: the deposit lands first: 110 / 10,898", m.get("2026-01-07"), 0.010093595155074325, 1e-12);
  t("day without trades: 0", m.get("2026-01-08"), 0, 1e-12);
  is("a balance at or below 0 gives null", accountDays(tr, 100, [{ id: "w", accountId: "a", t: "2026-01-06 08:00", type: "withdrawal", amount: 500 }], "2026-01-05", "2026-01-08") === null);
}

console.log("-- Alignment with benchmark trading days");
{ const acct = new Map<string, number>([["2026-01-03", 0.005], ["2026-01-04", 0], ["2026-01-05", 0.01], ["2026-01-06", -0.02], ["2026-01-07", 0.01], ["2026-01-08", 0]]);
  const bench: Bar[] = [["2026-01-02", 100], ["2026-01-05", 101], ["2026-01-06", 99.99], ["2026-01-07", 100.9899], ["2026-01-08", 100.9899]].map(([d, c]) => ({ d: d as string, o: c as number, h: c as number, l: c as number, c: c as number }));
  const p = alignWithBenchmark(acct, bench, "2026-01-03", "2026-01-08");
  is("4 benchmark days", p.length === 4 && p[0].d === "2026-01-05", JSON.stringify(p.map((x) => x.d)));
  t("Monday includes the weekend trade: 1.005 x 1.01 - 1", p[0].rp, 0.01505, 1e-12); t("benchmark Monday +1%", p[0].rb, 0.01, 1e-12);
  t("Tuesday -2% vs -1%", p[1].rp, -0.02, 1e-12); t("benchmark Tuesday", p[1].rb, -0.01, 1e-9);
  t("Thursday flat", p[3].rb, 0, 1e-12);
}

console.log("-- Benchmark statistics (rp = 2 x rb + 0.0001, 20 days)");
{ const rb = [0.01, -0.005, 0.002, -0.008, 0.004, 0.01, -0.005, 0.002, -0.008, 0.004, 0.01, -0.005, 0.002, -0.008, 0.004, 0.01, -0.005, 0.002, -0.008, 0.004];
  const pairs: Pair[] = rb.map((r, i) => ({ d: dayN("2026-01-01", i), rb: r, rp: 2 * r + 0.0001 }));
  const s = benchStats(pairs)!;
  t("your return %", s.you, 2.4628630289, 1e-6); t("benchmark return %", s.bench, 1.1649902695, 1e-6); t("excess (points)", s.excess, 1.2978727594, 1e-6);
  t("beta 2", s.beta, 2, 1e-9); t("correlation 1", s.corr, 1, 1e-9); t("R-squared 1", s.r2, 1, 1e-9);
  t("alpha 0.0001 x 252 = 2.52% a year", s.alpha, 2.52, 1e-6);
  t("up capture %", s.upCapture, 201.6643412353, 1e-6); t("down capture %", s.downCapture, 198.4970940847, 1e-6);
  t("relative strength", s.relStrength, 1.0128292679, 1e-9);
  t("active return % a year", s.active, 17.64, 1e-6); t("tracking error % a year", s.trackingError, 10.4845148973, 1e-6);
  t("information ratio", s.infoRatio, 1.6824812757, 1e-6); t("Treynor", s.treynor, 17.9372147904, 1e-6);
  is("12 up days, 8 down days", s.upDays === 12 && s.downDays === 8, `${s.upDays}/${s.downDays}`);
  const f = benchStats(pairs, { rf: 4 })!;
  t("alpha with a 4% risk-free rate", f.alpha, 6.4423765423, 1e-6); t("Treynor with 4% risk-free", f.treynor, 15.9372147904, 1e-6);
  is("fewer than 20 days: null", benchStats(pairs.slice(0, 19)) === null);
  const flat = benchStats(pairs.map((p) => ({ ...p, rb: 0 })))!;
  is("flat benchmark: no beta, correlation or capture", flat.beta === null && flat.corr === null && flat.upCapture === null && flat.downCapture === null && flat.treynor === null);
}

console.log("-- Market context");
{ const bar = (d: string, c: number, r: number): Bar => ({ d, o: c, h: c + r / 2, l: c - r / 2, c });
  const AAA = Array.from({ length: 30 }, (_, i) => bar(dayN("2026-03-01", i), 1, i < 10 ? 0.002 : i < 20 ? 0.004 : 0.008));
  const BBB = Array.from({ length: 10 }, (_, i) => bar(dayN("2026-03-02", i), 2, 0.02));
  const CCC = Array.from({ length: 10 }, (_, i) => bar(dayN("2026-04-01", i), 1 + 0.01 * i, 0.01));
  const bench = Array.from({ length: 46 }, (_, i) => ({ d: dayN("2026-03-01", i), o: 100 + i, h: 100 + i, l: 100 + i, c: 100 + i }));
  const tr = [
    T("AAA", "long", "2026-03-05T10:00", "2026-03-05T12:00", 1.0005, 50), T("AAA", "short", "2026-03-08T10:00", "2026-03-08T12:00", 0.9995, -20),
    T("AAA", "long", "2026-03-15T10:00", "2026-03-15T12:00", 1.0, 30), T("AAA", "long", "2026-03-16T10:00", "2026-03-16T12:00", 0.999, 10),
    T("AAA", "short", "2026-03-17T10:00", "2026-03-17T12:00", 1.001, 6), T("AAA", "long", "2026-03-25T10:00", "2026-03-27T12:00", 1.004, -40),
    T("AAA", "short", "2026-03-27T13:00", "2026-03-27T14:00", 0.996, -10), T("AAA", "long", "2026-03-28T10:00", "2026-03-28T11:30", 1.002, 5),
    T("BBB", "long", "2026-03-10T10:00", "2026-03-10T12:00", 1.0, 7), T("BBB", "short", "2026-03-11T10:00", "2026-03-11T12:00", 1.0, -3),
    T("CCC", "long", "2026-04-02T10:00", "2026-04-02T10:30", 1.01, 1), T("CCC", "long", "2026-04-05T10:00", "2026-04-05T10:30", 1.04, 20),
    T("CCC", "short", "2026-04-06T10:00", "2026-04-06T10:30", 1.05, -15), T("CCC", "long", "2026-04-07T10:00", "2026-04-07T10:30", 1.06, -5),
    T("CCC", "short", "2026-04-08T10:00", "2026-04-08T10:30", 1.07, -8), T("CCC", "long", "2026-04-09T10:00", "2026-04-09T10:30", 1.08, 12),
  ];
  const m = marketContext(tr, { AAA, BBB, CCC }, { barMinutes: 60, start: 10000, bench, smaLen: 3, atrLen: 1 });
  is("all 16 trades covered", m.trades === 16 && m.covered === 16, `${m.trades}/${m.covered}`);
  is("BBB prices are another scale: left out of the location", m.offScale.length === 1 && m.offScale[0] === "BBB", JSON.stringify(m.offScale));
  t("location: 14 entries", m.location.n, 14); t("buys at 58.33% of the day range", m.location.long, 525 / 9); t("sells at 40%", m.location.short, 40);
  t("trend readings: 5 (CCC)", m.trend.n, 5); t("3 with the trend = 60%", m.trend.share, 60); t("with-trend win rate 2/3", m.trend.alignedWin, 200 / 3); t("countertrend win rate 0%", m.trend.counterWin, 0);
  t("low volatility: 2 trades", m.regimes.low.n, 2); t("low: net +30", m.regimes.low.net, 30); t("low: win rate 50%", m.regimes.low.winRate, 50);
  t("normal: 3 trades", m.regimes.normal.n, 3); t("normal: net +46", m.regimes.normal.net, 46); t("normal: average +15.33", m.regimes.normal.avg, 46 / 3);
  t("high: 3 trades", m.regimes.high.n, 3); t("high: net -45", m.regimes.high.net, -45); t("high: win rate 33.33%", m.regimes.high.winRate, 100 / 3);
  is("best regime: normal (low has fewer than 3 trades)", m.best === "normal", String(m.best));
  t("average duration: 4.34 one-hour bars", m.bars.avg, 4.34375, 1e-9);
  t("benchmark-relative trade return (avg %)", m.relTrade.avg, -0.0764719172183175, 1e-9); t("16 trades with benchmark closes", m.relTrade.n, 16);
}
{ const b: Bar[] = [{ d: "2026-01-01", o: 10, h: 11, l: 9, c: 10 }, { d: "2026-01-02", o: 10, h: 12, l: 10, c: 11 }, { d: "2026-01-03", o: 11, h: 11.5, l: 8, c: 9 }];
  const a = atrPct(b, 2);
  is("ATR needs `len` bars", a[0] === null, String(a[0]));
  t("ATR(2) day 2: true ranges 2 and 2 -> 2 / 11", a[1], (2 / 11) * 100, 1e-9);
  t("ATR(2) day 3: true ranges 2 and 3.5 -> 2.75 / 9", a[2], (2.75 / 9) * 100, 1e-9);
}

console.log("-- Parsers");
{ const y = parseYahooChart(JSON.stringify({ chart: { result: [{ meta: { gmtoffset: -18000 }, timestamp: [1735828200, 1735914600, 1736173800], indicators: { quote: [{ open: [100, 101, null], high: [102, 103, null], low: [99, 100, null], close: [101, 102, null] }] } }], error: null } }));
  is("Yahoo: 2 bars, the empty one dropped", y.length === 2 && y[0].d === "2025-01-02" && y[1].d === "2025-01-03" && y[1].c === 102, JSON.stringify(y));
  is("Yahoo: broken payload -> no bars", parseYahooChart("<html>") .length === 0);
  // FX bars stamped at midnight London time; the response's gmtoffset (0, winter) would put the summer bar on the day before
  const fx = (tz: string) => parseYahooChart(JSON.stringify({ chart: { result: [{ meta: { gmtoffset: 0, exchangeTimezoneName: tz }, timestamp: [1704153600, 1719788400], indicators: { quote: [{ open: [1.1, 1.07], high: [1.11, 1.08], low: [1.09, 1.06], close: [1.1, 1.07] }] } }], error: null } }));
  is("Yahoo: dates in the exchange time zone (London, both seasons)", fx("Europe/London").map((b) => b.d).join() === "2024-01-02,2024-07-01", JSON.stringify(fx("Europe/London")));
  is("Yahoo: unknown time zone -> gmtoffset", fx("Not/AZone").map((b) => b.d).join() === "2024-01-02,2024-06-30", JSON.stringify(fx("Not/AZone")));
  const stooq = parseOhlcCsv("Date,Open,High,Low,Close,Volume\n2024-01-02,2062.71,2078.71,2058.58,2059.73,0\n2024-01-03,2059.73,2065.5,2030.1,2042.2,0\n");
  is("Stooq CSV", stooq.length === 2 && stooq[1].l === 2030.1 && stooq[1].c === 2042.2, JSON.stringify(stooq));
  const tv = parseOhlcCsv("time,open,high,low,close,Volume\n1704189600,1.1,1.12,1.09,1.11,10\n1704193200,1.11,1.15,1.10,1.14,10\n1704276000,1.14,1.16,1.13,1.15,10\n");
  is("TradingView hourly -> one bar a day", tv.length === 2 && tv[0].o === 1.1 && tv[0].h === 1.15 && tv[0].l === 1.09 && tv[0].c === 1.14 && tv[1].c === 1.15, JSON.stringify(tv));
  const mt5 = parseOhlcCsv("<DATE>\t<TIME>\t<OPEN>\t<HIGH>\t<LOW>\t<CLOSE>\t<TICKVOL>\t<VOL>\t<SPREAD>\n2024.01.02\t00:00:00\t2062.71\t2078.71\t2058.58\t2059.73\t100\t0\t20\n");
  is("MT5 export (tabs, dotted dates)", mt5.length === 1 && mt5[0].d === "2024-01-02" && mt5[0].c === 2059.73, JSON.stringify(mt5));
  const eu = parseOhlcCsv("Date;Open;High;Low;Close\n2024-01-02;1,1000;1,1200;1,0900;1,1100\n");
  is("semicolons and decimal commas", eu.length === 1 && eu[0].c === 1.11 && eu[0].h === 1.12, JSON.stringify(eu));
  is("not a price file -> no bars", parseOhlcCsv("name,amount\nx,1\n").length === 0);
  is("explicit offset honoured", new Date(cellTime("2024-01-02T22:30:00-05:00")).toISOString() === "2024-01-03T03:30:00.000Z");
}

console.log("-- Tickers");
{ const s = (x: string) => JSON.stringify(tickerFor(x));
  is("XAUUSD.m -> spot gold on Stooq", s("XAUUSD.m") === JSON.stringify({ yahoo: "GC=F", stooq: "xauusd" }), s("XAUUSD.m"));
  is("OANDA:EURUSD", s("OANDA:EURUSD") === JSON.stringify({ yahoo: "EURUSD=X", stooq: "eurusd" }), s("OANDA:EURUSD"));
  is("NAS100 -> Nasdaq 100", tickerFor("NAS100")?.yahoo === "^NDX");
  is("US30.cash -> Dow Jones", tickerFor("US30.cash")?.yahoo === "^DJI");
  is("BTCUSDT -> BTC-USD", s("BTCUSDT") === JSON.stringify({ yahoo: "BTC-USD", stooq: null }), s("BTCUSDT"));
  is("GBPJPY-pro", tickerFor("GBPJPY-pro")?.yahoo === "GBPJPY=X");
  is("ESTX50 is not the S&P 500", tickerFor("ESTX50") === null, s("ESTX50"));
  is("unknown symbol -> null", tickerFor("MYSTOCK1") === null);
}
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
