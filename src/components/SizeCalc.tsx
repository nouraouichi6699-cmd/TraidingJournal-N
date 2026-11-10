// Position size calculator (header panel): the lots that risk a share of the balance (or an amount) between an entry and
// a stop. Prop-challenge accounts also show the safe risk per trade (a third of the room left before a rule breaks, as in
// the Telegram morning plan) and warn when the trade would risk more.
import type { Account, BalancePoint, Lang, Trade } from "../types";
import type { CashFlow } from "../lib/cashflow";
import { fmtMoney } from "../lib/money";
import { usePrivacy } from "../usePrivacy";
import { useSizeCalc } from "../useCalculators";

type L3 = Record<Lang, string>;
const T = {
  title: { en: "Position size", ar: "حجم الصفقة", fr: "Taille de position" },
  account: { en: "Account", ar: "الحساب", fr: "Compte" },
  balance: { en: "Balance", ar: "الرصيد", fr: "Solde" },
  risk: { en: "Risk", ar: "المخاطرة", fr: "Risque" },
  pct: { en: "% of balance", ar: "% من الرصيد", fr: "% du solde" },
  amt: { en: "Amount", ar: "مبلغ", fr: "Montant" },
  symbol: { en: "Symbol", ar: "الرمز", fr: "Symbole" },
  entry: { en: "Entry", ar: "سعر الدخول", fr: "Entrée" },
  stop: { en: "Stop loss", ar: "وقف الخسارة", fr: "Stop loss" },
  contract: { en: "Contract size (1 lot)", ar: "حجم العقد (لوت واحد)", fr: "Taille du contrat (1 lot)" },
  contractHint: { en: "In MT5: right-click the symbol › Specification.", ar: "في MT5: انقر بالزر الأيمن على الرمز ثم المواصفات.", fr: "Dans MT5 : clic droit sur le symbole › Spécification." },
  lots: { en: "lots", ar: "لوت", fr: "lots" },
  real: { en: "Risk at this size", ar: "المخاطرة بهذا الحجم", fr: "Risque à cette taille" },
  dist: { en: "Stop distance", ar: "مسافة الوقف", fr: "Distance du stop" },
  pips: { en: "pips", ar: "نقطة", fr: "pips" },
  safe: { en: "Safe risk per trade · {n}", ar: "المخاطرة الآمنة للصفقة · {n}", fr: "Risque sûr par trade · {n}" },
  over: { en: "Above the safe risk: three losses like this would break a challenge rule.", ar: "أعلى من المخاطرة الآمنة: ثلاث خسائر مثلها تكسر قاعدة في التحدي.", fr: "Au-dessus du risque sûr : trois pertes comme celle-ci enfreindraient une règle du challenge." },
  tiny: { en: "This risk is below the smallest size (0.01 lot).", ar: "هذه المخاطرة أقل من أصغر حجم (0.01 لوت).", fr: "Ce risque est sous la plus petite taille (0,01 lot)." },
  fill: { en: "Enter the entry and the stop loss.", ar: "أدخل سعر الدخول ووقف الخسارة.", fr: "Saisissez l'entrée et le stop loss." },
  step: { en: "Rounded down to 0.01 lot. Check your broker's minimum and step.", ar: "مقرّب للأسفل إلى 0.01 لوت. تحقق من حد الوسيط وخطوته.", fr: "Arrondi à 0,01 lot inférieur. Vérifiez le minimum et le pas de votre courtier." },
  none: { en: "Add an account first.", ar: "أضف حساباً أولاً.", fr: "Ajoutez d'abord un compte." },
} satisfies Record<string, L3>;

interface Props { lang: Lang; accounts: Account[]; trades: Trade[]; balances: Record<string, BalancePoint[]>; flows: CashFlow[] }

export default function SizeCalc({ lang, accounts, trades, balances, flows }: Props) {
  const L = (x: L3) => x[lang];
  const { hidden } = usePrivacy();
  const { s, save, acc, symbols, sym, cur, entry, setEntry, stop, setStop, r } = useSizeCalc({ accounts, trades, balances, flows });
  const money = (v: number, cents = true) => (hidden ? "••••" : fmtMoney(v, { cents, currency: cur }));

  const lbl = "flex flex-col gap-1 text-xs font-medium text-muted";
  if (!acc || !r) return <div className="p-4 text-sm">{L(T.none)}</div>;
  const pipsTxt = r.sp.pip && r.dist > 0 ? `${(r.dist / r.sp.pip).toFixed(1)} ${L(T.pips)}` : r.dist > 0 ? String(+r.dist.toFixed(5)) : "-";
  return (
    <div className="flex flex-col gap-3 p-4 text-sm">
      <div className="flex items-center justify-between gap-2">
        <b className="text-base">{L(T.title)}</b>
        <span className="text-xs text-muted">{L(T.balance)}: <bdi dir="ltr">{money(r.bal, false)}</bdi></span>
      </div>
      <label className={lbl}>{L(T.account)}
        <select className="field" value={acc.id} onChange={(e) => save({ acc: e.target.value, sym: "" })}>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>
      <div className={lbl}>{L(T.risk)}
        <div className="flex gap-2">
          <input className="field flex-1" inputMode="decimal" dir="ltr" value={s.mode === "pct" ? s.pct : s.amt} onChange={(e) => save(s.mode === "pct" ? { pct: e.target.value } : { amt: e.target.value })} />
          <div className="flex overflow-hidden rounded-lg border border-[var(--border)]">
            {(["pct", "amt"] as const).map((m) => (
              <button key={m} type="button" aria-pressed={s.mode === m} onClick={() => save({ mode: m })} className={`px-3 text-xs font-semibold ${s.mode === m ? "bg-primary text-[var(--on-primary,#111)]" : ""}`}>{m === "pct" ? "%" : cur === "USD" ? "$" : cur}</button>
            ))}
          </div>
        </div>
        <span className="text-[11px]">{s.mode === "pct" ? L(T.pct) : L(T.amt)}{s.mode === "pct" && Number.isFinite(r.riskMoney) && <> · <bdi dir="ltr">{money(r.riskMoney)}</bdi></>}</span>
      </div>
      <label className={lbl}>{L(T.symbol)}
        <input className="field" dir="ltr" list="sizecalc-syms" value={sym} onChange={(e) => save({ sym: e.target.value.toUpperCase() })} />
        <datalist id="sizecalc-syms">{symbols.map((x) => <option key={x} value={x} />)}</datalist>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className={lbl}>{L(T.entry)}<input className="field" inputMode="decimal" dir="ltr" value={entry} onChange={(e) => setEntry(e.target.value)} /></label>
        <label className={lbl}>{L(T.stop)}<input className="field" inputMode="decimal" dir="ltr" value={stop} onChange={(e) => setStop(e.target.value)} /></label>
      </div>
      {r.sp.contract == null && (
        <label className={lbl}>{L(T.contract)}
          <input className="field" inputMode="decimal" dir="ltr" value={s.contracts[sym.toUpperCase()] ?? ""} onChange={(e) => save({ contracts: { ...s.contracts, [sym.toUpperCase()]: e.target.value } })} />
          <span className="text-[11px]">{L(T.contractHint)}</span>
        </label>
      )}
      {r.needRate && (
        <label className={lbl}><bdi dir="ltr">1 {r.sp.quote} = ? {cur}</bdi>
          <input className="field" inputMode="decimal" dir="ltr" value={s.rates[`${r.sp.quote}${cur}`] ?? ""} onChange={(e) => save({ rates: { ...s.rates, [`${r.sp.quote}${cur}`]: e.target.value } })} />
        </label>
      )}
      <div className="rounded-xl border border-[var(--border)] p-3">
        {!(r.dist > 0) ? <span className="text-muted">{L(T.fill)}</span> : !r.ok ? <span className="text-muted">-</span> : r.lots < 0.01 ? <span className="text-loss">{L(T.tiny)}</span> : (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline gap-2"><b className="text-3xl tabular-nums" dir="ltr">{r.lots.toFixed(2)}</b><span className="text-muted">{L(T.lots)}</span></div>
            <div className="flex justify-between gap-2 text-xs"><span className="text-muted">{L(T.real)}</span><bdi dir="ltr">{money(r.real)}</bdi></div>
            <div className="flex justify-between gap-2 text-xs"><span className="text-muted">{L(T.dist)}</span><bdi dir="ltr">{pipsTxt}</bdi></div>
          </div>
        )}
        {r.safe && (
          <div className="mt-2 border-t border-[var(--border)] pt-2 text-xs">
            <div className="flex justify-between gap-2"><span className="text-muted">{L(T.safe).replace("{n}", r.safe.name)}</span><bdi dir="ltr">{money(r.safe.v)}</bdi></div>
            {r.ok && r.lots >= 0.01 && r.real > r.safe.v + 0.005 && <p className="mt-1.5 font-medium text-loss">{L(T.over)}</p>}
          </div>
        )}
      </div>
      <p className="text-[11px] text-muted">{L(T.step)}</p>
    </div>
  );
}
