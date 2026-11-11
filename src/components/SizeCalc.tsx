// Position size calculator (header panel): the lots that risk a share of the balance (or an amount) over a stop typed in
// pips (the default) or between an entry and a stop price. Prop-challenge accounts also show the safe risk per trade (a third of the room left before a rule breaks, as in
// the Telegram morning plan) and warn when the trade would risk more.
import { useState } from "react";
import { Gauge } from "lucide-react";
import { BALANCE_PRESETS, balancePresetOf, parseNum } from "../lib/calcCore";
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
  capital: { en: "Capital", ar: "رأس المال", fr: "Capital" },
  capAcc: { en: "From account", ar: "من الحساب", fr: "Depuis le compte" },
  capManual: { en: "Manual", ar: "يدوي", fr: "Manuel" },
  risk: { en: "Risk", ar: "المخاطرة", fr: "Risque" },
  pct: { en: "% of balance", ar: "% من الرصيد", fr: "% du solde" },
  amt: { en: "Amount", ar: "مبلغ", fr: "Montant" },
  symbol: { en: "Symbol", ar: "الرمز", fr: "Symbole" },
  entry: { en: "Entry", ar: "سعر الدخول", fr: "Entrée" },
  stop: { en: "Stop loss", ar: "وقف الخسارة", fr: "Stop loss" },
  stopIn: { en: "Stop in", ar: "أدخل الوقف بـ", fr: "Stop en" },
  unitPips: { en: "Pips", ar: "نقاط", fr: "Pips" },
  unitPrice: { en: "Price", ar: "سعر", fr: "Prix" },
  stopPips: { en: "Stop loss (pips)", ar: "وقف الخسارة (نقاط)", fr: "Stop loss (pips)" },
  pipSize: { en: "Pip size", ar: "حجم النقطة", fr: "Taille du pip" },
  pipHint: { en: "In MT5 one pip is usually 10 points. Check your broker's specification.", ar: "في MT5 تساوي النقطة عادةً 10 نقاط سعر. تحقق من مواصفات وسيطك.", fr: "Dans MT5, un pip vaut généralement 10 points. Vérifiez la spécification de votre courtier." },
  price: { en: "Current price", ar: "السعر الحالي", fr: "Prix actuel" },
  priceHint: { en: "Needed to convert to {cur}.", ar: "لازم للتحويل إلى {cur}.", fr: "Nécessaire pour convertir en {cur}." },
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
  fillPips: { en: "Enter the stop loss in pips.", ar: "أدخل وقف الخسارة بالنقاط.", fr: "Saisissez le stop loss en pips." },
  fillPip: { en: "Enter the pip size.", ar: "أدخل حجم النقطة.", fr: "Saisissez la taille du pip." },
  step: { en: "Rounded down to 0.01 lot. Check your broker's minimum and step.", ar: "مقرّب للأسفل إلى 0.01 لوت. تحقق من حد الوسيط وخطوته.", fr: "Arrondi à 0,01 lot inférieur. Vérifiez le minimum et le pas de votre courtier." },
  modeBal: { en: "Lots/bal.", ar: "لوت/رصيد", fr: "Lots/solde" },
  unitAmt: { en: "Balance unit", ar: "وحدة الرصيد", fr: "Unité de solde" },
  lotsPerUnit: { en: "Lots per unit", ar: "لوت لكل وحدة", fr: "Lots par unité" },
  riskLevel: { en: "Risk level", ar: "مستوى المخاطرة", fr: "Niveau de risque" },
  presetLow: { en: "Low risk", ar: "مخاطرة منخفضة", fr: "Risque faible" },
  presetMedium: { en: "Medium risk", ar: "مخاطرة متوسطة", fr: "Risque moyen" },
  presetHigh: { en: "High risk", ar: "مخاطرة عالية", fr: "Risque élevé" },
  balRule: { en: "Fixed lots per chunk of balance, whatever the stop.", ar: "لوت ثابت لكل جزء من الرصيد، مهما كان الوقف.", fr: "Lots fixes par tranche de solde, quel que soit le stop." },
  riskPctField: { en: "Risk per trade (%)", ar: "المخاطرة لكل صفقة (%)", fr: "Risque par trade (%)" },
  risking: { en: "Risking", ar: "مخاطرة بمبلغ", fr: "Risque de" },
  ofBalance: { en: "of your balance", ar: "من رصيدك", fr: "de votre solde" },
  setupNeeded: { en: "Symbol setup needed: see Advanced below.", ar: "مطلوب إعداد الرمز: انظر الإعدادات المتقدمة أدناه.", fr: "Réglage du symbole requis : voir Options avancées ci-dessous." },
  advanced: { en: "Advanced", ar: "إعدادات متقدمة", fr: "Options avancées" },
  none: { en: "Add an account first.", ar: "أضف حساباً أولاً.", fr: "Ajoutez d'abord un compte." },
} satisfies Record<string, L3>;

interface Props { lang: Lang; accounts: Account[]; trades: Trade[]; balances: Record<string, BalancePoint[]>; flows: CashFlow[] }

export default function SizeCalc({ lang, accounts, trades, balances, flows }: Props) {
  const L = (x: L3) => x[lang];
  const { hidden } = usePrivacy();
  const { s, save, setCapSrc, acc, symbols, sym, cur, inPips, entry, setEntry, stop, setStop, stopPips, setStopPips, price, setPrice, pipField, setPipField, r } = useSizeCalc({ accounts, trades, balances, flows });
  // symbol setup (pip size, contract size, quote rate) that is needed and still empty: it lives under Advanced
  const setupMissing = !!r && s.mode !== "balance" && sym.trim() !== "" && (
    (inPips && r.sp.pip == null && !(r.pip > 0)) || (r.sp.contract == null && !(r.contract > 0)) || (r.needRate && !(parseNum(s.rates[`${r.sp.quote}${cur}`] ?? "") > 0)));
  // Advanced starts open only when the saved setup is not the simple default (%, capital from the account, stop in pips)
  const [advOpen, setAdvOpen] = useState(() => s.mode !== "pct" || s.capSrc !== "acc" || s.unit === "price" || setupMissing);
  const money = (v: number, cents = true) => (hidden ? "••••" : fmtMoney(v, { cents, currency: cur }));

  const lbl = "flex flex-col gap-1 text-xs font-medium text-muted";
  if (!acc || !r) return <div className="p-4 text-sm">{L(T.none)}</div>;
  const bal = s.mode === "balance";
  const pip = inPips ? r.pip : r.sp.pip;
  const pipsTxt = pip && r.dist > 0 ? `${(r.dist / pip).toFixed(1)} ${L(T.pips)}` : r.dist > 0 ? String(+r.dist.toFixed(5)) : "-";
  const fillTxt = !inPips ? L(T.fill) : Number.isFinite(r.sPips) && r.sPips !== 0 && !(r.pip > 0) ? L(T.fillPip) : L(T.fillPips);
  const riskPctOfBal = Number.isFinite(r.riskMoney) && r.bal > 0 ? (r.riskMoney / r.bal) * 100 : NaN;
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
      {/* the risk value of the saved mode: a plain % by default; the switch between modes lives under Advanced */}
      {bal ? (
        <div className="grid grid-cols-2 gap-2">
          <label className={lbl}>{L(T.unitAmt)}<input className="field" inputMode="decimal" dir="ltr" value={s.unitAmt} onChange={(e) => save({ unitAmt: e.target.value })} /></label>
          <label className={lbl}>{L(T.lotsPerUnit)}<input className="field" inputMode="decimal" dir="ltr" value={s.lotsPerUnit} onChange={(e) => save({ lotsPerUnit: e.target.value })} /></label>
        </div>
      ) : (
        <label className={lbl}>{s.mode === "pct" ? L(T.riskPctField) : `${L(T.risk)} · ${L(T.amt)}`}
          <input className="field" inputMode="decimal" dir="ltr" value={s.mode === "pct" ? s.pct : s.amt} onChange={(e) => save(s.mode === "pct" ? { pct: e.target.value } : { amt: e.target.value })} />
        </label>
      )}
      {bal && <p className="text-[11px] text-muted">{L(T.balRule)}</p>}
      {!bal && <><label className={lbl}>{L(T.symbol)}
        <input className="field" dir="ltr" list="sizecalc-syms" value={sym} onChange={(e) => save({ sym: e.target.value.toUpperCase() })} />
        <datalist id="sizecalc-syms">{symbols.map((x) => <option key={x} value={x} />)}</datalist>
      </label>
      {inPips ? (
        <label className={lbl}>{L(T.stopPips)}<input className="field" inputMode="decimal" dir="ltr" value={stopPips} onChange={(e) => setStopPips(e.target.value)} /></label>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <label className={lbl}>{L(T.entry)}<input className="field" inputMode="decimal" dir="ltr" value={entry} onChange={(e) => setEntry(e.target.value)} /></label>
          <label className={lbl}>{L(T.stop)}<input className="field" inputMode="decimal" dir="ltr" value={stop} onChange={(e) => setStop(e.target.value)} /></label>
        </div>
      )}
      {r.needPrice && (
        <label className={lbl}>{L(T.price)}
          <input className="field" inputMode="decimal" dir="ltr" value={price} onChange={(e) => setPrice(e.target.value)} />
          <span className="text-[11px]">{L(T.priceHint).replace("{cur}", cur)}</span>
        </label>
      )}
      </>}
      <div className="rounded-xl border border-[var(--border)] p-3">
        {bal ? (!r.ok ? <span className="text-muted">-</span> : (
          <div className="flex items-baseline gap-2"><b className="text-3xl tabular-nums" dir="ltr">{r.lots.toFixed(2)}</b><span className="text-muted">{L(T.lots)}</span></div>
        )) : !(r.dist > 0) ? <span className="text-muted">{fillTxt}</span> : !r.ok ? <span className="text-muted">-</span> : r.lots < 0.01 ? <span className="text-loss">{L(T.tiny)}</span> : (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline gap-2"><b className="text-3xl tabular-nums" dir="ltr">{r.lots.toFixed(2)}</b><span className="text-muted">{L(T.lots)}</span></div>
            <p className="text-xs">{L(T.risking)} <bdi dir="ltr">{money(r.riskMoney)}</bdi>{Number.isFinite(riskPctOfBal) && <> (<bdi dir="ltr">{riskPctOfBal.toFixed(2)}%</bdi> {L(T.ofBalance)})</>}</p>
            <div className="flex justify-between gap-2 text-xs"><span className="text-muted">{L(T.real)}</span><bdi dir="ltr">{money(r.real)}</bdi></div>
            <div className="flex justify-between gap-2 text-xs"><span className="text-muted">{L(T.dist)}</span><bdi dir="ltr">{pipsTxt}</bdi></div>
          </div>
        )}
        {!bal && r.safe && (
          <div className="mt-2 border-t border-[var(--border)] pt-2 text-xs">
            <div className="flex justify-between gap-2"><span className="text-muted">{L(T.safe).replace("{n}", r.safe.name)}</span><bdi dir="ltr">{money(r.safe.v)}</bdi></div>
            {r.ok && r.lots >= 0.01 && r.real > r.safe.v + 0.005 && <p className="mt-1.5 font-medium text-loss">{L(T.over)}</p>}
          </div>
        )}
      </div>
      {!advOpen && setupMissing && <p className="text-xs font-medium text-loss">{L(T.setupNeeded)}</p>}

      <details className="rounded-xl border border-[var(--border)] px-3 py-2" open={advOpen} onToggle={(e) => setAdvOpen(e.currentTarget.open)}>
        <summary className="cursor-pointer select-none text-xs font-semibold text-muted">{L(T.advanced)}</summary>
        <div className="mt-3 flex flex-col gap-3">
          <div className={lbl}>{L(T.risk)}
            <div className="flex self-start overflow-hidden rounded-lg border border-[var(--border)]" role="group" aria-label={L(T.risk)}>
              {(["pct", "amt", "balance"] as const).map((m) => (
                <button key={m} type="button" aria-pressed={s.mode === m} onClick={() => save({ mode: m })} className={`px-3 py-1 text-xs font-semibold ${s.mode === m ? "bg-primary text-[var(--on-primary,#111)]" : ""}`}>{m === "pct" ? "%" : m === "amt" ? (cur === "USD" ? "$" : cur) : L(T.modeBal)}</button>
              ))}
            </div>
          </div>
          {bal && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-[11px]"><Gauge size={13} aria-hidden />{L(T.riskLevel)}</span>
              {BALANCE_PRESETS.map((x) => {
                const on = balancePresetOf(s.unitAmt, s.lotsPerUnit) === x.key;
                return <button key={x.key} type="button" aria-pressed={on} onClick={() => save({ unitAmt: x.unitAmt, lotsPerUnit: x.lotsPerUnit })} className={`rounded-full border border-[var(--border)] px-2.5 py-0.5 text-[11px] font-semibold ${on ? "bg-primary text-[var(--on-primary,#111)]" : ""}`}>{L(x.key === "low" ? T.presetLow : x.key === "medium" ? T.presetMedium : T.presetHigh)}</button>;
              })}
            </div>
          )}
          {!bal && (
            <div className="flex items-center justify-between gap-2 text-xs font-medium text-muted">
              <span>{L(T.stopIn)}</span>
              <div className="flex overflow-hidden rounded-lg border border-[var(--border)]" role="group" aria-label={L(T.stopIn)}>
                {(["pips", "price"] as const).map((u) => {
                  const on = (u === "pips") === inPips;
                  return <button key={u} type="button" aria-pressed={on} onClick={() => save({ unit: u })} className={`px-2.5 py-0.5 text-[11px] font-semibold ${on ? "bg-primary text-[var(--on-primary,#111)]" : ""}`}>{u === "pips" ? L(T.unitPips) : L(T.unitPrice)}</button>;
                })}
              </div>
            </div>
          )}
          <div className="flex items-center justify-between gap-2 text-xs font-medium text-muted">
            <span>{L(T.capital)}</span>
            <div className="flex overflow-hidden rounded-lg border border-[var(--border)]" role="group" aria-label={L(T.capital)}>
              {(["acc", "manual"] as const).map((c) => {
                const on = s.capSrc === c;
                return <button key={c} type="button" aria-pressed={on} onClick={() => setCapSrc(c)} className={`px-2.5 py-0.5 text-[11px] font-semibold ${on ? "bg-primary text-[var(--on-primary,#111)]" : ""}`}>{c === "acc" ? L(T.capAcc) : L(T.capManual)}</button>;
              })}
            </div>
          </div>
          {s.capSrc === "manual" && <label className={lbl}>{L(T.capital)}<input className="field" inputMode="decimal" dir="ltr" value={s.capManual} onChange={(e) => save({ capManual: e.target.value })} /></label>}
          {!bal && (<>
          {inPips && r.sp.pip == null && sym.trim() !== "" && (
          <label className={lbl}>{L(T.pipSize)}
          <input className="field" inputMode="decimal" dir="ltr" value={pipField} onChange={(e) => setPipField(e.target.value)} />
          <span className="text-[11px]">{L(T.pipHint)}</span>
          </label>
          )}
          {r.sp.contract == null && sym.trim() !== "" && (
          <label className={lbl}>{L(T.contract)}
          <input className="field" inputMode="decimal" dir="ltr" value={s.contracts[sym.toUpperCase()] ?? ""} onChange={(e) => save({ contracts: { ...s.contracts, [sym.toUpperCase()]: e.target.value } })} />
          <span className="text-[11px]">{L(T.contractHint)}</span>
          </label>
          )}
          {r.needRate && (
          <label className={lbl}><bdi dir="ltr">1 {r.sp.quote} = ? {cur}</bdi>
          <input className="field" inputMode="decimal" dir="ltr" value={s.rates[`${r.sp.quote}${cur}`] ?? ""} onChange={(e) => save({ rates: { ...s.rates, [`${r.sp.quote}${cur}`]: e.target.value } })} />
          </label>
          )}          </>)}
          <p className="text-[11px] text-muted">{L(T.step)}</p>
        </div>
      </details>
    </div>
  );
}
