// Risk management: the well-known position-sizing methods as selectable presets (built in, or your own), what the chosen
// one gives on an account's balance, and a button that hands it to Position size. Same layout conventions as RiskSystem.tsx.
import { useMemo, useState, type ReactNode } from "react";
import { Check, ExternalLink, Pencil, Trash2, TriangleAlert } from "lucide-react";
import { useSettings } from "../../useSettings";
import { openCalculator } from "../../useCalculators";
import { currentBalance } from "../../lib/balance";
import {
  addRiskPreset, antiMartingaleRisk, currentLossStreak, deleteRiskPreset, parseNum, readRiskPresets, riskRuleResult, RISK_BUILTINS, RISK_PRESET_CAP,
  sizeStatePatch, updateRiskPreset, writeRiskPresets, writeSizeState, type CustomRiskPreset, type RiskMethod, type RiskPresetError, type RiskRule,
} from "../../lib/calculators";
import { CALC_TEXT, RM, RM_BUILT, T, type L3 } from "./text";
import {
  AccountField, asField, fill, fillIn, fmtLots, fmtN, fmtPct, Hint, InputsCard, JNumField, moneyFmt, NumField, Pair, ResultCard, Row, say, Section, Seg, useAccount, useJField, useL, type Ctx,
} from "./ui";

const pos = (v: number) => Number.isFinite(v) && v > 0;
const store = (): Storage | null => { try { return localStorage; } catch { return null; } };

interface Form { id: string | null; name: string; method: RiskMethod; a: string; b: string }
const emptyForm = (): Form => ({ id: null, name: "", method: "pct", a: "", b: "" });
const ruleOfForm = (f: Form): RiskRule =>
  f.method === "pct" ? { method: "pct", pct: parseNum(f.a) } : f.method === "amt" ? { method: "amt", amt: parseNum(f.a) } : { method: "balance", unitAmt: parseNum(f.a), lotsPerUnit: parseNum(f.b) };
const formOfPreset = (p: CustomRiskPreset): Form => {
  const r = p.rule;
  return { id: p.id, name: p.name, method: r.method, a: String(r.method === "pct" ? r.pct : r.method === "amt" ? r.amt : r.unitAmt), b: r.method === "balance" ? String(r.lotsPerUnit) : "" };
};

export function RiskMgmtBody({ ctx }: { ctx: Ctx }) {
  const L = useL(ctx.lang);
  const settings = useSettings();
  const { acc, cur } = useAccount(ctx);
  const [sel, setSel] = useState("fixed1");
  const [presets, setPresets] = useState<CustomRiskPreset[]>(() => { const s = store(); return s ? readRiskPresets(s) : []; });
  const [form, setForm] = useState<Form | null>(null);
  const [err, setErr] = useState<RiskPresetError | null>(null);
  const [unitT, setUnitT] = useState("10000"), [lpuT, setLpuT] = useState("1");
  const [baseT, setBaseT] = useState("1"), [haveT, setHaveT] = useState("2");

  // the balance and the losing streak come from the journal (and can be typed over); typed by hand in manual mode
  const jBal = useMemo(() => (ctx.journal && acc ? currentBalance(acc, ctx.trades, ctx.balances[acc.id] ?? [], ctx.flows) : null), [ctx.journal, acc, ctx.trades, ctx.balances, ctx.flows]);
  const jStreak = useMemo(() => (ctx.journal && acc ? currentLossStreak(ctx.trades.filter((t) => t.accountId === acc.id), settings.breakEven) : null), [ctx.journal, acc, ctx.trades, settings.breakEven]);
  const fBal = useJField(jBal != null && pos(jBal) ? asField(jBal) : null, acc?.id);
  const fStreak = useJField(jStreak != null ? String(jStreak) : null, acc?.id);
  const balance = parseNum(fBal.value);
  const streak = fStreak.value.trim() === "" ? 0 : parseNum(fStreak.value);
  const money = moneyFmt(cur, false);
  const moneyBal = moneyFmt(cur, ctx.hidden && ctx.journal && fBal.fromJournal);

  const custom = presets.find((p) => p.id === sel) ?? null;
  const base = parseNum(baseT), haveAfter = parseNum(haveT);
  const antiPct = antiMartingaleRisk(base, streak, haveAfter);
  const halvings = Number.isFinite(antiPct) ? Math.floor(streak / Math.floor(haveAfter)) : NaN;
  const rule: RiskRule | null = custom ? custom.rule
    : sel === "fixed1" ? { method: "pct", pct: 1 } : sel === "fixed2" ? { method: "pct", pct: 2 }
    : sel === "lotbal" ? { method: "balance", unitAmt: parseNum(unitT), lotsPerUnit: parseNum(lpuT) }
    : sel === "antimart" ? { method: "pct", pct: antiPct } : null;
  const res = rule ? riskRuleResult(rule, balance) : null;

  const missing: L3[] = [];
  if (!pos(balance)) missing.push(T.balance);
  if (sel === "lotbal") { if (!pos(parseNum(unitT))) missing.push(T.unitAmt); if (!pos(parseNum(lpuT))) missing.push(T.lotsPerUnit); }
  if (sel === "antimart") {
    if (!pos(base)) missing.push(RM.baseRisk);
    if (!(haveAfter >= 1)) missing.push(RM.haveAfter);
    if (!(streak >= 0)) missing.push(RM.curStreak);
  }

  const commit = (list: CustomRiskPreset[]) => { setPresets(list); const s = store(); if (s) writeRiskPresets(s, list); };
  const save = () => {
    if (!form) return;
    const r = ruleOfForm(form);
    const out = form.id ? updateRiskPreset(presets, form.id, form.name, r) : addRiskPreset(presets, form.name, r);
    if (out.error) { setErr(out.error); return; }
    commit(out.list);
    setSel(out.id);
    setForm(null);
    setErr(null);
  };
  const remove = (id: string) => { commit(deleteRiskPreset(presets, id)); if (sel === id) setSel("fixed1"); if (form?.id === id) setForm(null); };
  const full = presets.length >= RISK_PRESET_CAP;
  const useInSize = () => {
    if (!rule || !res?.ok) return;
    const s = store();
    if (s) writeSizeState(s, sizeStatePatch(rule, acc?.id));
    openCalculator("size");
  };

  const ruleText = (r: RiskRule): ReactNode =>
    r.method === "pct" ? fmtPct(r.pct) : r.method === "amt" ? money(r.amt, { cents: false }) : `${fmtN(r.lotsPerUnit, 4)} / ${fmtN(r.unitAmt, 2)}`;

  const rowCls = (on: boolean) => `flex min-w-0 flex-1 items-start gap-2 rounded-xl border p-3 text-start transition-colors ${on ? "" : "border-border hover:bg-glass"}`;
  const rowStyle = (on: boolean) => (on ? { borderColor: ctx.tone, background: `color-mix(in srgb, ${ctx.color} 10%, transparent)` } : undefined);
  const iconBtn = "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-glass hover:text-text";

  const formView = form && (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-3">
      <label className="flex flex-col gap-1 text-xs font-medium text-muted">{L(RM.formName)}
        <input className="field" maxLength={40} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </label>
      <div className="flex flex-col gap-1 text-xs font-medium text-muted">
        <span>{L(RM.formMethod)}</span>
        <Seg small label={L(RM.formMethod)} value={form.method} onChange={(m) => setForm({ ...form, method: m })}
          options={[{ v: "pct", label: L(RM.mPct) }, { v: "amt", label: L(RM.mAmt) }, { v: "balance", label: L(RM.mBal) }]} />
      </div>
      {form.method === "balance" ? (
        <Pair>
          <NumField lang={ctx.lang} label={L(T.unitAmt)} value={form.a} onChange={(v) => setForm({ ...form, a: v })} />
          <NumField lang={ctx.lang} label={L(T.lotsPerUnit)} value={form.b} onChange={(v) => setForm({ ...form, b: v })} />
        </Pair>
      ) : (
        <NumField lang={ctx.lang} label={form.method === "pct" ? L(T.riskPct) : L(T.amount)} value={form.a} onChange={(v) => setForm({ ...form, a: v })} suffix={form.method === "pct" ? "%" : cur} />
      )}
      {err && <p className="text-xs font-medium text-loss">{err === "cap" ? fill(L(RM.errCap), { n: RISK_PRESET_CAP }) : err === "name" ? L(RM.errName) : L(RM.errValues)}</p>}
      <div className="flex gap-2">
        <button type="button" className="calc-chip text-xs" aria-pressed="true" onClick={save}>{L(RM.save)}</button>
        <button type="button" className="calc-chip text-xs" onClick={() => { setForm(null); setErr(null); }}>{L(RM.cancel)}</button>
      </div>
    </div>
  );

  const rows = res?.ok && rule && (
    <>
      <Row label={L(T.balance)} value={moneyBal(balance, { cents: false })} />
      {rule.method !== "balance" && <Row label={L(RM.riskPctRow)} value={fmtPct(res.riskPct)} />}
      {rule.method !== "balance" && <Row label={L(RM.riskAmount)} value={money(res.riskMoney)} />}
      {rule.method === "balance" && <Row label={L(RM.rule)} value={ruleText(rule)} />}
      {sel === "antimart" && <Row label={L(RM.baseRisk)} value={fmtPct(base)} />}
      {sel === "antimart" && <Row label={L(RM.curStreak)} value={fmtN(streak, 0)} />}
    </>
  );

  return (
    <div className="grid items-start gap-4 md:grid-cols-2">
      <InputsCard>
        <Section label={L(T.secAccount)}>
          <AccountField ctx={ctx} />
          <JNumField lang={ctx.lang} label={L(T.balance)} f={fBal} hidden={ctx.hidden} money />
        </Section>

        <Section label={L(RM.secMethods)}>
          <div className="flex flex-col gap-2">
            {RISK_BUILTINS.map((b) => {
              const t = RM_BUILT[b.key];
              if (b.kind === "warn") {
                return (
                  <div key={b.key} className="calc-status-bad flex items-start gap-2 rounded-xl p-3">
                    <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
                    <div className="min-w-0 text-xs leading-5"><div className="text-sm font-semibold">{L(t.name)}</div>{L(t.desc)}</div>
                  </div>
                );
              }
              if (b.kind === "link") {
                return (
                  <div key={b.key} className="flex items-start gap-2 rounded-xl border border-border p-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">{L(t.name)}</div>
                      <div className="text-[11px] leading-4 text-muted">{L(t.desc)}</div>
                    </div>
                    <button type="button" className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-icon hover:underline" onClick={() => openCalculator(b.link)}>
                      <ExternalLink size={12} aria-hidden />{fill(L(RM.open), { name: b.link ? CALC_TEXT[b.link].name[ctx.lang] : "" })}
                    </button>
                  </div>
                );
              }
              const on = sel === b.key;
              return (
                <button key={b.key} type="button" aria-pressed={on} className={rowCls(on)} style={rowStyle(on)} onClick={() => setSel(b.key)}>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{L(t.name)}</span>
                    <span className="block text-[11px] leading-4 text-muted">{L(t.desc)}</span>
                  </span>
                  {on && <Check size={16} className="mt-0.5 shrink-0" style={{ color: ctx.tone }} aria-hidden />}
                </button>
              );
            })}
          </div>
        </Section>

        {(sel === "lotbal" || sel === "antimart") && (
          <Section label={L(RM.secSettings)}>
            {sel === "lotbal" ? (
              <Pair>
                <NumField lang={ctx.lang} label={L(T.unitAmt)} value={unitT} onChange={setUnitT} />
                <NumField lang={ctx.lang} label={L(T.lotsPerUnit)} value={lpuT} onChange={setLpuT} />
              </Pair>
            ) : (
              <>
                <Pair>
                  <NumField lang={ctx.lang} label={L(RM.baseRisk)} value={baseT} onChange={setBaseT} suffix="%" />
                  <NumField lang={ctx.lang} label={L(RM.haveAfter)} value={haveT} onChange={setHaveT} />
                </Pair>
                <JNumField lang={ctx.lang} label={L(RM.curStreak)} f={fStreak} />
                <Hint>{L(RM.restoreNote)}</Hint>
              </>
            )}
          </Section>
        )}

        <Section label={L(RM.secYours)}>
          <div className="flex flex-col gap-2">
            {!presets.length && !form && <Hint>{L(RM.noneYet)}</Hint>}
            {presets.map((p) => {
              const on = sel === p.id;
              return (
                <div key={p.id} className="flex items-stretch gap-1">
                  <button type="button" aria-pressed={on} className={rowCls(on)} style={rowStyle(on)} onClick={() => setSel(p.id)}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{p.name}</span>
                      <span className="block text-[11px] leading-4 text-muted">{L(p.rule.method === "pct" ? RM.mPct : p.rule.method === "amt" ? RM.mAmt : RM.mBal)} · <bdi dir="ltr">{ruleText(p.rule)}</bdi></span>
                    </span>
                    {on && <Check size={16} className="mt-0.5 shrink-0" style={{ color: ctx.tone }} aria-hidden />}
                  </button>
                  <button type="button" className={iconBtn} title={L(RM.edit)} aria-label={`${L(RM.edit)}: ${p.name}`} onClick={() => { setForm(formOfPreset(p)); setErr(null); }}><Pencil size={15} aria-hidden /></button>
                  <button type="button" className={iconBtn} title={L(RM.del)} aria-label={`${L(RM.del)}: ${p.name}`} onClick={() => remove(p.id)}><Trash2 size={15} aria-hidden /></button>
                </div>
              );
            })}
            {formView}
            {!form && (
              <>
                <button type="button" className="calc-chip self-start text-xs" disabled={full} onClick={() => { setForm(emptyForm()); setErr(null); }}>{L(RM.addOwn)}</button>
                {full && <p className="text-xs font-medium text-muted">{fill(L(RM.errCap), { n: RISK_PRESET_CAP })}</p>}
              </>
            )}
          </div>
        </Section>
      </InputsCard>

      <ResultCard
        lang={ctx.lang} color={ctx.color} tone={ctx.tone}
        missing={!rule ? L(RM.pickOne) : missing.length ? fillIn(ctx.lang, missing) : !res?.ok ? "-" : undefined}
        big={rule?.method === "balance" ? fmtLots(res?.lots ?? NaN) : money(res?.riskMoney ?? NaN)}
        unit={rule?.method === "balance" ? L(T.lotsUnit) : undefined}
        sentence={res?.ok && rule ? (
          rule.method === "balance" ? say(L(RM.balSay), { lotsPerUnit: fmtN(rule.lotsPerUnit, 4), unit: money(rule.unitAmt, { cents: false }), lots: fmtLots(res.lots), balance: moneyBal(balance, { cents: false }) })
          : sel === "antimart" ? say(L(RM.antiSay), { streak: fmtN(streak, 0), halvings: fmtN(halvings, 0), pct: fmtPct(antiPct), base: fmtPct(base), risk: money(res.riskMoney), balance: moneyBal(balance, { cents: false }) })
          : rule.method === "amt" ? say(L(RM.amtSay), { risk: money(res.riskMoney), pct: fmtPct(res.riskPct), balance: moneyBal(balance, { cents: false }) })
          : say(L(RM.pctSay), { balance: moneyBal(balance, { cents: false }), pct: fmtPct(rule.pct), risk: money(res.riskMoney) })
        ) : undefined}
        rows={rows}
      >
        {res?.ok && rule && (
          <>
            {rule.method !== "balance" && <Hint>{L(RM.needStop)}</Hint>}
            <button type="button" className="calc-chip self-start text-xs" aria-pressed="true" onClick={useInSize}>{L(RM.useIn)}</button>
          </>
        )}
      </ResultCard>
    </div>
  );
}
