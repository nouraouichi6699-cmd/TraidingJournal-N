import { LayoutDashboard, PenLine, SquarePlus, LineChart, ClipboardList } from "lucide-react";
import type { Key } from "../i18n";

const items = [
  { id: "dashboard", icon: LayoutDashboard },
  { id: "journal", icon: PenLine },
  { id: "accounts", icon: SquarePlus },
  { id: "charts", icon: LineChart },
  { id: "reports", icon: ClipboardList },
] as const;

export default function Sidebar({ t }: { t: (k: Key) => string }) {
  return (
    <nav
      aria-label={t("mainNav")}
      className="sticky top-3 m-3 flex w-14 sm:w-[92px] shrink-0 flex-col gap-1 self-start rounded-2xl border border-border bg-surface p-2"
    >
      {items.map(({ id, icon: Icon }, i) => (
        <button
          key={id}
          type="button"
          aria-label={t(id)}
          aria-current={i === 0 ? "page" : undefined}
          className={`flex flex-col items-center gap-1.5 rounded-xl px-1 py-3 text-[11px] font-semibold ${
            i === 0 ? "bg-primary-tint" : "hover:bg-primary-tint"
          }`}
        >
          <Icon size={22} strokeWidth={1.8} className="text-icon" />
          <span className="hidden text-center sm:block">{t(id)}</span>
        </button>
      ))}
    </nav>
  );
}
