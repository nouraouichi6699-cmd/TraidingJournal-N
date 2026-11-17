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
  type: "farmer" | "horse" | "guard" | "boss-serpent" | "npc";
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

export interface LandDefinition {
  id: string;
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
  // the Hesitation Serpent coiled inside the boss gate's ring marker, clear of the guard patrolling the gate
  // doors above it; stationary, always facing south toward the player
  {
    id: "boss-serpent", type: "boss-serpent", x: 50, y: 42, scale: 0.5, coreSize: 252, direction: "south",
  },
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
      { id: "exit", x: 50, y: 5, label: { ar: "بوابة الخروج", en: "Exit Gate" } },
    ],
    ambience: VERDANTIA_AMBIENCE,
    sprites: VERDANTIA_SPRITES,
    obstacles: VERDANTIA_OBSTACLES,
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
      { id: "exit", x: 51, y: 19, label: { ar: "بوابة الخروج", en: "Exit Gate" } },
    ],
    sprites: [],
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
    sprites: [],
    obstacles: HEARTLANDS_OBSTACLES,
  };
}

const LANDS: Partial<Record<ZoneTheme, LandDefinition>> = {
  forest: buildVerdantia(),
  oasis: buildSolmara(),
  sea: buildHeartlands(),
};

/** The land for a zone theme, or null when that zone's land hasn't been built yet. */
export function getZoneLand(theme: ZoneTheme): LandDefinition | null {
  return LANDS[theme] ?? null;
}
