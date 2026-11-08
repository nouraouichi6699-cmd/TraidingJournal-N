// Settings. Level one is a section, level two a topic; one config array holds both, so a later phase adds entries
// rather than markup. Personal details stay in the profile and are not repeated here, and every setting keeps the
// storage key, default and behaviour it already had: this file decides where a control sits, never what it does.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Clock3, Database, LogOut, Monitor, RefreshCw, Send, ShieldCheck, TrendingUp, type LucideIcon } from "lucide-react";
import { Lamp, Note, Pills, Row, SessionRibbon, THEME_CARDS, ThemeCards, Tile } from "./settingsUi";
import { TgAlerts, TgLink, TgPeople, TgStatus } from "./TelegramPanels";
import PhonePreview from "./PhonePreview";
import { useTelegram } from "../useTelegram";
import {
  cardSurface, DEFAULT_LIGHTING, maxGlassTransparency, paletteChoice, pushRecent, SWATCH,
  type CardColor, type IconStyle, type LightColor, type Lighting, type LightStyle,
} from "../lib/lighting";
import {
  createMyTheme, deleteMyTheme, getMyTheme, isBuiltIn, MY_THEME_ID,
  resolveTheme, updateLook,
  type ThemeLook,
} from "../lib/customThemes";
import { ColorPalette, type SpecialChoice } from "./ColorPalette";
import { SESSION_TRIO } from "../lib/sessionColors";
import { sessionAt } from "../lib/tradingTime";
import { languages, stT, themeNames, type Key } from "../i18n";
import { setActiveTheme, setSettings, useActiveTheme, useReduceMotion, useSettings, type BrokerClock, type DayStart, type FontSize, type NumberFormat, type SettingsStart, type WeekStart } from "../useSettings";
import { clampBounds, DEFAULT_BOUNDS } from "../lib/tradingTime";
import { classifyOutcome } from "../lib/outcome";
import { currenciesOf, FRANKFURTER_CODES, frankfurterUrl, isFrankfurter, missingRates } from "../lib/fx";
import { setPrivacy } from "../usePrivacy";
import { downloadCsv, tradesToCsv } from "../lib/exportTrades";
import { supabase } from "../lib/supabase";
import type { Account, Lang, Theme, Trade } from "../types";

interface Props {
  t: (k: Key) => string;
  lang: Lang;
  theme: Theme;
  onLang: (l: Lang) => void;
  onTheme: (t: string) => void;
  accounts: Account[];
  trades: Trade[];
  onImport: () => void;
  onProfile: () => void;
  /** Where a link into Settings asked to land; absent means Display > Look. */
  start?: SettingsStart | null;
}

interface Topic { id: string; label: string; intro: string; tiles: ReactNode }
interface Section { id: string; label: string; desc: string; icon: LucideIcon; intro?: string; topics: Topic[]; tiles?: ReactNode }

const field = "field !w-auto !py-1.5 text-sm";
const btnGhost = "min-h-[42px] rounded-full border border-border px-4 text-[13.5px] font-medium transition hover:bg-primary-tint";
const btnGold = "min-h-[42px] rounded-full bg-primary px-4 text-[13.5px] font-bold text-on-primary transition hover:brightness-95";
const btnDanger = "min-h-[42px] rounded-full border border-loss/45 px-4 text-[13.5px] font-medium text-loss transition hover:bg-loss/10";
const grid = "grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(290px,1fr))]";
/** The sections in dock order. Kept apart from SECTIONS so a link can be checked before the tiles are built. */
const SECTION_IDS = ["display", "trading", "analysis", "telegram", "security", "data"];

export default function SettingsView({ t, lang, theme, onLang, onTheme, accounts, trades, onImport, onProfile, start }: Props) {
  const L = stT(lang);
  const s = useSettings();
  const reduce = useReduceMotion();
  const activeId = useActiveTheme();
  const customs = s.customThemes ?? [];
  const resolved = resolveTheme(activeId, customs, theme);
  const [exportAcc, setExportAcc] = useState("all");
  const [note, setNote] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [secId, setSecId] = useState(() => (start && SECTION_IDS.includes(start.section) ? start.section : "display"));
  const [topId, setTopId] = useState(() => start?.topic ?? "");
  const [phone, setPhone] = useState<string | null>(null); // which section the phone is inside, null = the list
  const [pane, setPane] = useState(0); // counts every move, so the content settles in again each time

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(t);
  }, [notice]);

  // Currencies the accounts actually use, minus the base, which needs no rate of its own.
  const needed = useMemo(() => currenciesOf(accounts).filter((c) => c !== s.baseCurrency), [accounts, s.baseCurrency]);
  const fxMissing = useMemo(() => missingRates(accounts, s.baseCurrency, s.rates), [accounts, s.baseCurrency, s.rates]);
  // The base list is the published set plus anything the accounts already use, so a manual-only currency can be it.
  const baseOptions = useMemo(
    () => [...new Set([...FRANKFURTER_CODES, ...currenciesOf(accounts).filter(Boolean)])].sort(),
    [accounts],
  );
  const [fetching, setFetching] = useState(false);
  const [ratesNote, setRatesNote] = useState<string | null>(null);

  const updateRates = async () => {
    // Only the codes the published set covers are asked for; the rest stay as they were typed.
    const ask = needed.filter((c) => isFrankfurter(c));
    if (!ask.length) return setRatesNote(L("ratesManual"));
    setFetching(true);
    setRatesNote(null);
    try {
      const r = await fetch(frankfurterUrl(s.baseCurrency, ask));
      if (!r.ok) throw new Error(String(r.status));
      const data = (await r.json()) as { date?: string; rates?: Record<string, number> };
      const got = data.rates ?? {};
      const next = { ...s.rates };
      for (const [k, v] of Object.entries(got)) if (Number.isFinite(v) && v > 0) next[k] = v;
      setSettings({ rates: next, ratesDate: data.date ?? "" });
    } catch {
      setRatesNote(L("ratesFailed"));
    } finally {
      setFetching(false);
    }
  };

  const exportNow = () => {
    const list = trades.filter((x) => exportAcc === "all" || x.accountId === exportAcc);
    if (!list.length) return setNote(L("noTrades"));
    const who = exportAcc === "all" ? "all-accounts" : (accounts.find((a) => a.id === exportAcc)?.name ?? exportAcc);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`mizan-trades-${who.replace(/[^\w-]+/g, "-")}-${stamp}.csv`, tradesToCsv(list, accounts));
    setNote(L("exported").replace("{n}", String(list.length)));
  };

  // One Telegram connection for the whole page: its two topics and the partner and coach cards all read it.
  const tg = useTelegram(lang, secId === "telegram" || secId === "security");
  // Which alert the phone should be showing, and a counter so switching the same lamp twice replays the effect.
  const [preview, setPreview] = useState<{ id: string; n: number } | null>(null);
  const flash = (id: string) => setPreview((p) => ({ id, n: (p?.n ?? 0) + 1 }));

  const signOutEverywhere = async () => {
    setBusy(true);
    // Ends this session too, so the app drops back to the login screen on its own through onAuthStateChange.
    await supabase.auth.signOut({ scope: "global" });
    setBusy(false);
    setAsking(false);
  };

  // ---------- the pieces each topic is made of ----------

  const accountSelect = (value: string, onChange: (v: string) => void, label: string) => (
    <select aria-label={label} className={field} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="all">{L("allAccounts")}</option>
      {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
    </select>
  );

  const myTheme = getMyTheme(customs);

  const doResetMyTheme = () => {
    const result = deleteMyTheme(customs);
    setSettings({ customThemes: result.customs });
    setActiveTheme(result.fallbackBase);
    onTheme(result.fallbackBase);
    setDeleting(false);
  };

  const look: ReactNode = (
    <>
      <Tile title={L("tileTheme")} wide>
        <ThemeCards
          value={activeId} onChange={onTheme} label={t("theme")}
          names={{ dark: themeNames.dark[lang], light: themeNames.light[lang], black: themeNames.black[lang] }}
        />
        {myTheme && (
          <>
            <div className="mt-1 flex items-center gap-2">
              <span className="h-px flex-1 bg-border" />
              <span className="text-xs font-semibold text-muted">{L("myTheme")}</span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button" role="radio" aria-checked={activeId === MY_THEME_ID} tabIndex={activeId === MY_THEME_ID ? 0 : -1}
                onClick={() => onTheme(MY_THEME_ID)}
                className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${activeId === MY_THEME_ID ? "border-primary bg-primary-tint text-primary" : "border-border hover:border-primary/50"}`}
              >
                {myTheme.name}
              </button>
              {activeId === MY_THEME_ID && (
                <button type="button" onClick={() => setDeleting(true)} className="text-[11px] text-muted hover:text-loss">{L("resetMyTheme")}</button>
              )}
            </div>
          </>
        )}
        {notice === "savedAsNew" && <p role="status" className="text-xs font-medium text-profit">{L("savedAsNew")}</p>}
        {notice === "baseChanged" && <p role="status" className="text-xs font-medium text-profit">{L("baseChanged")}</p>}
      </Tile>
      <Tile title={L("tileFont")}>
        <Row label={L("fontSize")} sub={L("fontSizeSub")}>
          <Pills<FontSize>
            label={L("fontSize")} value={s.fontSize} onChange={(v) => setSettings({ fontSize: v })}
            options={[{ v: "small", label: L("small") }, { v: "normal", label: L("normal") }, { v: "large", label: L("large") }]}
          />
        </Row>
      </Tile>
      <Tile title={L("tileOnOpen")}>
        {/* Turning it on hides things straight away, so the effect is visible rather than only next time. */}
        <Row label={L("privacyAtOpen")} sub={L("privacyAtOpenShort")}>
          <Lamp label={L("privacyAtOpen")} on={s.privacyAtOpen} onChange={(v) => { setSettings({ privacyAtOpen: v }); if (v) setPrivacy(true); }} />
        </Row>
        <Row label={L("reduceMotion")} sub={L("reduceMotionShort")}>
          <Lamp label={L("reduceMotion")} on={s.reduceMotion} onChange={(v) => setSettings({ reduceMotion: v })} />
        </Row>
      </Tile>
    </>
  );

  // ---- Display > Lighting ----
  const light: Lighting = {
    ...DEFAULT_LIGHTING,
    ...resolved.look,
    playing: s.lighting?.playing ?? DEFAULT_LIGHTING.playing,
    recentColors: s.lighting?.recentColors ?? [],
  };
  const setLight = (patch: Partial<Lighting>) => {
    const lookPatch: Partial<ThemeLook> = {};
    const globalPatch: Partial<Lighting> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (k === "playing" || k === "recentColors") (globalPatch as any)[k] = v;
      else (lookPatch as any)[k] = v;
    }
    const merged: Partial<import("../useSettings").Settings> = {};
    if (Object.keys(globalPatch).length > 0) {
      merged.lighting = { ...s.lighting, ...globalPatch };
    }
    if (Object.keys(lookPatch).length > 0) {
      if (!activeId || isBuiltIn(activeId)) {
        if (myTheme) {
          // My theme exists: switch to it, set base to current built-in, apply the edit.
          const updated = [{ ...myTheme, base: theme, look: { ...myTheme.look, ...lookPatch } }];
          merged.customThemes = updated;
          setSettings(merged);
          setActiveTheme(MY_THEME_ID);
          setNotice("baseChanged");
          return;
        }
        // Create My theme from the current built-in.
        const result = createMyTheme(theme, { ...resolved.look, ...lookPatch }, L("myTheme"));
        merged.customThemes = result.customs;
        setSettings(merged);
        setActiveTheme(result.created.id);
        setNotice("savedAsNew");
        return;
      }
      merged.customThemes = updateLook(customs, activeId, lookPatch);
    }
    if (Object.keys(merged).length > 0) setSettings(merged);
  };
  const full = light.style === "full";
  const sessionKey = sessionAt(new Date().getUTCHours(), s.sessionBounds);
  // The colour the cards are actually tinted with, resolved the same way the ambient layer resolves it.
  const cardTint = light.cardColor === "session" ? SESSION_TRIO[sessionKey].a
    : light.cardColor === "custom" ? light.cardSolid
      : (SWATCH[light.cardColor] ?? SWATCH.gold);
  const SESSION_NAME = { sessTK: t("sessTK"), sessLN: t("sessLN"), sessNY: t("sessNY"), sessSY: t("sessSY") } as const;

  // The swatches that are pictures of what a choice does rather than a colour you could name.
  const SESSION_SWATCH = "conic-gradient(#ffd84d 0 25%, #7fd4ff 0 50%, #ff5a6e 0 75%, #4dffa0 0)";

  // The choices that mean something, in the order they have always been in. Full colour has no moving set and takes
  // one colour rather than three, so those two are left out of its row.
  const bgSpecials: SpecialChoice[] = [
    { id: "gold", label: L("lightGold"), swatch: SWATCH.gold },
    { id: "session", label: L("lightSession"), swatch: SESSION_SWATCH },
  ];
  const cardSpecials: SpecialChoice[] = [
    // A picture of changing nothing, so it needs the card's own edge to be visible at all.
    { id: "theme", label: L("cardsTheme"), swatch: "var(--surface)", outline: true, ink: "var(--text)" },
    { id: "gold", label: L("lightGold"), swatch: SWATCH.gold },
    { id: "session", label: L("lightSession"), swatch: SESSION_SWATCH },
  ];

  // Under full colour "custom" has always meant one colour out of the field, which is what "solid" means now, so the
  // two are read as the same choice. SWATCH is handed over as the colours the fixed choices used to stand for, which
  // is how a setting saved before the palette existed still finds its swatch.
  const bgChoice = paletteChoice(
    full && light.color === "custom" ? "solid" : light.color,
    bgSpecials.map((c) => c.id), light.solid, SWATCH,
  );
  const cardChoice = paletteChoice(
    light.cardColor === "custom" ? "solid" : light.cardColor,
    cardSpecials.map((c) => c.id), light.cardSolid, SWATCH,
  );

  // Only a colour the customer reached for themselves is worth remembering; the twenty are always there anyway.
  const remember = (h: string, own: boolean) => (own ? { recentColors: pushRecent(light.recentColors, h) } : {});

  const lightTiles: ReactNode = (
    <>
      <Tile title={L("topLight")} wide>

        <Row label={L("lightStyle")}>
          <Pills<LightStyle>
            label={L("lightStyle")} value={light.style}
            onChange={(v) => setLight(v === "full" && light.color === "rgb" ? { style: v, color: "gold" } : { style: v })}
            options={[
              { v: "off", label: L("lightOff") }, { v: "full", label: L("lightFull") },
            ]}
          />
        </Row>

        {light.style !== "off" && (
          <Row label={L("lightColor")}>
            <ColorPalette
              label={L("lightColor")} text={L} specials={bgSpecials} choice={bgChoice}
              hex={light.solid} recent={light.recentColors}
              onSpecial={(id) => setLight({ color: id as LightColor })}
              onPick={(h, own) => setLight({ color: "solid", solid: h, ...remember(h, own) })}
            />
          </Row>
        )}

        {light.style !== "off" && light.color === "session" && (
          <div className="flex flex-col gap-2 rounded-2xl border border-border p-3">
            <span className="flex items-center gap-2 text-xs text-muted">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: SESSION_TRIO[sessionKey].a, boxShadow: `0 0 10px ${SESSION_TRIO[sessionKey].a}` }} />
              {L("lightSessionNow")} <b className="font-semibold text-text">{SESSION_NAME[sessionKey]}</b>
            </span>
            <Note text={L("lightSessionNote")} />
          </div>
        )}

        {light.style !== "off" && (
          <>
            <Note text={L("lightFullNote")} />
            <Row label={L("lightLevel")}>
              <span className="flex items-center gap-2">
                <input
                  type="range" min="20" max="100" step="5" value={light.level} aria-label={L("lightLevel")}
                  onChange={(e) => setLight({ level: Number(e.target.value) })}
                  className="w-40 cursor-pointer accent-[var(--primary)]"
                />
                <span className="tnum w-10 text-xs font-semibold" dir="ltr">{light.level}%</span>
              </span>
            </Row>
          </>
        )}
      </Tile>

      <Tile title={L("cards")}>
        <Note text={L("cardsSub")} />
        <Row label={L("lightColor")}>
          <ColorPalette
            label={L("cards")} text={L} specials={cardSpecials} choice={cardChoice}
            hex={light.cardSolid} recent={light.recentColors}
            onSpecial={(id) => setLight({ cardColor: id as CardColor })}
            onPick={(h, own) => setLight({ cardColor: "custom", cardSolid: h, ...remember(h, own) })}
          />
        </Row>

        {light.cardColor !== "theme" && (
          <>
            <Row label={L("lightLevel")}>
              <span className="flex items-center gap-2">
                <input
                  type="range" min="20" max="100" step="5" value={light.cardLevel} aria-label={L("lightLevel")}
                  onChange={(e) => setLight({ cardLevel: Number(e.target.value) })}
                  className="w-40 cursor-pointer accent-[var(--primary)]"
                />
                <span className="tnum w-10 text-xs font-semibold" dir="ltr">{light.cardLevel}%</span>
              </span>
            </Row>
            {/* What the guard actually allowed, so a bright colour settling low is explained rather than puzzling. */}
            {(() => { const cs = cardSurface(theme, cardTint, light.cardLevel); return (<>
              <Note text={L("cardsUsed").replace("{n}", String(Math.round(cs.mix * 100)))} />
              <Note text={L(cs.ink === "dark" ? "cardsInkDark" : "cardsInkLight")} />
            </>); })()}
          </>
        )}
      </Tile>

      <Tile title={L("tileIcons")}>
        <Row label={L("iconStyle")}>
          <Pills<IconStyle>
            label={L("iconStyle")} value={light.iconStyle}
            onChange={(v) => setLight({ iconStyle: v })}
            options={[{ v: "normal", label: L("iconStyleNormal") }, { v: "glass", label: L("iconStyleGlass") }]}
          />
        </Row>
        {light.iconStyle === "glass" && (
          <>
            <Row label={L("iconTransparency")}>
              <span className="flex items-center gap-2">
                <input
                  type="range" min="0" max={maxGlassTransparency(resolved.base)} step="5"
                  value={light.iconTransparency} aria-label={L("iconTransparency")}
                  onChange={(e) => setLight({ iconTransparency: Number(e.target.value) })}
                  className="w-40 cursor-pointer accent-[var(--primary)]"
                />
                <span className="tnum w-10 text-xs font-semibold" dir="ltr">{light.iconTransparency}%</span>
              </span>
            </Row>
            <Note text={L("iconGlassSub")} />
            <Note text={L("iconUsed").replace("{n}", String(100 - light.iconTransparency))} />
          </>
        )}
      </Tile>
    </>
  );

  const langTiles: ReactNode = (
    <>
      <Tile title={L("tileLanguage")}>
        <Row label={t("language")}>
          <Pills<Lang> label={t("language")} value={lang} onChange={onLang} options={languages.map((l) => ({ v: l.code, label: l.label }))} />
        </Row>
      </Tile>
      <Tile title={L("tileNumbers")}>
        <Row label={L("weekStart")} sub={L("weekStartSub")}>
          <Pills<WeekStart>
            label={L("weekStart")} value={s.weekStart} onChange={(v) => setSettings({ weekStart: v })}
            options={[{ v: "mon", label: L("monday") }, { v: "sun", label: L("sunday") }]}
          />
        </Row>
        <Row label={L("numberFormat")} sub={L("numberFormatSub")}>
          <Pills<NumberFormat>
            label={L("numberFormat")} value={s.numberFormat} onChange={(v) => setSettings({ numberFormat: v })}
            options={[{ v: "dot", label: "1,234.56" }, { v: "space", label: "1 234,56" }]}
          />
        </Row>
      </Tile>
    </>
  );

  const tradingTiles: ReactNode = (
    <>
      <Tile title={L("tileDashboard")}>
        <Row label={L("defaultAccount")} sub={L("defaultAccountSub")}>
          <select aria-label={L("defaultAccount")} className={field} value={s.defaultAccount} onChange={(e) => setSettings({ defaultAccount: e.target.value })}>
            <option value="all">{L("allAccounts")}</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Row>
      </Tile>
      <Tile title={L("tileSizeCalc")}>
        <Row label={L("riskPct")} sub={L("riskPctSub")}>
          <span className="flex items-center gap-1.5">
            <input
              aria-label={L("riskPct")} className="field !w-20 !py-1.5 text-sm" type="number" min="0.1" max="100" step="0.1" inputMode="decimal"
              value={s.riskPct} onChange={(e) => setSettings({ riskPct: e.target.value })}
            />
            <span className="text-xs font-semibold">%</span>
          </span>
        </Row>
        <Note text={L("riskTip")} tip />
      </Tile>
    </>
  );

  const clockPills = (value: BrokerClock["kind"], onChange: (k: BrokerClock["kind"]) => void, label: string) => (
    <Pills<BrokerClock["kind"]>
      label={label} value={value} onChange={onChange}
      options={[{ v: "none", label: L("clockNone") }, { v: "fixed", label: L("clockFixed") }, { v: "mt5", label: L("clockMt5") }]}
    />
  );

  const timeTiles: ReactNode = (
    <>
      <Tile title={L("tileDayHour")}>
        <Row label={L("dayStart")} sub={L("dayStartShort")}>
          <Pills<DayStart>
            label={L("dayStart")} value={s.dayStart} onChange={(v) => setSettings({ dayStart: v })}
            options={[{ v: "midnight", label: L("midnight") }, { v: "ny17", label: L("ny17") }]}
          />
        </Row>
        {s.dayStart === "ny17" ? <Note text={L("ny17Sub")} /> : <Note text={L("dateOnlyNote")} />}
        <Row label={L("brokerClock")} sub={L("brokerClockShort")}>
          <span className="flex flex-wrap items-center gap-2">
            {clockPills(s.brokerClock.kind, (v) => setSettings({ brokerClock: v === "fixed" ? { kind: "fixed", hours: 2 } : { kind: v } }), L("brokerClock"))}
            {s.brokerClock.kind === "fixed" && (
              <input
                aria-label={L("clockHours")} className="field !w-20 !py-1.5 text-sm" type="number" min="-12" max="14" step="1"
                value={s.brokerClock.hours}
                onChange={(e) => setSettings({ brokerClock: { kind: "fixed", hours: Number(e.target.value) || 0 } })}
              />
            )}
          </span>
        </Row>
      </Tile>

      {accounts.length > 0 && (
        <Tile title={L("tileOtherClock")}>
          <Note text={L("perAccountShort")} />
          <div className="flex flex-col gap-2.5">
            {accounts.map((a) => {
              const own = s.brokerByAccount[a.id];
              return (
                <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{a.name}</span>
                    <span className="block text-[11px] text-muted">{a.currency}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label={`${L("brokerClock")}: ${a.name}`} className={field} value={own?.kind ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        const next = { ...s.brokerByAccount };
                        if (!v) delete next[a.id];
                        else next[a.id] = v === "fixed" ? { kind: "fixed", hours: 2 } : { kind: v as "none" | "mt5" };
                        setSettings({ brokerByAccount: next });
                      }}
                    >
                      <option value="">{L("useDefault")}</option>
                      <option value="none">{L("clockNone")}</option>
                      <option value="fixed">{L("clockFixed")}</option>
                      <option value="mt5">{L("clockMt5")}</option>
                    </select>
                    {own?.kind === "fixed" && (
                      <input
                        aria-label={`${L("clockHours")}: ${a.name}`} className="field !w-20 !py-1.5 text-sm" type="number" min="-12" max="14" step="1"
                        value={own.hours}
                        onChange={(e) => setSettings({ brokerByAccount: { ...s.brokerByAccount, [a.id]: { kind: "fixed", hours: Number(e.target.value) || 0 } } })}
                      />
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </Tile>
      )}
    </>
  );

  const sessionTiles: ReactNode = (
    <Tile title={L("bounds")} wide>
      <Note text={L("boundsSub")} />
      <SessionRibbon
        bounds={s.sessionBounds}
        names={{ sessTK: t("sessTK"), sessLN: t("sessLN"), sessNY: t("sessNY"), sessSY: t("sessSY") }}
      />
      <div className="flex flex-wrap items-end gap-3">
        {([["boundTokyo", "tokyo"], ["boundLondon", "london"], ["boundNewYork", "newYork"]] as const).map(([key, f]) => (
          <label key={f} className="flex flex-col gap-1 text-[11px] font-medium text-muted">
            {L(key)}
            <input
              className="field !w-[70px] !py-1.5 text-sm" type="number" min="0" max="24" step="1" dir="ltr" value={s.sessionBounds[f]}
              /* Put back in order on the way in, so an invalid set is never stored. */
              onChange={(e) => setSettings({ sessionBounds: clampBounds({ ...s.sessionBounds, [f]: Number(e.target.value) }) })}
            />
          </label>
        ))}
        <button type="button" onClick={() => setSettings({ sessionBounds: DEFAULT_BOUNDS })} className={btnGhost}>
          {L("reset")}
        </button>
      </div>
      <Note text={L("boundsNote")} />
    </Tile>
  );

  // The examples are classified live, with the range as it stands, so the effect of a change is visible at once.
  const beExamples: { label: string; v: number }[] = [
    { label: L("beWon"), v: 0.6 },
    { label: L("beWon"), v: 3.2 },
    { label: L("beLost"), v: -0.4 },
  ];
  const outName = { win: L("outWin"), loss: L("outLoss"), be: L("outBe") };

  const resultTiles: ReactNode = (
    <>
      <Tile title={L("breakEven")}>
        <Row label={L("breakEven")} sub={L("breakEvenShort")}>
          <span className="flex items-center gap-1.5">
            <span className="text-sm font-semibold">±</span>
            <input
              aria-label={L("breakEven")} className="field !w-24 !py-1.5 text-sm" type="number" min="0" step="0.01" inputMode="decimal"
              value={s.breakEven} onChange={(e) => setSettings({ breakEven: Math.max(0, Number(e.target.value) || 0) })}
            />
          </span>
        </Row>
      </Tile>
      <Tile title={L("tileExample")}>
        <div className="flex flex-col gap-2">
          {beExamples.map((ex, i) => {
            const out = classifyOutcome(ex.v, { breakEven: s.breakEven });
            const tone = out === "win" ? "text-profit" : out === "loss" ? "text-loss" : "text-muted";
            return (
              <div key={i} className="flex items-center justify-between gap-2 rounded-2xl border border-border px-3 py-2 text-sm">
                <span className="text-muted">{ex.label}</span>
                <span className="tnum font-semibold" dir="ltr">{ex.v > 0 ? `+${ex.v.toFixed(2)}` : ex.v.toFixed(2)}</span>
                <span className={`text-xs font-bold ${tone}`}>{outName[out]}</span>
              </div>
            );
          })}
        </div>
        <Note text={L("beExampleNote").replace("{v}", String(s.breakEven || 0))} />
      </Tile>
    </>
  );

  const newsTiles: ReactNode = (
    <Tile title={L("tileNewsWindow")}>
      <Row label={L("newsWindow")} sub={L("newsWindowSub")}>
        <Pills<"15" | "30" | "60">
          label={L("newsWindow")} value={String(s.newsWindowMin) as "15" | "30" | "60"}
          onChange={(v) => setSettings({ newsWindowMin: Number(v) as 15 | 30 | 60 })}
          options={[{ v: "15", label: "15m" }, { v: "30", label: "30m" }, { v: "60", label: "60m" }]}
        />
      </Row>
      <Row label={L("newsCountMedium")} sub={L("newsCountMediumSub")}>
        <Lamp label={L("newsCountMedium")} on={s.newsCountMedium} onChange={(v) => setSettings({ newsCountMedium: v })} />
      </Row>
    </Tile>
  );

  const currencyTiles: ReactNode = (
    <>
      <Tile title={L("tileUnified")}>
        <Row label={L("unify")} sub={L("unifyShort")}>
          <Lamp label={L("unify")} on={s.unifyCurrency} onChange={(v) => setSettings({ unifyCurrency: v })} />
        </Row>
        <Row label={L("baseCurrency")}>
          <select aria-label={L("baseCurrency")} className={field} value={s.baseCurrency} onChange={(e) => setSettings({ baseCurrency: e.target.value })}>
            {baseOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Row>
        <Note text={L("ratesSent")} />
      </Tile>

      {s.unifyCurrency && (
        <Tile title={L("tileRates")}>
          <Note text={L("ratesSub").replace("{base}", s.baseCurrency)} />
          {s.ratesDate && <Note text={L("ratesAsOf").replace("{date}", s.ratesDate)} />}
          {fxMissing.length > 0 && (
            <p className="text-xs text-loss">
              {L("ratesMissing").replace("{codes}", fxMissing.map((c) => c || L("noCurrencyCode")).join(", "))}
            </p>
          )}
          <div className="flex flex-col gap-2.5">
            {needed.map((c) => (
              <div key={c} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted">{c || L("noCurrencyCode")}</span>
                <span className="flex items-center gap-2">
                  <input
                    aria-label={`${L("rates")}: ${c}`} className="field !w-28 !py-1.5 text-sm" type="number" min="0" step="0.0001" inputMode="decimal" dir="ltr"
                    value={s.rates[c] ?? ""}
                    onChange={(e) => {
                      const next = { ...s.rates };
                      const v = Number(e.target.value);
                      if (!e.target.value || !Number.isFinite(v) || v <= 0) delete next[c];
                      else next[c] = v;
                      setSettings({ rates: next });
                    }}
                  />
                  {!isFrankfurter(c) && <span className="text-[11px] text-muted">{L("ratesManual")}</span>}
                </span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {ratesNote && <span className="text-xs text-muted">{ratesNote}</span>}
            <button type="button" disabled={fetching} onClick={() => void updateRates()} className={`${btnGhost} flex items-center gap-2 disabled:opacity-60`}>
              <RefreshCw size={13} className={fetching ? "animate-spin text-icon" : "text-icon"} />
              {L("updateRates")}
            </button>
          </div>
        </Tile>
      )}
    </>
  );

  const goLink = () => { setSecId("telegram"); setTopId("link"); setPane((n) => n + 1); setPhone("telegram"); };

  const tgLinkTiles: ReactNode = <TgLink tg={tg} lang={lang} />;
  const tgAlertTiles: ReactNode = <TgAlerts tg={tg} lang={lang} onLink={goLink} onPreview={flash} />;
  const peopleTiles: ReactNode = <TgPeople tg={tg} lang={lang} onLink={goLink} />;

  const signInTiles: ReactNode = (
    <Tile title={L("tileDevices")}>
      <Row label={L("signOutAll")} sub={L("signOutAllShort")}>
        <button type="button" onClick={() => setAsking(true)} className={`${btnDanger} flex items-center gap-2`}>
          <LogOut size={15} />{L("signOutAll")}
        </button>
      </Row>
    </Tile>
  );

  const dataTiles: ReactNode = (
    <>
      <Tile title={L("tileExport")}>
        <Row label={L("exportCsv")} sub={L("exportShort")}>
          <span className="flex flex-wrap items-center gap-2">
            {accountSelect(exportAcc, setExportAcc, L("exportWhich"))}
            <button type="button" onClick={exportNow} className={btnGold}>{L("download")}</button>
          </span>
        </Row>
        {note && <p role="status" aria-live="polite" className="text-xs text-muted">{note}</p>}
      </Tile>
      <Tile title={L("tileSyncAccount")}>
        <Row label={L("mt5Keys")} sub={L("mt5KeysSub")}>
          <button type="button" onClick={onImport} className={btnGhost}>{L("openImport")}</button>
        </Row>
        <Row label={L("deleteAccount")} sub={L("deleteAccountSub")}>
          <button type="button" onClick={onProfile} className={btnGhost}>{L("openProfile")}</button>
        </Row>
      </Tile>
    </>
  );

  // ---------- the config: sections, then topics ----------
  const SECTIONS: Section[] = [
    {
      id: "display", label: L("secDisplay"), desc: L("secDisplayDesc"), icon: Monitor, topics: [
        { id: "look", label: L("topLook"), intro: L("topLookIntro"), tiles: look },
        { id: "lang", label: L("topLang"), intro: L("topLangIntro"), tiles: langTiles },
        { id: "light", label: L("topLight"), intro: L("topLightIntro"), tiles: lightTiles },
      ],
    },
    { id: "trading", label: L("secTrading"), desc: L("secTradingDesc"), icon: TrendingUp, intro: L("tradingIntro"), topics: [], tiles: tradingTiles },
    {
      id: "analysis", label: L("secAnalysis"), desc: L("secAnalysisDesc"), icon: Clock3, topics: [
        { id: "time", label: L("topTime"), intro: L("topTimeIntro"), tiles: timeTiles },
        { id: "sessions", label: L("topSessions"), intro: L("topSessionsIntro"), tiles: sessionTiles },
        { id: "results", label: L("topResults"), intro: L("topResultsIntro"), tiles: resultTiles },
        { id: "currency", label: L("topCurrency"), intro: L("topCurrencyIntro"), tiles: currencyTiles },
        { id: "news", label: L("topNews"), intro: L("topNewsIntro"), tiles: newsTiles },
      ],
    },
    {
      id: "telegram", label: L("secTelegram"), desc: L("secTelegramDesc"), icon: Send, topics: [
        { id: "link", label: L("topTgLink"), intro: L("topTgLinkIntro"), tiles: tgLinkTiles },
        { id: "alerts", label: L("topTgAlerts"), intro: L("topTgAlertsIntro"), tiles: tgAlertTiles },
      ],
    },
    {
      id: "security", label: L("secSecurity"), desc: L("secSecurityDesc"), icon: ShieldCheck, topics: [
        { id: "login", label: L("topSignIn"), intro: L("topSignInIntro"), tiles: signInTiles },
        { id: "people", label: L("topPeople"), intro: L("topPeopleIntro"), tiles: peopleTiles },
      ],
    },
    { id: "data", label: L("secData"), desc: L("secDataDesc"), icon: Database, intro: L("dataIntro"), topics: [], tiles: dataTiles },
  ];

  // ---------- navigation ----------

  // A later link in, while the page is already open.
  useEffect(() => {
    if (!start || !SECTION_IDS.includes(start.section)) return;
    setSecId(start.section);
    setTopId(start.topic ?? "");
    setPhone(start.section);
    setPane((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start]);

  const section = SECTIONS.find((x) => x.id === secId) ?? SECTIONS[0];
  const topic = section.topics.find((x) => x.id === topId) ?? section.topics[0] ?? null;
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const rtl = typeof document !== "undefined" && document.documentElement.dir === "rtl";

  const goSection = (id: string) => {
    if (id === secId) return;
    setSecId(id);
    setTopId("");
    setPane((n) => n + 1);
  };
  const goTopic = (id: string) => {
    if (id === topic?.id) return;
    setTopId(id);
    setPane((n) => n + 1);
  };

  const topicTabs = (scroll?: boolean) => (
    section.topics.length > 1 && (
      <div
        role="tablist" aria-label={section.label}
        className={`mz-glass flex gap-1 rounded-full p-1 ${scroll ? "overflow-x-auto" : "flex-wrap"}`}
      >
        {section.topics.map((x, i) => {
          const here = x.id === topic?.id;
          return (
            <button
              key={x.id} type="button" role="tab" aria-selected={here} aria-controls={`mz-panel-${x.id}`}
              id={`mz-tab-${x.id}`} tabIndex={here ? 0 : -1}
              ref={(el) => { tabs.current[i] = el; }}
              onClick={() => goTopic(x.id)}
              onKeyDown={(e) => {
                const back = e.key === "ArrowUp" || e.key === (rtl ? "ArrowRight" : "ArrowLeft");
                const fwd = e.key === "ArrowDown" || e.key === (rtl ? "ArrowLeft" : "ArrowRight");
                if (!back && !fwd) return;
                e.preventDefault();
                const to = (i + (fwd ? 1 : -1) + section.topics.length) % section.topics.length;
                goTopic(section.topics[to].id);
                tabs.current[to]?.focus();
              }}
              className={`min-h-[44px] shrink-0 rounded-full px-4 text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] ${here ? "bg-primary font-bold text-on-primary" : "font-medium text-muted hover:text-text"}`}
            >
              {x.label}
            </button>
          );
        })}
      </div>
    )
  );

  const intro = topic?.intro ?? section.intro ?? "";
  const body = (
    <div key={pane} id={topic ? `mz-panel-${topic.id}` : undefined} role={topic ? "tabpanel" : undefined}
      aria-labelledby={topic ? `mz-tab-${topic.id}` : undefined} className="mz-pane flex flex-col gap-4">
      {intro && (
        <p className="flex items-start gap-2 text-[13px] leading-relaxed text-muted">
          <span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
          {intro}
        </p>
      )}
      <div className={grid}>{topic ? topic.tiles : section.tiles}</div>
    </div>
  );

  return (
    <>
      {/* ---------- phone: a list of sections, then one section at a time ---------- */}
      <div className="flex flex-col gap-4 md:hidden">
        {phone === null ? (
          <>
            <header>
              <h1 className="font-heading text-2xl font-bold">{L("title")}</h1>
              <p className="mt-1 text-sm text-muted">{L("sub")}</p>
            </header>
            <nav aria-label={L("title")} className="mz-glass flex flex-col overflow-hidden rounded-3xl">
              {SECTIONS.map((x, i) => (
                <button
                  key={x.id} type="button" onClick={() => { setSecId(x.id); setTopId(""); setPhone(x.id); setPane((n) => n + 1); }}
                  className={`flex min-h-[64px] items-center gap-3 px-4 text-start transition hover:bg-primary-tint ${i ? "border-t border-border" : ""}`}
                >
                  <span className="mz-icon-tile grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-tint text-icon"><x.icon size={18} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{x.label}</span>
                    <span className="block truncate text-xs text-muted">{x.desc}</span>
                  </span>
                  {/* Points the way the reader travels: right in English, left in Arabic. */}
                  <ChevronRight size={16} className="shrink-0 text-muted rtl:rotate-180" />
                </button>
              ))}
            </nav>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPhone(null)} aria-label={L("back")} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border">
                <ChevronLeft size={18} className="rtl:rotate-180" />
              </button>
              <span className="min-w-0">
                <span className="block font-heading text-lg font-bold">{section.label}</span>
                <span className="block truncate text-xs text-muted">{section.desc}</span>
              </span>
            </div>
            {topicTabs(true)}
            {body}
          </>
        )}
      </div>

      {/* ---------- tablet and desktop: the dock across the top, then the content ---------- */}
      <div className="hidden flex-col gap-4 md:flex lg:h-[calc(100vh-6.5rem)] lg:overflow-hidden">
        <nav aria-label={L("title")} className="mz-glass flex shrink-0 gap-1 overflow-x-auto rounded-3xl p-2 lg:overflow-visible">
          {SECTIONS.map((x) => {
            const here = x.id === secId;
            return (
              <button
                key={x.id} type="button" aria-current={here ? "page" : undefined} onClick={() => goSection(x.id)}
                className={`flex min-h-[64px] w-[88px] shrink-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[11px] leading-tight transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] ${here ? "bg-primary-tint font-semibold text-primary" : "font-normal text-muted hover:text-text"}`}
              >
                <span className={`inline-flex items-center justify-center rounded-xl p-1${!here ? " mz-icon-tile" : ""}`}>
                  <x.icon size={19} />
                </span>
                <span className="w-full truncate text-center">{x.label}</span>
              </button>
            );
          })}
        </nav>

        {/* The phone fills the column phase A left for it, and only where there is a message to show. */}
        <div className="flex min-h-0 flex-1 gap-5">
          <div className="flex min-w-0 flex-1 flex-col gap-4 lg:min-h-0 lg:overflow-y-auto lg:pe-1 xl:max-w-[940px]">
            <header className="flex shrink-0 flex-wrap items-center gap-3">
              <span className="min-w-0 flex-1">
                <h1 className="font-heading text-xl font-bold">{section.label}</h1>
                <p className="mt-0.5 text-sm text-muted">{section.desc}</p>
              </span>
              {secId === "telegram" && <TgStatus tg={tg} lang={lang} />}
            </header>
            {topicTabs()}
            {body}
          </div>
          {secId === "telegram" && (
            <aside aria-label={L("previewPick")} className="hidden w-[272px] shrink-0 lg:min-h-0 lg:overflow-y-auto xl:block">
              <PhonePreview lang={lang} highlight={preview} />
            </aside>
          )}
        </div>
      </div>

      {deleting && (
        <div role="dialog" aria-modal="true" aria-label={L("resetMyThemeConfirm")} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5">
            <h2 className="font-heading text-lg font-semibold">{L("resetMyThemeConfirm")}</h2>
            <p className="mt-2 text-sm text-muted">{L("resetMyThemeBody")}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleting(false)} className={btnGhost}>{L("cancel")}</button>
              <button type="button" onClick={doResetMyTheme} className="min-h-[42px] rounded-full bg-loss px-4 text-[13.5px] font-semibold text-white">
                {L("resetMyTheme")}
              </button>
            </div>
          </div>
        </div>
      )}

      {asking && (
        <div role="dialog" aria-modal="true" aria-label={L("signOutAllConfirm")} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5">
            <h2 className="font-heading text-lg font-semibold">{L("signOutAllConfirm")}</h2>
            <p className="mt-2 text-sm text-muted">{L("signOutAllBody")}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setAsking(false)} className={btnGhost}>{L("cancel")}</button>
              <button type="button" disabled={busy} onClick={() => void signOutEverywhere()} className="min-h-[42px] rounded-full bg-loss px-4 text-[13.5px] font-semibold text-white disabled:opacity-60">
                {L("signOutAll")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
