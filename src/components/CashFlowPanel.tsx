import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { CashFlow, CashFlowType } from "../lib/cashflow";
import { signed } from "../lib/cashflow";
import { fmtMoney } from "../lib/money";
import { usePrivacy } from "../usePrivacy";
import { GREEN, RED } from "./dashWidgets";
import type { Account, Lang } from "../types";

type L = [string, string, string];
const X = {
  title: ["Cash flows", "التدفقات النقدية", "Flux de trésorerie"] as L,
  hint: ["Record deposits, withdrawals, credits and adjustments. They are never counted as trading profit.", "سجّل الإيداعات والسحوبات والائتمانات والتعديلات. لا تُحتسب أبداً كربح تداول.", "Enregistrez dépôts, retraits, crédits et ajustements. Jamais comptés comme profit."] as L,
  add: ["Add", "إضافة", "Ajouter"] as L, account: ["Account", "الحساب", "Compte"] as L, date: ["Date", "التاريخ", "Date"] as L, type: ["Type", "النوع", "Type"] as L, amount: ["Amount", "المبلغ", "Montant"] as L,
  deposit: ["Deposit", "إيداع", "Dépôt"] as L, withdrawal: ["Withdrawal", "سحب", "Retrait"] as L, credit: ["Credit", "ائتمان", "Crédit"] as L, adjustment: ["Adjustment", "تعديل", "Ajustement"] as L,
  none: ["No cash flows recorded yet.", "لا توجد تدفقات مسجّلة بعد.", "Aucun flux enregistré."] as L,
  bad: ["Enter a date and a non-zero amount (an adjustment may be negative).", "أدخل تاريخاً ومبلغاً غير صفري (التعديل يمكن أن يكون سالباً).", "Saisissez une date et un montant non nul."] as L,
  del: ["Delete this cash flow?", "حذف هذا التدفق؟", "Supprimer ce flux ?"] as L, remove: ["Delete", "حذف", "Supprimer"] as L,
};
const TYPES: CashFlowType[] = ["deposit", "withdrawal", "credit", "adjustment"];

export default function CashFlowPanel({ lang, accounts, flows, onAdd, onRemove }: { lang: Lang; accounts: Account[]; flows: CashFlow[]; onAdd?: (f: Omit<CashFlow, "id">) => void; onRemove?: (id: string) => void }) {
  const k = lang === "en" ? 0 : lang === "ar" ? 1 : 2, T = (x: L) => x[k];
  const { hidden } = usePrivacy();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [type, setType] = useState<CashFlowType>("deposit");
  const [amount, setAmount] = useState("");
  const [err, setErr] = useState(false);
  const acc = accounts.some((a) => a.id === accountId) ? accountId : accounts[0]?.id ?? "";
  const name = (id: string) => accounts.find((a) => a.id === id)?.name ?? "—";
  const cur = (id: string) => accounts.find((a) => a.id === id)?.currency ?? "";
  const field = "rounded-lg border border-border bg-bg px-2.5 py-1.5 text-sm text-text";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = Number(amount.replace(",", "."));
    if (!acc || !date || !Number.isFinite(v) || v === 0 || (type !== "adjustment" && v < 0)) { setErr(true); return; }
    setErr(false);
    onAdd?.({ accountId: acc, t: `${date} 00:00:00`, type, amount: v }); // start of the day: same convention as the return calculations
    setAmount("");
  };
  const list = [...flows].sort((a, b) => b.t.localeCompare(a.t));

  return (
    <div className="rounded-xl border border-border p-3" style={{ background: "color-mix(in srgb, var(--text) 4%, transparent)" }}>
      <div className="text-sm font-semibold">{T(X.title)}</div>
      <div className="mb-3 text-xs text-muted">{T(X.hint)}</div>
      {onAdd && accounts.length > 0 && (
        <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
          {accounts.length > 1 && (
            <label className="grid gap-1 text-[11px] text-muted">{T(X.account)}
              <select value={acc} onChange={(e) => setAccountId(e.target.value)} className={field}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
            </label>
          )}
          <label className="grid gap-1 text-[11px] text-muted">{T(X.date)}<input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={field} /></label>
          <label className="grid gap-1 text-[11px] text-muted">{T(X.type)}
            <select value={type} onChange={(e) => setType(e.target.value as CashFlowType)} className={field}>{TYPES.map((x) => <option key={x} value={x}>{T(X[x])}</option>)}</select>
          </label>
          <label className="grid gap-1 text-[11px] text-muted">{T(X.amount)}<input inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} className={`${field} w-32`} dir="ltr" /></label>
          <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-on-primary"><Plus size={14} />{T(X.add)}</button>
          {err && <div role="alert" className="w-full text-xs" style={{ color: RED }}>{T(X.bad)}</div>}
        </form>
      )}
      <div className="mt-3 max-h-56 overflow-auto">
        {!list.length ? <div className="text-xs text-muted">{T(X.none)}</div> : (
          <table className="w-full text-sm">
            <tbody>
              {list.map((f) => { const v = signed(f); return (
                <tr key={f.id} className="border-t border-border">
                  <td className="tnum py-1.5 pe-3 text-xs text-muted" dir="ltr">{f.t.slice(0, 10)}</td>
                  {accounts.length > 1 && <td className="py-1.5 pe-3 text-xs">{name(f.accountId)}</td>}
                  <td className="py-1.5 pe-3">{T(X[f.type])}</td>
                  <td className="tnum py-1.5 pe-3 text-end font-semibold" style={{ color: hidden ? undefined : v > 0 ? GREEN : RED }}><span dir="ltr">{hidden ? "••••" : fmtMoney(v, { cents: true, sign: true, currency: cur(f.accountId) })}</span></td>
                  <td className="w-8 py-1.5 text-end">{onRemove && <button type="button" aria-label={T(X.remove)} title={T(X.remove)} onClick={() => window.confirm(T(X.del)) && onRemove(f.id)} className="text-muted hover:text-[var(--text)]"><Trash2 size={14} /></button>}</td>
                </tr>
              ); })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
