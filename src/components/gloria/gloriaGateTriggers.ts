// GLORIA_RPG: entry and exit gates as trigger zones. The hero doesn't have to thread a painted archway pixel by
// pixel; getting within a radius of the gate's marker fires it (see GloriaHeroSprite):
//   - entry: the hero fades out and reappears at the inside-the-city spawn, a short way past the gate;
//   - exit:  the hero fades out and the land view travels to the world map (or, while the exit is locked, just says
//            why it can't).
// The boss gate is not a trigger zone: it keeps its deliberate click-to-open behaviour.
//
// Everything is derived from a land's `gates` and `imageSize`, so a new land gets the behaviour just by defining
// `entry` and `exit` gates. Positions are image percentages (like gates and obstacles); sizes are painting pixels
// turned into percentages per axis, so a square 1024x1024 land and a 1248x832 one behave alike.
import type { LandDefinition, LandGate, LandGateId } from "./gloriaLands";

export type TriggerGateId = Extract<LandGateId, "entry" | "exit">;

/** True for the gates that fire on proximity (the boss gate does not). */
export function isTriggerGate(id: LandGateId): id is TriggerGateId {
  return id === "entry" || id === "exit";
}

/** Trigger radius as a fraction of the land's shorter side: ~33px on a 1248x832 painting, ~41px on 1024x1024. It
 *  stays smaller than the gate ring's own width, yet large enough that the hero, stopped by the wall or gate pillars
 *  beside a gate, still gets inside it. */
export const GATE_TRIGGER_RADIUS_FRAC = 0.04;
/** A fired gate re-arms only once the hero is this many radii away, so standing on its edge can't flicker. */
export const GATE_REARM_FACTOR = 1.25;
/** The inside spawn sits at least this many radii past the entry gate -- outside the re-arm distance. */
const SPAWN_MIN_RADII = 1.6;
const SPAWN_MAX_RADII = 8;
/** Where the hero starts: this many radii outside the entry gate, on the far side from the exit. */
const START_RADII = 1.4;
const STEP_PX = 2;

export interface Pt {
  x: number;
  y: number;
}

type Size = { w: number; h: number };

/** Trigger radius in painting pixels. */
export function gateRadiusPx(size: Size): number {
  return Math.min(size.w, size.h) * GATE_TRIGGER_RADIUS_FRAC;
}

/** Distance in painting pixels between two image-percentage points. */
export function distPx(a: Pt, b: Pt, size: Size): number {
  return Math.hypot(((a.x - b.x) / 100) * size.w, ((a.y - b.y) / 100) * size.h);
}

/** True when the hero is inside the gate's zone (`factor` widens it for the re-arm test). */
export function inGateZone(hero: Pt, gate: Pt, size: Size, factor = 1): boolean {
  return distPx(hero, gate, size) <= gateRadiusPx(size) * factor;
}

/** Unit vector (painting px) from the entry gate toward the exit gate; straight up when either is missing. */
function inwardDir(gates: readonly LandGate[], size: Size): Pt {
  const entry = gates.find((g) => g.id === "entry");
  const exit = gates.find((g) => g.id === "exit");
  if (!entry || !exit) return { x: 0, y: -1 };
  const dx = ((exit.x - entry.x) / 100) * size.w;
  const dy = ((exit.y - entry.y) / 100) * size.h;
  const len = Math.hypot(dx, dy);
  return len === 0 ? { x: 0, y: -1 } : { x: dx / len, y: dy / len };
}

const clampPct = (v: number) => Math.min(99, Math.max(1, v));

function pointAt(origin: Pt, dir: Pt, distance: number, size: Size): Pt {
  return {
    x: clampPct(origin.x + ((dir.x * distance) / size.w) * 100),
    y: clampPct(origin.y + ((dir.y * distance) / size.h) * 100),
  };
}

/**
 * Where the hero reappears after the entry gate: the first free point heading from the entry gate toward the exit,
 * at least SPAWN_MIN_RADII away (so it is clear of the entry zone) and clear of the exit zone. `blocked` says
 * whether the hero's feet at a point overlap an obstacle. Falls back to the entry gate itself if nothing is free.
 */
export function findInsideSpawn(land: Pick<LandDefinition, "gates" | "imageSize">, blocked: (p: Pt) => boolean): Pt {
  const { gates, imageSize: size } = land;
  const entry = gates.find((g) => g.id === "entry");
  if (!entry) return { x: 50, y: 50 };
  const exit = gates.find((g) => g.id === "exit");
  const dir = inwardDir(gates, size);
  const r = gateRadiusPx(size);
  for (let d = r * SPAWN_MIN_RADII; d <= r * SPAWN_MAX_RADII; d += STEP_PX) {
    const p = pointAt(entry, dir, d, size);
    if (blocked(p)) continue;
    if (distPx(p, entry, size) < r * GATE_REARM_FACTOR) continue; // clamped back toward the gate
    if (exit && inGateZone(p, exit, size, GATE_REARM_FACTOR)) continue;
    return p;
  }
  return { x: entry.x, y: entry.y };
}

/**
 * Where the hero starts a land: just outside the entry gate (away from the exit), so walking up to the gate is
 * what brings it into the city. Falls back toward the gate itself when the map edge or an obstacle is in the way.
 */
export function findOutsideStart(land: Pick<LandDefinition, "gates" | "imageSize">, blocked: (p: Pt) => boolean): Pt {
  const { gates, imageSize: size } = land;
  const entry = gates.find((g) => g.id === "entry");
  if (!entry) return { x: 50, y: 92 };
  const dir = inwardDir(gates, size);
  const out = { x: -dir.x, y: -dir.y };
  const r = gateRadiusPx(size);
  for (let d = r * START_RADII; d > 0; d -= STEP_PX) {
    const p = pointAt(entry, out, d, size);
    if (!blocked(p)) return p;
  }
  return { x: entry.x, y: entry.y };
}
