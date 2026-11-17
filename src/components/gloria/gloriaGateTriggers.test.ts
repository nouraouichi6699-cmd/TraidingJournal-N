// Run: npx tsx src/components/gloria/gloriaGateTriggers.test.ts
// (GloriaHeroSprite pulls in a .css import, which plain Node cannot load: preload a stub for it with
//  NODE_OPTIONS="--import <file registering a module hook that returns an empty module for .css>".)
// Checks every registered land's gate trigger zones against its real obstacles: the hero starts free and outside
// the entry zone, the inside spawn is free and clear of both zones, and -- walking with the real movement step --
// the entry zone is reachable from the start, and the exit zone from the inside spawn. Multi-scene lands (Aurelia)
// are checked scene by scene: a portal gate must be reachable and lead to a real scene whose start is free, and a
// scene entered through a portal starts at its own `start` and must reach its boss and exit from there.
import { getLandScene, getZoneLand, type LandDefinition } from "./gloriaLands";
import type { ZoneTheme } from "./gloriaZones";
import { footprintBlocked, stepHero } from "./GloriaHeroSprite";
import { findInsideSpawn, findOutsideStart, GATE_REARM_FACTOR, gateRadiusPx, inGateZone, isTriggerGate, type Pt } from "./gloriaGateTriggers";

// every theme that has a land today: Verdantia, Solmara, Heartlands, Aurelia
const THEMES: ZoneTheme[] = ["forest", "oasis", "sea", "mountain"];
// one entry per scene: a single-scene land is just its own scene
const SCENES: { base: LandDefinition; land: LandDefinition; sceneId?: string }[] = THEMES.flatMap((t) => {
  const base = getZoneLand(t)!;
  return [
    { base, land: getLandScene(base), sceneId: undefined },
    ...Object.keys(base.scenes ?? {}).map((id) => ({ base, land: getLandScene(base, id), sceneId: id })),
  ];
});

let failures = 0;
const check = (ok: boolean, msg: string) => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
};

/** Flood fill over 3px cells with the game's own movement step, so slide-along-walls matches play. Returns a
 *  predicate "is this image-percentage point walkable from `from`" (true when its cell or a neighbouring one was
 *  reached, which absorbs the 3px lattice's offset from the probe). */
function reachableFrom(land: LandDefinition, from: Pt): (p: Pt) => boolean {
  const { w, h } = land.imageSize;
  const obstacles = land.obstacles ?? [];
  const cell = 3;
  const key = (p: Pt) => `${Math.round(((p.x / 100) * w) / cell)},${Math.round(((p.y / 100) * h) / cell)}`;
  const seen = new Set<string>([key(from)]);
  const queue: Pt[] = [from];
  const dxp = (cell / w) * 100;
  const dyp = (cell / h) * 100;
  while (queue.length) {
    const p = queue.pop()!;
    for (const [dx, dy] of [[dxp, 0], [-dxp, 0], [0, dyp], [0, -dyp]]) {
      const n = stepHero(p.x, p.y, dx, dy, obstacles, w, h);
      if (n.x === p.x && n.y === p.y) continue;
      const k = key(n);
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push(n);
    }
  }
  return (p) => {
    const px = (p.x / 100) * w;
    const py = (p.y / 100) * h;
    for (const dx of [-cell, 0, cell]) for (const dy of [-cell, 0, cell]) {
      if (seen.has(`${Math.round((px + dx) / cell)},${Math.round((py + dy) / cell)}`)) return true;
    }
    return false;
  };
}

for (const { base, land, sceneId } of SCENES) {
  const { w, h } = land.imageSize;
  const obstacles = land.obstacles ?? [];
  const blocked = (p: Pt) => footprintBlocked(p.x, p.y, obstacles, w, h);
  const entry = land.gates.find((g) => g.id === "entry")!;
  const exit = land.gates.find((g) => g.id === "exit");
  const boss = land.gates.find((g) => g.id === "boss");
  const r = gateRadiusPx(land.imageSize);
  const start = land.start ?? findOutsideStart(land, blocked);
  const spawn = findInsideSpawn(land, blocked);
  const tag = `${land.id}${sceneId ? `/${sceneId}` : ""} (${w}x${h}, r=${r.toFixed(1)}px)`;
  // an entry the hero is only spawned at, or one that is a portal, is not the respawn-inside trigger
  const respawnEntry = !entry.spawnOnly && !entry.to;

  // walking from a point: true once the hero's feet can be inside the gate's zone
  const walksInto = (from: Pt, gate: Pt) => {
    const near = reachableFrom(land, from);
    // sample the zone's disc on a fine grid and ask the flood fill
    const rp = r;
    for (let a = 0; a < 360; a += 10) {
      for (const f of [0, 0.5, 1]) {
        const p = {
          x: gate.x + ((Math.cos((a * Math.PI) / 180) * rp * f) / w) * 100,
          y: gate.y + ((Math.sin((a * Math.PI) / 180) * rp * f) / h) * 100,
        };
        if (near(p) && inGateZone(p, gate, land.imageSize)) return true;
      }
    }
    return false;
  };

  check(isTriggerGate("entry") && isTriggerGate("exit") && !isTriggerGate("boss"), `${tag}: boss gate is not a trigger gate`);
  check(!blocked(start), `${tag}: start (${start.x.toFixed(1)}, ${start.y.toFixed(1)}) is on open ground`);

  if (respawnEntry) {
    check(!inGateZone(start, entry, land.imageSize), `${tag}: start is outside the entry zone`);
    check(!blocked(spawn), `${tag}: inside spawn (${spawn.x.toFixed(1)}, ${spawn.y.toFixed(1)}) is on open ground`);
    check(!inGateZone(spawn, entry, land.imageSize, GATE_REARM_FACTOR), `${tag}: spawn is clear of the entry re-arm distance`);
    if (exit) check(!inGateZone(spawn, exit, land.imageSize, GATE_REARM_FACTOR), `${tag}: spawn is clear of the exit zone`);
    if (exit) check(spawn.y < entry.y === exit.y < entry.y, `${tag}: spawn lies on the exit's side of the entry gate`);
    check(walksInto(start, entry), `${tag}: the entry zone is reachable on foot from the start`);
  }
  const from = respawnEntry ? spawn : start;
  if (boss && exit) check(!inGateZone(boss, exit, land.imageSize), `${tag}: boss marker is outside the exit zone`);
  if (boss && respawnEntry) check(!inGateZone(boss, entry, land.imageSize), `${tag}: boss marker is outside the entry zone`);
  if (boss && !respawnEntry) check(walksInto(from, boss), `${tag}: the boss marker is reachable on foot from the start`);
  if (exit) check(walksInto(from, exit), `${tag}: the exit zone is reachable on foot`);

  // a portal leads to a real scene, is reachable from the start, and lands the hero on open ground
  if (entry.to) {
    const target = base.scenes?.[entry.to.scene];
    check(!!target, `${tag}: portal leads to scene "${entry.to.scene}"`);
    check(walksInto(start, entry), `${tag}: the portal is reachable on foot from the start`);
    if (target) {
      const tl = getLandScene(base, entry.to.scene);
      const arrival = tl.start;
      const tEntry = tl.gates.find((g) => g.id === "entry")!;
      check(!!arrival, `${tag}: the target scene defines where the hero arrives`);
      if (arrival) {
        check(!footprintBlocked(arrival.x, arrival.y, tl.obstacles ?? [], tl.imageSize.w, tl.imageSize.h), `${tag}: arrival (${arrival.x}, ${arrival.y}) is on open ground`);
        check(arrival.x === tEntry.x && arrival.y === tEntry.y, `${tag}: arrival is the target's entry position`);
      }
      check(tl.gates.every((g) => !g.to || g.to.scene !== sceneId), `${tag}: the target has no portal straight back`);
    }
  }
}

// ── Aurelia's interior: the corridor is clear, the chambers can be entered, walls hold ──
{
  const land = getLandScene(getZoneLand("mountain")!, "interior");
  const { w, h } = land.imageSize;
  const obstacles = land.obstacles ?? [];
  const pt = (x: number, y: number): Pt => ({ x: (x / w) * 100, y: (y / h) * 100 }); // painting px -> image %
  const blockedPx = (x: number, y: number) => footprintBlocked(pt(x, y).x, pt(x, y).y, obstacles, w, h);
  const canReach = reachableFrom(land, land.start!);
  const at = (x: number, y: number) => canReach(pt(x, y));

  let corridorBlocked = 0;
  for (let y = 270; y <= 830; y += 4) for (let x = 548; x <= 700; x += 4) if (blockedPx(x, y)) corridorBlocked++;
  check(corridorBlocked === 0, `aurelia/interior: the central corridor (x 548-700, y 270-830) has no obstacles (${corridorBlocked} blocked samples)`);
  check(at(624, 250), "aurelia/interior: the floor in front of the throne steps (the boss spot) is reachable from the entry");
  // open floor inside each side chamber (painting px, picked on the chamber floors) must be walkable from the corridor
  const chambers: [string, number, number][] = [
    ["north-west room", 300, 235], ["north-east room", 1000, 235], ["west chamber (chest)", 190, 460], ["east chamber (chest)", 1100, 510],
    ["west chamber (north)", 400, 425], ["east chamber (north)", 850, 455], ["south-west chamber", 200, 740], ["south-east chamber", 965, 720],
    ["south-east chamber, door side", 870, 650], ["south-west chamber, mummy side", 330, 720],
  ];
  for (const [name, x, y] of chambers) check(at(x, y), `aurelia/interior: ${name} (${x}, ${y}) is enterable from the corridor`);
  // walls hold: spots on solid wall segments, statues and the void must NOT be walkable
  const solid: [string, number, number][] = [
    ["pharaoh's throne", 624, 180], ["outer west wall", 80, 150], ["outer east wall", 1170, 450], ["west maze wall", 520, 390],
    ["east maze wall", 730, 330], ["north-west back wall", 250, 140], ["void west of the corridor foot", 440, 760], ["void east of the corridor foot", 800, 760],
    ["jackal statue pedestal", 220, 235], ["mummy sarcophagus", 170, 700],
  ];
  for (const [name, x, y] of solid) check(!at(x, y), `aurelia/interior: ${name} (${x}, ${y}) blocks the hero`);
}

console.log(failures === 0 ? "\nAll gate trigger checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
