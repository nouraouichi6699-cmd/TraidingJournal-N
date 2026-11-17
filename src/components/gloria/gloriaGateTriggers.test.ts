// Run: npx tsx src/components/gloria/gloriaGateTriggers.test.ts
// (GloriaHeroSprite pulls in a .css import, which plain Node cannot load: preload a stub for it with
//  NODE_OPTIONS="--import <file registering a module hook that returns an empty module for .css>".)
// Checks every registered land's gate trigger zones against its real obstacles: the hero starts free and outside
// the entry zone, the inside spawn is free and clear of both zones, and -- walking with the real movement step --
// the entry zone is reachable from the start, and the exit zone from the inside spawn.
import { getZoneLand } from "./gloriaLands";
import type { ZoneTheme } from "./gloriaZones";
import { footprintBlocked, stepHero } from "./GloriaHeroSprite";
import { findInsideSpawn, findOutsideStart, GATE_REARM_FACTOR, gateRadiusPx, inGateZone, isTriggerGate, type Pt } from "./gloriaGateTriggers";

// every theme that has a land today: Verdantia, Solmara, Heartlands
const THEMES: ZoneTheme[] = ["forest", "oasis", "sea"];
const LANDS = THEMES.map((t) => getZoneLand(t)!);

let failures = 0;
const check = (ok: boolean, msg: string) => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
};

for (const land of LANDS) {
  const { w, h } = land.imageSize;
  const obstacles = land.obstacles ?? [];
  const blocked = (p: Pt) => footprintBlocked(p.x, p.y, obstacles, w, h);
  const entry = land.gates.find((g) => g.id === "entry")!;
  const exit = land.gates.find((g) => g.id === "exit")!;
  const boss = land.gates.find((g) => g.id === "boss")!;
  const r = gateRadiusPx(land.imageSize);
  const start = findOutsideStart(land, blocked);
  const spawn = findInsideSpawn(land, blocked);
  const tag = `${land.id} (${w}x${h}, r=${r.toFixed(1)}px)`;

  check(isTriggerGate("entry") && isTriggerGate("exit") && !isTriggerGate("boss"), `${tag}: boss gate is not a trigger gate`);
  check(!blocked(start), `${tag}: start (${start.x.toFixed(1)}, ${start.y.toFixed(1)}) is on open ground`);
  check(!inGateZone(start, entry, land.imageSize), `${tag}: start is outside the entry zone`);
  check(!blocked(spawn), `${tag}: inside spawn (${spawn.x.toFixed(1)}, ${spawn.y.toFixed(1)}) is on open ground`);
  check(!inGateZone(spawn, entry, land.imageSize, GATE_REARM_FACTOR), `${tag}: spawn is clear of the entry re-arm distance`);
  check(!inGateZone(spawn, exit, land.imageSize, GATE_REARM_FACTOR), `${tag}: spawn is clear of the exit zone`);
  check(spawn.y < entry.y === exit.y < entry.y, `${tag}: spawn lies on the exit's side of the entry gate`);
  check(!inGateZone(boss, entry, land.imageSize) && !inGateZone(boss, exit, land.imageSize), `${tag}: boss marker is outside both zones`);

  // Walk the real movement step toward a gate from a point; true once the hero's feet are inside the gate's zone.
  const walksInto = (from: Pt, gate: Pt) => {
    // reachable-set flood fill over 3px cells, moving with stepHero so slide-along-walls matches the game
    const cell = 3;
    const key = (p: Pt) => `${Math.round(((p.x / 100) * w) / cell)},${Math.round(((p.y / 100) * h) / cell)}`;
    const seen = new Set<string>([key(from)]);
    const queue: Pt[] = [from];
    const dxp = (cell / w) * 100;
    const dyp = (cell / h) * 100;
    while (queue.length) {
      const p = queue.pop()!;
      if (inGateZone(p, gate, land.imageSize)) return true;
      for (const [dx, dy] of [[dxp, 0], [-dxp, 0], [0, dyp], [0, -dyp]]) {
        const n = stepHero(p.x, p.y, dx, dy, obstacles, w, h);
        if (n.x === p.x && n.y === p.y) continue;
        const k = key(n);
        if (seen.has(k)) continue;
        seen.add(k);
        queue.push(n);
      }
    }
    return false;
  };
  check(walksInto(start, entry), `${tag}: the entry zone is reachable on foot from the start`);
  check(walksInto(spawn, exit), `${tag}: the exit zone is reachable on foot from the inside spawn`);
}

console.log(failures === 0 ? "\nAll gate trigger checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
