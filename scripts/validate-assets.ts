/**
 * Enforces the pixel spec on every asset. Fails (exit 1) on any violation.
 *   - character sheets: exact template size, idle/walk frames present, colors ∈ key ramps + fixed colors,
 *     no semi-transparency except the shadow layer
 *   - item default colors and the starter characters only use items and ramps that exist
 *   - furniture/tilesets: colors ∈ master palette
 *   - map: every gid resolves, required layers exist, at least one spawn
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Canvas } from "./lib/pixel.js";
import {
  ANIMS, ANIM_ORDER, FRAME_H, FRAME_W, SHEET_DIRS, SHEET_H, SHEET_W, sheetRow,
  KEY_RAMPS, FIXED_COLORS, masterPalette, LAYERS, SLOTS, STARTERS, rampLibraryFor,
  DEPARTMENTS, DESK_SETUP, buildWorld, mapLibrary, spaceFits,
  type ItemRegistry, type TiledMap,
} from "../shared/src/index.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const A = path.join(ROOT, "client/public/assets");
const errors: string[] = [];
const err = (m: string) => errors.push(m);

const hex = (r: number, g: number, b: number) => "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
const charColors = new Set<string>([...Object.values(KEY_RAMPS).flat(), ...Object.values(FIXED_COLORS)]);
const master = new Set(masterPalette());

function scanColors(c: Canvas, allowed: Set<string>, file: string, allowAlpha: boolean) {
  const bad = new Map<string, number>();
  for (let i = 0; i < c.data.length; i += 4) {
    const a = c.data[i + 3]!;
    if (a === 0) continue;
    if (a !== 255 && !allowAlpha) {
      err(`${file}: semi-transparent pixel at index ${i / 4} (alpha ${a})`);
      return;
    }
    const h = hex(c.data[i]!, c.data[i + 1]!, c.data[i + 2]!);
    if (!allowed.has(h)) bad.set(h, (bad.get(h) ?? 0) + 1);
  }
  if (bad.size) err(`${file}: ${bad.size} off-palette colors (${[...bad.keys()].slice(0, 6).join(", ")}${bad.size > 6 ? ", …" : ""})`);
}

function frameEmpty(c: Canvas, col: number, row: number): boolean {
  for (let y = row * FRAME_H; y < (row + 1) * FRAME_H; y++)
    for (let x = col * FRAME_W; x < (col + 1) * FRAME_W; x++) if (c.data[(y * c.w + x) * 4 + 3] !== 0) return false;
  return true;
}

// ── characters ──
const regFile = path.join(A, "characters/items.json");
const reg: ItemRegistry = JSON.parse(fs.readFileSync(regFile, "utf8"));
const ids = new Set<string>();
for (const item of reg.items) {
  if (ids.has(item.id)) err(`items.json: duplicate id ${item.id}`);
  ids.add(item.id);
  if (!SLOTS.includes(item.slot)) err(`items.json: ${item.id} has unknown slot ${item.slot}`);
  for (const ramp of Object.values(item.defaults ?? {}))
    if (!rampLibraryFor(item.slot)[ramp]) err(`items.json: ${item.id} defaults to unknown color "${ramp}"`);
  for (const part of [...item.parts, ...(item.partsUnderHat ?? [])]) {
    if (!LAYERS.includes(part.layer)) err(`items.json: ${item.id} unknown layer ${part.layer}`);
    const file = path.join(A, "characters", part.sheet);
    if (!fs.existsSync(file)) {
      err(`${part.sheet}: missing`);
      continue;
    }
    const c = Canvas.load(file);
    if (c.w !== SHEET_W || c.h !== SHEET_H) {
      err(`${part.sheet}: is ${c.w}×${c.h}, template is ${SHEET_W}×${SHEET_H}`);
      continue;
    }
    scanColors(c, charColors, part.sheet, part.layer === "shadow");
    if (item.slot === "body" && part.layer === "body")
      for (const anim of ANIM_ORDER)
        for (const dir of SHEET_DIRS)
          for (let f = 0; f < ANIMS[anim].frames; f++)
            if (frameEmpty(c, f, sheetRow(anim, dir))) err(`${part.sheet}: empty frame ${anim}_${dir} #${f}`);
  }
}

// starter characters: every slot wears a real, unlocked item of that slot in a real color
for (const st of STARTERS)
  for (const slot of SLOTS) {
    const c = st.avatar.slots[slot];
    if (!c) continue;
    const item = reg.items.find((i) => i.id === c.id);
    if (!item || item.slot !== slot || item.unlock) err(`starter ${st.id}: ${slot} wears ${c.id}, which is missing, locked or in another slot`);
    for (const ramp of [c.primary, c.secondary]) if (ramp && !rampLibraryFor(slot)[ramp]) err(`starter ${st.id}: ${slot} uses unknown color "${ramp}"`);
  }

// ── environment ──
for (const dir of ["tilesets", "furniture"]) {
  const files = (fs.readdirSync(path.join(A, dir), { recursive: true }) as string[]).filter((n) => n.endsWith(".png"));
  for (const f of files) scanColors(Canvas.load(path.join(A, dir, f)), master, `${dir}/${f}`, true);
}

// ── maps ──
const maps: Record<string, TiledMap> = {};
for (const name of ["town", "office"]) {
  const mapFile = path.join(A, `maps/${name}.tmj`);
  if (!fs.existsSync(mapFile)) {
    err(`${name}.tmj: missing`);
    continue;
  }
  const map: TiledMap = (maps[name] = JSON.parse(fs.readFileSync(mapFile, "utf8")));
  for (const layer of ["ground", "walls", "collision", "objects", "above", "markers"])
    if (!map.layers.some((l) => l.name === layer)) err(`${name}.tmj: missing layer "${layer}"`);
  const maxGid = Math.max(...map.tilesets.map((t) => t.firstgid + t.tilecount - 1));
  for (const l of map.layers) {
    l.data?.forEach((gid) => gid > maxGid && err(`${name}.tmj: layer ${l.name} has unknown gid ${gid}`));
    l.objects?.forEach((o) => o.gid && (o.gid & 0x1fffffff) > maxGid && err(`${name}.tmj: object ${o.id} unknown gid`));
  }
  for (const ts of map.tilesets) {
    if (ts.image && !fs.existsSync(path.resolve(path.dirname(mapFile), ts.image))) err(`${name}.tmj: missing ${ts.image}`);
    ts.tiles?.forEach((t) => t.image && !fs.existsSync(path.resolve(path.dirname(mapFile), t.image)) && err(`${name}.tmj: missing ${t.image}`));
  }
  const hasSpawn = map.layers.some((l) => l.objects?.some((o) => (o.type ?? o.class) === "spawn"));
  if (!hasSpawn) err(`${name}.tmj: no spawn marker`);
}

// the office: a floor to build on, and a carpet, a chair and room for every department
if (maps.office) {
  const world = buildWorld(maps.office);
  const lib = mapLibrary(maps.office);
  if (!world.build) err(`office.tmj: no zone of kind "build"`);
  for (const d of DEPARTMENTS) {
    if (!lib.floors.has(d.id)) err(`office.tmj: no terrain tile with floor="${d.id}"`);
    if (!lib.props.has(d.chair)) err(`office.tmj: department ${d.id} uses the missing prop ${d.chair}`);
    if (world.build && !spaceFits([], { id: "a", kind: d.id, x: world.build.x, y: world.build.y, ...d.size }, world.build)) err(`department ${d.id}: its starting size does not fit the office`);
  }
  for (const p of ["desk", "office_chair", "plant_tree", "plant_small", "plant_pot", ...DESK_SETUP.map((d) => d.prop)]) if (!lib.props.has(p)) err(`office.tmj: missing prop ${p}`);
  if (!lib.props.get("office_chair")?.seat) err("office.tmj: office_chair is not a seat");
}

if (errors.length) {
  console.error(`✗ asset validation failed (${errors.length}):\n  ` + errors.join("\n  "));
  process.exit(1);
}
console.log(`✓ assets valid: ${reg.items.length} items, maps ${Object.entries(maps).map(([n, m]) => `${n} ${m.width}×${m.height}`).join(", ")}`);
