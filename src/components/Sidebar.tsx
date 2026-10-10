import { useLayoutEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  PenLine,
  SquarePlus,
  LineChart,
  ClipboardList,
  Upload,
  Target,
  Trophy,
} from "lucide-react";
import type { Key } from "../i18n";

const main = [
  { id: "dashboard", icon: LayoutDashboard },
  { id: "journal", icon: PenLine },
  { id: "accounts", icon: SquarePlus },
  { id: "charts", icon: LineChart },
  { id: "reports", icon: ClipboardList },
] as const;

const more = [
  { id: "import", icon: Upload },
  { id: "strategies", icon: Target },
  { id: "achievements", icon: Trophy },
] as const;

export type View = (typeof main)[number]["id"] | (typeof more)[number]["id"];

interface Props {
  t: (k: Key) => string;
  view: View;
  onView: (v: View) => void;
}

export default function Sidebar({ t, view, onView }: Props) {
  const nav = useRef<HTMLElement>(null);
  const [pill, setPill] = useState({ top: 0, height: 0, ready: false });

  useLayoutEffect(() => {
    const el = nav.current?.querySelector<HTMLElement>(`[data-id="${view}"]`);
    if (el) setPill((p) => ({ top: el.offsetTop, height: el.offsetHeight, ready: true || p.ready }));
  }, [view]);

  const item = ({ id, icon: Icon }: { id: View; icon: typeof Upload }) => (
    <button
      key={id}
      type="button"
      data-id={id}
      aria-label={t(id)}
      aria-current={view === id ? "page" : undefined}
      onClick={() => onView(id)}
      className="nav-item relative z-10 flex flex-col items-center gap-1.5 rounded-xl px-1 py-3 text-[11px] font-semibold"
    >
      <Icon size={22} strokeWidth={1.8} className="text-icon" />
      <span className="hidden text-center sm:block">{t(id)}</span>
    </button>
  );

  return (
    <nav
      ref={nav}
      aria-label={t("mainNav")}
      className="sticky top-3 m-3 flex w-14 shrink-0 flex-col gap-1 self-start rounded-2xl border border-border bg-surface p-2 sm:w-[92px]"
    >
      <span
        aria-hidden
        className="nav-pill pointer-events-none absolute inset-x-2 top-0 rounded-xl border border-icon/40 bg-primary-tint"
        style={{ transform: `translateY(${pill.top}px)`, height: pill.height, opacity: pill.ready ? 1 : 0 }}
      >
        <span className="absolute inset-y-3 -start-[9px] w-1 rounded-full bg-icon" />
      </span>
      {main.map(item)}
      <hr className="mx-2 my-1 border-border" />
      {more.map(item)}
    </nav>
  );
}
