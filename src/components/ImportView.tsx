import { useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { parseTradingViewCsv } from "../lib/tradingview";
import type { Key } from "../i18n";
import type { Account } from "../types";
import type { useJournal } from "../useJournal";

interface Props {
  t: (k: Key) => string;
  accounts: Account[];
  journal: ReturnType<typeof useJournal>;
  onConnect: () => void;
}

interface Line {
  name: string;
  text: string;
  ok: boolean;
}

export default function ImportView({ t, accounts, journal, onConnect }: Props) {
  const tv = accounts.filter((a) => a.platform === "tradingview");
  const [accountId, setAccountId] = useState<string>("");
  const [lines, setLines] = useState<Line[]>([]);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const selected = tv.find((a) => a.id === accountId) ?? tv[0];

  const handle = async (files: FileList | File[]) => {
    if (!selected) return;
    const out: Line[] = [];
    // Process sequentially: each import builds on the latest stored data
    for (const f of Array.from(files)) {
      const res = parseTradingViewCsv(await f.text());
      if (res.kind === "trades") {
        const r = journal.importTrades(selected.id, res.trades);
        out.push({
          name: f.name,
          ok: true,
          text: `${t("kindTrades")}: ${r.added} ${t("resAdded")} · ${r.updated} ${t("resUpdated")} · ${r.skipped} ${t("resSkipped")}`,
        });
      } else if (res.kind === "balance") {
        const r = journal.importBalance(selected.id, res.points);
        out.push({ name: f.name, ok: true, text: `${t("kindBalance")}: ${r.added} ${t("resPoints")}` });
      } else out.push({ name: f.name, ok: false, text: t("kindUnknown") });
    }
    setLines(out);
  };

  if (tv.length === 0) {
    return (
      <section className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
        <p className="text-sm text-muted">{t("noTvAccount")}</p>
        <button type="button" onClick={onConnect} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary">
          {t("connect")}
        </button>
        <p className="text-xs text-muted">{t("mt5Soon")}</p>
      </section>
    );
  }

  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-4">
      <h2 className="font-heading text-xl font-semibold">{t("importTitle")}</h2>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("pickAccount")}
        <select className="field" value={selected?.id} onChange={(e) => setAccountId(e.target.value)}>
          {tv.map((a) => (
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
        <p className="text-sm text-muted">{t("importHelp")}</p>
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv"
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
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">{t("mt5Soon")}</p>
    </section>
  );
}
