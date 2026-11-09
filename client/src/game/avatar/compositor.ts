/**
 * Avatar compositor: layer sheets → palette swap → one baked sheet (same template).
 * Pure DOM canvas, no Phaser — used by the game AND the builder preview.
 */
import {
  FRAME_H, SHEET_DIRS, SHEET_H, SHEET_W, ANIM_ORDER, sheetRow, LAYER_ORDER, SLOTS,
  avatarKey, buildSwapTable, resolveRamp, skinRamp, swapPixels,
  type Avatar, type Channel, type ItemRegistry, type Layer, type Ramp,
} from "@ft/shared";

const BASE = "assets/characters/";
const images = new Map<string, Promise<HTMLImageElement>>();
const baked = new Map<string, Promise<HTMLCanvasElement>>();

function loadImage(url: string): Promise<HTMLImageElement> {
  let p = images.get(url);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`failed to load ${url}`));
      img.src = url;
    });
    images.set(url, p);
  }
  return p;
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

async function recoloredLayer(sheet: string, swaps: Partial<Record<Channel, Ramp>>): Promise<HTMLCanvasElement> {
  const img = await loadImage(BASE + sheet);
  const [c, ctx] = canvas(SHEET_W, SHEET_H);
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, SHEET_W, SHEET_H);
  swapPixels(data.data, buildSwapTable(swaps));
  ctx.putImageData(data, 0, 0);
  return c;
}

async function bake(a: Avatar, reg: ItemRegistry): Promise<HTMLCanvasElement> {
  const byId = new Map(reg.items.map((i) => [i.id, i]));
  const layers = new Map<Layer, HTMLCanvasElement>();
  const jobs: Promise<void>[] = [];

  for (const slot of SLOTS) {
    const choice = a.slots[slot];
    if (!choice) continue;
    const item = byId.get(choice.id);
    if (!item) continue;
    const swaps: Partial<Record<Channel, Ramp>> = { skin: skinRamp(a.skin) };
    const p = resolveRamp(slot, choice.primary);
    const s = resolveRamp(slot, choice.secondary);
    if (p) swaps.primary = p;
    if (s) swaps.secondary = s;
    for (const part of item.parts)
      jobs.push(recoloredLayer(part.sheet, swaps).then((c) => void layers.set(part.layer, c)));
  }
  await Promise.all(jobs);

  const [out, ctx] = canvas(SHEET_W, SHEET_H);
  // Draw row by row: each direction has its own layer order.
  for (const dir of SHEET_DIRS)
    for (const anim of ANIM_ORDER) {
      const y = sheetRow(anim, dir) * FRAME_H;
      for (const layer of LAYER_ORDER[dir]) {
        const src = layers.get(layer);
        if (src) ctx.drawImage(src, 0, y, SHEET_W, FRAME_H, 0, y, SHEET_W, FRAME_H);
      }
    }
  return out;
}

/** Baked sheet for an avatar (cached by appearance). */
export function bakeAvatar(a: Avatar, reg: ItemRegistry): Promise<HTMLCanvasElement> {
  const key = avatarKey(a);
  let p = baked.get(key);
  if (!p) {
    p = bake(a, reg);
    baked.set(key, p);
    p.catch(() => baked.delete(key));
  }
  return p;
}

/** Short stable id for texture keys. */
export function avatarHash(a: Avatar): string {
  const s = avatarKey(a);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
