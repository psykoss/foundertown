/**
 * Renders composed avatars (all frames, all directions) to docs/previews/*.png at 4× —
 * same layer order + palette swap as the game. Use it to review art without running the game.
 *   pnpm tsx scripts/preview-avatar.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Canvas } from "./lib/pixel.js";
import {
  ANIMS, ANIM_ORDER, FRAME_H, FRAME_W, SHEET_DIRS, sheetRow,
  LAYER_ORDER, DEFAULT_AVATAR, SLOTS, resolveRamp, skinRamp,
  buildSwapTable, swapPixels, type Avatar, type ItemRegistry, type Layer, type Ramp, type SlotChoice,
} from "../shared/src/index.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = path.join(ROOT, "client/public/assets/characters");
const reg: ItemRegistry = JSON.parse(fs.readFileSync(path.join(ASSETS, "items.json"), "utf8"));

function compose(a: Avatar): Canvas {
  const layers = new Map<Layer, Canvas>();
  for (const slot of SLOTS) {
    const choice = a.slots[slot] as SlotChoice | null | undefined;
    if (!choice) continue;
    const item = reg.items.find((i) => i.id === choice.id)!;
    for (const part of item.parts) {
      const sheet = Canvas.load(path.join(ASSETS, part.sheet));
      const swaps: Partial<Record<"skin" | "primary" | "secondary", Ramp>> = { skin: skinRamp(a.skin) };
      const p = resolveRamp(slot, choice.primary);
      const s = resolveRamp(slot, choice.secondary);
      if (p) swaps.primary = p;
      if (s) swaps.secondary = s;
      swapPixels(sheet.data, buildSwapTable(swaps));
      layers.set(part.layer, sheet);
    }
  }
  const out = new Canvas(layers.values().next().value!.w, layers.values().next().value!.h);
  for (const dir of SHEET_DIRS)
    for (const anim of ANIM_ORDER) {
      const y = sheetRow(anim, dir) * FRAME_H;
      const row = new Canvas(out.w, FRAME_H);
      for (const layer of LAYER_ORDER[dir]) {
        const src = layers.get(layer);
        if (!src) continue;
        const slice = new Canvas(src.w, FRAME_H);
        slice.data.set(src.data.subarray(y * src.w * 4, (y + FRAME_H) * src.w * 4));
        row.blit(slice, 0, 0);
      }
      out.blit(row, 0, y);
    }
  return out;
}

function scale(c: Canvas, k: number, bg = "#3f7a3e"): Canvas {
  const o = new Canvas(c.w * k, c.h * k);
  o.fill(0, 0, o.w, o.h, bg);
  for (let y = 0; y < c.h; y++)
    for (let x = 0; x < c.w; x++) {
      const i = (y * c.w + x) * 4;
      const a = c.data[i + 3]!;
      if (!a) continue;
      for (let yy = 0; yy < k; yy++)
        for (let xx = 0; xx < k; xx++) {
          const j = ((y * k + yy) * o.w + x * k + xx) * 4;
          for (let ch = 0; ch < 3; ch++) o.data[j + ch] = Math.round((c.data[i + ch]! * a + o.data[j + ch]! * (255 - a)) / 255);
        }
    }
  return o;
}

const looks: Record<string, Avatar> = {
  default: DEFAULT_AVATAR,
  hoodie: { skin: "brown", slots: { ...DEFAULT_AVATAR.slots, hair: { id: "hair_long_01", primary: "black" }, outerwear: { id: "outer_hoodie_01", primary: "mustard", secondary: "cream" }, bottom: { id: "bottom_skirt_01", primary: "charcoal" }, shoes: { id: "shoes_boots_01", primary: "charcoal", secondary: "beige" }, back_accessory: { id: "backpack_01", primary: "sage", secondary: "teal" } } },
  founder: { skin: "porcelain", slots: { ...DEFAULT_AVATAR.slots, hair: { id: "hair_bun_01", primary: "blonde" }, top: { id: "top_longsleeve_01", primary: "cream", secondary: "slate" }, outerwear: { id: "outer_blazer_01", primary: "slate", secondary: "cream" }, face_accessory: { id: "glasses_01" }, bottom: { id: "bottom_pants_01", primary: "charcoal" } } },
  cap: { skin: "deep", slots: { ...DEFAULT_AVATAR.slots, headwear: { id: "head_cap_01", primary: "orange", secondary: "charcoal" }, bottom: { id: "bottom_shorts_01", primary: "beige" }, top: { id: "top_tee_01", primary: "rust" } } },
};

fs.mkdirSync(path.join(ROOT, "docs/previews"), { recursive: true });
for (const [name, a] of Object.entries(looks)) {
  scale(compose(a), 4).save(path.join(ROOT, `docs/previews/avatar_${name}.png`));
}
void ANIMS; void FRAME_W;
console.log("previews written to docs/previews/");
