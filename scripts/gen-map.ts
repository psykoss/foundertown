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

/**
 * A table with chairs tucked in on all four sides (pixel-precise so chairs touch the table edges).
 * (tx, ty) = tile whose bottom edge the table stands on; `count` tables side by side.
 */
function tableSet(table: string, tx: number, ty: number, count = 1, sides = true) {
  const t = size(table);
  const x0 = tx * T + Math.round((T - t.w) / 2) - Math.round(((count - 1) * t.w) / 2);
  const base = (ty + 1) * T;
  for (let i = 0; i < count; i++) {
    const x = x0 + i * t.w;
    placePx(table, x, base);
    const cx = x + Math.round((t.w - size("chair_front").w) / 2);
    placePx("chair_front", cx, base - t.h + 6); // north side, facing the viewer (tucked behind the table)
    placePx("chair_back", cx, base + 10); // south side, backrest towards us
  }
  if (sides) {
    placePx("chair_left", x0 - size("chair_left").w + 3, base - 4); // west side, facing east
    placePx("chair_right", x0 + count * t.w - 3, base - 4); // east side, facing west
  }
}

// Open office: two rows of four desks with chairs (reference layout)
for (const row of [5, 10])
  for (const tx of [2, 6, 10, 14]) {
    placeC("desk", tx, row, 3);
    placeC("office_chair", tx, row + 1, 3, -6);
  }
placePx("plant_desk", 2 * T + 10, 6 * T - 20, 20);
placePx("monitor_desk", 15 * T + 8, 11 * T - 14, 20);
mount("window_wide", 2, 1, 3);
mount("painting_sunset", 6, 1, 1);
mount("window", 8, 1, 1);
mount("window_wide", 10, 1, 3);
mount("window", 14, 1, 1);
placeC("bookshelf", 16, 3, 1);
placeC("bookshelf", 17, 3, 1);
placeC("shelf_white", 18, 3, 1);
placeC("plant_tree", 1, 3, 1);
placeC("cabinet", 1, 8, 1);
placeC("lamp_red", 1, 14, 1);
placeC("plant_small", 18, 14, 1);
placeC("plant_tree", 18, 8, 1);
placeC("lamp_blue", 18, 5, 1);
placeC("plant_small", 1, 11, 1);
placeC("shelf_white", 15, 3, 1);
placeC("plant_tree", 9, 14, 1);
placeC("plant_tree", 11, 14, 1);

// Kitchen: counter run along the back wall, dining table with chairs
{
  let px = 21 * T + 4;
  const base = 4 * T - 2;
  const at: Record<string, number> = {};
  for (const n of ["fridge", "counter_drawers", "sink_double", "stove", "counter", "counter_cabinet", "counter_doors", "kitchen_shelf"]) {
    at[n] = px;
    placePx(n, px, base);
    px += size(n).w;
  }
  block(21, 3, 12, 1);
  placePx("microwave", at.counter_drawers! + 10, base - 22, 30);
  placePx("coffee_machine", at.counter! + 8, base - 22, 30);
  placePx("mixer", at.counter_cabinet! + 14, base - 22, 30);
}
for (const [tx, ty] of [[24, 7], [29, 7], [24, 10], [29, 10]] as const) tableSet("table_dining", tx, ty, 1);
placeC("plant_tree", 32, 11, 1);
placeC("plant_small", 21, 11, 1);
mount("painting_sea", 29, 1, 1);

// Bathroom: 3 stalls + an open one, urinals, vanities along the back wall
for (let i = 0; i < 4; i++) placePx(i === 3 ? "stall_open" : "stall", 21 * T + 6 + i * 32, 16 * T);
block(21, 15, 5, 1);
for (let i = 0; i < 3; i++) placePx("urinal", 26 * T + 6 + i * 18, 16 * T - 6);
placePx("vanity", 28 * T + 4, 16 * T);
placePx("vanity_double", 30 * T + 2, 16 * T);
block(26, 15, 7, 1);
placeC("plant_small", 32, 25, 1);
placeC("plant_tree", 21, 25, 1);

// Lounge: sofa facing down, side sofas facing in, coffee table on a rug
place("rug_red", 3, 22, 14, 6);
placeC("sofa_grey", 4, 20, 2, 2);
placeC("coffee_table", 4, 22, 2, -2);
place("sofa_side_a", 2, 23, 22, -6);
place("sofa_side_b", 6, 23, -12, -6);
mount("painting_forest", 5, 17, 1);
placeC("plant_tree", 1, 19, 1);
placeC("lamp_blue", 8, 19, 1);
placeC("bookshelf", 6, 19, 1);
placeC("bookshelf", 7, 19, 1);
place("rug_small_blue", 2, 25, 8, -4);
placeC("plant_small", 1, 25, 1);
placeC("plant_small", 8, 25, 1);

// Meeting room: two tables pushed together, chairs on all sides
tableSet("table_meeting", 15, 22, 2);
mount("chalkboard", 14, 17, 2);
placeC("plant_tree", 19, 19, 1);
placeC("wardrobe", 11, 19, 1);
placeC("cabinet", 12, 19, 1);
placeC("lamp_red", 18, 25, 1);
placeC("plant_small", 11, 25, 1);

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
