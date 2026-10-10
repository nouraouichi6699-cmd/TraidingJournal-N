import { CandlestickChart, Server, Trash2, SquarePlus } from "lucide-react";
import type { Key } from "../i18n";
import type { Account, BalancePoint, Trade } from "../types";
import { computeStats, fmt } from "../lib/stats";

interface Props {
  t: (k: Key) => string;
  accounts: Account[];
  onRemove: (id: string) => void;
  onConnect: () => void;
  trades: Trade[];
  balances: Record<string, BalancePoint[]>;
}

function Sparkline({ points }: { points: BalancePoint[] }) {
  if (points.length < 2) return null;
  const v = points.map((p) => p.balance);
  const min = Math.min(...v), max = Math.max(...v), span = max - min || 1;
  const d = v.map((y, i) => `${(i / (v.length - 1)) * 100},${36 - ((y - min) / span) * 32 - 2}`).join(" ");
  return (
    <svg viewBox="0 0 100 36" preserveAspectRatio="none" className="h-9 w-full" aria-hidden>
      <polyline points={d} fill="none" stroke="var(--icon)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function AccountsList({ t, accounts, onRemove, onConnect, trades, balances }: Props) {
  if (accounts.length === 0) {
    return (
      <section className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
        <SquarePlus size={32} className="text-icon" strokeWidth={1.6} />
        <h2 className="font-heading text-lg font-semibold">{t("noAccounts")}</h2>
        <p className="text-sm text-muted">{t("noAccountsHint")}</p>
        <button type="button" onClick={onConnect} className="mt-1 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary">
          {t("connect")}
        </button>
      </section>
    );
  }

  return (
    <section aria-labelledby="accounts-title">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="accounts-title" className="font-heading text-lg font-semibold">
          {t("accountsTitle")}
        </h2>
        <button type="button" onClick={onConnect} className="flex items-center gap-2 rounded-xl border border-border px-3 py-1.5 text-sm font-semibold hover:bg-primary-tint">
          <SquarePlus size={16} className="text-icon" />
          {t("connect")}
        </button>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {accounts.map((a) => {
          const Icon = a.platform === "mt5" ? Server : CandlestickChart;
          const mine = trades.filter((x) => x.accountId === a.id);
          const st = computeStats(mine);
          const bal = balances[a.id] ?? [];
          const current = bal.length ? bal[bal.length - 1].balance : a.startBalance;
          return (
            <li key={a.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Icon size={22} className="shrink-0 text-icon" strokeWidth={1.8} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{a.name}</p>
                    <p className="text-xs text-muted">{t(a.platform === "mt5" ? "mt5Name" : "tvName")}</p>
                  </div>
                </div>
                <button type="button" aria-label={`${t("remove")}: ${a.name}`} onClick={() => onRemove(a.id)} className="icon-btn -m-1">
                  <Trash2 size={16} className="text-muted" />
                </button>
              </div>
              <p className="tnum text-2xl font-semibold" dir="ltr">
                {fmt(current)} <span className="text-sm text-muted">{a.currency}</span>
              </p>
              <Sparkline points={bal} />
              {st.count > 0 ? (
                <dl className="grid grid-cols-3 gap-2 text-xs">
                  <div><dt className="text-muted">{t("tradesCount")}</dt><dd className="tnum font-semibold" dir="ltr">{st.count}</dd></div>
                  <div><dt className="text-muted">{t("winRate")}</dt><dd className="tnum font-semibold" dir="ltr">{st.winRate != null ? `${st.winRate.toFixed(0)}%` : "—"}</dd></div>
                  <div><dt className="text-muted">{t("netPnl")}</dt><dd className={`tnum font-semibold ${st.net >= 0 ? "text-profit" : "text-loss"}`} dir="ltr">{st.net > 0 ? "+" : ""}{fmt(st.net)}</dd></div>
                </dl>
              ) : (
                <p className="text-xs text-muted">
                  {a.login ? <span dir="ltr">#{a.login} · </span> : null}
                  {t("awaiting")}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
