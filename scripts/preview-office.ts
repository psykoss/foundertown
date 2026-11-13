/**
 * Renders every department of the private office (shared/src/office.ts) at its starting size, and a
 * larger one, to docs/previews/office.png — the same floors and furniture the game lays out.
 *   pnpm tsx scripts/preview-office.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Canvas } from "./lib/pixel.js";
import { TILE } from "../shared/src/spec.js";
import type { TiledMap } from "../shared/src/map.js";
import { DEPARTMENTS, buildWorld, mapLibrary, type Space } from "../shared/src/office.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAPS = path.join(ROOT, "client/public/assets/maps");
const map: TiledMap = JSON.parse(fs.readFileSync(path.join(MAPS, "office.tmj"), "utf8"));
const lib = mapLibrary(map);
const terrain = Canvas.load(path.join(MAPS, "../tilesets/terrain.png"));
const ts = map.tilesets.find((t) => t.name === "terrain")!;

// two rows: starting sizes, then each department grown by 5×3 tiles
const spaces: Space[] = [];
let x = 1;
for (const d of DEPARTMENTS) {
  spaces.push({ id: d.id, kind: d.id, x, y: 4, w: d.size.w, h: d.size.h });
  spaces.push({ id: d.id + "2", kind: d.id, x, y: 14, w: d.size.w + 5, h: d.size.h + 3 });
  x += d.size.w + 6;
}
const W = x, H = 27;
const world = buildWorld({ ...map, width: W, height: H, layers: [] }, { spaces });

const out = new Canvas(W * TILE, H * TILE);
const tile = (gid: number, tx: number, ty: number) => {
  const id = gid - ts.firstgid;
  for (let y = 0; y < TILE; y++)
    for (let px = 0; px < TILE; px++) {
      const i = ((Math.floor(id / ts.columns) * TILE + y) * terrain.w + (id % ts.columns) * TILE + px) * 4;
      const o = ((ty * TILE + y) * out.w + tx * TILE + px) * 4;
      for (let k = 0; k < 4; k++) out.data[o + k] = terrain.data[i + k]!;
    }
};
for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) tile(ts.firstgid + 4, tx, ty); // cream brick
for (const s of world.spaces) for (let ty = s.y; ty < s.y + s.h; ty++) for (let tx = s.x; tx < s.x + s.w; tx++) tile(s.floor, tx, ty);
const props = new Map<string, Canvas>();
for (const f of [...world.furniture].sort((a, b) => a.y + a.z - (b.y + b.z))) {
  const info = [...lib.props.values()].find((p) => p.image === f.image)!;
  if (!props.has(info.path)) props.set(info.path, Canvas.load(path.resolve(MAPS, info.path)));
  out.blit(props.get(info.path)!, f.x, f.y - f.height);
}
const file = path.join(ROOT, "docs/previews/office.png");
out.save(file);
console.log(`office preview: ${path.relative(ROOT, file)} (${DEPARTMENTS.length} departments)`);
