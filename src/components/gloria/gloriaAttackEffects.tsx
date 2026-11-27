// GLORIA_RPG: the "attack moves" feature is purely cosmetic (see GloriaLandCanvas) -- defeating a boss is still
// driven entirely by completing its trading challenge (gloriaZones' bossDefeated). This module just maps each
// playable class to a short visual flourish, played once at the boss gate when the player clicks an
// already-defeated boss, so the moment feels like a win instead of a silent no-op.
import type { GloriaCharacterId } from "../../services/gloriaCharacterService";

export type AttackStyle = "slash" | "dagger" | "arrow" | "fireball" | "holy";

/** Which flourish each class plays. Melee classes get a slash, the two rogue-ish classes a dagger flurry, the two
 *  ranged classes an arrow streak, the caster a fireball burst, and the healer a holy burst (no class truly
 *  "attacks" the boss -- the challenge does -- so this is just each class's signature moment). */
export const ATTACK_STYLE: Record<GloriaCharacterId, AttackStyle> = {
  warrior: "slash",
  savage: "slash",
  tank: "slash",
  rogue: "dagger",
  assassin: "dagger",
  sniper: "arrow",
  elf: "arrow",
  mage: "fireball",
  healer: "holy",
};

/** How long the flourish plays before GloriaLandCanvas removes it from the DOM (ms); matches the longest CSS
 *  animation duration in gloria.css's attack-flourish block, plus a small margin. */
export const GZ_ATTACK_MS = 750;

/** One flourish, drawn centred on (cx, cy) in the same SVG viewBox the gate rings use. Plain shapes (no sprite
 *  assets needed) so every class's effect ships without new art. */
export function AttackEffect({ style, cx, cy, scale }: { style: AttackStyle; cx: number; cy: number; scale: number }) {
  const s = 26 * scale;
  switch (style) {
    case "slash":
      return (
        <g className="gz-atk-wrap" transform={`translate(${cx} ${cy})`}>
          <path
            className="gz-atk-slash"
            d={`M ${-s} ${s * 0.3} A ${s * 1.3} ${s * 1.3} 0 0 1 ${s} ${-s * 0.3}`}
            fill="none"
            stroke="#f8fafc"
            strokeWidth={s * 0.18}
            strokeLinecap="round"
          />
        </g>
      );
    case "dagger":
      return (
        <g className="gz-atk-wrap" transform={`translate(${cx} ${cy})`}>
          <g className="gz-atk-dagger">
            <line x1={-s * 0.6} y1={0} x2={s * 0.6} y2={0} stroke="#e2e8f0" strokeWidth={s * 0.12} strokeLinecap="round" />
          </g>
        </g>
      );
    case "arrow":
      return (
        <g className="gz-atk-wrap" transform={`translate(${cx} ${cy})`}>
          <g className="gz-atk-arrow">
            <line x1={-s} y1={0} x2={s * 0.6} y2={0} stroke="#facc15" strokeWidth={s * 0.1} strokeLinecap="round" />
            <path d={`M ${s * 0.6} ${-s * 0.25} L ${s} 0 L ${s * 0.6} ${s * 0.25} Z`} fill="#facc15" />
          </g>
        </g>
      );
    case "fireball":
      return (
        <g className="gz-atk-wrap" transform={`translate(${cx} ${cy})`}>
          <circle className="gz-atk-fireball" r={s * 0.6} fill="#fb923c" />
        </g>
      );
    case "holy":
      return (
        <g className="gz-atk-wrap" transform={`translate(${cx} ${cy})`}>
          <g className="gz-atk-holy">
            <path d={`M 0 ${-s} L ${s * 0.22} ${-s * 0.22} L ${s} 0 L ${s * 0.22} ${s * 0.22} L 0 ${s} L ${-s * 0.22} ${s * 0.22} L ${-s} 0 L ${-s * 0.22} ${-s * 0.22} Z`} fill="#fde68a" />
          </g>
        </g>
      );
  }
}
