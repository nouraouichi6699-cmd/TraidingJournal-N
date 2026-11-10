// The pieces every calculator screen is built from: the inputs card (sections, number fields, the journal's gold
// fields, segmented choices) and the result card (big number, status pill, a sentence, detail rows).
import { Fragment, useId, useState, type CSSProperties, type ReactNode } from "react";
import { Check, NotebookPen, TriangleAlert } from "lucide-react";
import type { Account, BalancePoint, Lang, Trade } from "../../types";
import type { CashFlow } from "../../lib/cashflow";
import { numberLocale } from "../../lib/numberFormat";
import { fmtMoney } from "../../lib/money";
import { SYMBOLS } from "../../lib/symbols";
import type { DistUnit } from "../../lib/calcCore";
import { T, type L3 } from "./text";

/** What every calculator body is given by the page. */
export interface Ctx {
  lang: Lang;
  accounts: Account[];
  trades: Trade[];
  balances: Record<string, BalancePoint[]>;
  flows: CashFlow[];
  /** The values come from the journal (false: the trader types everything). */
  journal: boolean;
  /** Privacy mode: money the journal provides is masked. */
  hidden: boolean;
  /** The group colour, and the same colour readable as text on this page's glass. */
  color: string;
  tone: string;
  /** The account the calculators that use one start on. */
  accId: string;
  setAccId: (id: string) => void;
  /** The currency typed when there is no account at all. */
  cur: string;
  setCur: (c: string) => void;
  /** This calculator's remembered "Pips | Price" choice (Risk/Reward, Profit and loss; Position size keeps its own). */
  unit: DistUnit;
  setUnit: (u: DistUnit) => void;
}

export const useL = (lang: Lang) => (x: L3) => x[lang];
export const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));

// ---------- numbers ----------

const nf = (v: number, max: number, min = 0) => v.toLocaleString(numberLocale(), { minimumFractionDigits: min, maximumFractionDigits: max });
/** A plain number, rounded; "-" when there is none. */
export const fmtN = (v: number, max = 2, min = 0) => (Number.isFinite(v) ? nf(v, max, min) : "-");
export const fmtPct = (v: number, max = 2) => (Number.isFinite(v) ? `${nf(v, max)}%` : "-");
export const fmtPrice = (v: number) => fmtN(v, 5);
export const fmtLots = (v: number) => fmtN(v, 2, 2);
/** Money in the account currency, masked when it comes from the journal in privacy mode. */
export const moneyFmt = (cur: string, masked: boolean) => (v: number, o: { cents?: boolean; sign?: boolean } = {}) =>
  masked ? "••••" : fmtMoney(v, { cents: o.cents ?? true, sign: o.sign, currency: cur });

/** A sentence with {keys}: numbers go in as left-to-right pieces so they keep their order inside Arabic text. */
export function say(tpl: string, vars: Record<string, ReactNode>): ReactNode {
  return tpl.split(/(\{\w+\})/).map((part, i) => {
    const m = /^\{(\w+)\}$/.exec(part);
    if (!m) return <Fragment key={i}>{part}</Fragment>;
    const v = vars[m[1]];
    return typeof v === "string" && !/\d/.test(v) ? <Fragment key={i}>{v}</Fragment> : <bdi key={i} dir="ltr">{v}</bdi>;
  });
}

// ---------- the journal's fields ----------

/**
 * A field the journal fills: the journal's value (null: none) until the trader types over it; the edit then stays.
 * An edit belongs to its `scope` (the account, the challenge): picking another one shows that one's journal value.
 */
export function useJField(journalValue: string | null, scope = "") {
  const [st, setSt] = useState<{ own: string | null; scope: string }>({ own: null, scope });
  const own = st.scope === scope ? st.own : null;
  return {
    value: own ?? journalValue ?? "", set: (v: string) => setSt({ own: v, scope }),
    fromJournal: own == null && !!journalValue, edited: own != null && journalValue != null, reset: () => setSt({ own: null, scope }),
  };
}
export type JField = ReturnType<typeof useJField>;

/** Rounds a journal number for a field: up to `d` decimals, no grouping, a dot. */
export const asField = (v: number | null | undefined, d = 2): string | null => (v == null || !Number.isFinite(v) ? null : String(Math.round(v * 10 ** d) / 10 ** d));

// ---------- inputs card ----------

export function InputsCard({ children }: { children: ReactNode }) {
  return <div className="calc-glass flex flex-col gap-5 rounded-2xl p-4 sm:p-5">{children}</div>;
}

/** A gold-labelled group of inputs; `aside` (a small control) sits at the end of the label's line. */
export function Section({ label, aside, children }: { label: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      {aside ? <div className="flex items-center gap-2"><div className="calc-sec min-w-0 flex-1">{label}</div>{aside}</div> : <div className="calc-sec">{label}</div>}
      {children}
    </div>
  );
}

const lblCls = "flex flex-col gap-1 text-xs font-medium text-muted";

interface NumFieldProps {
  lang: Lang;
  label: ReactNode;
  value: string;
  onChange: (v: string) => void;
  hint?: ReactNode;
  suffix?: string;
  placeholder?: string;
  /** Shows the journal's gold frame. */
  journal?: boolean;
  /** Masks the value (journal money in privacy mode). */
  masked?: boolean;
  /** Offered once a journal value has been typed over. */
  onReset?: () => void;
  /** Takes a minus sign: a full keyboard on phones, whose decimal pads have none. */
  signed?: boolean;
}

/** A decimal field: a comma or a dot, numbers left to right. */
export function NumField({ lang, label, value, onChange, hint, suffix, placeholder, journal, masked, onReset, signed }: NumFieldProps) {
  const id = useId();
  return (
    <div className={lblCls}>
      <div className="flex min-h-[18px] items-center gap-1.5">
        <label htmlFor={id}>{label}</label>
        {journal && <NotebookPen size={12} className="shrink-0 text-icon" aria-label={T.journalNote[lang]} />}
        {onReset && (
          <button type="button" onClick={onReset} title={T.resetTip[lang]} className="ms-auto inline-flex items-center gap-1 text-[11px] font-semibold text-icon hover:underline">
            <NotebookPen size={11} aria-hidden />{T.reset[lang]}
          </button>
        )}
      </div>
      <div className="relative" dir="ltr">
        <input
          id={id} className={`field tnum ${journal ? "calc-field-j" : ""} ${suffix ? "!pr-11" : ""}`} inputMode={signed ? "text" : "decimal"} autoComplete="off"
          value={masked ? "••••" : value} readOnly={masked} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        />
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">{suffix}</span>}
      </div>
      {hint && <span className="text-[11px] font-normal leading-4">{hint}</span>}
    </div>
  );
}

/** NumField over a journal field: gold while it shows the journal's value, a way back once typed over. */
export function JNumField({ f, hidden, money, ...p }: Omit<NumFieldProps, "value" | "onChange" | "journal" | "masked" | "onReset"> & { f: JField; hidden?: boolean; money?: boolean }) {
  return <NumField {...p} value={f.value} onChange={f.set} journal={f.fromJournal} masked={!!money && !!hidden && f.fromJournal} onReset={f.edited ? f.reset : undefined} />;
}

export function Seg<V extends string>({ value, options, onChange, label, small }: { value: V; options: { v: V; label: ReactNode }[]; onChange: (v: V) => void; label: string; small?: boolean }) {
  return (
    <div className={small ? "calc-seg calc-seg-sm" : "calc-seg"} role="group" aria-label={label}>
      {options.map((o) => <button key={o.v} type="button" aria-pressed={value === o.v} onClick={() => onChange(o.v)}>{o.label}</button>)}
    </div>
  );
}

/** The small "Pips | Price" switch: how a stop, a target or a result is typed. */
export function UnitSeg({ lang, value, onChange }: { lang: Lang; value: DistUnit; onChange: (u: DistUnit) => void }) {
  return <Seg small label={T.unitIn[lang]} value={value} onChange={onChange} options={[{ v: "pips", label: T.unitPips[lang] }, { v: "price", label: T.unitPrice[lang] }]} />;
}

/** The account to read from, or a currency to type when there is no account yet. */
export function AccountField({ ctx, value, onChange }: { ctx: Ctx; value?: string; onChange?: (id: string) => void }) {
  const L = useL(ctx.lang);
  const acc = ctx.accounts.find((a) => a.id === (value ?? ctx.accId)) ?? ctx.accounts[0];
  if (!acc) {
    return (
      <label className={lblCls}>{L(T.currency)}
        <input className="field uppercase" dir="ltr" maxLength={4} value={ctx.cur} onChange={(e) => ctx.setCur(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))} />
      </label>
    );
  }
  return (
    <label className={lblCls}>{L(T.account)}
      <select className="field" value={acc.id} onChange={(e) => (onChange ?? ctx.setAccId)(e.target.value)}>
        {ctx.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.currency ? ` · ${a.currency.toUpperCase()}` : ""}</option>)}
      </select>
    </label>
  );
}

/** The account a calculator works on, and its currency (the typed one when there is no account). */
export function useAccount(ctx: Ctx) {
  const acc = ctx.accounts.find((a) => a.id === ctx.accId) ?? ctx.accounts[0];
  return { acc, cur: ((acc ? acc.currency : ctx.cur) || "USD").toUpperCase() };
}

const COMMON = SYMBOLS.filter((g) => g.group === "fx" || g.group === "metals").flatMap((g) => g.list);
/** A symbol, suggesting the account's own first and then the common pairs and metals. */
export function SymbolField({ lang, value, onChange, mine = [] }: { lang: Lang; value: string; onChange: (v: string) => void; mine?: string[] }) {
  const id = useId();
  const list = [...new Set([...mine, ...COMMON])];
  return (
    <label className={lblCls}>{T.symbol[lang]}
      <input className="field" dir="ltr" list={`${id}l`} autoComplete="off" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} />
      <datalist id={`${id}l`}>{list.map((x) => <option key={x} value={x} />)}</datalist>
    </label>
  );
}

/** The account's symbols, most recently traded first. */
export function accountSymbols(trades: Trade[], accId: string | undefined): string[] {
  if (!accId) return [];
  const mine = trades.filter((t) => t.accountId === accId).sort((a, b) => (b.entryTime ?? "").localeCompare(a.entryTime ?? ""));
  return [...new Set(mine.map((t) => t.symbol).filter(Boolean))].slice(0, 30);
}

// ---------- result card ----------

interface ResultProps {
  lang: Lang;
  color: string;
  tone: string;
  /** Shown instead of everything else while an input is missing or wrong. */
  missing?: ReactNode;
  big?: ReactNode;
  /** A colour for the big number other than the group's (green / red results). */
  bigColor?: string;
  unit?: ReactNode;
  pill?: ReactNode;
  sentence?: ReactNode;
  rows?: ReactNode;
  children?: ReactNode;
}

export function ResultCard({ lang, color, tone, missing, big, bigColor, unit, pill, sentence, rows, children }: ResultProps) {
  const style = { "--g": color, "--gt": tone } as CSSProperties;
  return (
    <section className="calc-glass calc-result flex flex-col gap-3 rounded-2xl p-4 sm:p-5" style={style} aria-live="polite">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{T.result[lang]}</div>
      {missing ? <p className="text-sm text-muted">{missing}</p> : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <bdi dir="ltr" className="calc-big tnum" style={bigColor ? { color: bigColor } : undefined}>{big}</bdi>
            {unit && <span className="text-sm text-muted">{unit}</span>}
          </div>
          {pill}
          {sentence && <p className="text-sm leading-6">{sentence}</p>}
          {rows && <div className="calc-rows">{rows}</div>}
          {children}
        </>
      )}
    </section>
  );
}

/** A detail row: the label at the start, the value at the end. A number value reads left to right; `words` keeps a
 *  value made of words (with its numbers isolated by say()) in the page's own direction. */
export function Row({ label, value, color, words }: { label: ReactNode; value: ReactNode; color?: string; words?: boolean }) {
  const style = color ? { color } : undefined;
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-sm">
      <span className="min-w-0 text-muted">{label}</span>
      {words ? <span className="shrink-0 text-end font-medium" style={style}>{value}</span> : <bdi dir="ltr" className="tnum shrink-0 text-end font-medium" style={style}>{value}</bdi>}
    </div>
  );
}

/** Green check "safe" or red alert "above the safe risk". */
export function SafePill({ lang, safe }: { lang: Lang; safe: boolean }) {
  return (
    <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${safe ? "calc-status-ok" : "calc-status-bad"}`}>
      {safe ? <Check size={14} aria-hidden /> : <TriangleAlert size={14} aria-hidden />}
      {safe ? T.safe[lang] : T.above[lang]}
    </span>
  );
}

/** "Fill in: Entry, Stop loss." */
export const fillIn = (lang: Lang, labels: L3[]) => fill(T.fill[lang], { list: labels.map((x) => x[lang]).join(lang === "ar" ? "، " : ", ") });

/** Two inputs side by side (one under the other on very small screens). */
export function Pair({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">{children}</div>;
}

export const Hint = ({ children }: { children: ReactNode }) => <p className="text-[11px] leading-4 text-muted">{children}</p>;
