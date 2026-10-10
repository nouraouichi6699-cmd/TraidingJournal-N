import { useState } from "react";
import { fmt } from "../lib/stats";
import type { Key } from "../i18n";
import type { Account, Trade } from "../types";

interface Props {
  t: (k: Key) => string;
  accounts: Account[];
  trades: Trade[];
}

const when = (s: string | null) => (s ? s.replace("T", " ") : "—");

export default function JournalView({ t, accounts, trades }: Props) {
  const [acc, setAcc] = useState("all");
  const rows = trades
    .filter((x) => acc === "all" || x.accountId === acc)
    .sort((a, b) => (b.entryTime ?? "").localeCompare(a.entryTime ?? ""));

  return (
    <section className="flex flex-col gap-4">
      {accounts.length > 1 && (
        <select className="field max-w-xs" value={acc} onChange={(e) => setAcc(e.target.value)} aria-label={t("pickAccount")}>
          <option value="all">{t("allAccounts")}</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      )}
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border py-16 text-center text-sm text-muted">{t("noTrades")}</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
          <table className="w-full min-w-[780px] text-sm">
            <thead className="text-muted">
              <tr className="border-b border-border">
                {(["symbol", "side", "entry", "exit", "size", "pnl", "status"] as Key[]).map((k) => (
                  <th key={k} scope="col" className="px-4 py-3 text-start font-semibold">{t(k)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.key} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium" dir="ltr">{x.symbol}</td>
                  <td className="px-4 py-3">{t(x.side)}</td>
                  <td className="px-4 py-3 tnum" dir="ltr">{fmt(x.entryPrice, x.entryPrice < 10 ? 5 : 2)}<span className="block text-xs text-muted">{when(x.entryTime)}</span></td>
                  <td className="px-4 py-3 tnum" dir="ltr">{x.exitPrice != null ? fmt(x.exitPrice, x.exitPrice < 10 ? 5 : 2) : "—"}<span className="block text-xs text-muted">{when(x.exitTime)}</span></td>
                  <td className="px-4 py-3 tnum" dir="ltr">{x.qty.toLocaleString("en-US")}</td>
                  <td className={`px-4 py-3 tnum font-semibold ${x.pnl == null ? "" : x.pnl >= 0 ? "text-profit" : "text-loss"}`} dir="ltr">
                    {x.pnl == null ? "—" : `${x.pnl > 0 ? "+" : ""}${fmt(x.pnl)}`}
                  </td>
                  <td className="px-4 py-3">{t(x.status === "open" ? "open" : "closed")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
