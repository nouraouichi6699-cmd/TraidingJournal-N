import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { AlertTriangle, ArrowRight, ArrowUpDown, CircleCheck, Clock3, Coins, Crosshair, Eye, Flame, Footprints, Info, ListChecks, Lock, MessagesSquare, RotateCcw, Route, SendHorizontal, ShieldCheck, Sparkles, Star, TrendingUp, Wrench, type LucideIcon } from "lucide-react";
import { SectionHead, type Tone } from "./profileUi";
import { inputsFor, presetWhatIf } from "./WhatIfTab";
import { advise, journalContext, MIN_TRADES, type Advice, type Plan, type Topic } from "../lib/advisor";
import { askAdvisor, type AskError, type Turn } from "../lib/advisorChat";
import { commonCurrency, fmtMoney, ltrNumbers } from "../lib/money";
import { fmtHold } from "../lib/stats";
import type { Account, Lang, Trade } from "../types";

type L = [string, string, string]; // en, ar, fr
const X = (en: string, ar: string, fr: string): L => [en, ar, fr];
const TXT = {
  title: X("Advisor", "المستشار", "Conseiller"),
  sub: X("What your trades say, and what to change first.", "ما تقوله صفقاتك، وما يجب تغييره أولاً.", "Ce que disent vos trades, et quoi changer en premier."),
  all: X("All accounts", "كل الحسابات", "Tous les comptes"),
  analysed: X("{n} closed trades analysed", "تم تحليل {n} صفقة مغلقة", "{n} trades clôturés analysés"),
  yourPlan: X("Your plan", "خطتك", "Votre plan"),
  planCap: X("would have been added to your history by following these {n} rules together.", "كان سيُضاف إلى سجلك لو اتبعت هذه القواعد الـ{n} معاً.", "auraient été ajoutés à votre historique en suivant ces {n} règles ensemble."),
  planCap1: X("would have been added to your history by following this rule.", "كان سيُضاف إلى سجلك لو اتبعت هذه القاعدة.", "auraient été ajoutés à votre historique en suivant cette règle."),
  tryPlan: X("Try the plan in What if", "جرّب الخطة في «ماذا لو»", "Essayer le plan dans « Et si ? »"),
  tryOne: X("Try in What if", "جرّبها في «ماذا لو»", "Essayer dans « Et si ? »"),
  clean: X("No clear weakness in these trades. Keep going.", "لا يظهر ضعف واضح في هذه الصفقات. واصل.", "Aucune faiblesse nette dans ces trades. Continuez."),
  fix: X("To fix", "ما يجب إصلاحه", "À corriger"),
  watch: X("To watch", "للمتابعة", "À surveiller"),
  strength: X("What works for you", "ما ينجح معك", "Ce qui marche pour vous"),
  onHistory: X("on your history", "على سجلك", "sur votre historique"),
  strong: X("Strong evidence", "دليل قوي", "Preuve solide"),
  medium: X("Some evidence", "دليل متوسط", "Preuve moyenne"),
  weak: X("Weak evidence", "دليل ضعيف", "Preuve faible"),
  both: X("worked in both halves of your history", "نجحت في نصفي سجلك", "a marché sur les deux moitiés de votre historique"),
  oneHalf: X("worked in one half only", "نجحت في نصف واحد فقط", "n'a marché que sur une moitié"),
  caveat: X("Every figure is measured on your own past trades. A rule picked to fit the past usually helps less in the future: trust advice backed by many trades that worked in both halves of your history.", "كل رقم هنا مقاس على صفقاتك السابقة. القاعدة المختارة لتناسب الماضي تفيد عادةً أقل في المستقبل: ثق بالنصائح المدعومة بصفقات كثيرة والتي نجحت في نصفي سجلك.", "Chaque chiffre est mesuré sur vos propres trades passés. Une règle choisie pour coller au passé aide en général moins à l'avenir : fiez-vous aux conseils appuyés par beaucoup de trades et qui ont marché sur les deux moitiés de votre historique."),
  few: X("The advisor needs at least {n} closed trades (you have {m}).", "يحتاج المستشار {n} صفقات مغلقة على الأقل (لديك {m}).", "Le conseiller a besoin d'au moins {n} trades clôturés (vous en avez {m})."),
  exitsHint: X("Exit advice (stop loss, take profit) needs price paths: open Reports › Trade path once.", "نصائح الخروج (وقف الخسارة وجني الربح) تحتاج مسارات الأسعار: افتح «التقارير › مسار الصفقة» مرة واحدة.", "Les conseils de sortie (stop, take profit) demandent les parcours de prix : ouvrez une fois Rapports › Parcours du trade."),
  openPath: X("Open Trade path", "افتح «مسار الصفقة»", "Ouvrir Parcours du trade"),
  chat: X("Ask your advisor", "اسأل مستشارك", "Demandez à votre conseiller"),
  chatSub: X("Answers by a free AI (Google Gemini), from a summary of your trades.", "يجيب ذكاء اصطناعي مجاني (Google Gemini) انطلاقاً من ملخّص صفقاتك.", "Réponses d'une IA gratuite (Google Gemini), à partir d'un résumé de vos trades."),
  me: X("Mizan advisor", "مستشار ميزان", "Conseiller Mizan"),
  thinking: X("Reading your trades…", "يقرأ صفقاتك…", "Lecture de vos trades…"),
  placeholder: X("Ask about your trading…", "اسأل عن تداولك…", "Posez une question sur votre trading…"),
  send: X("Send", "إرسال", "Envoyer"),
  restart: X("New conversation", "محادثة جديدة", "Nouvelle conversation"),
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
const dly = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

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
const tint = (s: string): ReactNode[] => s.split(/⁦([^⁩]*)⁩/).map((p, i) => (i % 2 ? <bdi key={i} dir="ltr" className={numCls(p)}>{p}</bdi> : p));

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
function NextStep({ name, style, children }: { name: string; style: CSSProperties; children: ReactNode }) {
  return (
    <div dir="auto" className="tone-gold adv-pop adv-next flex items-start gap-3 rounded-xl p-3.5" style={style}>
      <span className="tone-tile h-9 w-9 rounded-lg"><Footprints size={16} /></span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="tone-text text-xs font-bold">{name}</p>
        {children}
      </div>
    </div>
  );
}
function Answer({ text }: { text: string }) {
  const secs = useMemo(() => parse(text), [text]);
  let n = 0, h = 0;
  const d = () => dly(Math.min(n++, 14) * 65); // the blocks come in one after the other
  const body = (b: Block, k: string): ReactNode => {
    if (b.t === "p") return <p key={k} dir="auto" className="adv-pop adv-p" style={d()}>{inline(b.s, k)}</p>;
    if (b.t === "next") return <NextStep key={k} name={b.label} style={d()}><p className="font-medium leading-7 text-text">{inline(b.s, k)}</p></NextStep>;
    const List = b.t;
    return (
      <List key={k} className="space-y-2">
        {b.items.map((it, i) => (
          <li key={i} dir="auto" className="adv-pop flex items-start gap-2.5" style={d()}>
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
            {s.title && <h4 dir="auto" className="tone-text adv-pop flex items-center gap-2.5 font-heading font-semibold" style={d()}><span aria-hidden="true" className="adv-h-bar" />{inline(s.title, k)}</h4>}
            {s.blocks.length > 0 && <div className={`space-y-2.5 ${s.title ? "adv-sec" : ""}`}>{s.blocks.map((b, bi) => body(b, `${k}.${bi}`))}</div>}
          </section>
        );
      })}
    </div>
  );
}

function Chat({ lang, T, context }: { lang: Lang; T: (x: L) => string; context: () => unknown }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<AskError | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  // a new answer is read from its first line; otherwise follow the end of the conversation
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const last = el.lastElementChild as HTMLElement | null;
    const top = !busy && last && turns[turns.length - 1]?.role === "assistant" ? last.offsetTop - 8 : el.scrollHeight;
    el.scrollTo({ top, behavior: "smooth" });
  }, [turns, busy]);
  useEffect(() => { const el = area.current; if (el) { el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 160)}px`; } }, [draft]);
  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    const history = turns;
    setTurns([...history, { role: "user", content: question }]); setDraft(""); setErr(null); setBusy(true);
    const r = await askAdvisor(question, lang, context(), history);
    setBusy(false);
    if ("answer" in r) setTurns((t) => [...t, { role: "assistant", content: r.answer }]);
    else { setErr(r.error); setTurns((t) => t.slice(0, -1)); setDraft(question); }
  };
  const errText = err && T(err === "notDeployed" ? TXT.notDeployed : err === "noKey" ? TXT.noKey : err === "signIn" ? TXT.signIn : err === "busy" ? TXT.busy : TXT.failed);
  const avatar = (spin?: boolean) => <span className="tone-tile mt-0.5 h-9 w-9 rounded-xl max-sm:hidden"><Sparkles size={16} className={spin ? "adv-twinkle" : undefined} /></span>;
  return (
    <section className="tone-violet tone-panel relative overflow-hidden rounded-2xl p-4 sm:p-5 md:p-6">
      <span aria-hidden="true" className="adv-orb pointer-events-none absolute -end-24 -top-28 h-72 w-72 rounded-full blur-3xl" style={{ background: "color-mix(in srgb, var(--c-violet) 20%, transparent)" }} />
      <div className="relative">
        <SectionHead tone="violet" icon={MessagesSquare} title={T(TXT.chat)} sub={T(TXT.chatSub)}
          aside={turns.length > 0 ? <button type="button" onClick={() => { setTurns([]); setErr(null); }} className="tone-violet tone-btn inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold"><RotateCcw size={13} />{T(TXT.restart)}</button> : undefined} />
        {(turns.length > 0 || busy) && (
          <div ref={box} className="relative mt-5 max-h-[560px] space-y-5 overflow-y-auto pe-1">
            {turns.map((m, i) => m.role === "user" ? (
              <div key={i} className="adv-msg flex justify-end">
                <div dir="auto" className="adv-user max-w-[85%] rounded-2xl rounded-ee-md px-4 py-2.5 text-sm leading-relaxed">{m.content}</div>
              </div>
            ) : (
              <div key={i} className="adv-msg flex items-start gap-3">
                {avatar()}
                <div className="min-w-0 flex-1">
                  <p className="tone-text mb-1.5 flex items-center gap-1.5 text-xs font-semibold"><Sparkles size={12} className="sm:hidden" />{T(TXT.me)}</p>
                  <div className="adv-answer rounded-2xl rounded-ss-md p-3.5 sm:p-4 md:p-5"><Answer text={m.content} /></div>
                </div>
              </div>
            ))}
            {busy && (
              <div className="adv-msg flex items-start gap-3">
                {avatar(true)}
                <div className="adv-answer flex items-center gap-3 rounded-2xl rounded-ss-md px-4 py-3" role="status">
                  <span className="flex gap-1" aria-hidden="true">{[0, 1, 2].map((j) => <span key={j} className="adv-dot h-1.5 w-1.5 rounded-full" style={{ background: "var(--tone)", animationDelay: `${j * 160}ms` }} />)}</span>
                  <span className="adv-shimmer text-sm font-medium">{T(TXT.thinking)}</span>
                </div>
              </div>
            )}
          </div>
        )}
        {turns.length === 0 && !busy && (
          <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
            {ASK.map(({ q, tone, icon: Icon }, i) => (
              <button key={q[0]} type="button" onClick={() => void ask(T(q))} className={`tone-${tone} adv-pop adv-ask group flex items-center gap-3 rounded-xl px-3.5 py-3 text-start`} style={dly(i * 70)}>
                <span className="tone-tile h-8 w-8 rounded-lg"><Icon size={15} /></span>
                <span className="min-w-0 flex-1 text-sm font-medium text-text">{T(q)}</span>
                <ArrowRight size={15} className="tone-text shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 rtl:-scale-x-100" />
              </button>
            ))}
          </div>
        )}
        {errText && (
          <p className="tone-red mt-4 flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-xs text-text" style={{ border: "1px solid color-mix(in srgb, var(--tone) 45%, transparent)", background: "color-mix(in srgb, var(--tone) 9%, transparent)" }}>
            <AlertTriangle size={14} className="tone-text mt-px shrink-0" />{errText}
          </p>
        )}
        <form className="adv-input mt-5 flex items-end gap-2 rounded-2xl p-1.5" onSubmit={(e) => { e.preventDefault(); void ask(draft); }}>
          <textarea ref={area} dir="auto" rows={1} value={draft} maxLength={1000} placeholder={T(TXT.placeholder)} aria-label={T(TXT.placeholder)} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ask(draft); } }}
            className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent px-3 py-2.5 text-sm text-text outline-none placeholder:text-muted" />
          <button type="submit" disabled={busy || !draft.trim()} aria-label={T(TXT.send)} className="tone-solid adv-send grid h-11 w-11 shrink-0 place-items-center rounded-xl disabled:opacity-40"><SendHorizontal size={17} className="rtl:-scale-x-100" /></button>
        </form>
        <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted"><Lock size={12} className="mt-0.5 shrink-0" />{T(TXT.privacy)}</p>
      </div>
    </section>
  );
}
/** Title, finding, advice per advice id. */
const COPY: Record<string, [L, L, L]> = {
  streak: [X("Stop after {nL}", "توقّف بعد {nL}", "Arrêtez après {nL}"), X("After {nL} the same day, your next trades averaged {avg} ({kT}).", "بعد {nL} في اليوم نفسه، كان متوسط الصفقات التالية {avg} ({kT}).", "Après {nL} dans la journée, les trades suivants ont fait en moyenne {avg} ({kT})."), X("End the day after {nL}.", "أنهِ يومك بعد {nL}.", "Arrêtez la journée après {nL}.")],
  maxDay: [X("At most {nT} a day", "{nT} كحد أقصى في اليوم", "Au plus {nT} par jour"), X("Trades after {firstN} of the day averaged {avg} ({kT}).", "الصفقات بعد {firstN} في اليوم كان متوسطها {avg} ({kT}).", "Les trades après {firstN} de la journée ont fait en moyenne {avg} ({kT})."), X("Stop after {nT} a day.", "توقّف بعد {nT} في اليوم.", "Arrêtez après {nT} par jour.")],
  dayLoss: [X("Daily loss limit: {v}", "حد الخسارة اليومي: {v}", "Perte maximale par jour : {v}"), X("Once a day was down {v}, the trades that followed averaged {avg} ({kT}).", "حين كان اليوم خاسراً {v}، كان متوسط الصفقات التالية {avg} ({kT}).", "Une fois la journée à {v} de perte, les trades suivants ont fait en moyenne {avg} ({kT})."), X("Stop for the day once you are down {v}.", "توقّف لبقية اليوم عندما تخسر {v}.", "Arrêtez la journée dès {v} de perte.")],
  dayGain: [X("Lock in a good day at {v}", "احفظ يومك الرابح عند {v}", "Sécurisez une bonne journée à {v}"), X("After a day reached {v} of profit, the trades that followed averaged {avg} ({kT}).", "بعد أن بلغ ربح اليوم {v}، كان متوسط الصفقات التالية {avg} ({kT}).", "Après {v} de gain dans la journée, les trades suivants ont fait en moyenne {avg} ({kT})."), X("Stop for the day once you are up {v}.", "توقّف لبقية اليوم عندما تربح {v}.", "Arrêtez la journée dès {v} de gain.")],
  weekday: [X("Skip {day}", "تجنّب يوم {day}", "Évitez le {day}"), X("On {day}: {nT}, {net}, {wr} won.", "يوم {day}: {nT}، {net}، ربحت {wr} منها.", "Le {day} : {nT}, {net}, {wr} gagnants."), X("Don't trade on {day}, or trade it smaller.", "لا تتداول يوم {day}، أو تداول بحجم أصغر.", "Ne tradez pas le {day}, ou en plus petit.")],
  hours: [X("Avoid {range}", "تجنّب {range}", "Évitez {range}"), X("Entries from {a} to {b}: {nT}, {net}, {wr} won.", "الدخول من {a} إلى {b}: {nT}، {net}، ربحت {wr} منها.", "Entrées de {a} à {b} : {nT}, {net}, {wr} gagnants."), X("Don't open trades from {a} to {b} (your broker's clock).", "لا تفتح صفقات من {a} إلى {b} (بتوقيت الوسيط).", "N'ouvrez pas de trades de {a} à {b} (heure du courtier).")],
  symbol: [X("Leave {s} aside", "اترك {s} جانباً", "Mettez {s} de côté"), X("{s}: {nT}, {net}, {wr} won.", "{s}: {nT}، {net}، ربحت {wr} منها.", "{s} : {nT}, {net}, {wr} gagnants."), X("Stop trading {s} until you find what works on it.", "توقّف عن تداول {s} حتى تجد ما ينجح معه.", "Arrêtez {s} jusqu'à trouver ce qui marche dessus.")],
  side: [X("Focus on {other}", "ركّز على {other}", "Concentrez-vous sur les {other}"), X("Your {side}: {nT}, {net}, {wr} won.", "صفقات {side}: {nT}، {net}، ربحت {wr} منها.", "Vos {side} : {nT}, {net}, {wr} gagnants."), X("Take only {other} until your {side} improve.", "اكتفِ بصفقات {other} حتى تتحسّن صفقات {side}.", "Ne prenez que des {other} tant que vos {side} ne s'améliorent pas.")],
  stop: [X("Stop loss at {v}", "وقف خسارة عند {v}", "Stop loss à {v}"), X("{kT} went {v} or more against you before you closed them.", "{kT} تحرّكت ضدك {v} أو أكثر قبل أن تغلقها.", "{kT} sont allés à {v} ou plus contre vous avant clôture."), X("Place a stop at {v} on every trade.", "ضع وقف خسارة عند {v} في كل صفقة.", "Placez un stop à {v} sur chaque trade.")],
  target: [X("Take profit at {v}", "جني الربح عند {v}", "Take profit à {v}"), X("{kT} reached {v} of profit; taking it there beats your exits.", "{kT} بلغت ربح {v}، وكان الخروج عنده أفضل من خروجك.", "{kT} ont atteint {v} de gain ; sortir là fait mieux que vos sorties."), X("Take profit at {v}.", "اجنِ الربح عند {v}.", "Prenez vos gains à {v}.")],
  revenge: [X("Keep your size after a loss", "حافظ على حجمك بعد الخسارة", "Gardez votre taille après une perte"), X("After a loss you traded {x} your usual size: {nT}, {net}.", "بعد الخسارة تداولت بـ{x} حجمك المعتاد: {nT}، {net}.", "Après une perte, vous avez tradé {x} votre taille habituelle : {nT}, {net}."), X("Use your normal size on the trade after a loss.", "استخدم حجمك المعتاد في الصفقة التي تلي الخسارة.", "Gardez votre taille normale sur le trade qui suit une perte.")],
  rush: [X("Pause after a loss", "خذ استراحة بعد الخسارة", "Faites une pause après une perte"), X("Trades opened within {m} minutes of a loss: {nT}, {net}, {wr} won.", "صفقات فُتحت خلال {m} دقائق من خسارة: {nT}، {net}، ربحت {wr} منها.", "Trades ouverts moins de {m} minutes après une perte : {nT}, {net}, {wr} gagnants."), X("Wait at least 15 minutes after a losing trade.", "انتظر 15 دقيقة على الأقل بعد كل صفقة خاسرة.", "Attendez au moins 15 minutes après un trade perdant.")],
  holdLosers: [X("You hold losers longer", "تحتفظ بالصفقات الخاسرة أطول", "Vous gardez les pertes plus longtemps"), X("Losing trades last {ll} on average, winners {lw}: {x} longer.", "تدوم الصفقة الخاسرة {ll} في المتوسط والرابحة {lw}، أي أطول بـ{x}.", "Les pertes durent {ll} en moyenne, les gains {lw} : {x} plus long."), X("Decide your exit before you enter, and close when it is hit.", "حدّد خروجك قبل الدخول، وأغلق عند بلوغه.", "Décidez votre sortie avant d'entrer, et respectez-la.")],
  noStop: [X("Trades without a stop loss", "صفقات بلا وقف خسارة", "Trades sans stop loss"), X("{p} of your trades have no stop loss. Their average loss is {a}{vs}.", "{p} من صفقاتك بلا وقف خسارة، ومتوسط خسارتها {a}{vs}.", "{p} de vos trades n'ont pas de stop : perte moyenne {a}{vs}."), X("Set a stop loss on every trade before you enter.", "ضع وقف خسارة لكل صفقة قبل الدخول.", "Placez un stop loss sur chaque trade avant d'entrer.")],
  bestSymbol: [X("{s} is your best market", "{s} أفضل سوق لك", "{s} est votre meilleur marché"), X("{nT}, {net}, {wr} won.", "{nT}، {net}، ربحت {wr} منها.", "{nT}, {net}, {wr} gagnants."), X("Keep it as your main market.", "اجعله سوقك الأساسي.", "Gardez-le comme marché principal.")],
  bestDay: [X("{day} works for you", "يوم {day} يناسبك", "Le {day} vous réussit"), X("{nT}, {net}, {wr} won.", "{nT}، {net}، ربحت {wr} منها.", "{nT}, {net}, {wr} gagnants."), X("Be fully prepared for {day}.", "كن مستعداً تماماً ليوم {day}.", "Soyez prêt pour le {day}.")],
  bestHours: [X("Your best hours: {range}", "أفضل ساعاتك: {range}", "Vos meilleures heures : {range}"), X("{nT}, {net}, {wr} won.", "{nT}، {net}، ربحت {wr} منها.", "{nT}, {net}, {wr} gagnants."), X("Plan your main trades in this window.", "خطّط لصفقاتك الأساسية في هذه الفترة.", "Placez vos trades principaux sur ce créneau.")],
  bestSide: [X("Your {side} work", "صفقات {side} تنجح معك", "Vos {side} marchent"), X("{nT}, {net}, {wr} won.", "{nT}، {net}، ربحت {wr} منها.", "{nT}, {net}, {wr} gagnants."), X("Look for {side} setups first.", "ابحث عن فرص {side} أولاً.", "Cherchez d'abord des {side}.")],
};
const VS = X(", against {b} with a stop", " مقابل {b} مع الوقف", ", contre {b} avec stop");
const SIDE: Record<string, L> = { long: X("longs", "الشراء", "achats"), short: X("shorts", "البيع", "ventes") };
const ICON: Record<Topic, LucideIcon> = { discipline: ShieldCheck, timing: Clock3, symbols: Coins, direction: ArrowUpDown, exits: Crosshair, behaviour: Flame, risk: AlertTriangle };
/** One colour per kind of advice: its section heading, its cards and the plan's chips. */
const KIND: Record<Advice["kind"], { tone: Tone; icon: LucideIcon; title: L }> = {
  fix: { tone: "rose", icon: Wrench, title: TXT.fix },
  watch: { tone: "amber", icon: Eye, title: TXT.watch },
  strength: { tone: "emerald", icon: Star, title: TXT.strength },
};

/** A figure that counts up to its value (at once for reduced-motion users). */
function useCount(target: number, ms = 1100) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setV(target); return; }
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => { const p = Math.min(1, (t - t0) / ms); setV(target * (1 - (1 - p) ** 3)); if (p < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}
/** Elements with .adv-reveal rise in the first time they scroll into view. */
function useReveal(dep: unknown) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const els = [...(root.current?.querySelectorAll<HTMLElement>(".adv-reveal:not([data-in])") ?? [])];
    if (!els.length) return;
    if (typeof IntersectionObserver === "undefined") { els.forEach((e) => { e.dataset.in = ""; }); return; }
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { (e.target as HTMLElement).dataset.in = ""; io.unobserve(e.target); } }), { rootMargin: "0px 0px -6% 0px", threshold: 0.08 });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [dep]);
  return root;
}

export default function AdvisorView({ lang, accounts, trades, onWhatIf, onOpenPath }: { lang: Lang; accounts: Account[]; trades: Trade[]; onWhatIf: (acc: string | null) => void; onOpenPath: () => void }) {
  const k = lang === "en" ? 0 : lang === "ar" ? 1 : 2, T = (x: L) => x[k];
  const [acc, setAcc] = useState("all");
  const list = useMemo(() => (acc === "all" ? trades : trades.filter((t) => t.accountId === acc)), [trades, acc]);
  const currency = commonCurrency(acc === "all" ? accounts : accounts.filter((a) => a.id === acc));
  const res: Plan = useMemo(() => advise(inputsFor(list, trades)), [list, trades]);
  const shown = useCount(res.plan?.impact ?? 0);
  const root = useReveal(res);
  const money = (v: number, sign = false) => fmtMoney(v, { sign, currency });
  const wd = (d: number) => new Intl.DateTimeFormat(lang, { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 1 + d)));
  const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
  const nTrades = (n: number) => (k === 1 ? (n === 1 ? "صفقة واحدة" : n === 2 ? "صفقتان" : n <= 10 ? `${n} صفقات` : `${n} صفقة`) : `${n} ${n === 1 ? "trade" : "trades"}`);
  const nLosses = (n: number) => (k === 1 ? (n === 1 ? "خسارة واحدة" : n === 2 ? "خسارتين متتاليتين" : n <= 10 ? `${n} خسائر متتالية` : `${n} خسارة متتالية`) : k === 2 ? `${n} pertes d'affilée` : `${n} losses in a row`);
  const iso = (s: string) => `⁦${s}⁩`; // a value kept left to right inside Arabic text
  const firstN = (n: number) => (k === 1 ? (n === 1 ? "الصفقة الأولى" : n === 2 ? "أول صفقتين" : n <= 10 ? `أول ${n} صفقات` : `أول ${n} صفقة`) : k === 2 ? (n === 1 ? "votre premier trade" : `vos ${n} premiers trades`) : n === 1 ? "your first trade" : `your first ${n} trades`);
  const fill = (x: string, a: Advice) => {
    const d = a.data, lv = (v: number) => (d.unit === "R" ? `${v}R` : money(v));
    const map: Record<string, string> = {
      n: String(d.n ?? ""), k: String(d.k ?? ""), nT: nTrades(Number(d.n)), kT: nTrades(Number(d.k)), nL: nLosses(Number(d.n)), m: String(d.m ?? ""),
      avg: money(Number(d.avg), true), net: money(Number(d.net), true), wr: `${Number(d.wr).toFixed(0)}%`, p: `${Number(d.p).toFixed(0)}%`,
      v: d.v != null ? lv(Number(d.v)) : "", a: a.id === "noStop" ? money(Number(d.a)) : d.a != null ? hh(Number(d.a)) : "", b: a.id === "noStop" ? (d.b != null ? money(Number(d.b)) : "") : d.b != null ? hh(Number(d.b)) : "",
      vs: a.id === "noStop" && d.b != null ? T(VS).replace("{b}", money(Number(d.b))) : "",
      day: d.d != null ? wd(Number(d.d)) : "", firstN: firstN(Number(d.n)), range: d.a != null && d.b != null && a.id !== "noStop" ? iso(`${hh(Number(d.a))}–${hh(Number(d.b))}`) : "", s: String(d.s ?? ""), side: d.side ? T(SIDE[String(d.side)]) : "", other: d.other ? T(SIDE[String(d.other)]) : "",
      x: `${Number(d.x).toFixed(1)}×`, lw: iso(fmtHold(Number(d.lw))), ll: iso(fmtHold(Number(d.ll))),
    };
    return ltrNumbers(x.replace(/\{(\w+)\}/g, (_, key: string) => map[key] ?? ""));
  };
  const text = (a: Advice, i: 0 | 1 | 2) => fill(T(COPY[a.id][i]), a);
  const tryRules = (r: Advice["rules"]) => { if (!r) return; presetWhatIf(r); onWhatIf(acc === "all" ? null : acc); }; // What if opens on the same account

  const byKind = (kind: Advice["kind"]) => res.advice.filter((a) => a.kind === kind);
  const planned = res.plan ? byKind("fix").filter((a) => res.plan!.ids.includes(a.id)) : [];

  const card = (a: Advice, i: number) => {
    const Icon = a.kind === "strength" ? Star : ICON[a.topic];
    const both = !!a.halves && a.halves[0] > 0 && a.halves[1] > 0;
    const lvl = a.proof === "strong" ? 3 : a.proof === "medium" ? 2 : 1, proofTone: Tone = lvl === 3 ? "emerald" : lvl === 2 ? "amber" : "slate";
    return (
      <div key={a.id} className="adv-reveal" style={dly((i % 2) * 90)}>
        <article data-advice={a.id} className={`tone-${KIND[a.kind].tone} adv-item adv-lift relative h-full overflow-hidden rounded-2xl p-4 sm:p-5`}>
          <span aria-hidden="true" className="absolute inset-y-0 start-0 w-1" style={{ background: "var(--tone)" }} />
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
              <span className="tone-tile h-10 w-10 rounded-xl"><Icon size={17} /></span>
              <h3 className="min-w-0 font-heading text-base font-semibold leading-snug text-text">{text(a, 0)}</h3>
            </div>
            {a.impact != null && (
              <div className="flex items-baseline gap-2 max-sm:basis-full sm:flex-col sm:items-end sm:gap-0">
                <bdi dir="ltr" className="tone-emerald tone-text font-heading text-xl font-bold tnum">{money(a.impact, true)}</bdi>
                <span className="text-[11px] text-muted">{T(TXT.onHistory)}</span>
              </div>
            )}
          </div>
          <p className="adv-p mt-3 text-sm">{tint(text(a, 1))}</p>
          <div className="adv-do mt-3 flex items-start gap-2.5 rounded-xl px-3.5 py-3">
            <ArrowRight size={15} className="tone-text mt-0.5 shrink-0 rtl:-scale-x-100" />
            <p className="text-sm font-medium leading-relaxed text-text">{tint(text(a, 2))}</p>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted">
              <span className={`tone-${proofTone} tone-chip inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold`}>
                <span aria-hidden="true" className="adv-meter flex items-end gap-0.5">
                  {[0, 1, 2].map((j) => <span key={j} className="w-1 rounded-full" style={{ height: 6 + j * 2.5, background: j < lvl ? "currentColor" : "color-mix(in srgb, currentColor 25%, transparent)" }} />)}
                </span>
                {T(TXT[a.proof])}
              </span>
              {a.halves && <span className="inline-flex items-center gap-1">{both ? <CircleCheck size={12} className="tone-emerald tone-text" /> : <Info size={12} />}{T(both ? TXT.both : TXT.oneHalf)}</span>}
            </div>
            {a.rules && (
              <button type="button" onClick={() => tryRules(a.rules)} className="tone-btn inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold">
                <Sparkles size={13} />{T(TXT.tryOne)}
              </button>
            )}
          </div>
        </article>
      </div>
    );
  };
  const group = (kind: Advice["kind"]) => {
    const items = byKind(kind), K = KIND[kind], Icon = K.icon;
    return items.length > 0 && (
      <section key={kind} className="space-y-4">
        <div className={`tone-${K.tone} adv-reveal flex items-center gap-3`}>
          <span className="tone-tile h-10 w-10 rounded-xl"><Icon size={18} /></span>
          <h2 className="font-heading text-lg font-semibold text-text">{T(K.title)}</h2>
          <span className="tone-chip rounded-full px-2.5 py-0.5 text-xs font-bold tnum">{items.length}</span>
          <span aria-hidden="true" className="adv-rule min-w-6 flex-1" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">{items.map(card)}</div>
      </section>
    );
  };

  return (
    <div ref={root} className="mx-auto max-w-6xl space-y-6 py-2 sm:space-y-8 sm:p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="adv-logo grid h-12 w-12 shrink-0 place-items-center rounded-2xl"><Sparkles size={22} className="adv-twinkle" /></span>
          <div>
            <h1 className="font-heading text-2xl font-bold text-text">{T(TXT.title)}</h1>
            <p className="text-sm text-muted">{T(TXT.sub)}</p>
          </div>
        </div>
        {accounts.length > 1 && (
          <select className="field !w-auto" value={acc} onChange={(e) => setAcc(e.target.value)}>
            {[{ value: "all", label: T(TXT.all) }, ...accounts.map((a) => ({ value: a.id, label: a.name }))].map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}
      </header>

      {res.trades < MIN_TRADES ? (
        <div className="tone-sky tone-panel adv-pop rounded-3xl p-8 text-center">
          <span className="tone-tile mx-auto h-14 w-14 rounded-2xl"><Sparkles size={24} className="adv-twinkle" /></span>
          <p className="mx-auto mt-4 max-w-md font-heading text-lg font-semibold text-text">{ltrNumbers(T(TXT.few).replace("{n}", String(MIN_TRADES)).replace("{m}", String(res.trades)))}</p>
          <div className="mx-auto mt-5 h-2 max-w-xs overflow-hidden rounded-full" style={{ background: "color-mix(in srgb, var(--tone) 15%, var(--border))" }}>
            <div className="adv-grow h-full rounded-full" style={{ width: `${Math.min(100, (res.trades / MIN_TRADES) * 100)}%`, background: "var(--tone)" }} />
          </div>
          <p dir="ltr" className="tone-text mt-2 text-xs font-semibold tnum">{res.trades} / {MIN_TRADES}</p>
        </div>
      ) : (
        <>
          <section className="tone-gold adv-hero adv-pop relative overflow-hidden rounded-3xl p-5 sm:p-6 md:p-8">
            <span aria-hidden="true" className="adv-orb pointer-events-none absolute -end-16 -top-24 h-72 w-72 rounded-full blur-3xl" style={{ background: "color-mix(in srgb, var(--c-gold) 26%, transparent)" }} />
            <span aria-hidden="true" className="adv-orb pointer-events-none absolute -bottom-28 start-1/4 h-64 w-64 rounded-full blur-3xl" style={{ background: "color-mix(in srgb, var(--c-violet) 16%, transparent)", animationDelay: "-4.5s" }} />
            <div className="relative flex flex-wrap items-center gap-8">
              <div className="min-w-0 flex-1 basis-80">
                <div className="flex flex-wrap gap-2">
                  <span className="tone-chip inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"><Sparkles size={13} />{T(TXT.yourPlan)}</span>
                  <span className="tone-slate tone-chip inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"><ListChecks size={13} />{ltrNumbers(T(TXT.analysed).replace("{n}", String(res.trades)))}</span>
                </div>
                {res.plan ? (
                  <>
                    <div className="mt-5"><bdi dir="ltr" className="tone-emerald tone-text font-heading text-4xl font-bold leading-none tnum sm:text-5xl md:text-6xl">{money(Math.round(shown), true)}</bdi></div>
                    <p className="mt-2.5 max-w-xl text-sm leading-relaxed text-muted">{ltrNumbers((planned.length > 1 ? T(TXT.planCap) : T(TXT.planCap1)).replace("{n}", String(planned.length)))}</p>
                    <div className="mt-5 flex flex-wrap gap-2">
                      {planned.map((a, i) => {
                        const Icon = ICON[a.topic];
                        return <span key={a.id} className="tone-rose tone-chip adv-pop inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium" style={dly(250 + i * 90)}><Icon size={13} />{text(a, 0)}</span>;
                      })}
                    </div>
                    <button type="button" onClick={() => tryRules(res.plan!.rules)} className="tone-solid adv-cta mt-6 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold">
                      <Sparkles size={15} />{T(TXT.tryPlan)}
                    </button>
                  </>
                ) : (
                  <div className="mt-5 flex items-center gap-3">
                    <span className="tone-emerald tone-tile h-11 w-11 rounded-xl"><CircleCheck size={20} /></span>
                    <p className="font-heading text-lg font-semibold text-text">{T(TXT.clean)}</p>
                  </div>
                )}
              </div>
              <div aria-hidden="true" className="relative hidden h-36 w-36 shrink-0 place-items-center sm:grid">
                <span className="adv-ring absolute inset-0 rounded-full" />
                <span className="adv-ring adv-ring-2 absolute inset-3 rounded-full" />
                <span className="tone-tile relative h-24 w-24 rounded-full"><Sparkles size={34} className="adv-twinkle" /></span>
              </div>
            </div>
          </section>

          <Chat lang={lang} T={T} context={() => journalContext(list, res, currency)} />

          {group("fix")}
          {group("watch")}
          {group("strength")}

          <div className="tone-slate adv-reveal flex gap-3 rounded-2xl p-4" style={{ border: "1px dashed color-mix(in srgb, var(--tone) 35%, var(--border))" }}>
            <span className="tone-tile h-9 w-9 rounded-xl"><Info size={16} /></span>
            <div className="min-w-0 flex-1 space-y-2 text-xs leading-relaxed text-muted">
              {res.exitsCovered < MIN_TRADES && (
                <p className="flex flex-wrap items-center gap-2">{T(TXT.exitsHint)}
                  <button type="button" onClick={onOpenPath} className="tone-sky tone-btn inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-semibold"><Route size={13} />{T(TXT.openPath)}</button>
                </p>
              )}
              <p>{T(TXT.caveat)}</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
