// The Telegram topics of Settings, and the partner and coach cards under Security. All of it is the Profile card's
// behaviour in the phase A shell: the same eight states (loading, error with its four texts and a retry, the
// three-step invitation, waiting for Start, an expired link, linked, test sent, a preference that failed to save),
// the same calls, the same confirm before unlinking.
import { useEffect, useRef, useState } from "react";
import { Mic, Send, Users } from "lucide-react";
import { Lamp, Note, Row, Tile } from "./settingsUi";
import { COACH_ICON, GROUPS, pick, ROLE, T, TG_COACH } from "./telegramText";
import { tgCoachPrefs, tgWatcherNow, type TgCoach, type TgCoachPrefs, type TgPartner, type TgRole } from "../lib/telegram";
import type { Telegram } from "../useTelegram";
import type { Lang } from "../types";

const POLL_MS = 3000;
const btnGhost = "min-h-[42px] rounded-full border border-border px-4 text-[13px] font-medium transition hover:bg-primary-tint disabled:opacity-50";
const btnGold = "min-h-[42px] rounded-full bg-primary px-4 text-[13px] font-bold text-on-primary transition hover:brightness-95 disabled:opacity-50";
const btnDanger = "min-h-[42px] rounded-full border border-loss/45 px-4 text-[13px] font-medium text-loss transition hover:bg-loss/10 disabled:opacity-50";
const spinner = <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none" />;
const dateOf = (iso: string, lang: Lang) => { const d = new Date(iso); return Number.isNaN(+d) ? "" : new Intl.DateTimeFormat(lang === "ar" ? "ar-u-nu-latn" : lang, { day: "numeric", month: "short", year: "numeric" }).format(d); };

/** The pill beside the page title: lit and named when the chat is linked. */
export function TgStatus({ tg, lang }: { tg: Telegram; lang: Lang }) {
  const L = pick(lang);
  if (tg.v.kind !== "ready") return null;
  const on = tg.v.linked;
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${on ? "border-primary/50 text-primary" : "border-border text-muted"}`}>
      <span className={`h-2 w-2 rounded-full ${on ? "bg-primary" : "bg-[var(--muted)]"}`} />
      {L(on ? T.connected : T.notConnected)}
    </span>
  );
}

/** A ring showing how many of a group's alerts are on, for the tile the design marks with one. */
function Ring({ on, of }: { on: number; of: number }) {
  const r = 13, c = 2 * Math.PI * r;
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true" className="shrink-0">
      <circle cx="17" cy="17" r={r} fill="none" stroke="var(--border)" strokeWidth="3" />
      <circle
        cx="17" cy="17" r={r} fill="none" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - (of ? on / of : 0))} transform="rotate(-90 17 17)"
      />
      <text x="17" y="17" textAnchor="middle" dominantBaseline="central" fontSize="11" fontWeight="700" fill="var(--text)">{on}</text>
    </svg>
  );
}

/** Topic: Link. The bot card in whichever of its states applies, then voice notes and the bot's commands. */
export function TgLink({ tg, lang }: { tg: Telegram; lang: Lang }) {
  const L = pick(lang);
  const { v, url, busy, note } = tg;

  if (v.kind === "loading") {
    return (
      <Tile title={L(T.title)} wide>
        <div className="grid gap-3 sm:grid-cols-2" aria-hidden>
          {[0, 1].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-skeleton motion-reduce:animate-none" />)}
        </div>
      </Tile>
    );
  }

  if (v.kind === "error") {
    return (
      <Tile title={L(T.title)} wide>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className={v.error === "unreachable" || v.error === "failed" ? "text-loss" : "text-muted"}>
            {L(T[v.error === "notLinked" || v.error === "unreachable" ? "failed" : v.error])}
          </span>
          <button type="button" onClick={tg.retry} className={btnGhost}>{L(T.retry)}</button>
        </div>
      </Tile>
    );
  }

  return (
    <>
      <Tile title={L(T.title)} wide>
        {!v.linked ? (
          <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-center">
            <ol className="flex flex-col gap-3">
              {[T.step1, T.step2, T.step3].map((x, i) => (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <span className="tnum grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary-tint text-xs font-bold text-primary">{i + 1}</span>
                  <span className="pt-0.5">{L(x)}</span>
                </li>
              ))}
            </ol>
            {url ? (
              <div className="flex flex-col items-stretch gap-2.5 md:items-end">
                <a href={url} target="_blank" rel="noopener noreferrer" className={`${btnGold} inline-flex items-center justify-center gap-2`}><Send size={16} />{L(T.open)}</a>
                <span className="flex items-center gap-2 text-xs font-medium text-muted">{spinner}{L(T.waiting)}</span>
              </div>
            ) : (
              <button type="button" disabled={busy} onClick={tg.connect} className={`${btnGold} inline-flex items-center justify-center gap-2`}><Send size={16} />{L(T.connect)}</button>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary-tint text-primary"><Send size={17} /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{L(T.linkedTo).replace("{n}", v.name ?? "Telegram")}</p>
              <p className="text-xs text-muted"><bdi dir="ltr">@{v.bot}</bdi></p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={tg.test} className={btnGhost}>{L(T.test)}</button>
              <button type="button" disabled={busy} onClick={tg.unlink} className={btnDanger}>{L(T.off)}</button>
            </div>
          </div>
        )}
        {note && <p role="status" aria-live="polite" className="text-sm">{note}</p>}
      </Tile>

      <Tile title={L(T.voiceT)}>
        <Row label={L(T.voiceT)} sub={L(T.voiceD)}>
          <span className="grid h-10 w-10 place-items-center rounded-full bg-primary-tint text-primary"><Mic size={17} /></span>
        </Row>
      </Tile>

      <Tile title={L(T.boardT)}>
        <Row label={L(T.boardT)} sub={L(T.boardD)}>
          <span className="grid h-10 w-10 place-items-center rounded-full bg-primary-tint text-primary"><Users size={17} /></span>
        </Row>
        <Note text={L(T.cmds)} />
      </Tile>
    </>
  );
}

/** Topic: Alerts. The lamp board, or the same "link first" state the card showed. */
export function TgAlerts({ tg, lang, onLink, onPreview }: { tg: Telegram; lang: Lang; onLink: () => void; onPreview?: (pref: string) => void }) {
  const L = pick(lang);
  const { v, busy } = tg;

  if (v.kind !== "ready" || !v.linked) {
    return (
      <Tile title={L(T.choose)} wide>
        <Note text={L(T.peopleNeed)} />
        {v.kind === "ready" && <button type="button" onClick={onLink} className={`${btnGold} self-start`}>{L(T.connect)}</button>}
      </Tile>
    );
  }

  return (
    <>
      {GROUPS.map((g) => {
        const on = g.items.filter((x) => v.prefs[x.k]).length;
        return (
          <Tile key={g.tone} title={pick(lang)(g.title)}>
            <div className="flex items-center gap-2">
              {/* The protection group carries the ring, as the design marks it. */}
              {g.tone === "rose" && <Ring on={on} of={g.items.length} />}
              <span className="tnum text-xs font-semibold text-muted">
                {L(T.onOf).replace("{n}", String(on)).replace("{m}", String(g.items.length))}
              </span>
            </div>
            {g.items.map(({ k, icon: RowIcon }) => (
              <Row key={k} label={L(T[k])} sub={L(T[`${k}_d`])}>
                <RowIcon size={16} className="hidden shrink-0 text-icon sm:block" />
                <Lamp
                  label={L(T[k])} on={v.prefs[k]} disabled={busy}
                  onChange={(x) => { tg.setPref({ ...v.prefs, [k]: x }); if (x) onPreview?.(k); }}
                />
              </Row>
            ))}
          </Tile>
        );
      })}
    </>
  );
}

/** The accountability partner or the coach: invite (a one-time link, watched until accepted), who it is, end it; the
 *  coach card also lists what the coach gets, each with its own lamp. */
function Watcher({ role, lang, person, busy, act, onPerson, onNote }: {
  role: TgRole; lang: Lang; person: TgPartner | TgCoach | null; busy: boolean;
  act: (f: () => Promise<unknown>) => Promise<void>; onPerson: (p: TgPartner | TgCoach | null) => void; onNote: (n: string | null) => void;
}) {
  const L = pick(lang), R = ROLE[role];
  const [invite, setInvite] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const until = useRef(0);
  useEffect(() => {
    if (!invite) return;
    const id = window.setInterval(async () => {
      if (Date.now() > until.current) { setInvite(null); return; }
      const s = await tgWatcherNow(role);
      if (s?.person) { setInvite(null); onPerson(s.person); }
      else if (s && !s.pending) { setInvite(null); onNote(L(T.closed)); }
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [invite]); // eslint-disable-line react-hooks/exhaustive-deps
  const start = () => act(async () => {
    const r = await R.make(lang);
    if ("error" in r) { onNote(L(T.failed)); return; }
    until.current = Date.now() + 15 * 60e3;
    setCopied(false);
    setInvite(r.url);
  });
  const copy = async () => { if (!invite) return; try { await navigator.clipboard.writeText(invite); setCopied(true); } catch { /* the field stays selectable */ } };
  const end = () => act(async () => { const r = await R.remove(lang); if ("error" in r) onNote(L(T.failed)); else onPerson(null); });
  const coach = role === "coach" && person && "prefs" in person ? person : null;
  const setPref = (p: TgCoachPrefs) => act(async () => { if (!coach) return; onPerson({ ...coach, prefs: p }); const r = await tgCoachPrefs(lang, p); if ("error" in r) onNote(L(T.failed)); });
  const Icon = R.icon;

  return (
    <Tile title={L(R.title)}>
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-tint text-primary"><Icon size={19} /></span>
        <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted">{L(R.what)}</p>
      </div>

      {person ? (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border p-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-primary-tint font-heading text-sm font-bold text-primary">
              {(person.name ?? "?").trim().charAt(0).toUpperCase() || "?"}
            </span>
            <div className="min-w-[9rem] flex-1">
              <p className="truncate text-sm font-semibold">{person.name ?? "—"}</p>
              {person.since && <p className="text-xs text-muted">{L(T.since).replace("{d}", dateOf(person.since, lang))}</p>}
            </div>
            <button type="button" disabled={busy} onClick={end} className={btnDanger}>{L(R.end)}</button>
          </div>
          {coach && (
            <>
              <p className="text-xs font-semibold text-muted">{L(T.cGets)}</p>
              {(Object.keys(TG_COACH) as (keyof TgCoachPrefs)[]).map((k) => {
                const RowIcon = COACH_ICON[k];
                return (
                  <Row key={k} label={L(T[`c_${k}`])}>
                    <RowIcon size={16} className="hidden shrink-0 text-icon sm:block" />
                    <Lamp label={L(T[`c_${k}`])} on={coach.prefs[k]} disabled={busy} onChange={(on) => setPref({ ...coach.prefs, [k]: on })} />
                  </Row>
                );
              })}
            </>
          )}
        </>
      ) : invite ? (
        <div className="flex flex-col gap-2.5 rounded-2xl border border-dashed border-border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <input readOnly value={invite} dir="ltr" aria-label={L(R.invite)} onFocus={(e) => e.target.select()} className="field min-w-0 flex-1 text-xs" />
            <button type="button" onClick={copy} className={btnGhost}>{L(copied ? T.copied : T.copy)}</button>
          </div>
          <p className="text-xs text-muted">{L(R.send)}</p>
          <span className="flex items-center gap-2 text-xs font-medium text-muted">{spinner}{L(R.wait)}</span>
        </div>
      ) : (
        <button type="button" disabled={busy} onClick={start} className={btnGold}>{L(R.invite)}</button>
      )}
    </Tile>
  );
}

/** Topic: Partner & coach, under Security. Unchanged rule: neither of them ever sees an amount or an account. */
export function TgPeople({ tg, lang, onLink }: { tg: Telegram; lang: Lang; onLink: () => void }) {
  const L = pick(lang);
  const { v, busy, peopleNote } = tg;
  const ready = v.kind === "ready" && v.linked;

  if (!ready) {
    return (
      <Tile title={L(T.people)} wide>
        <Note text={L(T.peopleSub)} />
        <Note text={L(T.peopleNeed)} />
        {v.kind === "ready" && <button type="button" onClick={onLink} className={`${btnGold} self-start`}>{L(T.goTg)}</button>}
      </Tile>
    );
  }

  return (
    <>
      <Watcher
        role="partner" lang={lang} person={v.partner} busy={busy} act={tg.act}
        onPerson={(p) => tg.setV((x) => (x.kind === "ready" ? { ...x, partner: p } : x))} onNote={tg.setPeopleNote}
      />
      <Watcher
        role="coach" lang={lang} person={v.coach} busy={busy} act={tg.act}
        onPerson={(p) => tg.setV((x) => (x.kind === "ready" ? { ...x, coach: p && "prefs" in p ? p : null } : x))} onNote={tg.setPeopleNote}
      />
      {peopleNote && <p role="status" aria-live="polite" className="text-sm sm:col-span-full">{peopleNote}</p>}
    </>
  );
}
