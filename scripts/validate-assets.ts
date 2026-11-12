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

// ── map ──
const mapFile = path.join(A, "maps/town.tmj");
const map: TiledMap = JSON.parse(fs.readFileSync(mapFile, "utf8"));
for (const name of ["ground", "walls", "collision", "objects", "above", "markers"])
  if (!map.layers.some((l) => l.name === name)) err(`town.tmj: missing layer "${name}"`);
const maxGid = Math.max(...map.tilesets.map((t) => t.firstgid + t.tilecount - 1));
for (const l of map.layers) {
  l.data?.forEach((gid) => gid > maxGid && err(`town.tmj: layer ${l.name} has unknown gid ${gid}`));
  l.objects?.forEach((o) => o.gid && (o.gid & 0x1fffffff) > maxGid && err(`town.tmj: object ${o.id} unknown gid`));
}
for (const ts of map.tilesets) {
  if (ts.image && !fs.existsSync(path.resolve(path.dirname(mapFile), ts.image))) err(`town.tmj: missing ${ts.image}`);
  ts.tiles?.forEach((t) => t.image && !fs.existsSync(path.resolve(path.dirname(mapFile), t.image)) && err(`town.tmj: missing ${t.image}`));
}
const hasSpawn = map.layers.some((l) => l.objects?.some((o) => (o.type ?? o.class) === "spawn"));
if (!hasSpawn) err("town.tmj: no spawn marker");

if (errors.length) {
  console.error(`✗ asset validation failed (${errors.length}):\n  ` + errors.join("\n  "));
  process.exit(1);
}
console.log(`✓ assets valid: ${reg.items.length} items, map ${map.width}×${map.height}`);
