// GLORIA_RPG lands: the data behind each zone's land view (rendered by GloriaLandCanvas).
//
// A land is a painted pixel-art image (public/) plus the interactive spots on it -- the gates -- placed in
// percentages of the image, so they stay on the same landmark however the image is scaled or cropped.
//
// The older tile-map fields (terrain grid, objects, palette, fireflies) are still filled for Verdantia but no longer
// rendered; they stay optional until a later cleanup removes them. Everything "random" in them comes from a
// deterministic hash of the tile position.
//
// Only Verdantia (the forest zone) has a land so far; getZoneLand returns null for the others.
import type { ZoneTheme } from "./gloriaZones";

export const TILE = 32;

export type TerrainType = "grass" | "forest" | "dirt" | "water" | "sand";

export type LandObjectType =
  | "treeLarge"
  | "treeMedium"
  | "treeSmall"
  | "bush"
  | "rock"
  | "rockSmall"
  | "mushroom"
  | "flower"
  | "torch"
  | "log"
  | "stump"
  | "fenceH"
  | "fenceV";

export interface LandObject {
  type: LandObjectType;
  col: number;
  row: number;
  /** Small offset from the tile centre (SVG units), so dense forest doesn't look like a grid. */
  dx?: number;
  dy?: number;
  /** Drives colour variation in the art (trees, flowers). */
  seed?: number;
}

export type LandGateId = "entry" | "boss" | "exit";

export interface LandGate {
  id: LandGateId;
  /** Position as a percentage (0-100) of the image width. */
  x: number;
  /** Position as a percentage (0-100) of the image height. */
  y: number;
  label: { ar: string; en: string };
  /** Makes this a scene portal: reaching it (or clicking it) switches the land to that scene, whose `start` is
   *  where the hero appears, instead of respawning inside the same scene. See LandDefinition.scenes. */
  to?: SceneTransition;
  /** The gate only marks where the hero spawns (its ring stays clickable) and never fires on proximity -- the
   *  entry of a scene the hero was carried into by a portal. */
  spawnOnly?: boolean;
}

export type LandSceneId = string;

/** The id a portal uses to lead back to a land's first scene (the land's own fields, not an entry in `scenes`). */
export const FIRST_SCENE_ID: LandSceneId = "exterior";

/** Where a scene portal leads: the id of one of the land's extra `scenes`. */
export interface SceneTransition {
  scene: LandSceneId;
}

/**
 * Ambient life drawn over a land's painting (GloriaLandCanvas). Every position and size is a percentage (0-100) of
 * the image width (x, w, size) or height (y, h), pinned to the landmark it animates.
 */
export interface LandAmbience {
  /** Chimney tops that puff smoke. */
  smoke?: { x: number; y: number }[];
  /** Wheat-field strips that sway in the breeze: top-left corner and size. */
  wheat?: { x: number; y: number; w: number; h: number }[];
  /** Birds crossing the sky: height, seconds per loop, start delay (s), 1 = left to right, -1 = right to left. */
  birds?: { y: number; duration: number; delay: number; dir: 1 | -1 }[];
  /** Windmill hub and sail length (size, % of the image width). */
  windmill?: { x: number; y: number; size: number };
}

/** One of the eight facings PixelLab renders a character in. */
export type SpriteDirection = "south" | "south-east" | "east" | "north-east" | "north" | "north-west" | "west" | "south-west";

/**
 * A pixel-art character standing on a land (drawn by GloriaLandSprites from the frames in public/sprites/<type>/).
 * x and y are percentages (0-100) of the image width/height and mark where the character stands -- its feet.
 *
 * - No `animation` (or "idle"): the idle frame for `direction`, still.
 * - `animation` without `animationInterval`: that animation loops forever.
 * - `animation` with `animationInterval`: idle by default; every animationInterval to 4/3 of it (ms, picked at
 *   random each time) the animation plays once, then the character settles back to idle.
 * - `patrol`: the character walks from (x, y) through the waypoints and loops back to the first, turning to face
 *   where it is heading; `direction` is then only its facing when motion is reduced.
 */
export interface LandSprite {
  id: string;
  type:
    | "farmer"
    | "horse"
    | "guard"
    | "boss-serpent"
    | "boss-solmara"
    | "boss-verdantia"
    | "boss-aurelia"
    | "boss-heartlands"
    | "boss-drakemar"
    | "boss-frostfell"
    | "boss-throne"
    | "npc";
  x: number;
  y: number;
  /** Size multiplier: 1 draws one sprite pixel per painting pixel. */
  scale?: number;
  /** The character's core size in sprite pixels (default 32); larger frames are padding around it. */
  coreSize?: number;
  /** Facing while idle (and of the animation, when the sheet has it in that direction). */
  direction: SpriteDirection;
  animation?: "idle" | "walk" | "rear";
  /** Milliseconds per animation frame (default 150). */
  frameDuration?: number;
  /** Makes `animation` intermittent: the minimum wait between plays, in ms. */
  animationInterval?: number;
  /** Waypoints to walk between, in the same % coordinates as x/y -- always the straight segments connecting them
   *  in order, never a free 2D path, so the walker can't drift off the line they trace over the art. */
  patrol?: { x: number; y: number }[];
  /** How `patrol` is walked once the last waypoint is reached: "loop" (default) heads straight back to the
   *  first, tracing a circuit (the farmer's rectangular rounds); "pingpong" retraces the same segments back to the
   *  first and bounces there too, so a dead-end path (a guard pacing a short stretch) is retraced, not skipped. */
  pathMode?: "loop" | "pingpong";
  /** Patrol speed in painting pixels per second (default 8). */
  speed?: number;
}

/**
 * Solid scenery the player's hero can't walk into (buildings, walls, fences, trees, water), as an axis-aligned box
 * in percentages of the image: x and w of its width, y and h of its height. Open ground -- grass, paths, crop
 * fields -- is simply everywhere no obstacle covers.
 */
export interface LandObstacle {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Turns [x, y, w, h] boxes measured in painting pixels into percentage obstacles for an image of `size`. */
function obstaclesFromPixels(size: { w: number; h: number }, boxes: [number, number, number, number][]): LandObstacle[] {
  return boxes.map(([x, y, w, h]) => ({
    x: (x / size.w) * 100,
    y: (y / size.h) * 100,
    w: (w / size.w) * 100,
    h: (h / size.h) * 100,
  }));
}

/** A box roughly the size of a boss sprite's own body, centred on the point it stands at (spriteX, spriteY are the
 *  same image-percentage coordinates passed to its LandSprite -- its feet, per GloriaSprite's placement rule), so
 *  the hero can't walk through the monster itself. Independent of the land's pixel size (unlike
 *  obstaclesFromPixels), since it's defined directly in image percentages. */
function bossFootprint(spriteX: number, spriteY: number): LandObstacle {
  return { x: spriteX - 4.5, y: spriteY - 9, w: 9, h: 11 };
}

/**
 * Everything that belongs to one painted background: the image and what sits on it. A single-scene land is just one
 * of these (its LandDefinition); a multi-scene land adds more under `LandDefinition.scenes`.
 */
export interface LandScene {
  /** Path of the land image under public/, e.g. "/gloria-land-verdantia.jpg". */
  image: string;
  /** The image's natural pixel size. The gate overlay uses it as its viewBox so it crops exactly like the image. */
  imageSize: { w: number; h: number };
  gates: LandGate[];
  /** Optional ambient animations over the painting. */
  ambience?: LandAmbience;
  /** Animated characters standing on the land, drawn between the painting and the ambient layer. */
  sprites?: LandSprite[];
  /** Solid scenery blocking the player's hero; none means it can roam the whole image. */
  obstacles?: LandObstacle[];
  /** Wall(s) between the boss and whatever lies past it: the monster's own footprint (so the hero can't walk
   *  through its body) and, where measured, a wider block across the path to the exit gate. Solid like
   *  `obstacles` until the zone's boss is defeated, then ignored. Build footprint boxes with bossFootprint() and
   *  path blocks with obstaclesFromPixels, like the regular obstacles. */
  bossBarrier?: LandObstacle[];
  /** Where the hero starts standing (image percentages) -- on arrival from a portal, or on opening the land when
   *  this is its first scene. Without it, the hero starts just outside the entry gate (findOutsideStart). */
  start?: { x: number; y: number };
}

export interface LandDefinition extends LandScene {
  id: string;
  /**
   * Further scenes of a multi-scene land, by id. The land's own scene fields above are the FIRST scene -- the one the
   * land opens on -- and a gate with `to: { scene }` leads into one of these. Absent for a single-scene land
   * (Verdantia, Solmara, Heartlands), which is the whole of the model for them. Read the active scene through
   * getLandScene, never `scenes` directly.
   */
  scenes?: Record<LandSceneId, LandScene>;

  // ── legacy tile map: no longer rendered, kept until a later cleanup ──
  cols?: number;
  rows?: number;
  /** terrain[row][col] */
  terrain?: TerrainType[][];
  /** Up to 3 shades per terrain type; tiles pick one by position hash. */
  palette?: Record<TerrainType, string[]>;
  objects?: LandObject[];
  /** Tile positions of the drifting fireflies. */
  fireflies?: { col: number; row: number }[];
}

/** Deterministic 0..1 hash of a tile position (+ salt for independent draws on the same tile). */
export function hash2(a: number, b: number, salt = 0): number {
  let h = (Math.imul(a + 1, 374761393) + Math.imul(b + 1, 668265263) + Math.imul(salt + 1, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const TERRAIN_CODE: Record<string, TerrainType> = { F: "forest", G: "grass", D: "dirt", W: "water", S: "sand" };

function parseTerrain(rows: string[], cols: number): TerrainType[][] {
  return rows.map((line) => Array.from({ length: cols }, (_, c) => TERRAIN_CODE[line[c]] ?? "forest"));
}

// ── Verdantia ─────────────────────────────────────────────────────────────────────────────────────────────
// F forest floor (dense trees), G clearing grass, D dirt path, W pond, S muddy shore.
// The path enters at the bottom, winds north past the pond and leaves through the top of the forest.
const VERDANTIA_MAP = [
  "FFFFFFFFFFFDDFFFFFFFFFFF",
  "FFFFFFFFFFGDDGFFFFFFFFFF",
  "FFFFFFFFGGGDDGGGFFFFFFFF",
  "FFFFFFGGGGDDGGGGGGFFFFFF",
  "FFFFFGGGGDDGGGGGGGGFFFFF",
  "FFFFGGGGGDDGGGGGSSSGFFFF",
  "FFFGGGGGGDDGGGGSWWWSGFFF",
  "FFFGGGGGGGDDGGSWWWWWSGFF",
  "FFGGGGGGGGGDDGSWWWWWSGFF",
  "FFGGGGGGGGGGDDGSWWWSGGFF",
  "FFFGGGGGGGGGDDGGSSSGGFFF",
  "FFFFGGGGGGGDDGGGGGGGFFFF",
  "FFFFFGGGGGDDGGGGGGGFFFFF",
  "FFFFFFGGGGDDGGGGGGFFFFFF",
  "FFFFFFFFGGDDGGGGFFFFFFFF",
  "FFFFFFFFFFDDFFFFFFFFFFFF",
];

/** Hand-placed details in the clearing: [type, col, row]. */
const VERDANTIA_PROPS: [LandObjectType, number, number][] = [
  // torches lighting the path
  ["torch", 9, 13], ["torch", 12, 13], ["torch", 8, 5], ["torch", 11, 5], ["torch", 10, 1], ["torch", 13, 1],
  // fence at the forest entrance
  ["fenceH", 8, 14], ["fenceH", 9, 14], ["fenceH", 12, 14], ["fenceH", 13, 14],
  // rocks around the pond
  ["rock", 15, 5], ["rock", 21, 8], ["rockSmall", 14, 9], ["rockSmall", 20, 10],
  // woodcutter's corner
  ["log", 5, 8], ["stump", 6, 10],
  // mushrooms & flowers
  ["mushroom", 4, 7], ["mushroom", 5, 11], ["mushroom", 17, 12],
  ["flower", 6, 4], ["flower", 13, 3], ["flower", 7, 9], ["flower", 15, 11], ["flower", 14, 12], ["flower", 8, 12], ["flower", 16, 3],
  // bushes & lone trees in the clearing
  ["bush", 4, 6], ["bush", 18, 11], ["bush", 3, 9],
  ["treeLarge", 6, 7], ["treeMedium", 16, 13], ["treeMedium", 17, 4], ["treeSmall", 13, 6], ["treeSmall", 20, 9],
];

/** Fills every forest-floor tile with a varied tree (or the odd bush/stump/mushroom). */
function growForest(terrain: TerrainType[][]): LandObject[] {
  const out: LandObject[] = [];
  terrain.forEach((line, row) =>
    line.forEach((t, col) => {
      if (t !== "forest") return;
      const gap = hash2(col, row, 1);
      if (gap < 0.1) return;
      const pick = hash2(col, row, 2);
      const type: LandObjectType =
        pick < 0.38 ? "treeLarge" : pick < 0.68 ? "treeMedium" : pick < 0.82 ? "treeSmall" : pick < 0.93 ? "bush" : pick < 0.97 ? "stump" : "mushroom";
      out.push({
        type,
        col,
        row,
        dx: Math.round((hash2(col, row, 3) - 0.5) * 12),
        dy: Math.round((hash2(col, row, 4) - 0.5) * 10),
        seed: Math.floor(hash2(col, row, 5) * 1000),
      });
    }),
  );
  return out;
}

const VERDANTIA_IMAGE = "/gloria-land-verdantia.jpg";
const VERDANTIA_IMAGE_SIZE = { w: 1248, h: 832 };

/** Measured on the 1248x832 painting (pixel positions noted alongside). */
const VERDANTIA_AMBIENCE: LandAmbience = {
  smoke: [
    { x: 55.7, y: 14.4 }, //  castle, front-right tower roof (695, 120) -- clear of the exit ring and zone badge
    { x: 43.75, y: 36.7 }, // west cottage chimney (546, 305)
    { x: 58.2, y: 37.7 }, //  middle cottage chimney (726, 314)
    { x: 68.7, y: 39.9 }, //  east cottage chimney (857, 332)
  ],
  wheat: [
    { x: 5.0, y: 52.9, w: 17.3, h: 12.3 }, //  west field, top block (62-278, 440-542)
    { x: 5.0, y: 66.3, w: 24.0, h: 16.2 }, //  west field, middle (62-362, 552-687)
    { x: 29.2, y: 74.8, w: 16.4, h: 8.4 }, //  south-west field, top (365-570, 622-692)
    { x: 23.4, y: 83.2, w: 22.1, h: 10.6 }, // south-west field, bottom (292-568, 692-780)
    { x: 55.0, y: 76.2, w: 19.1, h: 18.0 }, // south-east field (686-924, 634-784)
  ],
  birds: [
    { y: 5, duration: 13, delay: 0, dir: 1 },
    { y: 8.5, duration: 10, delay: 4, dir: -1 },
    { y: 11, duration: 15, delay: 8, dir: 1 },
  ],
  windmill: { x: 86.9, y: 21.0, size: 6.4 }, // hub (1084, 175), sails ~80px
};

/** Standing on the painted figures they bring to life (feet positions on the 1248x832 painting). */
const VERDANTIA_SPRITES: LandSprite[] = [
  // reaper patrolling the dirt yard beside the stable, bordering the wheat field, from the stable's fence corner
  // down the field-edge path toward the thatched house (292, 350 -> 308, 350 -> 308, 500 -> 292, 500)
  {
    id: "farmer-wheat", type: "farmer", x: 23.4, y: 42.1, scale: 1.2, direction: "south-east", animation: "walk", frameDuration: 150,
    patrol: [{ x: 23.4, y: 42.1 }, { x: 24.7, y: 42.1 }, { x: 24.7, y: 60.1 }, { x: 23.4, y: 60.1 }],
  },
  // gardener patrolling the dirt path along the vegetable garden's west fence, with a longer round trip west
  // toward the village center before heading back (925, 505 -> 935, 505 -> 935, 620 -> 750, 620 -> 925, 620)
  {
    id: "farmer-fence", type: "farmer", x: 74.1, y: 60.7, scale: 1.2, direction: "south-east", animation: "walk", frameDuration: 150,
    patrol: [{ x: 74.1, y: 60.7 }, { x: 74.9, y: 60.7 }, { x: 74.9, y: 74.5 }, { x: 60.1, y: 74.5 }, { x: 74.1, y: 74.5 }],
  },
  // horse in the stable yard, rearing up every 6-8s (200, 291)
  { id: "horse", type: "horse", x: 16, y: 35, scale: 1.3, direction: "east", animation: "rear", frameDuration: 120, animationInterval: 6000 },
  // guard pacing the dirt path right at the castle doors, clear of the boss gate's ring marker below (602, 233 -> 641, 233);
  // re-measured against the live painting: the path there runs ~555-680px wide at this height, well clear of the
  // grass edges and the flanking buildings, so a straight back-and-forth segment stays on it
  {
    id: "guard-gate", type: "guard", x: 48.2, y: 28, scale: 0.9, coreSize: 48, direction: "east", animation: "walk", frameDuration: 150,
    patrol: [{ x: 48.2, y: 28 }, { x: 51.4, y: 28 }], pathMode: "pingpong",
  },
  // guard pacing the path junction just south-west of the windmill (918, 316 -> 973, 316); re-measured: the open
  // dirt yard there runs ~895-990px wide, clear of the house wall above and the fence gate below
  {
    id: "guard-windmill", type: "guard", x: 73.5, y: 38, scale: 0.9, coreSize: 48, direction: "east", animation: "walk", frameDuration: 150,
    patrol: [{ x: 73.5, y: 38 }, { x: 78, y: 38 }], pathMode: "pingpong",
  },
  // the forest guardian boss, standing in the battle arena just south of the boss gate marker (50, 35)
  { id: "boss-verdantia", type: "boss-verdantia", x: 50, y: 42, scale: 1.5, coreSize: 48, direction: "south" },
];

/** Measured with a pixel-grid overlay on the 1248x832 painting: [x, y, w, h] in painting px. Fences keep their gate
 *  leaves open (entry path 605-640px, windmill path 952-982px); crop fields and paths are left walkable. */
const VERDANTIA_OBSTACLES = obstaclesFromPixels(VERDANTIA_IMAGE_SIZE, [
  // castle and the cliff ledges of its plateau (the path up to the doors runs ~585-668px between them)
  [400, 0, 440, 226],
  [376, 30, 22, 270],
  [372, 245, 180, 50],
  [690, 262, 170, 35],
  // barn and its yard fences (the yard opens south through the gate at 180-203px and the lane at 267-326px)
  [57, 150, 269, 130],
  [45, 160, 12, 290],
  [326, 160, 13, 180],
  [45, 328, 135, 29],
  [203, 328, 64, 29],
  [337, 312, 128, 25],
  // woodcutter's shed below the barn and its fence
  [60, 363, 57, 77],
  [113, 363, 137, 30],
  // village houses: small, west, middle and east cottages, then the two houses flanking the well
  [365, 335, 80, 115],
  [465, 285, 110, 135],
  [652, 295, 113, 130],
  [765, 312, 115, 22],
  [777, 310, 118, 130],
  [340, 460, 45, 25],
  [380, 460, 160, 125],
  [697, 447, 155, 143],
  // the well
  [582, 445, 78, 90],
  // north-east yard: hay pen, shed, windmill and their fences
  [900, 112, 85, 83],
  [870, 170, 15, 145],
  [890, 205, 70, 95],
  [995, 220, 11, 92],
  [1025, 160, 125, 140],
  [905, 334, 47, 26],
  [982, 334, 266, 26],
  [1040, 367, 87, 60],
  [1132, 335, 68, 95],
  // fenced vegetable garden: four sides, the corn inside stays walkable
  [957, 460, 255, 20],
  [1202, 460, 12, 240],
  [957, 677, 257, 23],
  [957, 460, 15, 105],
  // southern fields: the entry path's gate posts and side fences, field-plot fences and gate posts
  [573, 620, 32, 30],
  [640, 620, 33, 30],
  [573, 620, 11, 185],
  [663, 620, 11, 185],
  [673, 732, 99, 15],
  [762, 732, 11, 70],
  [673, 788, 82, 16],
  [900, 620, 28, 30],
  [944, 760, 11, 72],
  [910, 798, 45, 30],
  [55, 700, 140, 28],
  [200, 782, 133, 28],
  [465, 707, 110, 20],
  // the two ponds
  [60, 740, 130, 92],
  [1090, 740, 125, 75],
  // trees (trunk and lower canopy) inside the village
  [350, 195, 32, 50],
  [330, 390, 32, 55],
  [752, 268, 32, 35],
  [905, 390, 30, 50],
  [995, 370, 30, 50],
  [868, 535, 32, 50],
  [1172, 190, 32, 45],
  // tree-lined west and east borders
  [0, 150, 40, 682],
  [1215, 150, 33, 682],
  // north-west woods: rock ledges, trees and boulders
  [0, 65, 55, 85],
  [50, 10, 75, 55],
  [125, 0, 85, 30],
  [10, 40, 25, 30],
  [52, 115, 30, 35],
  [120, 60, 30, 55],
  [170, 75, 30, 50],
  [215, 30, 30, 50],
  [305, 20, 30, 50],
  [342, 60, 28, 55],
  [250, 55, 30, 25],
  [295, 105, 50, 45],
  // north-east ridge, its trees and boulders
  [960, 0, 288, 75],
  [1140, 75, 108, 60],
  [915, 40, 35, 40],
  [872, 80, 32, 35],
  // boulders and trees along the south edge
  [950, 715, 30, 35],
  [1010, 740, 55, 65],
  [750, 805, 32, 27],
]);

// A gate across the dirt path between the boss arena (gate at y 35%, ~291px) and the castle doors (exit gate at
// y 24.6%, ~205px). The path there runs ~605-640px wide (see guard-gate's patrol above); padded a little for a
// clean block without pinching the grass edges either side.
const VERDANTIA_BOSS_BARRIER: LandObstacle[] = [
  ...obstaclesFromPixels(VERDANTIA_IMAGE_SIZE, [[580, 222, 100, 38]]),
  bossFootprint(50, 42), // the forest guardian's own footprint (boss-verdantia's sprite position)
];

function buildVerdantia(): LandDefinition {
  const cols = 24;
  const terrain = parseTerrain(VERDANTIA_MAP, cols);
  const props: LandObject[] = VERDANTIA_PROPS.map(([type, col, row], i) => ({ type, col, row, seed: i * 37 + col * 7 + row }));
  return {
    id: "verdantia",
    image: VERDANTIA_IMAGE,
    imageSize: VERDANTIA_IMAGE_SIZE,
    gates: [
      { id: "entry", x: 50, y: 92, label: { ar: "بوابة الدخول", en: "Entry Gate" } },
      { id: "boss", x: 50, y: 35, label: { ar: "ساحة المعركة", en: "Battle Arena" } },
      // on the castle's front door (the castle's solid box ends at y 226, so the hero can stand right below it)
      { id: "exit", x: 50, y: 24.6, label: { ar: "بوابة الخروج", en: "Exit Gate" } },
    ],
    ambience: VERDANTIA_AMBIENCE,
    sprites: VERDANTIA_SPRITES,
    obstacles: VERDANTIA_OBSTACLES,
    bossBarrier: VERDANTIA_BOSS_BARRIER,
    cols,
    rows: VERDANTIA_MAP.length,
    terrain,
    palette: {
      grass: ["#4a8f3a", "#539b40", "#468734"],
      forest: ["#2f6b2a", "#2b6327", "#33722d"],
      dirt: ["#9b7447", "#a47c4c", "#93703f"],
      water: ["#2f78b5", "#2c72ad", "#3380bf"],
      sand: ["#b59a62", "#ab915a", "#bea36b"],
    },
    objects: [...growForest(terrain), ...props],
    fireflies: [
      { col: 2, row: 4 },
      { col: 21, row: 3 },
      { col: 3, row: 13 },
      { col: 20, row: 13 },
    ],
  };
}

// ── Solmara ───────────────────────────────────────────────────────────────────────────────────────────────
// Desert oasis market (zone 1, theme "oasis"). Background only so far: no terrain grid, palette, or sprites yet
// -- NPCs/animals follow in a later pass, same as Verdantia's farmer/horse/guard were added after its background.
const SOLMARA_IMAGE = "/gloria-land-solmara.jpg";
const SOLMARA_IMAGE_SIZE = { w: 1248, h: 832 };

/** Measured with a pixel-grid overlay on the 1248x832 painting: [x, y, w, h] in painting px. Boxes reach down to a
 *  structure's base (the hero collides with its feet only, so its head may overlap the wall above). The sand
 *  paths, the arena in front of the castle (y ~215-400) and the bottom entry path (x ~475-810 between the two
 *  gate walls) stay open; small pots, jars and lantern hangers are left walkable. */
const SOLMARA_OBSTACLES = obstaclesFromPixels(SOLMARA_IMAGE_SIZE, [
  // the castle gate building: towers, the arched gatehouse (opening included) and the two wing walls
  [357, 0, 533, 214],
  [270, 85, 90, 108],
  [888, 80, 128, 140],
  // the oasis pool and its stone rim, as stacked bands from the north bridge down to the south rim
  [555, 405, 165, 40],
  [505, 445, 275, 30],
  [388, 475, 462, 30],
  [362, 505, 515, 75],
  [375, 580, 485, 60],
  [415, 640, 360, 40],
  [500, 680, 240, 36],
  // palm trunks rising from the rim on its north side
  [528, 415, 30, 40],
  [478, 440, 25, 40],
  [720, 395, 25, 55],
  [785, 430, 22, 60],
  // west market: the three flat-roofed buildings, the awning stall, the wall with the flag post
  [10, 268, 135, 152],
  [147, 248, 128, 170],
  [200, 170, 125, 120],
  [337, 162, 45, 65],
  [265, 305, 105, 115],
  [370, 285, 60, 100],
  // west market stalls: blue/white striped cart, red/white striped cart, the loaded table
  [0, 405, 158, 122],
  [32, 512, 102, 140],
  [8, 578, 28, 72],
  [195, 470, 63, 62],
  // south-west wall and gate pillars (the entry path opens between x 475 and 810)
  [0, 640, 78, 78],
  [82, 650, 100, 110],
  [100, 715, 235, 75],
  [332, 735, 80, 40],
  [410, 715, 40, 75],
  // south-east wall and gate pillars
  [812, 680, 34, 108],
  [842, 745, 63, 45],
  [905, 728, 215, 58],
  // east side: the ruined tower building and its walls, the flag post and the palm beside it
  [925, 215, 100, 140],
  [855, 270, 72, 60],
  [1025, 268, 110, 87],
  [1130, 295, 118, 60],
  [1180, 350, 68, 75],
  [826, 310, 26, 72],
  [865, 335, 30, 55],
  // east tents and stalls
  [960, 325, 140, 132],
  [1085, 330, 95, 95],
  [1150, 385, 98, 95],
  [1045, 455, 155, 130],
  [1020, 520, 22, 50],
  [1198, 480, 38, 135],
  [1000, 592, 65, 53],
  [1048, 635, 30, 87],
  [942, 635, 105, 105],
  [875, 685, 57, 52],
  [1080, 590, 135, 132],
  [1180, 678, 22, 60],
  [1220, 658, 26, 40],
  // watchtower pillars
  [52, 190, 55, 58],
  [1105, 110, 95, 150],
  // rock cliffs along the north-west, north-east and both bottom corners
  [0, 0, 165, 190],
  [0, 190, 105, 60],
  [125, 95, 85, 85],
  [175, 8, 125, 100],
  [940, 0, 308, 190],
  [1100, 185, 148, 95],
  [0, 735, 135, 97],
  [135, 780, 130, 52],
  [1000, 745, 248, 87],
  [1190, 720, 58, 30],
]);

function buildSolmara(): LandDefinition {
  return {
    id: "solmara",
    image: SOLMARA_IMAGE,
    imageSize: SOLMARA_IMAGE_SIZE,
    gates: [
      { id: "entry", x: 50, y: 94, label: { ar: "بوابة الدخول", en: "Entry Gate" } },
      { id: "boss", x: 51, y: 34, label: { ar: "ساحة المعركة", en: "Battle Arena" } },
      // at the foot of the gatehouse arch (its solid box ends at y 214, so the hero can stand right below it)
      { id: "exit", x: 51, y: 24, label: { ar: "بوابة الخروج", en: "Exit Gate" } },
    ],
    // the masked desert warrior boss, standing in the battle arena just south of the boss gate marker (51, 34)
    sprites: [{ id: "boss-solmara", type: "boss-solmara", x: 51, y: 40, scale: 1.5, coreSize: 48, direction: "south" }],
    bossBarrier: [bossFootprint(51, 40)],
    obstacles: SOLMARA_OBSTACLES,
  };
}

// ── Heartlands ────────────────────────────────────────────────────────────────────────────────────────────
// The walled capital (zone 4, theme "sea"): a castle in the north, a river wrapping the city, a market square inside
// the city walls and a harbour on the west bank. Square 1024x1024 painting -- unlike the 1248x832 Verdantia and
// Solmara -- so its imageSize is declared here and nothing may assume a fixed aspect ratio. Background, gates and
// obstacles only so far; NPCs follow in a later pass.
const HEARTLANDS_IMAGE = "/gloria-land-heartlands.jpg";
const HEARTLANDS_IMAGE_SIZE = { w: 1024, h: 1024 };

/** Measured with a pixel-grid overlay on the 1024x1024 painting: [x, y, w, h] in painting px. Boxes hug only solid
 *  structures (walls, towers, houses, stalls, water, cliffs, rocks, tree trunks and dense forest edges) and reach down
 *  to a structure's base, since the hero collides with its feet only. Left walkable: the cobble road from the castle
 *  doors down to the market stairs (x ~440-590), the grass ledge either side of that road, the stairs between their
 *  pillars (x ~482-545), the whole market square and the lanes between its stalls, the south gate arch and entry path
 *  (x ~482-541), the dirt paths along both river banks, the bridge decks, and the grass under tree canopies (only the
 *  trunk base of a lone tree blocks). The castle's door corridor (x 487-545) is open so the hero can reach the exit gate. */
const HEARTLANDS_OBSTACLES = obstaclesFromPixels(HEARTLANDS_IMAGE_SIZE, [
  // castle: left wing (towers, walls, inner courtyard), keep either side of its door corridor, right wing; the wing
  // walls end at y ~306 and only the tower bases reach y ~332, so the grass ledge below them stays open
  [245, 0, 195, 306],
  [245, 306, 47, 26],
  [392, 306, 42, 26],
  [440, 0, 47, 245],
  [487, 0, 58, 150],
  [545, 0, 240, 250],
  [590, 245, 195, 61],
  [590, 306, 40, 26],
  [720, 306, 52, 26],
  // trunks of the two big trees on the castle's south ledge
  [393, 330, 30, 22],
  [595, 328, 30, 22],
  // castle moat: cliff and water along the castle's south ledge (the road at x ~467-558 crosses it)
  [255, 358, 212, 40],
  [558, 358, 202, 42],
  // the two small pools where the moat meets the road
  [448, 338, 20, 22],
  [556, 338, 18, 22],
  // market wall, north side: corner towers, wall runs and the pillars flanking the stairs (stairs stay open)
  [255, 370, 50, 95],
  [305, 418, 160, 32],
  [462, 392, 20, 70],
  [545, 392, 18, 70],
  [563, 418, 160, 32],
  [722, 370, 48, 95],
  // market wall, east and west sides
  [264, 460, 26, 300],
  [738, 460, 26, 300],
  // market wall, south side: corner towers, wall runs and the pillars flanking the gate arch (the arch stays open)
  [245, 755, 52, 135],
  [297, 805, 125, 70],
  [422, 755, 50, 135],
  [470, 865, 12, 65],
  [541, 865, 12, 65],
  [553, 755, 50, 135],
  [602, 805, 135, 70],
  [730, 755, 55, 135],
  // houses inside the market wall
  [296, 432, 74, 110],
  [411, 452, 64, 68],
  [548, 452, 78, 70],
  [661, 437, 72, 103],
  [296, 598, 72, 102],
  [662, 596, 74, 104],
  [289, 716, 76, 98],
  [662, 716, 78, 98],
  // market stalls
  [408, 526, 62, 58],
  [562, 526, 62, 58],
  [306, 552, 60, 50],
  [662, 552, 60, 50],
  [379, 612, 60, 58],
  [585, 612, 59, 58],
  [388, 686, 62, 58],
  [573, 686, 62, 58],
  // fountain
  [462, 598, 98, 74],
  // trees on the market square
  [372, 440, 40, 58],
  [632, 442, 40, 54],
  [463, 700, 28, 30],
  [533, 700, 28, 30],
  [372, 765, 42, 34],
  [608, 765, 42, 34],
  // river, west bank: waterfall and cliff, then the channel in bands between the two bridges (decks stay open)
  [95, 0, 140, 100],
  [100, 100, 145, 100],
  [128, 238, 34, 25],
  [160, 245, 80, 25],
  [155, 270, 90, 55],
  [165, 325, 100, 118],
  [158, 480, 100, 32],
  [80, 528, 158, 82],
  [160, 610, 42, 142],
  [198, 562, 24, 140],
  // west bank trees on the city side of the river, by the lower bridge's east end
  [222, 610, 38, 32],
  [240, 655, 24, 22],
  // harbour: the west-bank house, cargo barrels, crane, the piers (solid wood), the boats, then the open bay
  [86, 592, 72, 90],
  [30, 678, 60, 42],
  [100, 680, 52, 40],
  [158, 622, 40, 18],
  [20, 722, 180, 26],
  [170, 690, 26, 145],
  [50, 748, 112, 88],
  [200, 752, 34, 62],
  [0, 550, 38, 130],
  [0, 760, 240, 120],
  // river and cliffs south of the city, and the treeline and peaks along the bottom edge (the entry path stays open)
  [0, 880, 468, 144],
  [555, 885, 469, 139],
  // river, east bank: down from the north moat, then the cliffs and bend south-east of the city
  [765, 392, 40, 40],
  [772, 432, 55, 40],
  [784, 465, 70, 40],
  [800, 505, 88, 60],
  [829, 744, 135, 45],
  [828, 790, 135, 110],
  [800, 880, 125, 80],
  // east bridge: parapets either side of the deck, and the cliff and river east of it
  [884, 552, 14, 85],
  [929, 552, 13, 85],
  [938, 562, 86, 68],
  // farmland: wheat fields and their fences, hay bales, the windmill, the east cottages
  [814, 133, 112, 120],
  [850, 92, 105, 42],
  [925, 136, 60, 12],
  [818, 252, 102, 28],
  [925, 293, 99, 120],
  [938, 196, 70, 68],
  [830, 285, 72, 97],
  [893, 402, 65, 62],
  [962, 465, 62, 76],
  [798, 612, 68, 78],
  // trunks of the trees along the east bank of the city wall and around the south-east cottage
  [772, 485, 20, 20],
  [772, 570, 26, 20],
  [822, 592, 24, 20],
  [765, 640, 22, 35],
  [772, 745, 40, 35],
  [866, 742, 26, 24],
  [908, 722, 24, 26],
  [952, 655, 26, 22],
  [995, 660, 26, 25],
  // trees on the farmland's west edge, between the castle's east tower and the fields
  [780, 160, 22, 18],
  [775, 235, 30, 22],
  [783, 310, 24, 18],
  // mountains and tree borders: north-west, north-east, north edge, east edge, south-east
  [0, 0, 95, 235],
  [0, 190, 35, 110],
  [0, 355, 40, 60],
  [775, 0, 170, 95],
  [940, 0, 84, 115],
  [995, 100, 29, 90],
  [995, 405, 29, 50],
  [940, 735, 84, 230],
  // west cottages, their trees, and the trees by the west bridge
  [45, 242, 68, 85],
  [98, 322, 70, 95],
  [10, 418, 70, 85],
  [118, 255, 45, 70],
  [168, 360, 40, 60],
  [120, 478, 38, 48],
]);

function buildHeartlands(): LandDefinition {
  return {
    id: "heartlands",
    image: HEARTLANDS_IMAGE,
    imageSize: HEARTLANDS_IMAGE_SIZE,
    gates: [
      // the south gate's archway: doors x ~487-537, y ~826-868, paved passage x ~483-540; the hero stands at their
      // threshold, centred in the opening (512, 864 in painting px)
      { id: "entry", x: 50, y: 84.4, label: { ar: "بوابة الدخول", en: "Entry Gate" } },
      { id: "boss", x: 51, y: 40, label: { ar: "ساحة المعركة", en: "Battle Arena" } },
      { id: "exit", x: 51, y: 17, label: { ar: "بوابة الخروج", en: "Exit Gate" } },
    ],
    // the drowned pirate captain boss, standing in the battle arena just south of the boss gate marker (51, 40)
    sprites: [{ id: "boss-heartlands", type: "boss-heartlands", x: 51, y: 46, scale: 1.5, coreSize: 48, direction: "south" }],
    bossBarrier: [bossFootprint(51, 46)],
    obstacles: HEARTLANDS_OBSTACLES,
  };
}

// ── Aurelia ───────────────────────────────────────────────────────────────────────────────────────────────
// The Egyptian temple (zone 3, theme "mountain"): the first TWO-SCENE land. It opens on the exterior -- pyramids and
// the temple facade, an approach view with no scenery to collide with -- and walking into the temple doorway carries
// the hero into the interior, a corridor-and-chambers painting. The land's own scene fields are the exterior; the
// interior sits under `scenes` (see LandDefinition). Backgrounds, scene transition, gates and obstacles only so far;
// NPCs follow in a later pass.
const AURELIA_EXTERIOR_IMAGE = "/gloria-land-aurelia-exterior.jpg";
const AURELIA_INTERIOR_IMAGE = "/gloria-land-aurelia-interior.jpg";
const AURELIA_EXTERIOR_SIZE = { w: 1248, h: 832 };
const AURELIA_INTERIOR_SIZE = { w: 1248, h: 832 };

/** Measured on the 1248x832 interior painting. The central corridor (x ~545-705, from the bottom edge up to the boss
 *  hall) is entirely clear, as is the open floor in front of the throne. The side chambers stay enterable: only
 *  their walls, back-wall faces and furniture block, and the floor inside them is open. Statues and pedestals block
 *  down to their base, since the hero collides with its feet only; small props (coin piles, pots' shadows, bones)
 *  are left walkable. */
const AURELIA_INTERIOR_OBSTACLES = obstaclesFromPixels(AURELIA_INTERIOR_SIZE, [
  // black void and the stone rims that fence it: the void is every dark area of the painting (the outside, the pits and
  // the maze's dark gaps), and each box reaches ~16-20px into the stone rim around it, so wall rims block while the
  // floor they enclose stays open (every chamber stays enterable with a few pixels to spare)
  [0, 0, 388, 28], [860, 0, 388, 28], [0, 28, 384, 44], [864, 28, 384, 40],
  [868, 68, 380, 8], [0, 72, 380, 4], [0, 76, 368, 4], [880, 76, 368, 4],
  [0, 80, 96, 32], [1152, 80, 96, 28], [1156, 108, 92, 36], [0, 112, 92, 32],
  [0, 144, 88, 44], [1160, 144, 88, 40], [1164, 184, 84, 40], [0, 188, 84, 40],
  [1168, 224, 80, 48], [0, 228, 80, 36], [316, 232, 36, 4], [316, 236, 60, 16],
  [872, 236, 64, 36], [276, 252, 100, 20], [0, 264, 76, 16], [388, 268, 36, 4],
  [468, 268, 36, 4], [272, 272, 252, 4], [720, 272, 228, 28], [1172, 272, 76, 16],
  [264, 276, 260, 4], [0, 280, 212, 52], [264, 280, 264, 32], [1064, 288, 184, 36],
  [720, 300, 252, 8], [720, 308, 296, 16], [264, 312, 60, 4], [452, 312, 76, 4],
  [252, 316, 72, 4], [452, 316, 72, 40], [248, 320, 76, 12], [720, 324, 52, 28],
  [912, 324, 104, 24], [1068, 324, 180, 24], [0, 332, 80, 4], [136, 332, 48, 4],
  [248, 332, 72, 32], [0, 336, 76, 40], [912, 348, 64, 12], [1104, 348, 144, 4],
  [724, 352, 48, 4], [1168, 352, 80, 12], [448, 356, 76, 12], [728, 356, 44, 4],
  [916, 360, 64, 44], [1172, 364, 76, 48], [444, 368, 80, 56], [0, 376, 72, 68],
  [912, 404, 68, 4], [908, 408, 72, 12], [1176, 412, 72, 36], [908, 420, 76, 24],
  [444, 424, 76, 4], [392, 428, 128, 40], [0, 444, 68, 24], [920, 444, 68, 28],
  [1180, 448, 68, 68], [264, 452, 108, 4], [264, 456, 116, 32], [0, 468, 64, 28],
  [476, 468, 36, 4], [924, 472, 64, 4], [728, 476, 260, 20], [260, 488, 120, 4],
  [76, 492, 36, 4], [140, 492, 36, 4], [260, 492, 112, 16], [0, 496, 176, 12],
  [728, 496, 264, 24], [0, 508, 216, 44], [232, 508, 140, 16], [1184, 516, 64, 20],
  [728, 520, 148, 4], [884, 520, 108, 4], [232, 524, 92, 28], [728, 524, 52, 20],
  [936, 524, 56, 16], [1008, 536, 36, 4], [1068, 536, 36, 4], [1164, 536, 84, 4],
  [936, 540, 312, 32], [728, 544, 56, 32], [0, 552, 64, 24], [940, 572, 308, 16],
  [0, 576, 60, 44], [732, 576, 52, 4], [1188, 588, 60, 40], [0, 620, 56, 48],
  [1192, 628, 56, 44], [0, 668, 52, 32], [1196, 672, 52, 36], [0, 700, 48, 44],
  [472, 700, 36, 4], [732, 700, 48, 4], [424, 704, 88, 8], [732, 704, 76, 4],
  [732, 708, 112, 4], [1200, 708, 48, 52], [376, 712, 136, 64], [732, 712, 144, 20],
  [732, 732, 148, 4], [736, 736, 144, 40], [0, 744, 44, 32], [1204, 760, 44, 16],
  [0, 776, 512, 44], [736, 776, 512, 40], [740, 816, 508, 16], [0, 820, 508, 12],
  // boss hall: the back wall, the two Anubis statues on their pedestals, the pharaoh on his throne (the dais steps and the floor in front stay open)
  [388, 0, 470, 150], [418, 150, 54, 66], [776, 150, 56, 66], [585, 150, 82, 58],
  // north-west and north-east rooms: the back walls with their pillars, and the jackal statues' pedestals
  [98, 85, 290, 120], [862, 85, 290, 120], [192, 204, 58, 52], [1012, 195, 58, 60],
  // west maze: the north chamber's back wall and pillar block, the two free-standing wall blocks, the pillar-and-banner stack, the south-west chamber's back wall, sarcophagus and urns, and the north-west chamber's back wall, chest and urn
  [330, 320, 140, 80], [262, 360, 70, 80], [410, 470, 120, 82], [413, 560, 115, 108],
  [240, 530, 150, 165], [68, 550, 135, 100], [108, 660, 138, 72], [75, 640, 35, 45],
  [70, 725, 32, 42], [322, 742, 32, 30], [78, 325, 140, 105], [120, 408, 52, 68],
  [88, 425, 28, 35],
  // east maze: the north chamber's back wall, pillars and urns, the far-east chamber's back wall, chest and urns, then the south chambers' back walls, sarcophagus and urns
  [715, 355, 70, 95], [775, 330, 140, 95], [780, 400, 32, 38], [875, 408, 28, 34],
  [978, 340, 30, 110], [1045, 355, 125, 90], [1058, 428, 55, 70], [995, 495, 35, 42],
  [1135, 498, 32, 36], [722, 525, 215, 108], [788, 602, 26, 32], [897, 605, 30, 36],
  [885, 730, 48, 45], [930, 590, 255, 85], [1003, 685, 135, 72], [1145, 672, 32, 42],
  [1146, 735, 30, 34],
  // the outer walls' thicker inner rims (west and east sides, and the chambers' bottom walls)
  [58, 62, 42, 225], [52, 320, 40, 190], [28, 538, 42, 250], [28, 762, 365, 30],
  [1150, 62, 44, 230], [1165, 285, 38, 265], [975, 525, 230, 28], [1178, 570, 42, 215],
  [885, 765, 335, 28],
]);

function buildAurelia(): LandDefinition {
  return {
    id: "aurelia",
    // first scene: the exterior. No obstacles -- just the approach to the temple.
    image: AURELIA_EXTERIOR_IMAGE,
    imageSize: AURELIA_EXTERIOR_SIZE,
    // the hero starts at the foot of the paved approach, below the temple steps
    start: { x: 50, y: 90 },
    gates: [
      // the temple's doorway (the only gate here): reaching it carries the hero into the interior. The trigger sits on
      // the paved ground in front of the steps (painting y ~632, steps end ~600, door opening ~340-520), never on the door.
      { id: "entry", x: 50, y: 76, label: { ar: "مدخل المعبد", en: "Temple Entrance" }, to: { scene: "interior" } },
    ],
    sprites: [],
    scenes: {
      interior: {
        image: AURELIA_INTERIOR_IMAGE,
        imageSize: AURELIA_INTERIOR_SIZE,
        // the bottom of the central corridor, where the hero arrives from the exterior
        start: { x: 50, y: 95 },
        gates: [
          // where the hero arrives, and the way back: walking onto it again (after leaving its zone) fades the hero
          // out to the exterior, in front of the same temple door
          { id: "entry", x: 50, y: 95, label: { ar: "بوابة الدخول", en: "Entry Gate" }, to: { scene: FIRST_SCENE_ID } },
          // open floor just below the dais steps
          { id: "boss", x: 50, y: 30, label: { ar: "ساحة المعركة", en: "Battle Arena" } },
          // at the pharaoh's feet: the throne's solid box ends at y 208, so the hero can stand right below it
          { id: "exit", x: 50, y: 23.5, label: { ar: "بوابة الخروج", en: "Exit Gate" } },
        ],
        // the mummy pharaoh king boss, standing in the battle arena just south of the boss gate marker (50, 30)
        sprites: [{ id: "boss-aurelia", type: "boss-aurelia", x: 50, y: 36, scale: 1.5, coreSize: 48, direction: "south" }],
        bossBarrier: [bossFootprint(50, 36)],
        obstacles: AURELIA_INTERIOR_OBSTACLES,
      },
    },
  };
}

// ── Drakemar ──────────────────────────────────────────────────────────────────────────────────────────────
// The sea fortress (zone 5, theme "castle"): the second TWO-SCENE land, built on the same pattern as Aurelia. It opens
// on the exterior -- the fort on its rocky island, an approach view with no scenery to collide with -- and walking
// into the fort's main gate carries the hero into the interior, the training yard. Backgrounds, scene transition,
// gates and obstacles only so far; NPCs follow in a later pass.
const DRAKEMAR_EXTERIOR_IMAGE = "/gloria-land-drakemar-exterior.jpg";
const DRAKEMAR_INTERIOR_IMAGE = "/gloria-land-drakemar-interior.jpg";
const DRAKEMAR_EXTERIOR_SIZE = { w: 1248, h: 832 };
const DRAKEMAR_INTERIOR_SIZE = { w: 1248, h: 832 };

/** Measured with a pixel-grid overlay on the 1248x832 interior painting: [x, y, w, h] in painting px. Boxes reach down
 *  to a structure's base, since the hero collides with its feet only. The central yard (x ~312-925), the gate passage
 *  (x ~580-668), the steps up to the stage (x 583-665) and the doorways into the armory and barracks (y ~517-575 on
 *  their yard-side walls) stay open, as does the floor inside both rooms. The stage deck is open too; only its rails
 *  block. The sparring ring's roped sides are decoration; only its four corner posts block. */
const DRAKEMAR_INTERIOR_OBSTACLES = obstaclesFromPixels(DRAKEMAR_INTERIOR_SIZE, [
  // the black void and the outer stone walls: north-west corner, north-east corner, south of the fort, and the two
  // room sides below the corner voids
  [0, 0, 176, 297], [1075, 0, 173, 297], [0, 297, 48, 483], [1198, 297, 50, 483],
  [0, 780, 502, 52], [745, 780, 503, 52],
  // north wall of the yard on either side of the stage (brick face down to the floor, y ~140), the archery targets
  // and the weapon racks standing against it
  [0, 0, 430, 140], [822, 0, 253, 140],
  [192, 140, 172, 22], [884, 140, 70, 20], [972, 140, 92, 20],
  // stage: the back wall and rail, the side rails, and the front rail and fascia either side of the steps (the deck
  // and the steps themselves stay walkable)
  [428, 0, 394, 46], [428, 48, 14, 165], [808, 48, 16, 165], [428, 150, 155, 62], [665, 150, 157, 62],
  // west edge of the yard: the arrow stand, the barrels, the bow rack
  [178, 168, 26, 50], [178, 218, 64, 76], [244, 242, 20, 50],
  // east edge of the yard: the spear rack with its shields, the plank leaning on the wall
  [958, 215, 110, 80], [1030, 183, 32, 52],
  // armory (west room): the top wall and its weapon racks, the yard-side wall either side of the doorway, crates,
  // barrel and bench against the west and south walls
  [22, 297, 290, 113], [55, 410, 65, 30], [205, 410, 68, 32],
  [285, 297, 27, 220], [283, 575, 29, 125],
  [52, 478, 44, 95], [52, 578, 44, 64], [54, 650, 100, 46], [236, 608, 42, 87],
  // barracks (east room): the top wall, the yard-side wall either side of the doorway, beds, nightstands, footlocker
  [922, 297, 303, 113], [922, 297, 28, 218], [922, 575, 28, 125],
  [958, 398, 88, 95], [958, 610, 46, 86], [1012, 650, 32, 42],
  [1108, 405, 84, 57], [1108, 482, 84, 56], [1108, 632, 84, 56],
  // south wall, either side of the gate: walls, gate pillars and the open door leaves (the passage x 580-668 stays open)
  [22, 690, 558, 92], [668, 690, 557, 92],
  // sparring ring corner posts (the roped sides are walk-through decoration)
  [335, 330, 16, 34], [487, 330, 16, 34], [335, 450, 16, 36], [487, 450, 16, 36],
  // training dummies, weapon racks and benches in the yard, the barrels and crate by the south-east wall
  [326, 630, 32, 56], [368, 625, 36, 58], [826, 350, 34, 52], [870, 328, 44, 160],
  [440, 657, 58, 34], [750, 657, 58, 34], [848, 600, 70, 98], [822, 648, 26, 45],
]);

function buildDrakemar(): LandDefinition {
  return {
    id: "drakemar",
    // first scene: the exterior. No obstacles -- just the approach to the fort.
    image: DRAKEMAR_EXTERIOR_IMAGE,
    imageSize: DRAKEMAR_EXTERIOR_SIZE,
    // the hero starts on the causeway at the foot of the island
    start: { x: 50, y: 90 },
    gates: [
      // the fort's main gate, the double door in the lower wall (the only gate here): reaching it carries the hero into
      // the training yard. The trigger sits on the path in front of it (painting y ~487; the door's base is ~452), not on it.
      { id: "entry", x: 50.5, y: 58.5, label: { ar: "بوابة الحصن", en: "Fort Gate" }, to: { scene: "interior" } },
    ],
    sprites: [],
    scenes: {
      interior: {
        image: DRAKEMAR_INTERIOR_IMAGE,
        imageSize: DRAKEMAR_INTERIOR_SIZE,
        // the yard floor just inside the open double gate (painting y ~649; the gate pillars and leaves start at ~690),
        // where the hero arrives from the exterior
        start: { x: 50, y: 78 },
        gates: [
          // where the hero arrives, and the way back: walking onto it again (after leaving its zone) fades the hero
          // out to the exterior, in front of the same fort gate
          { id: "entry", x: 50, y: 78, label: { ar: "بوابة الدخول", en: "Entry Gate" }, to: { scene: FIRST_SCENE_ID } },
          // open yard floor just below the steps up to the stage
          { id: "boss", x: 50, y: 28, label: { ar: "ساحة المعركة", en: "Battle Arena" } },
          // on the sparring stage, up the steps: a dead end, with no separate exit door painted
          { id: "exit", x: 50, y: 5, label: { ar: "بوابة الخروج", en: "Exit Gate" } },
        ],
        // the dark knight boss, standing in the battle arena just south of the boss gate marker (50, 28)
        sprites: [{ id: "boss-drakemar", type: "boss-drakemar", x: 50, y: 34, scale: 1.5, coreSize: 48, direction: "south" }],
        bossBarrier: [bossFootprint(50, 34)],
        obstacles: DRAKEMAR_INTERIOR_OBSTACLES,
      },
    },
  };
}

// ── Frostfell ─────────────────────────────────────────────────────────────────────────────────────────────
// The treasure temple beside the volcano (zone 6, theme "volcano"): the third TWO-SCENE land, built on the same pattern
// as Aurelia and Drakemar. It opens on the exterior -- a cobbled path up a cliff to a stone archway cut into the
// volcano -- and walking onto the foot of the stairs carries the hero into the interior, a looted vault with lava
// channels. Greed, not frost: the gold is still here, the lava is taking it back. Backgrounds, scene transition,
// gates and obstacles only so far; NPCs follow in a later pass.
const FROSTFELL_EXTERIOR_IMAGE = "/gloria-land-frostfell-exterior.jpg";
const FROSTFELL_INTERIOR_IMAGE = "/gloria-land-frostfell-interior.jpg";
const FROSTFELL_EXTERIOR_SIZE = { w: 1248, h: 832 };
const FROSTFELL_INTERIOR_SIZE = { w: 1248, h: 832 };

/** Measured with a pixel-grid overlay on the 1248x832 exterior painting: [x, y, w, h] in painting px. The walkable
 *  ground is the cobbled path -- from the foot of the painting (x ~570-1005) narrowing up to the stairs (x ~770-910) --
 *  so the boxes are everything else: the volcano face above the archway, the cliff faces and rock clusters either
 *  side of the path, and the stele and braziers at the bottom corners. The lava side (left) is cliff edge, never walkable. */
const FROSTFELL_EXTERIOR_OBSTACLES = obstaclesFromPixels(FROSTFELL_EXTERIOR_SIZE, [
  // the volcano face and the archway's own platform: the archway sits at the top of the stairs (door base ~y 390)
  [0, 0, 1248, 390],
  // west of the path: the cliff edge above the stairs, the rock cluster beside the cobbles, the stele outcrop below
  [0, 390, 790, 50], [0, 440, 770, 40], [0, 480, 700, 60], [0, 540, 640, 60], [0, 600, 600, 100], [0, 700, 570, 132],
  // east of the path: the braziers and rocks beside the stairs, the cliff face and its rocks, the right stele and brazier
  [910, 390, 338, 90], [850, 480, 398, 220], [1005, 700, 243, 132],
]);

/** Measured with a pixel-grid overlay on the 1248x832 interior painting: [x, y, w, h] in painting px, generated from the
 *  walkable floors minus the solid props, so every box edge lies on a floor or prop edge. Walkable: the central
 *  corridor (x ~572-712, from the bottom edge up to the stair), the stair (x 585-698) and the throne platform above
 *  it, the four stone slabs that bridge the lava ditches (y ~474-554 and ~652-744, both sides), and the floors of the
 *  four side chambers they lead to (north-west/north-east y ~346-446, south-west/south-east y ~612-792). Blocked: the
 *  lava itself, the back walls, the throne, the golden statues with their pedestals, the treasure chests, and the
 *  platform torches. Small coin piles are left walkable. */
const FROSTFELL_INTERIOR_OBSTACLES = obstaclesFromPixels(FROSTFELL_INTERIOR_SIZE, [
  // the back wall, throne and everything above the platform, and the walls either side of the platform and the stair
  [0, 0, 1248, 165], [840, 165, 408, 40], [0, 165, 420, 50], [428, 205, 26, 10], [824, 205, 424, 20], [0, 215, 454, 22],
  [813, 225, 435, 12], [0, 237, 585, 73], [698, 237, 550, 73], [0, 310, 572, 36], [712, 310, 536, 36],
  // north chambers: the statue pedestals, the treasure chests and their coin heaps, the lava slivers, the outer walls
  [340, 346, 100, 21], [813, 346, 112, 21], [148, 346, 148, 28], [148, 374, 124, 4], [1005, 346, 135, 34],
  [236, 378, 36, 30], [975, 380, 165, 28], [1005, 408, 135, 4], [60, 348, 72, 74], [0, 346, 10, 94], [1183, 346, 65, 94],
  [975, 440, 273, 5],
  // the lava ditches beside the corridor, and the walls and statues between the chambers and the slabs
  [505, 346, 67, 128], [712, 346, 61, 128], [0, 440, 410, 114], [843, 445, 405, 109], [0, 554, 572, 58],
  [298, 612, 112, 16], [712, 554, 536, 78], [412, 612, 160, 40], [712, 632, 131, 20],
  // south chambers: the big statue and chest on the west, the chest on the east, the outer walls
  [150, 612, 122, 91], [45, 612, 88, 120], [1026, 632, 152, 106], [0, 612, 20, 180],
  // the lava below the lower slabs, and the stone rim along the foot of the painting
  [412, 744, 160, 48], [712, 744, 131, 48], [1195, 632, 53, 160], [0, 792, 572, 40], [712, 792, 536, 40],
]);

function buildFrostfell(): LandDefinition {
  return {
    id: "frostfell",
    // first scene: the exterior. The path and stairs are walkable; the cliffs and rocks either side are solid.
    image: FROSTFELL_EXTERIOR_IMAGE,
    imageSize: FROSTFELL_EXTERIOR_SIZE,
    // the hero starts on the cobbles at the foot of the path
    start: { x: 62, y: 90 },
    gates: [
      // the stone archway cut into the volcano (the only gate here): reaching it carries the hero into the vault. The
      // trigger sits at the foot of the stairs (painting ~849, 458), clear of the archway whose base is ~y 390.
      { id: "entry", x: 68, y: 55, label: { ar: "مدخل المعبد الذهبي", en: "Golden Temple Gate" }, to: { scene: "interior" } },
    ],
    sprites: [],
    obstacles: FROSTFELL_EXTERIOR_OBSTACLES,
    scenes: {
      interior: {
        image: FROSTFELL_INTERIOR_IMAGE,
        imageSize: FROSTFELL_INTERIOR_SIZE,
        // the bottom of the central corridor, where the hero arrives from the exterior
        start: { x: 50, y: 95 },
        gates: [
          // where the hero arrives, and the way back: walking onto it again (after leaving its zone) fades the hero
          // out to the exterior, at the foot of the stairs below the same archway
          { id: "entry", x: 50, y: 95, label: { ar: "بوابة الدخول", en: "Entry Gate" }, to: { scene: FIRST_SCENE_ID } },
          // on the stair up to the throne platform
          { id: "boss", x: 50, y: 30, label: { ar: "ساحة المعركة", en: "Battle Arena" } },
          // on the throne platform, just in front of the throne: a dead end, with no separate exit door painted (the
          // throne's own solid base ends ~y 165, so the hero can stand right below it)
          { id: "exit", x: 50, y: 23, label: { ar: "بوابة الخروج", en: "Exit Gate" } },
        ],
        // the golden temple guardian boss, standing in the battle arena just south of the boss gate marker (50, 30)
        sprites: [{ id: "boss-frostfell", type: "boss-frostfell", x: 50, y: 36, scale: 1.5, coreSize: 48, direction: "south" }],
        bossBarrier: [bossFootprint(50, 36)],
        obstacles: FROSTFELL_INTERIOR_OBSTACLES,
      },
    },
  };
}

// ── Throne of Gloria ──────────────────────────────────────────────────────────────────────────────────────
// The final zone (zone 7, theme "throne"): the fourth TWO-SCENE land, same pattern as Aurelia, Drakemar and Frostfell.
// It opens on the exterior -- a snowy mountain path up to a glowing purple portal gate set into the ground -- and
// walking onto the snow in front of the portal's bottom step carries the hero into the interior: a long icy hall whose
// central carpet runs straight up to the throne, where the frozen king sits looming over the whole walk. Four open
// alcoves (treasure, weapon shrine, frozen fountain, a second hoard) branch off the hall through floor-level arches:
// optional detours, never needed for progression. Backgrounds, scene transition, gates and obstacles only so far.
//
// The interior painting is square (1024x1024) -- like Heartlands, this land's imageSize differs from the 1248x832 rest.
// Nothing here assumes an aspect ratio; the gate overlay and obstacles are all in the image's own pixels/percentages.
const THRONE_EXTERIOR_IMAGE = "/gloria-land-throne-exterior.jpg";
const THRONE_INTERIOR_IMAGE = "/gloria-land-throne-interior.jpg";
const THRONE_EXTERIOR_SIZE = { w: 1248, h: 832 };
const THRONE_INTERIOR_SIZE = { w: 1024, h: 1024 };

/** Measured with a pixel-grid overlay on the 1248x832 exterior painting: [x, y, w, h] in painting px. The walkable
 *  ground is the snowy clearing below the gate -- the path and its snow banks, x ~440-815 from the foot of the
 *  painting up to the portal's bottom step (y ~646) -- so the boxes are everything else: the gate structure with its
 *  torch pillars and steps and all the cliffs and forest above y 646, and either side of the clearing the boulders,
 *  shrubs, the two big pine trunks and the corner snow mounds. */
const THRONE_EXTERIOR_OBSTACLES = obstaclesFromPixels(THRONE_EXTERIOR_SIZE, [
  // the cliffs, forest, gate wall, torch pillars and the portal steps (their foot is ~y 645)
  [0, 0, 1248, 646],
  // west of the clearing: the boulder cluster, the pine trunk, the shrubs and the corner mound
  [0, 646, 440, 186],
  // east of the clearing: the boulder cluster, the pine trunk, the shrubs and the corner mound
  [815, 646, 433, 186],
]);

/** Measured with a pixel-grid overlay on the 1024x1024 interior painting: [x, y, w, h] in painting px. The whole hall
 *  floor is walkable -- the central carpet (x ~450-575, from the foot up to the throne stair at y ~275), the stone
 *  floor either side of it, the stair itself (x ~455-568, y ~178-275) and the floors of the four alcoves (north-west
 *  treasure room y ~300-495, north-east weapon shrine, and the south-west fountain and south-east hoard, which open
 *  onto the hall floor in front of their arches). Blocked: the back wall and everything above the alcove floors,
 *  the throne with the frozen king and the ice crystals either side of his stair, the arch rims and recesses of the
 *  two southern alcoves, the pillars and torch pedestals, the chests, altar, fountain basin and other large props, and
 *  the outer walls. Rugs, coin piles and the ice sheet are flat and left walkable. */
const THRONE_INTERIOR_OBSTACLES = obstaclesFromPixels(THRONE_INTERIOR_SIZE, [
  // the back wall either side of the stair channel, and the throne with the king (the stair top, y ~178, stays open)
  [0, 0, 455, 300], [570, 0, 454, 300], [455, 0, 115, 178],
  // the pillars and torch pedestals at the foot of the stair
  [350, 300, 40, 95], [378, 345, 45, 85], [645, 300, 40, 95], [608, 345, 42, 85],
  // north-west treasure alcove: the chests, the crown, the small chest, the crystals and the torch pedestal
  [0, 300, 26, 200], [28, 300, 150, 65], [140, 350, 55, 38], [248, 336, 46, 32], [272, 300, 50, 52], [28, 352, 40, 92], [225, 295, 45, 40],
  // north-east weapon shrine: the crystals, the altar, the chest, the shield and the weapon rack
  [682, 305, 65, 85], [765, 300, 145, 100], [900, 350, 70, 65], [945, 300, 50, 50], [890, 300, 45, 55], [958, 365, 35, 80],
  // the four torch pedestals along the hall
  [350, 545, 50, 95], [627, 548, 50, 100], [314, 845, 55, 118], [658, 840, 55, 122],
  // south-west fountain alcove: the arch and recess, the pillar, the torch pedestal, the basin, the crystals, the wall
  [0, 495, 255, 220], [255, 540, 92, 175], [295, 715, 52, 65], [255, 690, 42, 60], [35, 698, 218, 112], [25, 800, 85, 70], [0, 840, 48, 184],
  // south-east hoard alcove: the arch and recess, the pillar, the torch pedestal, and the chest, barrel, shield and vase
  [815, 495, 209, 220], [740, 520, 80, 195], [682, 555, 60, 160], [682, 715, 52, 65], [738, 655, 45, 85],
  [845, 665, 100, 135], [938, 715, 57, 100], [918, 765, 72, 85], [788, 722, 64, 70], [735, 720, 38, 45], [748, 690, 50, 60], [920, 820, 32, 35], [940, 795, 45, 70],
  // the outer walls and the stone block in the south-east corner
  [0, 0, 26, 1024], [975, 0, 49, 1024], [955, 985, 69, 39],
]);

function buildThroneOfGloria(): LandDefinition {
  return {
    id: "throne",
    // first scene: the exterior. The snowy clearing below the gate is walkable; everything above and beside it is solid.
    image: THRONE_EXTERIOR_IMAGE,
    imageSize: THRONE_EXTERIOR_SIZE,
    // the hero starts in the middle of the path, at the foot of the painting
    start: { x: 50, y: 94 },
    gates: [
      // the magical portal (the only gate here): reaching it carries the hero into the throne hall. The trigger sits on
      // the snow in front of the portal's bottom step (the steps end at ~y 645; this is painting ~624, 699), never on
      // the steps themselves, with open snow above it to step clear of the zone and re-arm.
      { id: "entry", x: 50, y: 84, label: { ar: "البوابة السحرية", en: "Magic Portal" }, to: { scene: "interior" } },
    ],
    sprites: [],
    obstacles: THRONE_EXTERIOR_OBSTACLES,
    scenes: {
      interior: {
        image: THRONE_INTERIOR_IMAGE,
        imageSize: THRONE_INTERIOR_SIZE,
        // the bottom of the central corridor, where the hero arrives from the exterior
        start: { x: 50, y: 95 },
        gates: [
          // where the hero arrives, and the way back: walking onto it again (after leaving its zone) fades the hero
          // out to the exterior, in front of the same portal
          { id: "entry", x: 50, y: 96, label: { ar: "بوابة الدخول", en: "Entry Gate" }, to: { scene: FIRST_SCENE_ID } },
          // on the open floor just below the throne stair, with the king looming above
          { id: "boss", x: 50, y: 27, label: { ar: "ساحة المعركة", en: "Battle Arena" } },
          // on the stair's top step, right in front of the king: a dead end, with no separate exit door painted (the
          // throne's solid base ends at y ~178, so the hero can stand right below it)
          { id: "exit", x: 50, y: 19, label: { ar: "بوابة الخروج", en: "Exit Gate" } },
        ],
        // the frozen king boss (final boss), standing in the battle arena just south of the boss gate marker (50, 27)
        sprites: [{ id: "boss-throne", type: "boss-throne", x: 50, y: 33, scale: 1.5, coreSize: 48, direction: "south" }],
        bossBarrier: [bossFootprint(50, 33)],
        obstacles: THRONE_INTERIOR_OBSTACLES,
      },
    },
  };
}

const LANDS: Partial<Record<ZoneTheme, LandDefinition>> = {
  forest: buildVerdantia(),
  oasis: buildSolmara(),
  sea: buildHeartlands(),
  mountain: buildAurelia(),
  castle: buildDrakemar(),
  volcano: buildFrostfell(),
  throne: buildThroneOfGloria(),
};

/** The land for a zone theme, or null when that zone's land hasn't been built yet. */
export function getZoneLand(theme: ZoneTheme): LandDefinition | null {
  return LANDS[theme] ?? null;
}

/**
 * The land as it looks in one of its scenes: a LandDefinition whose scene fields (image, gates, obstacles, ...) are
 * that scene's. With no `sceneId`, or for an id the land doesn't have (a single-scene land never does), it is the land
 * itself -- the very same object, so single-scene lands are untouched. A scene never inherits another scene's
 * ambience, sprites or obstacles.
 */
export function getLandScene(land: LandDefinition, sceneId?: LandSceneId): LandDefinition {
  const scene = sceneId ? land.scenes?.[sceneId] : undefined;
  if (!scene) return land;
  return {
    ...land,
    scenes: undefined,
    image: scene.image,
    imageSize: scene.imageSize,
    gates: scene.gates,
    ambience: scene.ambience,
    sprites: scene.sprites,
    obstacles: scene.obstacles,
    start: scene.start,
  };
}
