import { useEffect, useRef, useState } from "react";
import { CandlestickChart, Server, X, ShieldAlert } from "lucide-react";
import type { Key } from "../i18n";
import type { Account, Platform } from "../types";

interface Props {
  t: (k: Key) => string;
  onClose: () => void;
  onCreate: (a: Omit<Account, "id" | "createdAt">) => void;
}

const platforms: { id: Platform; name: Key; desc: Key; icon: typeof Server }[] = [
  { id: "tradingview", name: "tvName", desc: "tvDesc", icon: CandlestickChart },
  { id: "mt5", name: "mt5Name", desc: "mt5Desc", icon: Server },
];

const currencies = ["USD", "EUR", "GBP", "TND"];

export default function ConnectAccountModal({ t, onClose, onCreate }: Props) {
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [balance, setBalance] = useState("");
  const [login, setLogin] = useState("");
  const [server, setServer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    panel.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const bal = Number(balance.replace(",", "."));
  const nameErr = !name.trim();
  const balErr = balance.trim() === "" ? "required" : !Number.isFinite(bal) || bal < 0 ? "invalidNumber" : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!platform || nameErr || balErr) return;
    onCreate({
      platform,
      name: name.trim(),
      currency,
      startBalance: bal,
      ...(platform === "mt5" && login.trim() ? { login: login.trim() } : {}),
      ...(platform === "mt5" && server.trim() ? { server: server.trim() } : {}),
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="connect-title"
        className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 outline-none"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 id="connect-title" className="font-heading text-xl font-semibold">
            {platform ? t(platforms.find((p) => p.id === platform)!.name) : t("connect")}
          </h2>
          <button type="button" aria-label={t("close")} onClick={onClose} className="icon-btn -m-1.5">
            <X size={18} className="text-icon" />
          </button>
        </div>

        {!platform ? (
          <>
            <p className="mb-3 text-sm text-muted">{t("choosePlatform")}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {platforms.map(({ id, name: n, desc, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPlatform(id)}
                  className="flex flex-col items-start gap-3 rounded-xl border border-border p-4 text-start hover:border-icon hover:bg-primary-tint"
                >
                  <Icon size={26} className="text-icon" strokeWidth={1.7} />
                  <span>
                    <span className="block font-semibold">{t(n)}</span>
                    <span className="block text-sm text-muted">{t(desc)}</span>
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            <Field label={t("accountName")} error={submitted && nameErr ? t("required") : null}>
              <input className="field" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={60} />
            </Field>

            <div className="grid grid-cols-[1fr_120px] gap-3">
              <Field
                label={t("startBalance")}
                error={submitted && balErr ? t(balErr as Key) : null}
              >
                <input
                  className="field tnum"
                  inputMode="decimal"
                  value={balance}
                  onChange={(e) => setBalance(e.target.value)}
                  dir="ltr"
                />
              </Field>
              <Field label={t("currency")}>
                <select className="field" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {currencies.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
            </div>

            {platform === "mt5" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t("mt5Login")}>
                  <input className="field tnum" inputMode="numeric" value={login} onChange={(e) => setLogin(e.target.value)} dir="ltr" maxLength={20} />
                </Field>
                <Field label={t("mt5Server")}>
                  <input className="field" value={server} onChange={(e) => setServer(e.target.value)} dir="ltr" maxLength={60} />
                </Field>
              </div>
            )}

            <p className="flex items-center gap-2 text-sm text-muted">
              <ShieldAlert size={16} className="shrink-0 text-icon" />
              {t("noPassword")}
            </p>

            <div className="mt-1 flex justify-end gap-2">
              <button type="button" onClick={() => setPlatform(null)} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-primary-tint">
                {t("back")}
              </button>
              <button type="submit" className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary">
                {t("connectBtn")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string | null; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium">
      {label}
      {children}
      {error && <span className="text-xs font-normal text-loss">{error}</span>}
    </label>
  );
}
