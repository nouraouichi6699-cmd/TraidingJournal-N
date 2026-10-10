import { CandlestickChart, Server, Trash2, SquarePlus } from "lucide-react";
import type { Key } from "../i18n";
import type { Account } from "../types";

interface Props {
  t: (k: Key) => string;
  accounts: Account[];
  onRemove: (id: string) => void;
  onConnect: () => void;
}

export default function AccountsList({ t, accounts, onRemove, onConnect }: Props) {
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
      <h2 id="accounts-title" className="mb-3 font-heading text-lg font-semibold">
        {t("accountsTitle")}
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {accounts.map((a) => {
          const Icon = a.platform === "mt5" ? Server : CandlestickChart;
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
                {a.startBalance.toLocaleString("en-US")} <span className="text-sm text-muted">{a.currency}</span>
              </p>
              <p className="text-xs text-muted">
                {a.login ? <span dir="ltr">#{a.login} · </span> : null}
                {t("awaiting")}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
