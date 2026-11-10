// General: the standard calculator, the currency converter and the percentage calculator. None of them reads the
// journal; the keypad's display is its own result, the others use the usual two cards.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeftRight, Delete, RefreshCw } from "lucide-react";
import {
  convertFx, effectiveFx, FX_CURRENCIES, fxStatus, parseNum, percentCalc, roundSig, STD_START, stdKeyFromEvent, stdPress, type FxStore, type PctMode,
  type StdKey,
} from "../../lib/calculators";
import { loadFx, refreshFx, saveFx } from "../../lib/fxRates";
import { T } from "./text";
import { fillIn, fmtN, InputsCard, NumField, ResultCard, Row, Section, Seg, say, useL, type Ctx } from "./ui";

function Layout({ inputs, result }: { inputs: ReactNode; result: ReactNode }) {
  return <div className="grid items-start gap-4 md:grid-cols-2">{inputs}{result}</div>;
}

// ---------- Standard calculator ----------

const OP_LABEL = { "+": "+", "-": "−", "*": "×", "/": "÷" } as const;
const KEYPAD: (StdKey | "")[][] = [
  ["C", "back", "%", "/"],
  ["7", "8", "9", "*"],
  ["4", "5", "6", "-"],
  ["1", "2", "3", "+"],
  ["neg", "0", ".", "="],
];

export function StdBody({ ctx }: { ctx: Ctx }) {
  const L = useL(ctx.lang);
  const [s, setS] = useState(STD_START);
  const press = (k: StdKey) => setS((o) => stdPress(o, k));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      const k = stdKeyFromEvent(e.key);
      if (!k) return;
      e.preventDefault();
      press(k);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const label = (k: StdKey): ReactNode => {
    if (k === "back") return <Delete size={18} aria-hidden />;
    if (k === "neg") return "±";
    if (k === "*" || k === "/" || k === "-" || k === "+") return OP_LABEL[k];
    return k;
  };
  const aria = (k: StdKey): string | undefined => (k === "C" ? L(T.stdClear) : k === "back" ? L(T.stdBack) : k === "neg" ? L(T.stdNeg) : undefined);
  const isOp = (k: StdKey) => k === "+" || k === "-" || k === "*" || k === "/" || k === "=";
  const pending = s.op && s.acc != null ? `${roundSig(s.acc)} ${OP_LABEL[s.op]}` : "";

  return (
    <div className="mx-auto w-full max-w-sm">
      <div className="calc-glass flex flex-col gap-3 rounded-2xl p-4 sm:p-5">
        <div className="calc-sec">{L(T.stdKeys)}</div>
        <div className="rounded-xl border border-border px-4 py-3 text-end" aria-live="polite">
          <bdi dir="ltr" className="tnum block min-h-[20px] text-xs text-muted">{pending}</bdi>
          <bdi dir="ltr" className="tnum block overflow-x-auto whitespace-nowrap text-3xl font-semibold" style={s.error ? { color: "var(--loss)" } : undefined}>
            {s.error ? L(T.stdError) : s.entry}
          </bdi>
        </div>
        <div className="grid grid-cols-4 gap-2" dir="ltr">
          {KEYPAD.flat().map((k) => k && (
            <button
              key={k} type="button" aria-label={aria(k)} onClick={() => press(k)}
              className="calc-glass calc-pill flex h-12 items-center justify-center rounded-xl text-lg font-semibold"
              style={isOp(k) ? { color: ctx.tone } : undefined}
            >
              {label(k)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- Currency converter ----------

const fmtWhen = (at: number, lang: string) => new Date(at).toLocaleString(lang === "ar" ? "ar" : lang === "fr" ? "fr-FR" : "en-GB", { dateStyle: "medium", timeStyle: "short" });
const fmtFx = (v: number, code: string) => (code === "BTC" ? fmtN(v, 8) : fmtN(v, Math.abs(v) < 1 ? 6 : 2));

export function FxBody({ ctx }: { ctx: Ctx }) {
  const L = useL(ctx.lang);
  const [store, setStore] = useState<FxStore | null>(loadFx);
  const [fetched, setFetched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState("100");
  const [from, setFrom] = useState("TND");
  const [to, setTo] = useState("USD");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const alive = useRef(true);

  const refresh = () => {
    setLoading(true);
    refreshFx(loadFx()).then(({ store: fresh, ok }) => {
      if (!alive.current) return;
      // typed rates are read again here, so one typed while the request was out is not lost
      setStore((cur) => { const n = { ...fresh, manual: cur?.manual ?? fresh.manual }; if (ok) saveFx(n); return n; });
      setFetched(ok);
    }).catch(() => undefined).finally(() => { if (alive.current) setLoading(false); });
  };
  useEffect(() => { alive.current = true; refresh(); return () => { alive.current = false; }; }, []);

  const base: FxStore = store ?? { at: 0, live: {}, manual: {} };
  const rates = effectiveFx(store);
  const setManual = (c: string, text: string) => {
    setDraft((d) => ({ ...d, [c]: text }));
    const n = parseNum(text);
    const manual = { ...base.manual };
    if (Number.isFinite(n) && n > 0) manual[c] = n; else delete manual[c];
    const next = { ...base, manual };
    setStore(next); saveFx(next);
  };
  const resetManual = (c: string) => {
    const manual = { ...base.manual }; delete manual[c];
    const next = { ...base, manual };
    setStore(next); saveFx(next);
    setDraft((d) => { const n = { ...d }; delete n[c]; return n; });
  };

  const amt = parseNum(amount);
  const out = convertFx(amt, from, to, rates);
  const unit = convertFx(1, from, to, rates);
  const status = fxStatus(store && store.at > 0 ? store : null, fetched);
  const statusLine = status === "none" ? (loading ? L(T.fxLoading) : L(T.fxNone)) : say(status === "live" ? L(T.fxUpdated) : L(T.fxSaved), { when: fmtWhen(base.at, ctx.lang) });
  const swap = () => { setFrom(to); setTo(from); };
  const opts = FX_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>);

  return (
    <Layout
      inputs={
        <InputsCard>
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className="min-w-0 flex-1">{statusLine}</span>
            <button type="button" onClick={refresh} disabled={loading} className="inline-flex items-center gap-1 font-semibold text-icon hover:underline disabled:opacity-50">
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} aria-hidden />{L(T.fxRefresh)}
            </button>
          </div>
          <Section label={L(T.amount)}>
            <NumField lang={ctx.lang} label={L(T.amount)} value={amount} onChange={setAmount} />
            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">{L(T.fxFrom)}
                <select className="field" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)}>{opts}</select>
              </label>
              <button type="button" onClick={swap} aria-label={L(T.fxSwap)} title={L(T.fxSwap)} className="calc-glass calc-pill mb-0.5 flex h-9 w-9 items-center justify-center rounded-full">
                <ArrowLeftRight size={16} aria-hidden />
              </button>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">{L(T.fxTo)}
                <select className="field" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)}>{opts}</select>
              </label>
            </div>
          </Section>
          <details className="group">
            <summary className="calc-sec cursor-pointer select-none">{L(T.fxEdit)}</summary>
            <div className="mt-3 flex flex-col gap-3">
              <p className="text-[11px] leading-4 text-muted">{L(T.fxEditHint)}</p>
              {FX_CURRENCIES.filter((c) => c !== "USD").map((c) => {
                const manual = base.manual[c], live = base.live[c]?.rate;
                const value = draft[c] ?? (manual ? String(manual) : live ? String(roundSig(live, 6)) : "");
                return (
                  <div key={c} className="flex items-center gap-2 text-xs" dir="ltr">
                    <bdi className="w-24 shrink-0 text-muted">1 USD =</bdi>
                    <input className="field tnum min-w-0 flex-1" inputMode="decimal" autoComplete="off" aria-label={`1 USD = ${c}`} value={value} onChange={(e) => setManual(c, e.target.value)} />
                    <span className="w-9 shrink-0 font-semibold">{c}</span>
                    {manual ? (
                      <button type="button" onClick={() => resetManual(c)} className="shrink-0 text-[11px] font-semibold text-icon hover:underline" dir={ctx.lang === "ar" ? "rtl" : "ltr"}>
                        {L(T.fxManual)} · {L(T.fxReset)}
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </details>
        </InputsCard>
      }
      result={
        <ResultCard
          lang={ctx.lang} color={ctx.color} tone={ctx.tone}
          missing={!Number.isFinite(amt) ? fillIn(ctx.lang, [T.amount]) : undefined}
          big={fmtFx(out, to)} unit={to}
          sentence={Number.isFinite(unit) ? say("{a} {f} = {r} {t}", { a: fmtN(amt, 8), f: from, r: fmtFx(out, to), t: to }) : undefined}
          rows={<Row label={L(T.fxRate)} value={Number.isFinite(unit) ? `1 ${from} = ${fmtFx(unit, to)} ${to}` : "-"} />}
        >
          <div className="flex flex-col gap-1">
            <div className="calc-sec">{L(T.fxMostUsed)}</div>
            <div className="calc-rows">
              {FX_CURRENCIES.filter((c) => c !== from).map((c) => {
                const v = convertFx(amt, from, c, rates);
                return <Row key={c} label={c} value={Number.isFinite(v) ? fmtFx(v, c) : "-"} />;
              })}
            </div>
          </div>
          <p className="text-[11px] leading-4 text-muted">{L(T.fxSources)}</p>
        </ResultCard>
      }
    />
  );
}

// ---------- Percentage ----------

export function PctBody({ ctx }: { ctx: Ctx }) {
  const L = useL(ctx.lang);
  const [mode, setMode] = useState<PctMode>("of");
  const [x, setX] = useState("");
  const [y, setY] = useState("");
  const labels = { of: [T.pctXOf, T.pctYOf], is: [T.pctXIs, T.pctYIs], change: [T.pctXChange, T.pctYChange] }[mode];
  const nx = parseNum(x), ny = parseNum(y);
  const r = percentCalc(mode, nx, ny);

  const missing = r.reason === "missing" ? fillIn(ctx.lang, [...(Number.isFinite(nx) ? [] : [labels[0]]), ...(Number.isFinite(ny) ? [] : [labels[1]])]) : undefined;
  const v = r.value;
  const pctTxt = (n: number, sign = false) => `${sign && n > 0 ? "+" : ""}${fmtN(n, 4)}%`;
  let big = "-", bigColor: string | undefined, sentence: ReactNode;
  if (v != null) {
    if (mode === "of") { big = fmtN(v, 6); sentence = say(L(T.pctSayOf), { x: pctTxt(nx), y: fmtN(ny, 6), r: big }); }
    else if (mode === "is") { big = pctTxt(v); sentence = say(L(T.pctSayIs), { x: fmtN(nx, 6), r: big, y: fmtN(ny, 6) }); }
    else {
      big = pctTxt(v, true);
      bigColor = Math.abs(v) < 1e-12 ? "#3b82f6" : v > 0 ? "var(--profit)" : "var(--loss)";
      sentence = say(L(T.pctSayChange), { x: fmtN(nx, 6), y: fmtN(ny, 6), r: big });
    }
  } else if (r.reason === "zero") sentence = L(mode === "is" ? T.pctZeroIs : T.pctZeroChange);

  return (
    <Layout
      inputs={
        <InputsCard>
          <Seg label={L(T.pctMode)} value={mode} onChange={setMode} options={[{ v: "of", label: L(T.pctOf) }, { v: "is", label: L(T.pctIs) }, { v: "change", label: L(T.pctChange) }]} />
          <Section label={L(T.secValues)}>
            <NumField lang={ctx.lang} label={labels[0][ctx.lang]} value={x} onChange={setX} signed />
            <NumField lang={ctx.lang} label={labels[1][ctx.lang]} value={y} onChange={setY} signed />
          </Section>
        </InputsCard>
      }
      result={<ResultCard lang={ctx.lang} color={ctx.color} tone={ctx.tone} missing={missing} big={big} bigColor={bigColor} sentence={sentence} />}
    />
  );
}
