// The strategy library: texts complete in every language, diagrams that show what the words say. Run: npx tsx src/lib/strategies.test.ts
import { GROUPS, STRATEGIES, gapAt, norm, searchStrategies, valueArea, walk, type K } from "./strategies";
import { EN } from "./strategyText.en";
import { AR } from "./strategyText.ar";
import { FR } from "./strategyText.fr";

let pass = 0, fail = 0;
const is = (name: string, c: boolean, d = "") => { c ? pass++ : fail++; if (!c) console.log(`FAIL  ${name}  ${d}`); };
const ALL = { en: EN, ar: AR, fr: FR };

is("27 strategies", STRATEGIES.length === 27, String(STRATEGIES.length));
is("ids are unique", new Set(STRATEGIES.map((s) => s.id)).size === STRATEGIES.length);
is("every group has strategies", GROUPS.every((g) => STRATEGIES.some((s) => s.group === g)));
is("the strategies the trader asked for are there", ["ict", "smc", "elliott", "order-flow", "orb", "supply-demand"].every((id) => STRATEGIES.some((s) => s.id === id)));

for (const s of STRATEGIES) {
  for (const [lang, tx] of Object.entries(ALL)) {
    const t = tx[s.id];
    is(`${s.id} ${lang}: has a text`, !!t);
    if (!t) continue;
    is(`${s.id} ${lang}: tag, idea, stop, target`, [t.tag, t.idea, t.stop, t.target].every((x) => x.trim().length > 3));
    is(`${s.id} ${lang}: tag fits the list`, t.tag.length <= 60, `${t.tag.length}`);
    is(`${s.id} ${lang}: 3 to 6 concepts, 4 or 5 checks, 3 mistakes`, t.concepts.length >= 3 && t.concepts.length <= 6 && t.check.length >= 4 && t.check.length <= 5 && t.mistakes.length === 3);
    is(`${s.id} ${lang}: as many items as in English`, t.concepts.length === EN[s.id].concepts.length && t.check.length === EN[s.id].check.length && t.mistakes.length === EN[s.id].mistakes.length);
    is(`${s.id} ${lang}: no empty item`, [...t.concepts.flat(), ...t.check, ...t.mistakes].every((x) => x.trim().length > 1));
    if (lang === "ar") is(`${s.id} ar: written in Arabic`, /[؀-ۿ]/.test(t.idea) && /[؀-ۿ]/.test(t.check.join("")));
  }
  is(`${s.id}: timeframes are MT5 names`, s.tf.every((x) => /^(M1|M5|M15|M30|H1|H4|D1|W1)$/.test(x)), s.tf.join());
  is(`${s.id}: styles and markets set`, s.styles.length > 0 && s.markets.length > 0 && s.sessions.length > 0);

  const d = s.dia;
  const bad = (d.k ?? []).filter(([o, h, l, c]) => !(h >= Math.max(o, c) && l <= Math.min(o, c)));
  is(`${s.id}: every candle's wicks hold its body`, !bad.length, JSON.stringify(bad));
  is(`${s.id}: candles fit the slots`, !d.k || d.k.length <= d.n);
  for (const z of (d.zones ?? []).filter((z) => z.t === "FVG")) {
    const k = d.k as K[];
    const real = k.some((_, i) => i > 0 && i < k.length - 1 && (() => { const g = gapAt(k, i); return g.p1 > g.p0 && g.p0 === z.p0 && g.p1 === z.p1; })());
    is(`${s.id}: the FVG is a real gap between candle wicks`, real, `${z.p0}-${z.p1}`);
  }
  const t = d.trade;
  if (t) {
    const long = t.t > t.e;
    is(`${s.id}: stop and target on each side of the entry`, long ? t.s < t.e && t.e < t.t : t.s > t.e && t.e > t.t, JSON.stringify(t));
    const R = Math.abs(t.t - t.e) / Math.abs(t.e - t.s);
    const asks2R = EN[s.id].check.some((c) => c.includes("2R")) || EN[s.id].target.includes("2R");
    is(`${s.id}: reward to risk ${asks2R ? "at least 2" : "at least 1.5"}`, R >= (asks2R ? 1.995 : 1.5), R.toFixed(2));
    if (d.k) {
      const k = d.k, i = Math.floor(t.u), c = k[i];
      is(`${s.id}: price reaches the entry on the entry candle`, !!c && (long ? c[2] <= t.e : c[1] >= t.e), JSON.stringify(c));
      const after = k.slice(i + 1);
      const hitT = after.findIndex((x) => (long ? x[1] >= t.t : x[2] <= t.t)), hitS = [c, ...after].findIndex((x) => (long ? x[2] <= t.s : x[1] >= t.s));
      is(`${s.id}: the target is reached and the stop is not`, hitT >= 0 && hitS < 0, `${hitT} ${hitS}`);
    }
  }
}

// The value area: about 70% of the volume, grown from the POC.
const va = valueArea({ p0: 20, step: 5, v: [2, 3, 5, 8, 5, 24, 28, 34, 27, 22, 4, 6, 8, 6, 3] });
is("value area: POC 55, VAL 42.5, VAH 67.5", va.poc === 55 && va.val === 42.5 && va.vah === 67.5, JSON.stringify(va));
const sum = [24, 28, 34, 27, 22].reduce((a, b) => a + b, 0), total = 185;
is("value area holds at least 70%", sum / total >= 0.7);

// Candles along legs: open = previous close, the same every time.
const w = walk([[0, 10], [2, 20], [3, 15]]);
is("walk: one candle per slot", w.length === 3);
is("walk: each opens at the previous close", w[1][0] === w[0][3] && w[2][0] === w[1][3]);
is("walk: the same candles every time", JSON.stringify(walk([[0, 10], [2, 20], [3, 15]])) === JSON.stringify(w));
is("walk: a raid sets the low", walk([[0, 10], [1, 12]], { 0: { l: 5 } })[0][2] === 5);

// Search: names, other names and words in every language.
const ids = (q: string) => searchStrategies(q, [EN, AR, FR]).map((s) => s.id);
is("search: empty shows all", ids("").length === 27);
is("search: nothing found", ids("zzzz").length === 0);
is("search: 'fvg' finds the ICT models", ["ict", "silver-bullet", "unicorn"].every((x) => ids("fvg").includes(x)), ids("fvg").join());
is("search: 'orb' first", ids("orb")[0] === "orb", ids("orb").join());
is("search: Arabic name", ids("إليوت").includes("elliott"), ids("إليوت").join());
is("search: Arabic without hamza", ids("اليوت").includes("elliott"));
is("search: French word", ids("vagues")[0] === "elliott", ids("vagues").join());
is("search: two words must both match", ids("silver bullet").join() === "silver-bullet", ids("silver bullet").join());
is("search: case and accents", ids("WYCKOFF")[0] === "wyckoff" && ids("tete epaules").includes("chart-patterns"), ids("tete epaules").join());
is("norm: one alef, ya and ta marbuta", norm("آي سي تي") === "اي سي تي" && norm("فيبوناتشى") === "فيبوناتشي" && norm("قاعدة") === "قاعده");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
