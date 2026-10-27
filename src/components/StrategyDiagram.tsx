// A strategy's picture, drawn from its data: candles or a swing path, then the zones, levels and marks as price gets
// to them, and the trade last. Time runs left to right in every language; words starting with "@" are translated.
import { useLayoutEffect, useRef, useState } from "react";
import type { Diagram, Tone } from "../lib/strategies";

const PL = 8, PR = 54, PT = 16, PB = 10;
const UP = "#22c55e", DOWN = "#f87171";
const KS = 60;     // ms between two candles
const LD = 1500;   // ms to draw a swing path
const COLOR: Record<Tone, string> = { gold: "var(--icon)", muted: "var(--muted)", demand: UP, supply: DOWN, gap: "var(--icon)", range: "var(--muted)" };
const FILL: Record<Tone, number> = { gold: 0.3, muted: 0.1, demand: 0.13, supply: 0.12, gap: 0.17, range: 0.1 };

type Side = { y: number; t: string; c: string; ms: number };

export default function StrategyDiagram({ d, words, label }: { d: Diagram; words: Record<string, string>; label: string }) {
  // On a narrow screen the drawing gets fewer units across and bigger letters, so the words stay readable.
  const wrap = useRef<HTMLDivElement>(null), [narrow, setNarrow] = useState(false);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setNarrow(e.contentRect.width < 420));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const W = narrow ? 272 : 360, H = narrow ? 184 : 190, fs = narrow ? 1.15 : 1;
  // Prices shown: the diagram's own range, else everything it draws with a little room around.
  const ps: number[] = [];
  d.k?.forEach((c) => ps.push(c[1], c[2]));
  if (d.big) ps.push(d.big[1], d.big[2]);
  [d.line, d.line2, ...(d.curves ?? []).map((c) => c.pts), ...(d.tri ?? [])].forEach((l) => l?.forEach((q) => ps.push(q[1])));
  d.zones?.forEach((z) => ps.push(z.p0, z.p1));
  d.lv?.forEach((l) => ps.push(l.p));
  d.tx?.forEach((m) => ps.push(m.p));
  d.segs?.forEach((g) => ps.push(g.a[1], g.b[1]));
  if (d.profile) ps.push(d.profile.p0 - d.profile.step / 2, d.profile.p0 + (d.profile.v.length - 0.5) * d.profile.step);
  if (d.trade) ps.push(d.trade.e, d.trade.s, d.trade.t);
  const mn = Math.min(...ps), mx = Math.max(...ps), pad = (mx - mn) * 0.05;
  const [lo, hi] = d.rng ?? [mn - pad, mx + pad];
  const pw = W - PL - PR, bottom = d.delta ? H - PB - 40 : H - PB, ph = bottom - PT;
  const X = (u: number) => PL + (u / d.n) * pw;
  const Y = (p: number) => PT + ((hi - p) / (hi - lo)) * ph;
  const say = (t: string) => t.replace(/@(\w+)/g, (_, w: string) => words[w] ?? w);
  const step = pw / d.n, bw = Math.max(3, Math.min(22, step * 0.62));

  // When does price reach slot u? Candles come one by one; a path is drawn at an even speed along its length.
  const pts = d.line?.map(([u, p]) => [X(u), Y(p)] as const) ?? [];
  const lens = pts.map((_, i) => (i ? Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) : 0));
  const total = lens.reduce((a, b) => a + b, 0) || 1;
  const reach = (u: number): number => {
    if (d.k) return Math.min(u, d.k.length) * KS + 150;
    if (!pts.length) return 0;
    const x = X(u);
    let run = 0;
    for (let i = 1; i < pts.length; i++) {
      if (pts[i][0] >= x) return ((run + lens[i] * Math.max(0, Math.min(1, (x - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0] || 1)))) / total) * LD + 120;
      run += lens[i];
    }
    return LD + 120;
  };
  const end = d.k ? d.k.length * KS + 150 : LD + 120;
  const ms = (u?: number) => Math.round(u == null ? end : reach(u));
  const at = (u?: number) => ({ animationDelay: `${ms(u)}ms` });

  // Labels in the right margin, pushed apart so none overlap.
  const side: Side[] = [];
  const toSide = (p: number, t: string, c: string, delay: number) => side.push({ y: Y(p) + 3, t, c, ms: delay });
  (d.lv ?? []).forEach((l) => l.t && l.lu == null && (l.u1 == null || l.u1 >= d.n) && toSide(l.p, say(l.t), l.tone ? COLOR[l.tone] : "var(--muted)", ms(l.at)));
  (d.curves ?? []).forEach((c) => c.t && toSide(c.pts[c.pts.length - 1][1], c.t, COLOR[c.tone], ms(0)));
  const tr = d.trade, trEnd = tr && (tr.u1 == null || tr.u1 >= d.n);
  if (tr && trEnd) { toSide(tr.t, "TP", UP, ms(tr.u)); toSide(tr.e, say("@entry"), "var(--text)", ms(tr.u)); toSide(tr.s, "SL", DOWN, ms(tr.u)); }
  side.sort((a, b) => a.y - b.y).forEach((s, i, a) => { if (i && s.y - a[i - 1].y < 9 * fs) s.y = a[i - 1].y + 9 * fs; });
  const over = side.length ? side[side.length - 1].y - (bottom + 2) : 0;
  if (over > 0) side.forEach((s) => (s.y -= over));

  // A level's label inside the chart: under a low, over a high (judged by where price was where the line starts).
  const priceAt = (u: number) => {
    const c = d.k?.[Math.max(0, Math.min((d.k?.length ?? 1) - 1, Math.floor(u)))];
    if (c) return (c[0] + c[3]) / 2;
    const L = d.line ?? [];
    for (let i = 1; i < L.length; i++) if (L[i][0] >= u) return L[i - 1][1] + ((L[i][1] - L[i - 1][1]) * (u - L[i - 1][0])) / (L[i][0] - L[i - 1][0] || 1);
    return 50;
  };

  const va = d.profile && (() => {
    const v = d.profile.v, max = Math.max(...v), tot = v.reduce((a, b) => a + b, 0), poc = v.indexOf(max);
    let a = poc, b = poc, sum = v[poc];
    while (sum < tot * 0.7) { const dn = a > 0 ? v[a - 1] : -1, up = b < v.length - 1 ? v[b + 1] : -1; if (up >= dn) sum += v[++b]; else sum += v[--a]; }
    return { max, poc, a, b };
  })();
  const dMax = d.delta ? Math.max(...d.delta.map(Math.abs)) : 1, dMid = bottom + 22;

  return (
    <div ref={wrap}>
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full select-none" direction="ltr" role="img" aria-label={label} style={{ fontFamily: "Inter, 'IBM Plex Sans Arabic', system-ui, sans-serif" }}>
      {(d.bands ?? []).map((b, i) => (
        <g key={`b${i}`} className="sd-o" style={at(0)}>
          <rect x={X(b.u0)} y={PT - 2} width={X(b.u1) - X(b.u0)} height={bottom - PT + 2} fill="var(--text)" opacity={i % 2 ? 0.025 : 0.05} />
          <text x={X(b.u0) + 3} y={10} fontSize={8 * fs} fill="var(--muted)">{say(b.t)}</text>
        </g>
      ))}
      {(d.vlines ?? []).map((v, i) => (
        <g key={`v${i}`} className="sd-o" style={at(v.u)}>
          <line x1={X(v.u)} x2={X(v.u)} y1={PT - 4} y2={bottom} stroke="var(--icon)" strokeWidth={1} strokeDasharray="3 3" />
          <text x={X(v.u) + 3} y={10} fontSize={8 * fs} fontWeight={600} fill="var(--icon)">{say(v.t)}</text>
        </g>
      ))}
      {d.split != null && <line x1={PL} x2={X(d.n)} y1={Y(d.split)} y2={Y(d.split)} stroke="var(--border)" strokeWidth={1} />}
      {(d.zones ?? []).map((z, i) => {
        const y0 = Y(Math.max(z.p0, z.p1)), h = Math.abs(Y(z.p0) - Y(z.p1));
        return (
          <g key={`z${i}`} className="sd-o" style={at(z.at)}>
            <rect x={X(z.u0)} y={y0} width={X(z.u1) - X(z.u0)} height={h} fill={COLOR[z.tone]} fillOpacity={FILL[z.tone]} stroke={COLOR[z.tone]} strokeOpacity={0.45} strokeWidth={0.8} rx={1.5} />
          </g>
        );
      })}
      {d.profile && va && d.profile.v.map((v, i) => {
        const p = d.profile!.p0 + i * d.profile!.step, len = (v / va.max) * pw * 0.3, y = Y(p + d.profile!.step / 2) + 0.7;
        return <rect key={`p${i}`} className="sd-o" style={at(0)} x={X(d.n) - len} y={y} width={len} height={Math.max(1, Y(p - d.profile!.step / 2) - y - 1.4)} rx={1}
          fill={i === va.poc ? "var(--icon)" : "var(--muted)"} fillOpacity={i === va.poc ? 0.8 : i >= va.a && i <= va.b ? 0.38 : 0.16} />;
      })}
      {(d.lv ?? []).map((l, i) => {
        const u0 = l.u0 ?? 0, u1 = l.u1 ?? d.n, c = l.tone ? COLOR[l.tone] : "var(--muted)", inside = l.t && (l.lu != null || u1 < d.n);
        const below = l.below ?? priceAt(u0) >= l.p, lx = l.lu ?? u0;
        return (
          <g key={`l${i}`} className="sd-o" style={at(l.at)}>
            <line x1={X(u0)} x2={X(u1)} y1={Y(l.p)} y2={Y(l.p)} stroke={c} strokeWidth={l.tone === "gold" ? 1.3 : 1} strokeDasharray={l.tone === "gold" ? undefined : "4 3"} />
            {inside && <text x={X(lx) + 2} y={below ? Y(l.p) + 10 * fs : Y(l.p) - 3} fontSize={8 * fs} fontWeight={600} fill={c}>{say(l.t!)}</text>}
          </g>
        );
      })}
      {(d.tri ?? []).map((t, i) => (
        <polygon key={`t${i}`} className="sd-o" style={at(t[t.length - 1][0])} points={t.map(([u, p]) => `${X(u)},${Y(p)}`).join(" ")} fill="var(--icon)" fillOpacity={0.1} stroke="var(--icon)" strokeOpacity={0.3} strokeWidth={0.8} />
      ))}
      {(d.curves ?? []).map((c, i) => (
        <polyline key={`c${i}`} className="sd-o" style={at(0)} points={c.pts.map(([u, p]) => `${X(u)},${Y(p)}`).join(" ")} fill="none" stroke={COLOR[c.tone]} strokeWidth={c.tone === "gold" ? 1.8 : 1} strokeDasharray={c.dash ? "3 3" : undefined} strokeLinejoin="round" strokeLinecap="round" />
      ))}
      {tr && (() => {
        const x0 = X(tr.u), x1 = X(tr.u1 ?? d.n);
        return (
          <g className="sd-o" style={at(tr.u)}>
            <rect x={x0} y={Math.min(Y(tr.e), Y(tr.t))} width={x1 - x0} height={Math.abs(Y(tr.t) - Y(tr.e))} fill={UP} fillOpacity={0.14} />
            <rect x={x0} y={Math.min(Y(tr.e), Y(tr.s))} width={x1 - x0} height={Math.abs(Y(tr.s) - Y(tr.e))} fill={DOWN} fillOpacity={0.13} />
            <line x1={x0} x2={x1} y1={Y(tr.e)} y2={Y(tr.e)} stroke="var(--text)" strokeWidth={1.2} />
            <circle cx={x0} cy={Y(tr.e)} r={2.6} fill="var(--text)" className="sd-dot" />
            {!trEnd && [[tr.t, "TP", UP], [tr.s, "SL", DOWN]].filter(([p]) => Math.abs(Y(p as number) - Y(tr.e)) >= 11).map(([p, t, c]) => (
              <text key={t as string} x={x1 - 3} y={(p as number) > tr.e ? Y(p as number) + 9 : Y(p as number) - 3} fontSize={8 * fs} fontWeight={700} fill={c as string} textAnchor="end">{t}</text>
            ))}
          </g>
        );
      })()}
      {d.big && (() => {
        const [o, h, l, c] = d.big, x = X(d.n - 2), w = step * 1.6, col = c >= o ? UP : DOWN;
        return (
          <g className="sd-o" style={at(d.k?.length)}>
            <line x1={x} x2={x} y1={Y(h)} y2={Y(l)} stroke={col} strokeWidth={1.6} />
            <rect x={x - w / 2} y={Y(Math.max(o, c))} width={w} height={Math.max(1, Math.abs(Y(o) - Y(c)))} fill={col} rx={1.5} />
          </g>
        );
      })()}
      {(d.k ?? []).map(([o, h, l, c], i) => {
        const x = X(i + 0.5), col = c >= o ? UP : DOWN;
        return (
          <g key={`k${i}`} className="sd-k" style={{ animationDelay: `${i * KS}ms` }}>
            <line x1={x} x2={x} y1={Y(h)} y2={Y(l)} stroke={col} strokeWidth={1.1} />
            <rect x={x - bw / 2} y={Y(Math.max(o, c))} width={bw} height={Math.max(1, Math.abs(Y(o) - Y(c)))} fill={col} rx={Math.min(1.5, bw / 4)} />
          </g>
        );
      })}
      {d.delta && (
        <g>
          <line x1={PL} x2={X(d.n)} y1={dMid} y2={dMid} stroke="var(--border)" strokeWidth={1} />
          <text x={PL + 1} y={bottom + 9} fontSize={8 * fs} fill="var(--muted)">Delta</text>
          {d.delta.map((v, i) => {
            const h = (Math.abs(v) / dMax) * 15;
            return <rect key={`d${i}`} className="sd-k" style={{ animationDelay: `${i * KS}ms` }} x={X(i + 0.5) - bw / 2} y={v >= 0 ? dMid - h : dMid} width={bw} height={Math.max(1, h)} fill={v >= 0 ? UP : DOWN} fillOpacity={0.75} rx={1} />;
          })}
        </g>
      )}
      {d.line && <path className="sd-line" pathLength={1} d={`M${pts.map((p) => p.join(",")).join("L")}`} fill="none" stroke="var(--text)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" style={{ animationDuration: `${LD}ms` }} />}
      {d.line2 && <path className="sd-line" pathLength={1} d={`M${d.line2.map(([u, p]) => `${X(u)},${Y(p)}`).join("L")}`} fill="none" stroke="var(--text)" strokeOpacity={0.75} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" style={{ animationDuration: `${LD}ms` }} />}
      {(d.segs ?? []).map((s, i) => (
        <g key={`s${i}`} className="sd-o" style={at(s.at)}>
          <line x1={X(s.a[0])} y1={Y(s.a[1])} x2={X(s.b[0])} y2={Y(s.b[1])} stroke="var(--icon)" strokeWidth={1.2} strokeDasharray="3 3" />
          {s.t && <text x={(X(s.a[0]) + X(s.b[0])) / 2} y={(Y(s.a[1]) + Y(s.b[1])) / 2 - 4} fontSize={8 * fs} fontWeight={600} fill="var(--icon)" textAnchor="middle" className="sd-txt">{s.t}</text>}
        </g>
      ))}
      {(d.zones ?? []).map((z, i) => {
        const y0 = Y(Math.max(z.p0, z.p1)), h = Math.abs(Y(z.p0) - Y(z.p1));
        return z.t && <text key={`zt${i}`} className="sd-o sd-txt" style={at(z.at)} x={X(z.lu ?? z.u0) + 3} y={h >= 12 * fs ? y0 + 9 * fs : y0 - 3} fontSize={8 * fs} fontWeight={600} fill={COLOR[z.tone]}>{say(z.t)}</text>;
      })}
      {(d.tx ?? []).map((m, i) => (
        <text key={`x${i}`} className="sd-o sd-txt" style={at(m.at)} x={X(m.u)} y={Y(m.p) + 3} fontSize={9 * fs} fontWeight={700} textAnchor={m.anchor ?? "middle"} fill={m.tone ? COLOR[m.tone] : "var(--muted)"}>{say(m.t)}</text>
      ))}
      {side.map((s, i) => (
        <text key={`r${i}`} className="sd-o" style={{ animationDelay: `${s.ms}ms` }} x={X(d.n) + 4} y={s.y} fontSize={8 * fs} fontWeight={600} fill={s.c}>{s.t}</text>
      ))}
    </svg>
    </div>
  );
}
