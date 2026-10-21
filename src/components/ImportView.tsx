import { useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { parseTradingViewCsv, diagnoseCsv } from "../lib/tradingview";
import { parseMt5Xlsx, parseMt5Html } from "../lib/mt5";
import type { Key } from "../i18n";
import type { Account } from "../types";
import type { useJournal } from "../useJournal";
import type { useAccounts } from "../useAccounts";
import { planLedger, type FileLedger } from "../lib/importLedger";
import { fmtMoney } from "../lib/money";

interface Props {
  t: (k: Key) => string;
  accounts: Account[];
  journal: ReturnType<typeof useJournal>;
  resolveMt5: ReturnType<typeof useAccounts>["resolveMt5"];
  setStartBalance: ReturnType<typeof useAccounts>["setStartBalance"];
  onConnect: () => void;
}

interface Line {
  name: string;
  text: string;
  ok: boolean;
  details?: string[];
}

export default function ImportView({ t, accounts, journal, resolveMt5, setStartBalance, onConnect }: Props) {
  const [accountId, setAccountId] = useState<string>("");
  const [lines, setLines] = useState<Line[]>([]);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const selected = accounts.find((a) => a.id === accountId) ?? accounts[0];

  const summary = (title: string, r: { added: number; updated: number; skipped: number }, pts = 0) => {
    const details = [
      `${r.added} ${t("impNew")}`,
      ...(r.skipped > 0 ? [`${r.skipped} ${t("impExisting")}`] : []),
      ...(r.updated > 0 ? [`${r.updated} ${t("impUpdated")}`] : []),
      ...(pts > 0 ? [`${pts} ${t("resPoints")}`] : []),
    ];
    return { text: r.added === 0 && r.updated === 0 ? `${title} — ${t("impNothingNew")}` : title, details };
  };

  /** Start balance + cash flows of an imported file (rules in lib/importLedger.ts); returns the summary lines. */
  const applyLedger = (acc: Account, earliest: string | null, l: FileLedger, created = false) => {
    const plan = planLedger(acc.startBalance, earliest, l);
    if (plan.start != null) setStartBalance(acc.id, plan.start);
    const fl = journal.importFlows(acc.id, plan.flows);
    return [
      ...(plan.start != null || (created && plan.reaches) ? [`${t("impStart")} ${fmtMoney(l.startBalance as number, { cents: true, currency: acc.currency })}`] : []), // only when it changes
      ...(fl.added > 0 ? [`${fl.added} ${t("impFlows")}`] : []),
    ];
  };

  const handle = async (files: FileList | File[]) => {
    const out: Line[] = [];
    // Process sequentially: each import builds on the latest stored data
    for (const f of Array.from(files)) {
      try {
        if (/\.(xlsx|html?)$/i.test(f.name)) {
          const rep = /\.xlsx$/i.test(f.name) ? await parseMt5Xlsx(f) : await parseMt5Html(f);
          if (!rep) {
            out.push({ name: f.name, ok: false, text: t("errNotMt5") });
            continue;
          }
          const { account, created } = resolveMt5({ ...rep, preferId: selected?.platform === "mt5" ? selected.id : undefined });
          const earliest = journal.earliestTrade(account.id); // before this file's trades are stored
          const r = journal.importTrades(account.id, rep.trades);
          const b = journal.importBalance(account.id, rep.points);
          const ledger = applyLedger(account, earliest, rep, created);
          const s = summary(`${t("kindMt5")} → ${account.name}${created ? ` (${t("accCreated")})` : ""}`, r, b.added);
          out.push({ name: f.name, ok: true, text: s.text, details: [...s.details, ...ledger] });
          continue;
        }
        const txt = await f.text();
        const res = parseTradingViewCsv(txt);
        if (res.kind === "unknown") {
          const d = diagnoseCsv(txt);
          if (d.reason === "empty") out.push({ name: f.name, ok: false, text: t("errEmpty") });
          else if (d.missing.length === 0) out.push({ name: f.name, ok: false, text: t("errNoValid") });
          else out.push({ name: f.name, ok: false, text: `${t("errCols")} ${d.missing.join(" · ")}`, details: [`${t("errColsFound")} ${d.header.join(" | ").slice(0, 200)}`] });
        } else if (res.kind === "trades" && !selected) {
          out.push({ name: f.name, ok: false, text: t("errNeedTv") });
        } else if (res.kind === "balance" && (!selected || selected.platform !== "tradingview")) {
          out.push({ name: f.name, ok: false, text: t("errNeedTv") });
        } else if (res.kind === "trades") {
          const r = journal.importTrades(selected!.id, res.trades);
          out.push({ name: f.name, ok: true, ...summary(t("kindTrades"), r) });
        } else {
          const earliest = journal.earliestTrade(selected!.id);
          const r = journal.importBalance(selected!.id, res.points);
          const old = res.points.length - r.added;
          const ledger = applyLedger(selected!, earliest, res);
          out.push({
            name: f.name,
            ok: true,
            text: t("kindBalance"),
            details: [`${r.added} ${t("impPtsNew")}`, ...(old > 0 ? [`${old} ${t("impPtsOld")}`] : []), ...ledger],
          });
        }
      } catch (e) {
        out.push({ name: f.name, ok: false, text: `${t("errRead")} ${e instanceof Error ? e.message : ""}`.trim() });
      }
    }
    setLines(out);
  };

  if (accounts.length === 0) {
    return (
      <section className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
        <p className="text-sm text-muted">{t("noAccountsHint")}</p>
        <button type="button" onClick={onConnect} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary">
          {t("connect")}
        </button>
      </section>
    );
  }

  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-4">
      <h2 className="font-heading text-xl font-semibold">{t("importTitle")}</h2>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("pickAccount")}
        <select className="field" value={selected?.id} onChange={(e) => setAccountId(e.target.value)}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>

      <div
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          handle(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
          over ? "border-icon bg-primary-tint" : "border-border hover:border-icon"
        }`}
      >
        <UploadCloud size={34} className="text-icon" strokeWidth={1.6} />
        <p className="font-semibold">{t("dropHint")}</p>
        <p className="text-sm text-muted">{t("importHelp2")}</p>
        <input
          ref={input}
          type="file"
          accept=".csv,.xlsx,.html,.htm,text/csv,text/html"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) handle(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {lines.length > 0 && (
        <ul className="flex flex-col gap-2" aria-live="polite">
          {lines.map((l, i) => (
            <li key={i} className="rounded-xl border border-border bg-surface px-4 py-3 text-sm">
              <p className="truncate font-medium" dir="ltr">{l.name}</p>
              <p className={l.ok ? "text-icon" : "text-loss"}>{l.text}</p>
              {l.details?.map((d, j) => (
                <p key={j} className="text-xs text-muted">{d}</p>
              ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
