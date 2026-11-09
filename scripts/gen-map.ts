/**
 * Generates the STARTER town map as a Tiled map (.tmj) with embedded tilesets.
 * After this first generation, the map is edited in Tiled — this script refuses to overwrite
 * an existing map unless you pass --force.
 *
 * Layers (see docs/spec.md §Map):
 *   ground, ground_detail, walls  → tile layers drawn under characters
 *   collision                     → tile layer, hidden in game, any tile = blocked
 *   objects                       → furniture as TILE OBJECTS (y-sorted with characters)
 *   above                         → tile layer always drawn over characters
 *   markers                       → spawns + zones
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rng } from "./lib/pixel.js";
import { TERRAIN, TERRAIN_COLUMNS, TERRAIN_COUNT } from "./lib/env.js";
import type { TiledMap, TiledObject, TiledLayer } from "../shared/src/map.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = path.join(ROOT, "client/public/assets");
const OUT = path.join(ASSETS, "maps/town.tmj");
if (fs.existsSync(OUT) && !process.argv.includes("--force")) {
  console.log("map: town.tmj exists, keeping it (edit it in Tiled; --force regenerates)");
  process.exit(0);
}

const W = 48;
const H = 34;
const T = 32;
const FIRST_TERRAIN = 1;
const FIRST_FURN = 1 + TERRAIN_COUNT;

const ground = new Array(W * H).fill(0);
const detail = new Array(W * H).fill(0);
const walls = new Array(W * H).fill(0);
const collision = new Array(W * H).fill(0);
const above = new Array(W * H).fill(0);
const objects: TiledObject[] = [];
const markers: TiledObject[] = [];
let nextId = 1;

const g = (id: number) => FIRST_TERRAIN + id;
const set = (layer: number[], x: number, y: number, id: number) => {
  if (x >= 0 && y >= 0 && x < W && y < H) layer[y * W + x] = g(id);
};
const block = (x: number, y: number) => set(collision, x, y, TERRAIN.collision);
const fillRect = (layer: number[], x: number, y: number, w: number, h: number, id: number) => {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) set(layer, xx, yy, id);
};

// Grass base with variation
const rand = rng(1234);
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const r = rand();
    set(ground, x, y, r < 0.08 ? TERRAIN.grass2 : r < 0.3 ? TERRAIN.grass1 : TERRAIN.grass0);
  }

// Border hedge
for (let x = 0; x < W; x++) {
  set(walls, x, 0, TERRAIN.hedge);
  set(walls, x, H - 1, TERRAIN.hedge);
  block(x, 0);
  block(x, H - 1);
}
for (let y = 0; y < H; y++) {
  set(walls, 0, y, TERRAIN.hedge);
  set(walls, W - 1, y, TERRAIN.hedge);
  block(0, y);
  block(W - 1, y);
}

// Paths
fillRect(ground, 1, 17, W - 2, 2, TERRAIN.path);
fillRect(ground, 23, 14, 2, H - 15, TERRAIN.path);
fillRect(ground, 10, 14, 2, 3, TERRAIN.path);
fillRect(ground, 36, 14, 2, 3, TERRAIN.path);

/**
 * A building in 3/4 view: back wall shows its FACE (2 tiles tall), side and front walls show only
 * their top cap. Door = gap in the front wall.
 */
function building(x: number, y: number, w: number, h: number, floor: number, doorX: number, windows: number[]) {
  fillRect(ground, x + 1, y + 3, w - 2, h - 4, floor);
  // back wall: cap row + 2 face rows
  fillRect(walls, x, y, w, 1, TERRAIN.wallTop);
  fillRect(walls, x + 1, y + 1, w - 2, 1, TERRAIN.wallFace);
  fillRect(walls, x + 1, y + 2, w - 2, 1, TERRAIN.wallFaceLow);
  for (const wx of windows) set(walls, x + wx, y + 1, TERRAIN.wallWindow);
  // side walls (caps)
  fillRect(walls, x, y, 1, h, TERRAIN.wallTop);
  fillRect(walls, x + w - 1, y, 1, h, TERRAIN.wallTop);
  // front wall cap with door gap
  for (let xx = x; xx < x + w; xx++) if (xx !== doorX && xx !== doorX + 1) set(walls, xx, y + h - 1, TERRAIN.wallTop);
  set(ground, doorX, y + h - 1, TERRAIN.doormat);
  set(ground, doorX + 1, y + h - 1, TERRAIN.doormat);
  // collision: everything wall except door
  for (let yy = y; yy < y + h; yy++)
    for (let xx = x; xx < x + w; xx++) {
      const inside = xx > x && xx < x + w - 1 && yy >= y + 3 && yy < y + h - 1;
      const door = yy === y + h - 1 && (xx === doorX || xx === doorX + 1);
      if (!inside && !door) block(xx, yy);
    }
}

building(2, 2, 18, 12, TERRAIN.wood, 10, [3, 6, 11, 14]); // Office
building(28, 2, 18, 12, TERRAIN.tileFloor, 36, [3, 7, 10, 14]); // Café
fillRect(ground, 31, 9, 8, 3, TERRAIN.carpet);

// Pond
fillRect(ground, 34, 23, 8, 5, TERRAIN.water);
fillRect(ground, 33, 22, 10, 1, TERRAIN.sand);
fillRect(ground, 33, 28, 10, 1, TERRAIN.sand);
fillRect(ground, 33, 23, 1, 5, TERRAIN.sand);
fillRect(ground, 42, 23, 1, 5, TERRAIN.sand);
for (let y = 23; y < 28; y++) for (let x = 34; x < 42; x++) block(x, y);

// Plaza (pill stations)
fillRect(ground, 19, 22, 10, 6, TERRAIN.path);

// ── Furniture (tile objects: x = left, y = BOTTOM in pixels) ──
const furnMeta: { name: string; w: number; h: number; footprintW: number; footprintH: number }[] = JSON.parse(
  fs.readFileSync(path.join(ASSETS, "furniture/furniture.json"), "utf8"),
);
const furnIndex = new Map(furnMeta.map((f, i) => [f.name, i]));
function place(name: string, tileX: number, tileY: number) {
  const i = furnIndex.get(name);
  if (i === undefined) throw new Error(`unknown furniture ${name}`);
  const m = furnMeta[i]!;
  // tileY = the tile row the furniture's base stands on
  objects.push({ id: nextId++, name, x: tileX * T, y: (tileY + 1) * T, width: m.w, height: m.h, gid: FIRST_FURN + i });
}

// Office
place("whiteboard", 4, 5);
place("bookshelf", 15, 5);
place("plant", 18, 5);
place("plant", 3, 12);
for (const [x, y] of [[4, 7], [8, 7], [13, 7], [4, 10], [8, 10], [13, 10]] as const) {
  place("desk", x, y);
  place("chair", x, y + 1);
}
place("sofa", 16, 12);

// Café
place("counter", 30, 5);
place("plant", 44, 5);
place("bookshelf", 41, 5);
for (const [x, y] of [[32, 8], [38, 8], [32, 11], [41, 11]] as const) place("table_round", x, y);
place("chair", 34, 8);
place("chair", 40, 8);
place("sofa", 29, 12);

// Outdoors
for (const [x, y] of [[3, 21], [7, 25], [3, 29], [13, 23], [16, 29], [44, 20], [45, 30], [30, 30], [10, 30]] as const) place("tree", x, y);
place("bench", 20, 21);
place("bench", 26, 21);
place("bench", 36, 21);
place("lamp", 18, 19);
place("lamp", 29, 19);
place("lamp", 18, 28);
place("lamp", 29, 28);
place("pill_station", 21, 24);
place("pill_station", 23, 24);
place("pill_station", 25, 24);
place("pill_station", 27, 24);

// ── Markers ──
markers.push({ id: nextId++, name: "main", type: "spawn", x: 24 * T + 16, y: 19 * T + 16, width: 0, height: 0 });
const zone = (name: string, kind: string, x: number, y: number, w: number, h: number) =>
  markers.push({ id: nextId++, name, type: "zone", x: x * T, y: y * T, width: w * T, height: h * T, properties: [{ name: "kind", type: "string", value: kind }] });
zone("office", "room", 3, 5, 16, 8);
zone("cafe", "room", 29, 5, 16, 8);
zone("pill_plaza", "pills", 19, 22, 10, 6);

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
      firstgid: FIRST_FURN, name: "furniture", tilewidth: 96, tileheight: 96, tilecount: furnMeta.length, columns: 0,
      grid: { orientation: "orthogonal", width: 1, height: 1 }, margin: 0, spacing: 0,
      tiles: furnMeta.map((m, i) => ({
        id: i, image: `../furniture/${m.name}.png`, imagewidth: m.w, imageheight: m.h,
        properties: [
          { name: "footprintW", type: "int", value: m.footprintW },
          { name: "footprintH", type: "int", value: m.footprintH },
        ],
      })),
    } as TiledMap["tilesets"][number],
  ],
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(map));
console.log(`map: wrote ${path.relative(ROOT, OUT)} (${W}×${H}, ${objects.length} objects)`);
