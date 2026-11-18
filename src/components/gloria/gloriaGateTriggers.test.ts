// Run: npx tsx src/components/gloria/gloriaGateTriggers.test.ts
// (GloriaHeroSprite pulls in a .css import, which plain Node cannot load: preload a stub for it with
//  NODE_OPTIONS="--import <file registering a module hook that returns an empty module for .css>".)
// Checks every registered land's gate trigger zones against its real obstacles: the hero starts free and outside
// the entry zone, the inside spawn is free and clear of both zones, and -- walking with the real movement step --
// the entry zone is reachable from the start, and the exit zone from the inside spawn. Multi-scene lands (Aurelia)
// are checked scene by scene: a portal gate must be reachable and lead to a real scene whose start is free, and a
// scene entered through a portal starts at its own `start` and must reach its boss and exit from there.
import { FIRST_SCENE_ID, getLandScene, getZoneLand, type LandDefinition } from "./gloriaLands";
import type { ZoneTheme } from "./gloriaZones";
import { footprintBlocked, stepHero } from "./GloriaHeroSprite";
import { findInsideSpawn, findOutsideStart, GATE_REARM_FACTOR, gateRadiusPx, inGateZone, isTriggerGate, type Pt } from "./gloriaGateTriggers";

// every theme that has a land today: Verdantia, Solmara, Heartlands, Aurelia, Drakemar
const THEMES: ZoneTheme[] = ["forest", "oasis", "sea", "mountain", "castle"];
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

  // a portal leads to a real scene, is reachable from the start, and lands the hero on open ground at the target's
  // own entry gate (the hero arrives disarmed on it, so it can't flicker back)
  if (entry.to) {
    const targetId = entry.to.scene;
    const isFirst = targetId === FIRST_SCENE_ID;
    check(isFirst || !!base.scenes?.[targetId], `${tag}: portal leads to a real scene ("${targetId}")`);
    check(walksInto(start, entry), `${tag}: the portal is reachable on foot from the start`);
    // the opening scene starts the hero clear of its portal; a scene entered by a portal starts ON its entry (disarmed)
    if (!sceneId) check(!inGateZone(start, entry, land.imageSize), `${tag}: the hero does not start inside the portal zone`);
    const tl = getLandScene(base, isFirst ? undefined : targetId);
    check(isFirst ? tl === base : tl !== base, `${tag}: "${targetId}" resolves to the expected scene`);
    const tEntry = tl.gates.find((g) => g.id === "entry")!;
    const arrival = { x: tEntry.x, y: tEntry.y };
    check(!footprintBlocked(arrival.x, arrival.y, tl.obstacles ?? [], tl.imageSize.w, tl.imageSize.h), `${tag}: arrival (${arrival.x}, ${arrival.y}) is on open ground`);
    // the way back: the target's entry is itself a portal that leads straight back to this scene
    const back = tEntry.to?.scene;
    const thisId = sceneId ?? FIRST_SCENE_ID;
    check(back === thisId, `${tag}: the target's entry leads back to "${thisId}" (round trip)`);
    // arriving on the entry, the hero is inside its zone (disarmed until it walks clear), never mid-flicker
    check(inGateZone(arrival, tEntry, tl.imageSize), `${tag}: arrival sits on the target's entry trigger`);
    // and from the arrival point the hero can walk clear of that zone, then back onto it
    const out = { x: arrival.x, y: arrival.y - ((gateRadiusPx(tl.imageSize) * (GATE_REARM_FACTOR + 0.1)) / tl.imageSize.h) * 100 };
    check(!inGateZone(out, tEntry, tl.imageSize, GATE_REARM_FACTOR) && !footprintBlocked(out.x, out.y, tl.obstacles ?? [], tl.imageSize.w, tl.imageSize.h),
      `${tag}: the target's entry zone can be left (and so re-armed) by walking inward`);
  }
}

// ── the exterior trigger sits on the ground in front of the door, never on the door art ──
// base of the door/steps measured on the 1248x832 exterior paintings (painting px); the trigger disc must start below it
{
  const doors: { theme: ZoneTheme; name: string; baseY: number }[] = [
    { theme: "mountain", name: "aurelia (temple steps end ~y 600)", baseY: 598 },
    { theme: "castle", name: "drakemar (lower fort gate base ~y 452)", baseY: 452 },
  ];
  for (const { theme, name, baseY } of doors) {
    const land = getZoneLand(theme)!;
    const gate = land.gates.find((g) => g.id === "entry")!;
    const cy = (gate.y / 100) * land.imageSize.h;
    const top = cy - gateRadiusPx(land.imageSize);
    check(top >= baseY, `${name}: trigger disc top (${top.toFixed(0)}) is below the door base (${baseY})`);
    check(cy - baseY < 120, `${name}: trigger centre (${cy.toFixed(0)}) is still right in front of the door`);
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

// ── Drakemar's interior: yard, gate passage, stage steps and both rooms are walkable; walls and furniture hold ──
{
  const land = getLandScene(getZoneLand("castle")!, "interior");
  const { w, h } = land.imageSize;
  const pt = (x: number, y: number): Pt => ({ x: (x / w) * 100, y: (y / h) * 100 }); // painting px -> image %
  const canReach = reachableFrom(land, land.start!);
  const at = (x: number, y: number) => canReach(pt(x, y));

  const open: [string, number, number][] = [
    ["the open yard", 620, 450], ["the yard in front of the stage steps (boss spot)", 624, 233], ["the stage steps", 624, 195],
    ["the stage deck", 624, 100], ["the stage deck, far west", 470, 120], ["the yard, north-west corner", 230, 200],
    ["the yard, north-east corner", 1000, 180], ["the armory floor", 160, 550], ["the armory floor, north", 150, 440],
    ["the armory doorway", 300, 545], ["the barracks floor", 1050, 550], ["the barracks floor, north", 1060, 430],
    ["the barracks doorway", 935, 545], ["the gate passage", 624, 740], ["the path outside the gate", 624, 810],
  ];
  for (const [name, x, y] of open) check(at(x, y), `drakemar/interior: ${name} (${x}, ${y}) is walkable from the entry`);
  const solid: [string, number, number][] = [
    ["the black void north-west", 80, 150], ["the black void north-east", 1170, 150], ["the black void south", 300, 810],
    ["the north wall left of the stage", 300, 80], ["the stage back wall", 624, 20], ["the stage's front rail", 480, 185],
    ["the stage's west rail", 435, 120], ["the armory's top wall", 150, 350], ["the armory's yard-side wall", 298, 450],
    ["the barracks' top wall", 1100, 350], ["the barracks' yard-side wall", 935, 450], ["the south wall, west of the gate", 300, 730],
    ["the south wall, east of the gate", 900, 730], ["a barracks bed", 1150, 430], ["an armory crate", 70, 510],
    ["a sparring ring post", 342, 350], ["an archery target", 280, 150],
  ];
  for (const [name, x, y] of solid) check(!at(x, y), `drakemar/interior: ${name} (${x}, ${y}) blocks the hero`);
}

console.log(failures === 0 ? "\nAll gate trigger checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
