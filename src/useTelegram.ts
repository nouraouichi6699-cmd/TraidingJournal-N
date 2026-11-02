// The Telegram link and its alert preferences, taken out of the old Profile card so Settings can use the same state
// and the same handlers. Every call, every poll and every state this had in Profile is here unchanged: the move is a
// move, not a rewrite.
import { useCallback, useEffect, useRef, useState } from "react";
import { TG_PREFS, tgInfo, tgLink, tgLinked, tgPrefs, tgTest, tgUnlink, type TgCoach, type TgError, type TgPartner, type TgPrefs } from "./lib/telegram";
import { pick, T } from "./components/telegramText";
import type { Lang } from "./types";

export type TgView =
  | { kind: "loading" }
  | { kind: "error"; error: TgError }
  | { kind: "ready"; bot: string; linked: boolean; name: string | null; prefs: TgPrefs; partner: TgPartner | null; coach: TgCoach | null };

const POLL_MS = 3000, POLL_FOR = 3 * 60e3;

/**
 * `enabled` keeps the first request for the moment it is needed: Settings opens on Display, and asking the function
 * about a Telegram link before anyone has gone looking for one would be a call for nothing.
 */
export function useTelegram(lang: Lang, enabled = true) {
  const L = pick(lang);
  const [v, setV] = useState<TgView>({ kind: "loading" });
  const [url, setUrl] = useState<string | null>(null); // the one-time t.me link while waiting for Start
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [peopleNote, setPeopleNote] = useState<string | null>(null);
  const until = useRef(0);

  const load = useCallback(async () => {
    if (!enabled) return;
    const r = await tgInfo(lang);
    setV("error" in r ? { kind: "error", error: r.error } : { kind: "ready", bot: r.bot, linked: r.linked, name: r.name, prefs: { ...TG_PREFS, ...r.prefs }, partner: r.partner ?? null, coach: r.coach ?? null });
  }, [lang, enabled]);
  useEffect(() => { void load(); }, [load]);

  // after "Connect": watch the settings row until the chat is linked (or the link expires)
  useEffect(() => {
    if (!url) return;
    const id = window.setInterval(async () => {
      if (Date.now() > until.current) { setUrl(null); setNote(L(T.expired)); return; }
      const s = await tgLinked();
      if (s?.linked) { setUrl(null); setNote(null); setV((x) => (x.kind === "ready" ? { ...x, linked: true, name: s.name } : x)); }
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (f: () => Promise<unknown>) => { setBusy(true); setNote(null); try { await f(); } finally { setBusy(false); } };
  const connect = () => act(async () => {
    const r = await tgLink(lang);
    if ("error" in r) { setV({ kind: "error", error: r.error }); return; }
    until.current = Date.now() + POLL_FOR;
    setUrl(r.url);
    window.open(r.url, "_blank", "noopener"); // may be blocked after the await: the button below stays as the way in
  });
  const setPref = (p: TgPrefs) => act(async () => {
    if (v.kind !== "ready") return;
    setV({ ...v, prefs: p });
    const r = await tgPrefs(lang, p);
    if ("error" in r) setNote(L(T.failed));
  });
  const test = () => act(async () => { const r = await tgTest(lang); setNote("error" in r ? L(r.error === "notLinked" ? T.expired : T.failed) : L(T.sent)); });
  const unlink = () => { if (window.confirm(L(T.offAsk))) void act(async () => { const r = await tgUnlink(lang); if ("error" in r) setNote(L(T.failed)); else if (v.kind === "ready") setV({ ...v, linked: false, name: null, partner: null, coach: null }); }); };
  const retry = () => { setV({ kind: "loading" }); void load(); };

  const linked = v.kind === "ready" ? v.linked : null;

  return { v, setV, url, busy, note, setNote, peopleNote, setPeopleNote, linked, act, connect, setPref, test, unlink, retry };
}

export type Telegram = ReturnType<typeof useTelegram>;
