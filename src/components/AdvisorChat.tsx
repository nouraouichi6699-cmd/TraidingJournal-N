// The advisor's chat: a floating button (the candle mascot) that opens a side panel. The AI's answers are laid out in
// coloured sections and typed in; each ends with follow-up questions; the conversation is kept (and synced) in
// "mizan-advisor-chat". Also the number helpers shared with the Advisor page.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ArrowRight, Clock3, Coins, CornerDownRight, Flame, Footprints, Lock, RotateCcw, SendHorizontal, TrendingUp, X as Close, type LucideIcon } from "lucide-react";
import Mascot, { type Mood } from "./Mascot";
import type { Tone } from "./profileUi";
import { askAdvisor, type AskError, type Turn } from "../lib/advisorChat";
import type { Lang } from "../types";

type L = [string, string, string]; // en, ar, fr
const X = (en: string, ar: string, fr: string): L => [en, ar, fr];
const TXT = {
  chat: X("Ask your advisor", "اسأل مستشارك", "Demandez à votre conseiller"),
  chatSub: X("Answers by a free AI (Google Gemini), from a summary of your trades.", "يجيب ذكاء اصطناعي مجاني (Google Gemini) انطلاقاً من ملخّص صفقاتك.", "Réponses d'une IA gratuite (Google Gemini), à partir d'un résumé de vos trades."),
  me: X("Mizan advisor", "مستشار ميزان", "Conseiller Mizan"),
  hello: X("I have read your trades. Ask me what you want to improve.", "قرأتُ صفقاتك. اسألني عمّا تريد تحسينه.", "J'ai lu vos trades. Demandez-moi ce que vous voulez améliorer."),
  thinking: X("Reading your trades…", "يقرأ صفقاتك…", "Lecture de vos trades…"),
  next: X("Ask next", "اسأل بعدها", "Ensuite"),
  placeholder: X("Ask about your trading…", "اسأل عن تداولك…", "Posez une question sur votre trading…"),
  send: X("Send", "إرسال", "Envoyer"),
  restart: X("New conversation", "محادثة جديدة", "Nouvelle conversation"),
  close: X("Close", "إغلاق", "Fermer"),
  privacy: X("Your question and a summary of your trades (no account numbers) are sent to Google Gemini to write the answer. On the free tier, Google may use them to improve its products and reviewers may read them. This is not financial advice.", "يُرسَل سؤالك وملخّص لصفقاتك (بلا أرقام حسابات) إلى Google Gemini لكتابة الجواب. في المستوى المجاني قد تستخدمها Google لتحسين منتجاتها وقد يطّلع عليها مراجعون. هذا ليس نصيحة مالية.", "Votre question et un résumé de vos trades (sans numéros de compte) sont envoyés à Google Gemini pour rédiger la réponse. En version gratuite, Google peut les utiliser pour améliorer ses produits et des réviseurs peuvent les lire. Ce n'est pas un conseil financier."),
  notDeployed: X("The chat is not set up yet: deploy the \"advisor\" function in Supabase and add a free Gemini API key (GEMINI_API_KEY).", "المحادثة غير مفعّلة بعد: انشر الدالة advisor في Supabase وأضف مفتاح Gemini API المجاني باسم GEMINI_API_KEY.", "Le chat n'est pas encore installé : déployez la fonction « advisor » dans Supabase et ajoutez une clé API Gemini gratuite (GEMINI_API_KEY)."),
  noKey: X("Add your free Gemini API key in Supabase › Edge Functions › Secrets, named GEMINI_API_KEY.", "أضف مفتاح Gemini API المجاني في Supabase › Edge Functions › Secrets باسم GEMINI_API_KEY.", "Ajoutez votre clé API Gemini gratuite dans Supabase › Edge Functions › Secrets, nommée GEMINI_API_KEY."),
  busy: X("Today's free AI quota is used up. Try again tomorrow.", "انتهت حصة الذكاء الاصطناعي المجانية لهذا اليوم. حاول غداً.", "Le quota gratuit du jour est épuisé. Réessayez demain."),
  signIn: X("Sign in to use the chat.", "سجّل الدخول لاستخدام المحادثة.", "Connectez-vous pour utiliser le chat."),
  failed: X("The advisor could not answer right now. Try again in a moment.", "تعذّر على المستشار الإجابة الآن. حاول بعد قليل.", "Le conseiller n'a pas pu répondre. Réessayez dans un instant."),
};
/** Starter questions, each with its own colour. */
const ASK: { q: L; tone: Tone; icon: LucideIcon }[] = [
  { q: X("What is my costliest habit?", "ما أكثر عادة تكلّفني؟", "Quelle habitude me coûte le plus ?"), tone: "rose", icon: Flame },
  { q: X("When should I stop trading in a day?", "متى يجب أن أتوقف عن التداول في اليوم؟", "Quand dois-je arrêter de trader dans la journée ?"), tone: "sky", icon: Clock3 },
  { q: X("Which market should I focus on?", "على أي سوق يجب أن أركّز؟", "Sur quel marché me concentrer ?"), tone: "amber", icon: Coins },
  { q: X("What changed in my last month?", "ما الذي تغيّر في شهري الأخير؟", "Qu'est-ce qui a changé le mois dernier ?"), tone: "emerald", icon: TrendingUp },
];
export const dly = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;
const still = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---- numbers: kept left to right inside any text (Arabic included); signed money is green or red ----
const NUM = /(?<![⁦\w.,+\-−])[+\-−]?\d(?:[\d.,:/-]*\d)?(?: [A-Z]{2,}(?![A-Za-z])|[$€£¥₹₩₺₽₪₦₱₴₫₮%Rh](?![A-Za-z]))?/g;
const numCls = (tok: string) => {
  const money = /(?:[$€£¥₹₩₺₽₪₦₱₴₫₮R]| [A-Z]{2,})$/.test(tok);
  if (money && tok.startsWith("+")) return "adv-up";
  if (money && /^[-−]/.test(tok)) return "adv-down";
  return money || tok.endsWith("%") ? "adv-num" : undefined;
};
function nums(s: string, k: string): ReactNode[] {
  const out: ReactNode[] = [];
  let at = 0, i = 0;
  for (const m of s.matchAll(NUM)) {
    const x = m.index ?? 0;
    if (x > at) out.push(s.slice(at, x));
    out.push(<bdi key={`${k}~${i++}`} dir="ltr" className={numCls(m[0])}>{m[0]}</bdi>);
    at = x + m[0].length;
  }
  if (at < s.length) out.push(s.slice(at));
  return out;
}
/** The same for the advisor's own texts, whose values ltrNumbers already wrapped in U+2066…U+2069. */
export const tint = (s: string): ReactNode[] => s.split(/⁦([^⁩]*)⁩/).map((p, i) => (i % 2 ? <bdi key={i} dir="ltr" className={numCls(p)}>{p}</bdi> : p));

// ---- the AI's answer: sections (a "## …" line or a line all in bold opens one), lists, and the closing next step ----
const INL = /(\*\*[^*]+\*\*|`[^`]+`|(?<![\w*])\*[^*\s][^*]*\*(?![\w*]))/;
function inline(s: string, k: string): ReactNode[] {
  return s.split(INL).filter((p) => p !== "").map((p, i) => {
    const key = `${k}.${i}`;
    if (p.length > 4 && p.startsWith("**") && p.endsWith("**")) return <strong key={key} className="font-semibold text-text">{nums(p.slice(2, -2), key)}</strong>;
    if (p.length > 2 && p.startsWith("`") && p.endsWith("`")) return <code key={key} className="adv-code">{p.slice(1, -1)}</code>;
    if (p.length > 2 && p.startsWith("*") && p.endsWith("*")) return <em key={key} className="font-medium not-italic text-text">{nums(p.slice(1, -1), key)}</em>;
    return <span key={key}>{nums(p, key)}</span>;
  });
}
type ListBlock = { t: "ul" | "ol"; items: string[] };
type Block = { t: "p"; s: string } | ListBlock | { t: "next"; label: string; s: string };
type Sec = { title: string | null; blocks: Block[] };
const NEXT = /^(?:your |one |the )?(?:next (?:step|move)|action(?: step| plan)?|what to do(?: next)?|try this)\b|الخطوة (?:التالية|القادمة|الأولى)|خطوتك (?:التالية|القادمة)|ما (?:يجب|عليك) فعله|prochaine étape|étape suivante|première étape|à faire|plan d'action/i;
const label = (s: string) => s.replace(/^\*\*|\*\*$/g, "").replace(/\s*[:：]\s*$/, "").trim();
function parse(text: string): Sec[] {
  const secs: Sec[] = [{ title: null, blocks: [] }];
  let list: ListBlock | null = null;
  const add = (b: Block) => secs[secs.length - 1].blocks.push(b);
  const flush = () => { if (list) add(list); list = null; };
  for (const raw of text.split("\n")) {
    const l = raw.trim();
    if (!l || /^([-*_])\1{2,}$/.test(l)) { flush(); continue; }
    const head = /^#{1,6}\s+(.+?)\s*#*$/.exec(l)?.[1] ?? /^\*\*([^*]+)\*\*\s*[:：]?$/.exec(l)?.[1];
    if (head) { flush(); secs.push({ title: label(head), blocks: [] }); continue; }
    const li = /^(?:([-•*])|\d+[.)])\s+(.*)$/.exec(l);
    if (li) {
      const t = li[1] ? "ul" : "ol";
      if (!list || list.t !== t) { flush(); list = { t, items: [] }; }
      list.items.push(li[2]);
      continue;
    }
    flush();
    const lead = /^\*\*([^*]+?)\*\*\s*[:：]?\s*(.+)$/.exec(l);
    if (lead && NEXT.test(label(lead[1]))) secs.push({ title: null, blocks: [{ t: "next", label: label(lead[1]), s: lead[2] }] }); // full width, out of the section above
    else add({ t: "p", s: l });
  }
  flush();
  return secs.filter((s) => s.title || s.blocks.length);
}
const ANS: Tone[] = ["violet", "sky", "amber", "emerald", "indigo"];
function NextStep({ name, style, children }: { name: string; style?: CSSProperties; children: ReactNode }) {
  return (
    <div dir="auto" className={`tone-gold adv-next flex items-start gap-3 rounded-xl p-3.5 ${style ? "adv-pop" : ""}`} style={style}>
      <span className="tone-tile h-9 w-9 rounded-lg"><Footprints size={16} /></span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="tone-text text-xs font-bold">{name}</p>
        {children}
      </div>
    </div>
  );
}
/** `calm`: no rise-in per block (the answer is being typed in, which is its own motion). */
function Answer({ text, calm }: { text: string; calm?: boolean }) {
  const secs = useMemo(() => parse(text), [text]);
  let n = 0, h = 0;
  const d = () => (calm ? undefined : dly(Math.min(n++, 14) * 65));
  const pop = calm ? "" : "adv-pop";
  const body = (b: Block, k: string): ReactNode => {
    if (b.t === "p") return <p key={k} dir="auto" className={`${pop} adv-p`} style={d()}>{inline(b.s, k)}</p>;
    if (b.t === "next") return <NextStep key={k} name={b.label} style={d()}><p className="font-medium leading-7 text-text">{inline(b.s, k)}</p></NextStep>;
    const List = b.t;
    return (
      <List key={k} className="space-y-2">
        {b.items.map((it, i) => (
          <li key={i} dir="auto" className={`${pop} flex items-start gap-2.5`} style={d()}>
            {b.t === "ol" ? <span className="tone-chip mt-[3px] grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold">{i + 1}</span> : <span aria-hidden="true" className="adv-bullet" />}
            <span className="adv-p min-w-0">{inline(it, `${k}.${i}`)}</span>
          </li>
        ))}
      </List>
    );
  };
  return (
    <div className="space-y-5 text-[15px]">
      {secs.map((s, si) => {
        const k = `s${si}`;
        if (s.title && NEXT.test(s.title)) return <NextStep key={k} name={s.title} style={d()}>{s.blocks.map((b, bi) => body(b, `${k}.${bi}`))}</NextStep>;
        const tone = s.title ? ANS[h++ % ANS.length] : "violet";
        return (
          <section key={k} className={`tone-${tone} space-y-2.5`}>
            {s.title && <h4 dir="auto" className={`tone-text ${pop} flex items-center gap-2.5 font-heading font-semibold`} style={d()}><span aria-hidden="true" className="adv-h-bar" />{inline(s.title, k)}</h4>}
            {s.blocks.length > 0 && <div className={`space-y-2.5 ${s.title ? "adv-sec" : ""}`}>{s.blocks.map((b, bi) => body(b, `${k}.${bi}`))}</div>}
          </section>
        );
      })}
    </div>
  );
}
/** A new answer appears word by word (at once for reduced-motion users). */
function Typed({ text, onDone }: { text: string; onDone: () => void }) {
  const [n, setN] = useState(0);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (still()) { setN(text.length); done.current(); return; }
    const dur = Math.min(3600, Math.max(1200, text.length * 5)), t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      let k = Math.floor(text.length * p);
      if (p < 1) { const sp = text.indexOf(" ", k); k = sp < 0 ? text.length : sp; }
      setN(k);
      if (p < 1) raf = requestAnimationFrame(step); else done.current();
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [text]);
  return <div aria-busy={n < text.length}><Answer text={text.slice(0, n)} calm />{n < text.length && <span aria-hidden="true" className="adv-caret" />}</div>;
}

export type ChatTurn = Turn & { followups?: string[] };
const STORE = "mizan-advisor-chat"; // { v: 1, turns }: the conversation, synced like the other settings
const readChat = (): ChatTurn[] => {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? "null");
    return (Array.isArray(v?.turns) ? v.turns : []).filter((m: ChatTurn) => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string").slice(-24);
  } catch { return []; }
};
const writeChat = (turns: ChatTurn[]) => { try { localStorage.setItem(STORE, JSON.stringify({ v: 1, turns: turns.slice(-24) })); } catch { /* storage full or blocked */ } };

/** The floating button and the side panel. `request` asks a question from elsewhere on the page (n makes each one new). */
export default function AdvisorChat({ lang, mood, open, onOpen, onClose, request, context }: { lang: Lang; mood: Mood; open: boolean; onOpen: () => void; onClose: () => void; request: { q: string; n: number } | null; context: () => unknown }) {
  const k = lang === "en" ? 0 : lang === "ar" ? 1 : 2, T = (x: L) => x[k];
  const [turns, setTurns] = useState<ChatTurn[]>(readChat);
  const [typing, setTyping] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<AskError | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => writeChat(turns), [turns]);
  // a new answer is read from its first line; otherwise follow the end of the conversation
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const all = el.querySelectorAll<HTMLElement>("[data-turn]"), last = all[all.length - 1];
    const top = !busy && last && turns[turns.length - 1]?.role === "assistant" ? last.offsetTop - 12 : el.scrollHeight;
    el.scrollTo({ top, behavior: still() ? "auto" : "smooth" });
  }, [turns, busy]);
  useEffect(() => { const el = area.current; if (el) { el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 160)}px`; } }, [draft]);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => area.current?.focus({ preventScroll: true }), 380);
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close.current(); };
    window.addEventListener("keydown", key);
    return () => { clearTimeout(t); window.removeEventListener("keydown", key); };
  }, [open]);
  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    const history = turns;
    setTurns([...history, { role: "user", content: question }]); setDraft(""); setErr(null); setBusy(true); setTyping(null);
    const r = await askAdvisor(question, lang, context(), history);
    setBusy(false);
    if ("answer" in r) { setTurns((t) => [...t, { role: "assistant", content: r.answer, followups: r.followups }]); setTyping(history.length + 1); }
    else { setErr(r.error); setTurns((t) => t.slice(0, -1)); setDraft(question); }
  };
  const asked = useRef(0);
  useEffect(() => { if (request && request.n !== asked.current) { asked.current = request.n; void ask(request.q); } }); // eslint-disable-line react-hooks/exhaustive-deps
  const errText = err && T(err === "notDeployed" ? TXT.notDeployed : err === "noKey" ? TXT.noKey : err === "signIn" ? TXT.signIn : err === "busy" ? TXT.busy : TXT.failed);
  const last = turns[turns.length - 1];
  const follow = !busy && typing === null && last?.role === "assistant" ? last.followups ?? [] : [];
  const avatar = <span className="tone-tile mt-0.5 h-9 w-9 overflow-visible rounded-xl max-sm:hidden"><Mascot mood={mood} className="h-8 w-7" /></span>;

  // in <body>: the page sits in an animated (transformed) container, which would pin "fixed" to it instead of the screen
  return createPortal(
    <>
      <button type="button" onClick={onOpen} aria-label={T(TXT.chat)} aria-expanded={open} className="adv-fab fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full py-1.5 pe-1.5 ps-1.5 sm:pe-5" dir="ltr">
        <span className="grid h-14 w-14 place-items-center rounded-full" style={{ background: "radial-gradient(circle at 50% 60%, color-mix(in srgb, var(--c-violet) 30%, transparent), transparent 72%)" }}><Mascot mood={mood} className="h-[54px] w-[46px]" /></span>
        <span className="text-sm font-semibold max-sm:hidden" dir="auto">{T(TXT.chat)}</span>
      </button>
      <div className="adv-scrim fixed inset-0 z-40" data-open={open || undefined} onClick={onClose} aria-hidden="true" />
      {/* the panel slides in from the edge; this frame clips it so the page never scrolls sideways */}
      <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      <aside role="dialog" aria-modal="true" aria-label={T(TXT.chat)} aria-hidden={!open} data-open={open || undefined} className="tone-violet adv-drawer pointer-events-auto absolute inset-y-0 right-0 flex w-full flex-col sm:w-[460px]">
        <div className="flex items-center gap-3 border-b px-4 py-3" style={{ borderColor: "color-mix(in srgb, var(--tone) 22%, var(--border))" }}>
          <span className="tone-tile h-11 w-11 overflow-visible rounded-xl"><Mascot mood={mood} className="h-10 w-9" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-base font-semibold text-text">{T(TXT.me)}</h2>
            <p className="truncate text-xs text-muted">{T(TXT.chatSub)}</p>
          </div>
          {turns.length > 0 && <button type="button" onClick={() => { setTurns([]); setErr(null); setTyping(null); }} title={T(TXT.restart)} aria-label={T(TXT.restart)} className="tone-btn grid h-9 w-9 place-items-center rounded-lg"><RotateCcw size={15} /></button>}
          <button type="button" onClick={onClose} title={T(TXT.close)} aria-label={T(TXT.close)} className="grid h-9 w-9 place-items-center rounded-lg text-muted transition-colors hover:bg-[var(--bg)] hover:text-text"><Close size={18} /></button>
        </div>

        <div ref={box} className="adv-scroll relative flex-1 space-y-5 overflow-y-auto px-4 py-5">
          {turns.length === 0 && !busy && (
            <div className="space-y-5">
              <div className="adv-pop flex flex-col items-center text-center">
                <Mascot mood={mood} className="h-28 w-24" />
                <p className="mt-3 max-w-xs font-heading text-base font-semibold text-text">{T(TXT.hello)}</p>
              </div>
              <div className="grid gap-2.5">
                {ASK.map(({ q, tone, icon: Icon }, i) => (
                  <button key={q[0]} type="button" onClick={() => void ask(T(q))} className={`tone-${tone} adv-pop adv-ask group flex items-center gap-3 rounded-xl px-3.5 py-3 text-start`} style={dly(120 + i * 70)}>
                    <span className="tone-tile h-8 w-8 rounded-lg"><Icon size={15} /></span>
                    <span className="min-w-0 flex-1 text-sm font-medium text-text">{T(q)}</span>
                    <ArrowRight size={15} className="tone-text shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 rtl:-scale-x-100" />
                  </button>
                ))}
              </div>
            </div>
          )}
          {turns.map((m, i) => m.role === "user" ? (
            <div key={i} data-turn className="adv-msg flex justify-end">
              <div dir="auto" className="adv-user max-w-[85%] rounded-2xl rounded-ee-md px-4 py-2.5 text-sm leading-relaxed">{m.content}</div>
            </div>
          ) : (
            <div key={i} data-turn className="adv-msg flex items-start gap-3">
              {avatar}
              <div className="min-w-0 flex-1">
                <p className="tone-text mb-1.5 text-xs font-semibold">{T(TXT.me)}</p>
                <div className="adv-answer rounded-2xl rounded-ss-md p-3.5 sm:p-4">
                  {typing === i ? <Typed text={m.content} onDone={() => setTyping(null)} /> : <Answer text={m.content} calm />}
                </div>
              </div>
            </div>
          ))}
          {busy && (
            <div className="adv-msg flex items-start gap-3">
              {avatar}
              <div className="adv-answer flex items-center gap-3 rounded-2xl rounded-ss-md px-4 py-3" role="status">
                <span className="flex gap-1" aria-hidden="true">{[0, 1, 2].map((j) => <span key={j} className="adv-dot h-1.5 w-1.5 rounded-full" style={{ background: "var(--tone)", animationDelay: `${j * 160}ms` }} />)}</span>
                <span className="adv-shimmer text-sm font-medium">{T(TXT.thinking)}</span>
              </div>
            </div>
          )}
          {follow.length > 0 && (
            <div className="space-y-2 sm:ps-12">
              <p className="text-xs font-semibold text-muted">{T(TXT.next)}</p>
              {follow.map((q, i) => (
                <button key={q} type="button" onClick={() => void ask(q)} className={`tone-${ANS[i % ANS.length]} adv-pop adv-ask flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-start`} style={dly(i * 90)}>
                  <CornerDownRight size={15} className="tone-text shrink-0 rtl:-scale-x-100" />
                  <span dir="auto" className="min-w-0 flex-1 text-sm text-text">{q}</span>
                </button>
              ))}
            </div>
          )}
          {errText && (
            <p className="tone-red flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-xs text-text" style={{ border: "1px solid color-mix(in srgb, var(--tone) 45%, transparent)", background: "color-mix(in srgb, var(--tone) 9%, transparent)" }}>
              <AlertTriangle size={14} className="tone-text mt-px shrink-0" />{errText}
            </p>
          )}
        </div>

        <div className="border-t px-4 pb-4 pt-3" style={{ borderColor: "color-mix(in srgb, var(--tone) 22%, var(--border))" }}>
          <form className="adv-input flex items-end gap-2 rounded-2xl p-1.5" onSubmit={(e) => { e.preventDefault(); void ask(draft); }}>
            <textarea ref={area} dir="auto" rows={1} value={draft} maxLength={1000} placeholder={T(TXT.placeholder)} aria-label={T(TXT.placeholder)} onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ask(draft); } }}
              className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent px-3 py-2.5 text-sm text-text outline-none placeholder:text-muted" />
            <button type="submit" disabled={busy || !draft.trim()} aria-label={T(TXT.send)} className="tone-solid adv-send grid h-11 w-11 shrink-0 place-items-center rounded-xl disabled:opacity-40"><SendHorizontal size={17} className="rtl:-scale-x-100" /></button>
          </form>
          <p className="mt-2.5 flex items-start gap-1.5 text-[10.5px] leading-relaxed text-muted"><Lock size={11} className="mt-0.5 shrink-0" />{T(TXT.privacy)}</p>
        </div>
      </aside>
      </div>
    </>,
    document.body,
  );
}
