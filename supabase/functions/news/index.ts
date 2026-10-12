// Supabase Edge Function "news": aggregates public RSS feeds from several outlets.
// Returns headline + short snippet + link to the original (never full articles).

type Cat = "forex" | "crypto" | "geopolitics" | "economy";
interface Feed { source: string; url: string; cat: Cat }
type Dir = "up" | "down" | "flat";
export interface Asset { sym: string; dir: Dir }
export interface Impact { level: "high" | "medium" | "low"; assets: Asset[] }
export interface Item { id: string; title: string; summary: string; url: string; sources: string[]; category: Cat; date: string; image?: string; impact: Impact }

const FEEDS: Feed[] = [
  { source: "FXStreet", url: "https://www.fxstreet.com/rss/news", cat: "forex" },
  { source: "Cointelegraph", url: "https://cointelegraph.com/rss", cat: "crypto" },
  { source: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/", cat: "crypto" },
  { source: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml", cat: "geopolitics" },
  { source: "BBC News", url: "https://feeds.bbci.co.uk/news/world/rss.xml", cat: "geopolitics" },
  { source: "Federal Reserve", url: "https://www.federalreserve.gov/feeds/press_all.xml", cat: "economy" },
  { source: "ECB", url: "https://www.ecb.europa.eu/rss/press.xml", cat: "economy" },
];

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

const ents = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&amp;/g, "&");

// Feeds often entity-encode their HTML: unwrap CDATA, decode, strip tags, decode again.
const decode = (s: string) =>
  ents(ents(s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

const tag = (block: string, name: string) => {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1] : "";
};


// ---------- Automatic impact estimate (keyword rules, NOT a trading signal) ----------
const UP = /\b(rises?|rising|rose|climb\w*|gain\w*|rall(?:y|ies|ied)|surg\w*|jump\w*|soar\w*|advanc\w*|rebound\w*|record high|higher|strengthen\w*|bullish|recover\w*|inflows?|approv\w*|spik\w*|extends? gains)\b/i;
const DOWN = /\b(falls?|fell|fallen|drop\w*|slid\w*|slip\w*|declin\w*|tumbl\w*|plung\w*|sink\w*|slump\w*|lower|weaken\w*|bearish|retreat\w*|loses?|lost|losses|crash\w*|dips?|dipped|hack\w*|ban(?:s|ned)?|outflows?|sell-?off)\b/i;

const count = (re: RegExp, t: string) => (t.match(new RegExp(re.source, "gi")) ?? []).length;
const sentiment = (t: string): Dir => {
  const u = count(UP, t), d = count(DOWN, t);
  return u > d ? "up" : d > u ? "down" : "flat";
};
/** Sentiment of the words right around a mention; falls back to the whole headline. */
const near = (text: string, re: RegExp, fallback: string): Dir => {
  const m = re.exec(text);
  if (!m) return sentiment(fallback);
  const after = text.slice(m.index, m.index + m[0].length + 34);
  const d = sentiment(after);
  return d !== "flat" ? d : sentiment(fallback);
};

const CCY: [RegExp, string][] = [
  [/\b(aussie|australian dollar|aud)\b/i, "AUD"], [/\b(euro|eur)\b/i, "EUR"], [/\b(sterling|pound|gbp|cable)\b/i, "GBP"],
  [/\b(yen|jpy)\b/i, "JPY"], [/\b(loonie|canadian dollar|cad)\b/i, "CAD"], [/\b(swiss franc|chf)\b/i, "CHF"],
  [/\b(kiwi|nzd)\b/i, "NZD"], [/\b(yuan|renminbi|cny)\b/i, "CNY"],
];
const ISO = new Set("USD EUR GBP JPY AUD CAD CHF NZD CNY".split(" "));

const HIGH = /\b(war|invasion|invad\w+|missiles?|airstrikes?|nuclear|sanctions?|embargo|default|bankrupt\w*|collapse[sd]?|flash crash|emergency|exploit(?:ed)?|hack(?:ed|s)?|rate (?:hike|cut)s?|(?:raises?|cuts?|hikes?|slash\w*) (?:interest )?rates?|fomc|interest rate decision|monetary policy decision|blockade|hormuz|coup|escalat\w+|liquidations?|tariffs?|market turmoil)\b/i;
const MEDIUM = /\b(inflation|cpi|ppi|payrolls?|nfp|jobs report|unemployment|gdp|pmi|retail sales|yields?|opec|oil|crude|etf|sec|regulat\w+|central bank|fed|ecb|boj|boe|powell|lagarde|treasury|ceasefire|talks|summit|election|bitcoin|ethereum|gold)\b/i;

const ESCALATE = /\b(war|missiles?|airstrikes?|attack\w*|escalat\w+|tensions?|conflict|invasion|strikes?|blockade|hormuz|sanctions?)\b/i;
const PEACE = /\b(ceasefire|cease-fire|peace deal|truce|de-escalat\w+|talks resume|agreement reached)\b/i;
const HAWK = /\b(hike|hikes|hiking|hawkish|higher for longer|strong jobs|hot inflation|stronger dollar|yields? (?:rise|jump|climb)\w*|raises? rates?)\b/i;
const DOVE = /\b(rate cuts?|cuts? rates?|dovish|pause|paus\w+|weak jobs|softer inflation|cooling inflation|weaker dollar|easing|slash\w* rates?)\b/i;
const MIDEAST = /\b(iran|iraq|israel|gaza|hormuz|saudi|houthi|red sea|russia|ukraine|opec)\b/i;

export function analyze(title: string, summary: string, source: string): Impact {
  const text = `${title}. ${summary}`;
  const assets: Asset[] = [];
  const add = (sym: string, dir: Dir) => { if (!assets.some((a) => a.sym === sym)) assets.push({ sym, dir }); };

  // explicit pairs like EUR/USD
  for (const m of title.matchAll(/\b([A-Z]{3})\/([A-Z]{3})\b/g)) if (ISO.has(m[1]) && ISO.has(m[2])) add(`${m[1]}/${m[2]}`, near(title, new RegExp(m[0]), text));
  if (/\b(bitcoin|btc)\b/i.test(text)) add("BTC", near(title, /\b(bitcoin|btc)\b/i, text));
  if (/\b(ethereum|ether|eth)\b/i.test(text)) add("ETH", near(title, /\b(ethereum|ether|eth)\b/i, text));
  if (assets.length === 0 && /\b(crypto|altcoins?|stablecoins?|defi)\b/i.test(text)) add("Crypto", near(title, /\b(crypto|altcoins?|stablecoins?|defi)\b/i, text));
  if (/\b(gold|xau|bullion)\b/i.test(text)) add("XAU", near(title, /\b(gold|xau|bullion)\b/i, text));
  if (/\b(oil|crude|brent|wti)\b/i.test(text)) add("OIL", near(title, /\b(oil|crude|brent|wti)\b/i, text));

  const macroHawk = HAWK.test(text), macroDove = DOVE.test(text);
  if (/\b(fed|federal reserve|fomc|powell|dollar|usd|greenback|treasury)\b/i.test(text) && !assets.some((a) => a.sym.includes("USD"))) {
    const d: Dir = macroHawk && !macroDove ? "up" : macroDove && !macroHawk ? "down" : near(title, /\b(dollar|usd|greenback)\b/i, "");
    add("USD", d);
  }
  for (const [re, sym] of CCY) if (re.test(text) && !assets.some((a) => a.sym.includes(sym))) add(sym, near(title, re, text));

  // Implicit effects of big macro / geopolitical stories (only when not already named)
  const escalate = ESCALATE.test(text), peace = PEACE.test(text);
  if (!assets.some((a) => a.sym === "XAU") && (escalate || peace || macroHawk || macroDove)) {
    const up = (escalate && !peace) || (macroDove && !macroHawk);
    const down = peace || (macroHawk && !macroDove);
    if (up !== down) add("XAU", up ? "up" : "down");
  }
  if (!assets.some((a) => a.sym === "OIL") && MIDEAST.test(text) && (escalate || peace)) add("OIL", peace && !escalate ? "down" : "up");

  let level: Impact["level"] = HIGH.test(text) ? "high" : MEDIUM.test(text) ? "medium" : "low";
  if ((source === "Federal Reserve" || source === "ECB") && level === "low") level = "medium";
  if (level === "high" && assets.length === 0) level = "medium";
  return { level, assets: assets.slice(0, 4) };
}

const imageOf = (b: string, base: string): string | undefined => {
  const raw =
    b.match(/<media:content[^>]+url=["']([^"']+)["']/i)?.[1] ??
    b.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i)?.[1] ??
    b.match(/<enclosure[^>]+type=["']image\/[^"']*["'][^>]*url=["']([^"']+)["']/i)?.[1] ??
    b.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]*type=["']image\//i)?.[1] ??
    b.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] ??
    b.match(/&lt;img[^&]+src=["']([^"']+)["']/i)?.[1];
  if (!raw) return undefined;
  try {
    const u = new URL(raw.replace(/&amp;/g, "&"), base).href;
    return u.startsWith("https://") ? u : undefined;
  } catch {
    return undefined;
  }
};

export function parseRss(xml: string, feed: Feed): Item[] {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  const out: Item[] = [];
  for (const b of blocks.slice(0, 30)) {
    const title = decode(tag(b, "title"));
    let link = decode(tag(b, "link")) || (b.match(/<link[^>]+href="([^"]+)"/i)?.[1] ?? "");
    if (link.startsWith("/")) link = new URL(link, feed.url).href;
    const d = new Date(decode(tag(b, "pubDate")) || decode(tag(b, "updated")) || decode(tag(b, "dc:date")));
    if (!title || !/^https?:\/\//.test(link) || isNaN(+d)) continue;
    const summary = decode(tag(b, "description") || tag(b, "summary")).slice(0, 240);
    const sm = summary === title ? "" : summary;
    out.push({ id: link, title, summary: sm, url: link, sources: [feed.source], category: feed.cat, date: d.toISOString(), image: imageOf(b, feed.url), impact: analyze(title, sm, feed.source) });
  }
  return out;
}

const STOP = new Set("the a an of to in on for and as at by with from is are be its it after over says say new".split(" "));
const words = (t: string) => new Set(t.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
const sim = (a: Set<string>, b: Set<string>) => {
  let i = 0;
  for (const w of a) if (b.has(w)) i++;
  return i / Math.max(1, Math.min(a.size, b.size));
};

/** Merge near-duplicate stories from different outlets, listing every source that reported it. */
export function merge(items: Item[]): Item[] {
  const sorted = [...items].sort((a, b) => +new Date(b.date) - +new Date(a.date));
  const out: { it: Item; w: Set<string> }[] = [];
  for (const it of sorted) {
    const w = words(it.title);
    const hit = out.find((o) => o.it.category === it.category && w.size >= 4 && sim(w, o.w) >= 0.7 && Math.abs(+new Date(o.it.date) - +new Date(it.date)) < 36e5 * 36);
    if (hit) {
      for (const s of it.sources) if (!hit.it.sources.includes(s)) hit.it.sources.push(s);
      if (!hit.it.image && it.image) hit.it.image = it.image;
    } else out.push({ it, w });
  }
  return out.map((o) => o.it);
}


// ---------- Economic calendar (public weekly JSON feed) ----------
export interface CalEvent { id: string; time: string; currency: string; title: string; impact: "high" | "medium" | "low" | "none" | "holiday"; previous: string; forecast: string; actual: string }
const CAL_URLS = ["https://nfs.faireconomy.media/ff_calendar_thisweek.json", "https://nfs.faireconomy.media/ff_calendar_nextweek.json"];
let calCache: { at: number; events: CalEvent[]; ok: boolean } | null = null;

export function normalizeCal(rows: unknown): CalEvent[] {
  if (!Array.isArray(rows)) return [];
  const out: CalEvent[] = [];
  for (const r of rows as Record<string, unknown>[]) {
    const d = new Date(String(r.date ?? ""));
    const title = String(r.title ?? "").trim();
    const cur = String(r.country ?? "").trim().toUpperCase();
    if (!title || isNaN(+d) || !/^[A-Z]{2,4}$/.test(cur)) continue;
    const imp = String(r.impact ?? "").toLowerCase();
    const impact = imp === "high" || imp === "medium" || imp === "low" || imp === "holiday" ? imp : "none";
    out.push({
      id: `${d.toISOString()}|${cur}|${title}`, time: d.toISOString(), currency: cur, title, impact,
      previous: String(r.previous ?? ""), forecast: String(r.forecast ?? ""), actual: String(r.actual ?? ""),
    });
  }
  return out;
}

async function loadCalendar() {
  if (calCache && Date.now() - calCache.at < 15 * 60_000) return calCache;
  const parts = await Promise.all(
    CAL_URLS.map(async (u) => {
      try {
        const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0 (compatible; MizanCalendar/1.0)" }, signal: AbortSignal.timeout(8000) });
        if (!r.ok) throw new Error(String(r.status));
        return { ok: true, ev: normalizeCal(await r.json()) };
      } catch {
        return { ok: false, ev: [] as CalEvent[] };
      }
    }),
  );
  const events = parts.flatMap((p) => p.ev).sort((a, b) => +new Date(a.time) - +new Date(b.time));
  // Keep the last good data if a refresh fails entirely.
  calCache = events.length || !calCache ? { at: Date.now(), events, ok: parts.some((p) => p.ok) } : { ...calCache, at: Date.now() - 10 * 60_000 };
  return calCache;
}

let cache: { at: number; items: Item[]; failed: string[] } | null = null;

async function load() {
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache;
  const failed: string[] = [];
  const results = await Promise.all(
    FEEDS.map(async (f) => {
      try {
        const r = await fetch(f.url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; MizanNews/1.0)" }, signal: AbortSignal.timeout(8000) });
        if (!r.ok) throw new Error(String(r.status));
        return parseRss(await r.text(), f);
      } catch {
        failed.push(f.source);
        return [];
      }
    }),
  );
  const items = merge(results.flat()).slice(0, 200);
  cache = { at: Date.now(), items, failed };
  return cache;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  let type = "news";
  try {
    if (req.method === "POST") type = (await req.json())?.type ?? "news";
  } catch { /* no body */ }
  if (type === "calendar") {
    const { events, ok, at } = await loadCalendar();
    return new Response(JSON.stringify({ events, ok, updated: new Date(at).toISOString() }), {
      headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
    });
  }
  const { items, failed, at } = await load();
  return new Response(JSON.stringify({ items, failed, updated: new Date(at).toISOString(), sources: FEEDS.map((f) => f.source) }), {
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
  });
});
