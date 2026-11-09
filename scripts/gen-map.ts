/**
 * Generates the starter OFFICE map as a Tiled map (.tmj) with embedded tilesets.
 * After this first generation the map is edited in Tiled — this script refuses to overwrite an existing
 * map unless you pass --force.
 *
 * Layout (34×27 tiles):
 *   ┌──────────── open office ────────────┬──── kitchen ────┐
 *   │ lavender carpet, 8 desks + chairs   │ counters, table │
 *   │                                     ├──── bathroom ───┤
 *   ├──── lounge ─────┬──── meeting ──────┤ stalls, sinks   │
 *   └─────────────────┴───────────────────┴─────────────────┘
 *
 * Walls: a horizontal wall = cap row + 2 face rows below it (3/4 view); vertical walls = cap column.
 * Props come from the prop library (art/props, see scripts/tools/build_props.py) by name.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TERRAIN, TERRAIN_COLUMNS, TERRAIN_COUNT } from "./lib/env.js";
import type { TiledMap, TiledObject, TiledLayer, TiledProperty } from "../shared/src/map.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = path.join(ROOT, "client/public/assets");
const OUT = path.join(ASSETS, "maps/town.tmj");
if (fs.existsSync(OUT) && !process.argv.includes("--force")) {
  console.log("map: town.tmj exists, keeping it (edit it in Tiled; --force regenerates)");
  process.exit(0);
}

const W = 34;
const H = 27;
const T = 32;
const FIRST_TERRAIN = 1;
const FIRST_FURN = 1 + TERRAIN_COUNT;

const layer = () => new Array(W * H).fill(0);
const ground = layer(), detail = layer(), walls = layer(), collision = layer(), above = layer();
const objects: TiledObject[] = [];
const markers: TiledObject[] = [];
let nextId = 1;

const set = (l: number[], x: number, y: number, id: number) => {
  if (x >= 0 && y >= 0 && x < W && y < H) l[y * W + x] = FIRST_TERRAIN + id;
};
const clear = (l: number[], x: number, y: number) => {
  if (x >= 0 && y >= 0 && x < W && y < H) l[y * W + x] = 0;
};
const fill = (l: number[], x: number, y: number, w: number, h: number, id: number) => {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) set(l, xx, yy, id);
};
const block = (x: number, y: number, w = 1, h = 1) => fill(collision, x, y, w, h, TERRAIN.collision);

// ── floors ──
fill(ground, 0, 0, W, H, TERRAIN.wood); // cream brick (office default)
fill(ground, 2, 4, 17, 10, TERRAIN.carpet); // desk area (lavender carpet, like the reference office)
fill(ground, 21, 3, 12, 9, TERRAIN.floorYellow); // kitchen
fill(ground, 21, 15, 12, 11, TERRAIN.floorBath); // bathroom
fill(ground, 1, 19, 9, 7, TERRAIN.floorHerringbone); // lounge
fill(ground, 11, 19, 9, 7, TERRAIN.floorConcrete); // meeting room

// ── walls ──
/** Horizontal wall: cap at y, faces at y+1 (with window/face) and y+2 (baseboard); gaps = door columns. */
function hwall(y: number, x1: number, x2: number, gaps: number[] = [], windows: number[] = []) {
  for (let x = x1; x <= x2; x++) {
    if (gaps.includes(x)) continue;
    set(walls, x, y, TERRAIN.wallTop);
    set(walls, x, y + 1, windows.includes(x) ? TERRAIN.wallWindow : TERRAIN.wallFace);
    set(walls, x, y + 2, TERRAIN.wallFaceLow);
    block(x, y, 1, 3);
  }
}
/** Vertical wall: cap column; gaps = door rows. */
function vwall(x: number, y1: number, y2: number, gaps: number[] = []) {
  for (let y = y1; y <= y2; y++) {
    if (gaps.includes(y)) {
      clear(walls, x, y);
      clear(collision, x, y);
      continue;
    }
    set(walls, x, y, TERRAIN.wallTop);
    block(x, y);
  }
}
hwall(0, 0, W - 1); // back wall of office + kitchen
hwall(16, 0, 20, [4, 5, 14, 15]); // office | lounge + meeting (doors)
hwall(12, 21, W - 1, []); // kitchen | bathroom
vwall(0, 0, H - 1);
vwall(W - 1, 0, H - 1);
vwall(20, 0, H - 1, [7, 8, 15, 21, 22]); // doors: office↔kitchen, office↔bathroom, meeting↔bathroom
vwall(10, 16, H - 1, [22, 23]); // lounge | meeting
for (let x = 0; x < W; x++) {
  set(walls, x, H - 1, TERRAIN.wallTop);
  block(x, H - 1);
}

// ── props ──
const lib: { props: { name: string; file: string; w: number; h: number; footprintW: number; footprintH: number; layer?: string }[] } = {
  props: JSON.parse(fs.readFileSync(path.join(ASSETS, "furniture/furniture.json"), "utf8")),
};
const byName = new Map(lib.props.map((p, i) => [p.name, { ...p, gid: FIRST_FURN + i }]));
const size = (name: string) => byName.get(name)!;

/**
 * Place a prop. (px, py) = pixel position of its BOTTOM-LEFT corner (Tiled tile-object convention).
 * Helpers below place by tile.
 */
function placePx(name: string, px: number, py: number, z = 0) {
  const p = byName.get(name);
  if (!p) throw new Error(`unknown prop ${name}`);
  const properties: TiledProperty[] = z ? [{ name: "z", type: "int", value: z }] : [];
  objects.push({ id: nextId++, name, x: Math.round(px), y: Math.round(py), width: p.w, height: p.h, gid: p.gid, properties });
}
/** Stand a prop on tile row `ty` (its base on the bottom of that row), left edge at tile tx (+ px offset). */
const place = (name: string, tx: number, ty: number, dx = 0, dy = 0, z = 0) => placePx(name, tx * T + dx, (ty + 1) * T + dy, z);
/** Center a prop horizontally within `tiles` tiles starting at tx. */
const placeC = (name: string, tx: number, ty: number, tiles: number, dy = 0, z = 0) =>
  place(name, tx, ty, Math.round((tiles * T - size(name).w) / 2), dy, z);
/** Wall-mounted decor on a face row (no collision, drawn above the wall). */
const mount = (name: string, tx: number, faceRow: number, tiles = 1) => placeC(name, tx, faceRow, tiles, -4);

// Open office: two rows of four desks with chairs (reference layout)
for (const row of [5, 10])
  for (const tx of [2, 6, 10, 14]) {
    placeC("desk", tx, row, 3);
    placeC("office_chair", tx, row + 1, 3, -6);
  }
placeC("plant_desk", 2, 5, 1, -22, 20);
placeC("plant_desk", 16, 10, 1, -22, 20);
mount("window_wide", 2, 1, 4);
mount("painting_sunset", 7, 1, 2);
mount("window", 10, 1, 2);
mount("window_wide", 13, 1, 4);
place("bookshelf", 17, 3, 0, 0);
placeC("plant_tree", 1, 3, 1);
placeC("shelf_white", 9, 3, 1);
placeC("lamp_red", 1, 14, 1);
placeC("plant_small", 18, 14, 1);
placeC("cabinet", 1, 8, 1, 0);

// Kitchen: counter run along the back wall, dining table with chairs
{
  let px = 21 * T + 4;
  const base = 4 * T - 2;
  for (const n of ["fridge", "counter_drawers", "sink_double", "stove", "counter", "counter_cabinet", "counter_doors", "kitchen_shelf"]) {
    placePx(n, px, base);
    px += size(n).w;
  }
  block(21, 3, 12, 1);
  placePx("microwave", 21 * T + 4 + size("fridge").w + 8, base - 24, 30);
  placePx("coffee_machine", 21 * T + 4 + size("fridge").w + 47 + 47 + 29 + 8, base - 24, 30);
  placePx("mixer", 21 * T + 4 + size("fridge").w + 47 + 47 + 29 + 31 + 12, base - 24, 30);
}
place("table_dining", 25, 9, 6, 0);
placeC("chair_front", 25, 6, 3, 0);
placeC("chair_back", 25, 10, 3, 0);
place("chair_left", 24, 9, 4, -6);
place("chair_right", 28, 9, 2, -6);
placeC("plant_tree", 32, 11, 1);
mount("painting_sea", 29, 1, 2);

// Bathroom: stalls + urinals + vanities on the back wall
place("stalls", 22, 15, 4, 0);
place("urinals", 27, 15, -6, -2);
place("vanity", 29, 15, 4, 0);
place("vanity_double", 31, 15, -4, 0);
placeC("plant_small", 32, 25, 1);

// Lounge
place("rug_red", 2, 23, 12, 10);
placeC("sofa_grey", 3, 20, 3, 4);
placeC("coffee_table", 3, 22, 3, 6);
place("sofa_side_a", 1, 23, 4, 0);
place("sofa_side_b", 7, 23, 4, 0);
mount("painting_forest", 6, 17, 2);
placeC("plant_tree", 1, 19, 1);
placeC("lamp_blue", 8, 19, 1);
placeC("plant_small", 8, 25, 1);

// Meeting room
place("rug_green", 13, 23, 8, 6);
placeC("table_meeting", 13, 23, 3, -6);
placeC("chair_front", 13, 20, 3, 4);
placeC("chair_back", 13, 24, 3, 4);
place("chair_left", 12, 22, 2, 0);
place("chair_right", 16, 22, 4, 0);
mount("chalkboard", 13, 17, 3);
placeC("plant_tree", 19, 19, 1);
placeC("wardrobe", 11, 25, 2, 0);

// ── markers ──
markers.push({ id: nextId++, name: "main", type: "spawn", x: 10 * T + 16, y: 14 * T + 16, width: 0, height: 0 });
const zone = (name: string, kind: string, x: number, y: number, w: number, h: number) =>
  markers.push({ id: nextId++, name, type: "zone", x: x * T, y: y * T, width: w * T, height: h * T, properties: [{ name: "kind", type: "string", value: kind }] });
zone("open_office", "room", 1, 3, 19, 13);
zone("kitchen", "room", 21, 3, 12, 9);
zone("bathroom", "room", 21, 15, 12, 11);
zone("lounge", "room", 1, 19, 9, 7);
zone("meeting_room", "room", 11, 19, 9, 7);

const tileLayer = (id: number, name: string, data: number[], visible = true): TiledLayer => ({
  id, name, type: "tilelayer", width: W, height: H, data, visible, opacity: 1,
});

const map: TiledMap & Record<string, unknown> = {
  type: "map",
  version: "1.10",
  tiledversion: "1.10.2",
  orientation: "orthogonal",
  renderorder: "right-down",
  width: W,
  height: H,
  tilewidth: T,
  tileheight: T,
  infinite: false,
  nextlayerid: 9,
  nextobjectid: nextId,
  layers: [
    tileLayer(1, "ground", ground),
    tileLayer(2, "ground_detail", detail),
    tileLayer(3, "walls", walls),
    tileLayer(4, "collision", collision, false),
    { id: 5, name: "objects", type: "objectgroup", objects, visible: true, opacity: 1, draworder: "topdown" } as TiledLayer,
    tileLayer(6, "above", above),
    { id: 7, name: "markers", type: "objectgroup", objects: markers, visible: true, opacity: 1 } as TiledLayer,
  ],
  tilesets: [
    {
      firstgid: FIRST_TERRAIN, name: "terrain", tilewidth: T, tileheight: T, tilecount: TERRAIN_COUNT,
      columns: TERRAIN_COLUMNS, image: "../tilesets/terrain.png", imagewidth: TERRAIN_COLUMNS * T,
      imageheight: (TERRAIN_COUNT / TERRAIN_COLUMNS) * T, margin: 0, spacing: 0,
    } as TiledMap["tilesets"][number],
    {
      firstgid: FIRST_FURN, name: "props", tilewidth: 160, tileheight: 160, tilecount: lib.props.length, columns: 0,
      grid: { orientation: "orthogonal", width: 1, height: 1 }, margin: 0, spacing: 0,
      tiles: lib.props.map((m, i) => ({
        id: i, image: `../furniture/${m.file}`, imagewidth: m.w, imageheight: m.h,
        properties: [
          { name: "footprintW", type: "int", value: m.footprintW },
          { name: "footprintH", type: "int", value: m.footprintH },
          ...(m.layer ? [{ name: "layer", type: "string", value: m.layer }] : []),
        ],
      })),
    } as TiledMap["tilesets"][number],
  ],
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(map));
console.log(`map: wrote ${path.relative(ROOT, OUT)} (${W}×${H}, ${objects.length} props)`);
