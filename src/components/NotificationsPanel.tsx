import { Newspaper, CalendarDays, X, CheckCheck, Heart, BellRing, TrendingDown } from "lucide-react";
import type { Interests, Notice } from "../useInterests";
import type { Key } from "../i18n";
import type { Lang } from "../types";

interface Props {
  t: (k: Key) => string;
  lang: Lang;
  interests: Interests;
  onNews: () => void;
  onCalendar: () => void;
  onCharts?: () => void;
  close: () => void;
}

function label(k: string, t: (k: Key) => string) {
  if (k.startsWith("asset:")) return k.slice(6);
  if (k.startsWith("cat:")) return t(`cat_${k.slice(4)}` as Key);
  return k.slice(3).replace("|", " · ");
}

export default function NotificationsPanel({ t, lang, interests, onNews, onCalendar, onCharts, close }: Props) {
  const { notices, keys, unread } = interests;
  const when = (n: Notice) =>
    new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(n.time));

  const go = (n: Notice) => {
    interests.markRead(n.id);
    (n.kind === "news" ? onNews : n.kind === "edge" ? onCharts ?? onCalendar : onCalendar)();
    close();
  };
  const section = (kind: Notice["kind"], title: Key, Icon: typeof Newspaper) => {
    const list = notices.filter((n) => n.kind === kind);
    if (list.length === 0) return null;
    return (
      <div key={kind} className="mb-1">
        <p className="flex items-center gap-1.5 px-2 pb-1 pt-2 text-xs font-semibold text-muted"><Icon size={13} />{t(title)}</p>
        {list.map((n) => (
          <button key={n.id} type="button" onClick={() => go(n)} className="menu-item !items-start !gap-3 text-start">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.unread ? "bg-loss" : "bg-transparent"}`} aria-hidden />
            <span className="min-w-0 flex-1">
              <span dir="auto" className={`line-clamp-2 text-sm ${n.unread ? "font-semibold" : "text-muted"}`}>{n.title}</span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                {n.soon && <span className="flex items-center gap-1 font-semibold text-icon"><BellRing size={12} />{t("notifSoon")}</span>}
                <time>{when(n)}</time>
                {n.sub && <span>{n.sub}</span>}
              </span>
            </span>
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="flex max-h-[70vh] flex-col">
      <div className="flex items-center justify-between gap-3 px-2 pb-1 pt-1">
        <h2 className="font-heading text-sm font-bold">{t("notifications")}</h2>
        <button type="button" disabled={unread === 0} onClick={interests.markAllRead} className="flex items-center gap-1.5 text-xs font-semibold text-icon disabled:opacity-40">
          <CheckCheck size={14} />{t("markAllRead")}
        </button>
      </div>
      <div className="overflow-y-auto">
        {notices.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-sm text-muted">
            <Heart size={30} className="text-icon opacity-60" strokeWidth={1.5} />
            <p>{t("notifEmpty")}</p>
          </div>
        )}
        {section("edge", "notifEdgeTitle", TrendingDown)}
        {section("event", "notifEvents", CalendarDays)}
        {section("news", "notifNews", Newspaper)}
      </div>
      {keys.length > 0 && (
        <div className="mt-1 border-t border-border px-2 pt-2">
          <p className="mb-1.5 text-xs font-semibold text-muted">{t("notifFollowing")}</p>
          <div className="flex flex-wrap gap-1.5 pb-1">
            {keys.map((k) => (
              <span key={k} className="flex items-center gap-1 rounded-full border border-icon/50 bg-primary-tint py-0.5 ps-2.5 pe-1 text-xs font-medium text-icon">
                {label(k, t)}
                <button type="button" aria-label={`${t("unfollow")}: ${label(k, t)}`} onClick={() => interests.toggle(k)} className="rounded-full p-0.5 hover:bg-black/20"><X size={12} /></button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
