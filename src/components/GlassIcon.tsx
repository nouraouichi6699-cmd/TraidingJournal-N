// A glossy glass tile with a white glyph, tinted in one colour. Everything scales with `size`: the corner radius, the
// inner shade, the coloured drop shadow and the sheen over the top half. `color` is any CSS colour, a hex or a var().
import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";

interface Props {
  icon: LucideIcon;
  /** Tile side in px. */
  size?: number;
  color: string;
  /** 0..1, how much of the colour the tile keeps. 1 (the default) is the full glossy tile; lower lets the page show through. */
  fill?: number;
  className?: string;
  style?: CSSProperties;
}

const mix = (c: string, p: number) => `color-mix(in srgb, ${c} ${p}%, transparent)`;
const px = (v: number) => `${Math.round(v * 10) / 10}px`;

export default function GlassIcon({ icon: Icon, size = 40, color, fill = 1, className = "", style }: Props) {
  const s = size, r = s * 0.3, f = Math.max(0, Math.min(1, fill));
  return (
    <span
      aria-hidden="true"
      className={`relative inline-grid shrink-0 place-items-center overflow-hidden ${className}`}
      style={{
        width: s, height: s, borderRadius: r,
        background: `linear-gradient(155deg, ${mix(color, 90 * f)}, ${mix(color, 40 * f)} 70%, ${mix(color, 25 * f)})`,
        border: "1px solid rgba(255, 255, 255, 0.32)",
        boxShadow: `inset 0 1px 1px rgba(255, 255, 255, 0.55), inset 0 ${px(-s / 6)} ${px(s / 3)} ${mix(color, 33 * f)}, 0 ${px(s / 7)} ${px(s / 2.5)} ${mix(color, 27 * f)}`,
        ...(f < 1 ? { backdropFilter: "blur(5px)", WebkitBackdropFilter: "blur(5px)" } : null),
        ...style,
      }}
    >
      {/* the sheen: a soft reflection over the top half, its lower edge rounded like a lens */}
      <span
        className="pointer-events-none absolute inset-x-0 top-0"
        style={{ height: "48%", background: "linear-gradient(rgba(255, 255, 255, 0.38), rgba(255, 255, 255, 0))", borderRadius: `${px(r)} ${px(r)} 50% 50% / ${px(r)} ${px(r)} ${px(s * 0.14)} ${px(s * 0.14)}` }}
      />
      <Icon size={Math.round(s * 0.5)} color="#ffffff" strokeWidth={2} className="relative" style={{ filter: "drop-shadow(0 1px 1px rgba(0, 0, 0, 0.28))" }} />
    </span>
  );
}
