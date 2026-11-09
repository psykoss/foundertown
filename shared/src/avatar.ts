import type { Channel, Ramp } from "./palette.js";
import { CLOTH_RAMPS, HAIR_RAMPS, SKIN_RAMPS } from "./palette.js";
import type { SheetDir } from "./spec.js";

/** Render layers. A layer is a drawing position; an item can occupy several layers (e.g. long hair). */
export const LAYERS = [
  "shadow",
  "back_accessory",
  "hair_back",
  "body",
  "bottom",
  "shoes",
  "top",
  "outerwear",
  "head", // drawn over clothing so the head overlaps the shoulders
  "face",
  "hair_front",
  "headwear",
  "face_accessory",
  "hand_item",
] as const;
export type Layer = (typeof LAYERS)[number];

/** Default draw order (back → front). Overridden per direction below. */
const BASE_ORDER: Layer[] = [...LAYERS];

/**
 * Draw order per sheet direction. Facing up, the back of the character faces the camera,
 * so back-side layers (long hair, backpack) move in front of the body.
 */
export const LAYER_ORDER: Record<SheetDir, Layer[]> = {
  down: BASE_ORDER,
  left: BASE_ORDER,
  up: [
    "shadow",
    "face",
    "body",
    "bottom",
    "shoes",
    "top",
    "outerwear",
    "head",
    "hair_front",
    "hair_back",
    "back_accessory",
    "headwear",
    "face_accessory",
    "hand_item",
  ],
};

/** Customization slots shown in the builder. A slot holds one item. */
export const SLOTS = [
  "body",
  "face",
  "hair",
  "top",
  "outerwear",
  "bottom",
  "shoes",
  "headwear",
  "face_accessory",
  "back_accessory",
] as const;
export type Slot = (typeof SLOTS)[number];

/** Slots that may be empty. */
export const OPTIONAL_SLOTS: Slot[] = ["outerwear", "headwear", "face_accessory", "back_accessory"];

export interface ItemPart {
  layer: Layer;
  /** Path relative to /assets/characters/ */
  sheet: string;
}

export interface ItemDef {
  id: string;
  slot: Slot;
  name: string;
  parts: ItemPart[];
  /** Which key ramps this item uses (besides skin, which always follows the avatar skin). */
  channels: Channel[];
  tags?: string[];
  /** Locked items are unlocked by gameplay (rewards). */
  unlock?: string;
}

export interface ItemRegistry {
  version: number;
  items: ItemDef[];
}

export interface SlotChoice {
  id: string;
  primary?: string; // ramp name
  secondary?: string;
}

export interface Avatar {
  skin: string; // SKIN_RAMPS key
  slots: Partial<Record<Slot, SlotChoice | null>>;
}

export const DEFAULT_AVATAR: Avatar = {
  skin: "light",
  slots: {
    body: { id: "body_01" },
    face: { id: "face_01" },
    hair: { id: "hair_short_01", primary: "brown" },
    top: { id: "top_tee_01", primary: "sky" },
    bottom: { id: "bottom_pants_01", primary: "denim" },
    shoes: { id: "shoes_sneakers_01", primary: "white", secondary: "charcoal" },
    outerwear: null,
    headwear: null,
    face_accessory: null,
    back_accessory: null,
  },
};

/** Ramp library a channel draws from, depending on slot. */
export function rampLibraryFor(slot: Slot): Record<string, Ramp> {
  return slot === "hair" ? HAIR_RAMPS : CLOTH_RAMPS;
}

export function resolveRamp(slot: Slot, name: string | undefined): Ramp | undefined {
  if (!name) return undefined;
  return rampLibraryFor(slot)[name];
}

export function skinRamp(name: string): Ramp {
  return SKIN_RAMPS[name] ?? SKIN_RAMPS.light!;
}

/** Stable string key for caching baked textures. */
export function avatarKey(a: Avatar): string {
  const parts = [a.skin];
  for (const slot of [...SLOTS].sort()) {
    const c = a.slots[slot];
    parts.push(c ? `${slot}:${c.id}:${c.primary ?? ""}:${c.secondary ?? ""}` : `${slot}:-`);
  }
  return parts.join("|");
}

/** Random avatar from unlocked items (NPCs, testing). `rand` returns [0,1). */
export function randomAvatar(reg: ItemRegistry, rand: () => number = Math.random): Avatar {
  const pick = <T>(xs: T[]): T => xs[Math.floor(rand() * xs.length)]!;
  const skins = Object.keys(SKIN_RAMPS);
  const a: Avatar = { skin: pick(skins), slots: {} };
  for (const slot of SLOTS) {
    const options = reg.items.filter((i) => i.slot === slot && !i.unlock);
    const optional = OPTIONAL_SLOTS.includes(slot);
    if (!options.length || (optional && rand() < 0.6)) {
      a.slots[slot] = null;
      continue;
    }
    const item = pick(options);
    const lib = Object.keys(rampLibraryFor(slot));
    a.slots[slot] = {
      id: item.id,
      primary: item.channels.includes("primary") ? pick(lib) : undefined,
      secondary: item.channels.includes("secondary") ? pick(lib) : undefined,
    };
  }
  return a;
}

/** Validate an avatar against a registry; drops unknown/mismatched items. */
export function sanitizeAvatar(a: Avatar, reg: ItemRegistry): Avatar {
  const byId = new Map(reg.items.map((i) => [i.id, i]));
  const out: Avatar = { skin: SKIN_RAMPS[a.skin] ? a.skin : DEFAULT_AVATAR.skin, slots: {} };
  for (const slot of SLOTS) {
    const c = a.slots[slot];
    const item = c ? byId.get(c.id) : undefined;
    if (c && item && item.slot === slot) out.slots[slot] = c;
    else if (!OPTIONAL_SLOTS.includes(slot)) out.slots[slot] = DEFAULT_AVATAR.slots[slot] ?? null;
    else out.slots[slot] = null;
  }
  return out;
}
