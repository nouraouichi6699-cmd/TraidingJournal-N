// Supabase Edge Function "news": aggregates public RSS feeds from several outlets.
// Returns headline + short snippet + link to the original (never full articles).

type Cat = "forex" | "crypto" | "geopolitics" | "economy";
interface Feed { source: string; url: string; cat: Cat }
export interface Item { id: string; title: string; summary: string; url: string; sources: string[]; category: Cat; date: string }

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
    out.push({ id: link, title, summary: summary === title ? "" : summary, url: link, sources: [feed.source], category: feed.cat, date: d.toISOString() });
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
    } else out.push({ it, w });
  }
  return out.map((o) => o.it);
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
  const { items, failed, at } = await load();
  return new Response(JSON.stringify({ items, failed, updated: new Date(at).toISOString(), sources: FEEDS.map((f) => f.source) }), {
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
  });
});
