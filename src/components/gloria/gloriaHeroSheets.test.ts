// Run: NODE_OPTIONS="--import <file registering a module hook that returns an empty module for .css>" npx tsx src/components/gloria/gloriaHeroSheets.test.ts
// (GloriaHeroSprite pulls in a .css import, which plain Node cannot load; same setup as gloriaGateTriggers.test.ts.)
//
// Checks every hero sheet in HERO_SHEETS against the sprite files and the missing-direction fallback:
//  - every frame a sheet names exists on disk under public/sprites/<its own folder>/ (a sheet can never show
//    another character's art);
//  - each of the eight facings resolves to a plan: the facings that have walk frames walk with them, every other
//    facing falls back to THIS sheet's own idle pose (walk null -> idle + step bob);
//  - the walk lands on the right facings for a north-walk sheet (N, NE, NW) and for Mage's south-walk sheet
//    (S, SE, SW), with the west-leaning diagonal flipped.
import { existsSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import { HERO_SHEETS } from "./GloriaHeroSprite";
import { planWalkTable } from "./GloriaLandSprites";
import type { SpriteDirection } from "./gloriaLands";
import type { GloriaCharacterId } from "../../services/gloriaCharacterService";

let checks = 0;
const ok = (c: unknown, m: string) => { checks++; assert.ok(c, m); };
const eq = <T,>(a: T, b: T, m: string) => { checks++; assert.deepEqual(a, b, m); };

const DIRS: SpriteDirection[] = ["south", "south-east", "east", "north-east", "north", "north-west", "west", "south-west"];
const PUBLIC = join(process.cwd(), "public");
const NORTH_WALK: SpriteDirection[] = ["north-east", "north", "north-west"];
const SOUTH_WALK: SpriteDirection[] = ["south-east", "south", "south-west"];

const EXPECT: Partial<Record<GloriaCharacterId, { walkDirs: SpriteDirection[]; frames: string }>> = {
  savage: { walkDirs: NORTH_WALK, frames: "walk-n" },
  rogue: { walkDirs: NORTH_WALK, frames: "walk-n" },
  tank: { walkDirs: NORTH_WALK, frames: "walk-n" },
  sniper: { walkDirs: NORTH_WALK, frames: "walk-n" },
  elf: { walkDirs: NORTH_WALK, frames: "walk-n" },
  assassin: { walkDirs: NORTH_WALK, frames: "walk-n" },
  mage: { walkDirs: SOUTH_WALK, frames: "walk-s" },
};

// the registry holds exactly the characters that have sheets (a player with no class, or a class not listed here,
// plays as the Warrior)
eq(
  Object.keys(HERO_SHEETS).sort(),
  ["assassin", "elf", "healer", "mage", "rogue", "sniper", "tank", "warrior", "savage"].sort(),
  "registry: warrior, savage, rogue, tank, sniper, elf, mage, assassin, healer",
);

for (const [id, sheet] of Object.entries(HERO_SHEETS) as [GloriaCharacterId, NonNullable<(typeof HERO_SHEETS)[GloriaCharacterId]>][]) {
  const own = `/sprites/${id}/`;
  const allFrames = [...Object.values(sheet.idle), ...Object.values(sheet.animations.walk ?? {}).flatMap((f) => f ?? [])];
  for (const f of allFrames) {
    ok(f.startsWith(own), `${id}: ${f} belongs to its own folder`);
    ok(existsSync(join(PUBLIC, f)), `${id}: ${f} exists on disk`);
  }
  eq(Object.keys(sheet.idle).sort(), [...DIRS].sort(), `${id}: all 8 idle rotations`);

  const plan = planWalkTable(sheet, "walk");
  ok(plan, `${id}: a plan is produced`);
  for (const d of DIRS) {
    const entry = plan![d];
    ok(entry.idle.value.length === 1 && entry.idle.value[0].startsWith(own), `${id}/${d}: idle fallback is this sheet's own pose`);
  }

  const exp = EXPECT[id];
  if (!exp) continue; // warrior has three walk directions; only the single-direction sheets are pinned below
  for (const d of DIRS) {
    const w = plan![d].walk;
    if (exp.walkDirs.includes(d)) {
      ok(w && w.value.length === 8 && w.value.every((f) => f.startsWith(`${own}${exp.frames}-`)), `${id}/${d}: walks with ${exp.frames} frames`);
    } else {
      ok(w === null, `${id}/${d}: no walk frames -> idle pose with step bob`);
    }
  }
  // the west-leaning diagonal reuses the straight frames flipped; the east-leaning one is not flipped
  const [e, , w] = exp.walkDirs;
  ok(plan![e].walk!.flipX === false && plan![w].walk!.flipX === true, `${id}: ${w} is flipped, ${e} is not`);
}

// Mage is the south-walk sheet: it must NOT walk north, and the north-walk sheets must NOT walk south
const mage = planWalkTable(HERO_SHEETS.mage!, "walk")!;
ok(mage.south.walk && !mage.north.walk && !mage["north-east"].walk && !mage["north-west"].walk, "mage walks south, not north");
const tank = planWalkTable(HERO_SHEETS.tank!, "walk")!;
ok(tank.north.walk && !tank.south.walk && !tank["south-east"].walk && !tank["south-west"].walk, "tank walks north, not south");

console.log(`gloriaHeroSheets.test: ${checks} checks passed`);
