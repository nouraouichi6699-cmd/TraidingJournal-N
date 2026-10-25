// The advisor's mascot: a trading candlestick with a face (body = the candle, top wick = a tuft, bottom wick = its leg),
// always moving. Four moods; the drawing is here, the motion in index.css (.cs-*).
import { useId } from "react";

export type Mood = "happy" | "sad" | "angry" | "jealous";
export const MOODS: Mood[] = ["happy", "sad", "angry", "jealous"];

const INK = "#1c1024";
const PAL: Record<Mood, [string, string, string]> = { // light, mid, dark
  happy: ["#b9f8cd", "#2fd16a", "#10803a"],
  sad: ["#cfe0ff", "#5b8def", "#2b4d9c"],
  angry: ["#ffb3a3", "#f2433a", "#a01519"],
  jealous: ["#e9cdff", "#a35cf0", "#5b22a6"],
};

function eyes(mood: Mood, g: string) {
  const lid = (d: string) => `<path d="${d}" fill="url(#${g}b)" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>`;
  const one = (cx: number, px: number, py: number, l = "") => `
    <g class="cs-eye">
      <ellipse cx="${cx}" cy="112" rx="12.5" ry="14.5" fill="#fff" stroke="${INK}" stroke-width="2.4"/>
      <g class="cs-pupil"><circle cx="${px}" cy="${py}" r="7.2" fill="${INK}"/><circle cx="${px - 2.6}" cy="${py - 3}" r="2.6" fill="#fff"/><circle cx="${px + 2.4}" cy="${py + 2.6}" r="1.2" fill="#fff"/></g>
      ${l}
    </g>`;
  if (mood === "happy") return one(104, 104, 112) + one(136, 136, 112);
  if (mood === "sad") return one(104, 103, 118, lid("M91 96 L117 96 L117 103 Q104 103 91 110 Z")) + one(136, 137, 118, lid("M123 96 L149 96 L149 110 Q136 103 123 103 Z"));
  if (mood === "angry") return one(104, 107, 114, lid("M91 96 L117 96 L117 110 Q104 104 91 102 Z")) + one(136, 133, 114, lid("M123 96 L149 96 L149 102 Q136 104 123 110 Z"));
  return one(104, 98, 114, lid("M91 96 L117 96 L117 107 L91 107 Z")) + one(136, 130, 114, lid("M123 96 L149 96 L149 107 L123 107 Z"));
}
const BROWS: Record<Mood, [string, string]> = {
  happy: ["M93 91 Q104 83 115 90", "M125 90 Q136 83 147 91"],
  sad: ["M93 95 Q104 92 114 86", "M126 86 Q136 92 147 95"],
  angry: ["M92 88 L116 99", "M148 88 L124 99"],
  jealous: ["M93 96 L115 98", "M125 88 Q136 78 148 86"],
};
function mouth(mood: Mood, g: string) {
  if (mood === "happy") return `
    <clipPath id="${g}mc"><path d="M103 139 Q120 166 137 139 Q120 146 103 139 Z"/></clipPath>
    <path d="M103 139 Q120 166 137 139 Q120 146 103 139 Z" fill="#3a0d14" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
    <ellipse cx="120" cy="157" rx="11" ry="7" fill="#ff6b81" clip-path="url(#${g}mc)"/>`;
  if (mood === "sad") return `<path d="M108 153 Q120 142 132 153" stroke="${INK}" stroke-width="4.4" stroke-linecap="round" fill="none"/>`;
  if (mood === "angry") return `
    <rect x="103" y="138" width="34" height="15" rx="5.5" fill="#fff" stroke="${INK}" stroke-width="2.6"/>
    <path d="M111.5 138.5 V152.5 M120 138.5 V152.5 M128.5 138.5 V152.5 M103.5 145.5 H136.5" stroke="${INK}" stroke-width="1.8"/>`;
  return `<path d="M107 147 Q113 141 120 145 Q127 149 133 142" stroke="${INK}" stroke-width="4.2" stroke-linecap="round" fill="none"/>`;
}
// arms: shoulder → hand per side and where the hand is
const ARMS: Record<Mood, { l: string; r: string; hl: [number, number]; hr: [number, number]; fist?: boolean }> = {
  happy: { l: "M78 134 Q58 118 52 92", r: "M162 134 Q182 118 188 92", hl: [52, 89], hr: [188, 89] },
  sad: { l: "M78 142 Q66 162 68 184", r: "M162 142 Q174 162 172 184", hl: [68, 187], hr: [172, 187] },
  angry: { l: "M78 138 Q52 140 50 116", r: "M162 138 Q188 140 190 116", hl: [50, 112], hr: [190, 112], fist: true },
  jealous: { l: "M78 130 Q50 134 52 150 Q55 164 74 168", r: "M162 130 Q190 134 188 150 Q185 164 166 168", hl: [73, 168], hr: [167, 168] }, // hands on hips
};
function arms(mood: Mood, P: [string, string, string]) {
  const a = ARMS[mood], r = a.fist ? 8.5 : 7;
  const side = (d: string, [x, y]: [number, number], s: string) => `
    <g class="cs-arm cs-arm-${s}">
      <path d="${d}" stroke="${P[2]}" stroke-width="8" stroke-linecap="round" fill="none"/>
      <path d="${d}" stroke="${P[1]}" stroke-width="3.6" stroke-linecap="round" fill="none" opacity=".9"/>
      <circle cx="${x}" cy="${y}" r="${r}" fill="${P[1]}" stroke="${P[2]}" stroke-width="2.6"/>
      ${a.fist ? `<path d="M${x - 4} ${y - 3} h8 M${x - 4} ${y + 1} h8" stroke="${P[2]}" stroke-width="1.6" stroke-linecap="round"/>` : ""}
    </g>`;
  return side(a.l, a.hl, "l") + side(a.r, a.hr, "r");
}
function extras(mood: Mood) {
  const star = (x: number, y: number, s: number, d: number) => `<g transform="translate(${x} ${y}) scale(${s})"><path class="cs-spark" style="animation-delay:${d}s" d="M0 -11 Q2 -2 11 0 Q2 2 0 11 Q-2 2 -11 0 Q-2 -2 0 -11 Z" fill="#fff6c8"/></g>`;
  if (mood === "happy") {
    const up = (x: number, y: number, d: number, s: number) => `<g transform="translate(${x} ${y}) scale(${s})"><path class="cs-up" style="animation-delay:${d}s" d="M0 -12 L10 2 H4 V12 H-4 V2 H-10 Z" fill="#2fd16a" stroke="#0d6b30" stroke-width="2" stroke-linejoin="round"/></g>`;
    return up(30, 150, 0, 1) + up(212, 140, 0.7, 0.85) + up(204, 200, 1.3, 0.7) + star(40, 60, 1, 0.2) + star(200, 52, 0.8, 0.9);
  }
  if (mood === "sad") {
    const drop = (x: number, d: number) => `<path class="cs-drop" style="animation-delay:${d}s" d="M${x} 48 l-2.5 6 a3 3 0 0 0 5 0 Z" fill="#7cc8ff"/>`;
    return `
    <g class="cs-cloud"><path d="M138 34 a10 10 0 0 1 10 -12 a14 14 0 0 1 26 2 a10 10 0 0 1 4 20 h-36 a8 8 0 0 1 -4 -10 Z" fill="#c9d3e3" stroke="#7b8aa3" stroke-width="2"/></g>
    ${drop(150, 0)}${drop(162, 0.45)}${drop(172, 0.9)}
    <g class="cs-tear"><path d="M97 128 C93 135 94 140 98 140 C102 140 103 135 99 128 Z" fill="#7cc8ff" stroke="#3a8fd6" stroke-width="1.2"/></g>`;
  }
  if (mood === "angry") {
    const steam = (x: number, s: 1 | -1, d: number) => `<g class="cs-steam" style="animation-delay:${d}s" stroke="#fff" stroke-width="4.5" stroke-linecap="round" fill="none"><path d="M${x} 62 q${-7 * s} -8 0 -16 q${7 * s} -8 0 -16"/><path d="M${x - 12 * s} 70 q${-5 * s} -6 0 -12 q${5 * s} -6 0 -12"/></g>`;
    return `${steam(70, 1, 0)}${steam(170, -1, 0.9)}
    <g transform="translate(150 76)"><path class="cs-vein" d="M-8 -3 q5 0 5 -5 M8 -3 q-5 0 -5 -5 M-8 3 q5 0 5 5 M8 3 q-5 0 -5 5" stroke="#fff" stroke-width="3.4" stroke-linecap="round" fill="none"/></g>`;
  }
  // the plan's taller gold candle, which it keeps glancing at
  return `
    <g class="cs-ghost">
      <path d="M28 6 V26 M28 196 V224" stroke="#f5b83d" stroke-width="4" stroke-linecap="round"/>
      <rect x="12" y="26" width="32" height="170" rx="9" fill="#f5b83d" fill-opacity=".38" stroke="#f5b83d" stroke-width="2.4"/>
      <rect x="17" y="34" width="6" height="60" rx="3" fill="#fff" opacity=".35"/>
      ${star(28, -5, 1, 0)}
    </g>`;
}

function svg(mood: Mood, g: string) {
  const P = PAL[mood], front = mood === "jealous" ? extras(mood) : "";
  return `<svg class="cs cs-${mood}" viewBox="0 0 240 280" aria-hidden="true" focusable="false">
  <defs><linearGradient id="${g}b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${P[0]}"/><stop offset=".45" stop-color="${P[1]}"/><stop offset="1" stop-color="${P[2]}"/></linearGradient></defs>
  <ellipse class="cs-shadow" cx="120" cy="266" rx="40" ry="7" fill="#000"/>
  ${front}
  <g class="cs-all"><g class="cs-hop">
    <path d="M120 196 V250" stroke="${P[2]}" stroke-width="7" stroke-linecap="round"/>
    <ellipse cx="120" cy="254" rx="19" ry="7.5" fill="${P[2]}"/>
    <ellipse cx="114" cy="252" rx="7" ry="2.4" fill="#fff" opacity=".25"/>
    ${arms(mood, P)}
    <g class="cs-trunk">
      <path class="cs-tuft" d="M120 60 V22" stroke="${P[2]}" stroke-width="7" stroke-linecap="round"/>
      <rect x="74" y="58" width="92" height="140" rx="24" fill="url(#${g}b)" stroke="${P[2]}" stroke-width="3"/>
      <rect x="84" y="70" width="11" height="76" rx="5.5" fill="#fff" opacity=".32"/>
      <rect x="84" y="152" width="11" height="14" rx="5.5" fill="#fff" opacity=".22"/>
      <ellipse cx="90" cy="134" rx="8.5" ry="5" fill="#ff7a93" opacity=".55"/>
      <ellipse cx="150" cy="134" rx="8.5" ry="5" fill="#ff7a93" opacity=".55"/>
      ${BROWS[mood].map((d) => `<path d="${d}" stroke="${INK}" stroke-width="${mood === "angry" ? 6 : 4.6}" stroke-linecap="round" fill="none"/>`).join("")}
      ${eyes(mood, g)}
      ${mouth(mood, g)}
    </g>
    ${mood === "jealous" ? "" : extras(mood)}
  </g></g>
</svg>`;
}

/** The candle in a mood; size it with className (the drawing keeps a 6:7 ratio). Static drawing, no user text. */
export default function Mascot({ mood, className = "" }: { mood: Mood; className?: string }) {
  const g = `cs${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return <span aria-hidden="true" className={`cs-wrap ${className}`} dangerouslySetInnerHTML={{ __html: svg(mood, g) }} />;
}
