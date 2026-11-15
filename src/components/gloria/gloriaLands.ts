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
  /** The horse's hooves, where its dust puffs up. */
  horse?: { x: number; y: number };
  /** Farmers at work: chaff flying up from a harvest, or dust at a walker's feet, every `period` seconds. */
  farmers?: { x: number; y: number; kind: "harvest" | "walk"; period: number }[];
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
  horse: { x: 16.4, y: 36.4 }, //               hooves (205, 303), stable yard
  farmers: [
    { x: 17.1, y: 72.5, kind: "harvest", period: 3 }, // reaper in the west wheat (213, 603)
    { x: 83.1, y: 69.7, kind: "walk", period: 4 }, //    gardener in the east vegetable plot (1037, 580)
  ],
};

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

const LANDS: Partial<Record<ZoneTheme, LandDefinition>> = { forest: buildVerdantia() };

/** The land for a zone theme, or null when that zone's land hasn't been built yet. */
export function getZoneLand(theme: ZoneTheme): LandDefinition | null {
  return LANDS[theme] ?? null;
}
