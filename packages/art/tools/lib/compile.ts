import type {
  AnimationFrame,
  CharacterLayer,
  Direction,
} from "@founder-town/shared";
import { CHARACTER_SIZE, frameKey } from "@founder-town/shared";
import {
  LAYER_ORDER,
  OUTLINE_COLOR,
  PALETTE,
  RAMPS,
  SLOTS,
} from "../../src/index";
import type { CharacterPart, Grid, RampSelection } from "../../src/index";
import { addOutline, blit, createRaster, setPixel } from "./raster";
import type { Raster } from "./raster";

export type Colorize = (char: string) => string | undefined;

export const fixedColors: Colorize = (char) => PALETTE[char];

/** Keeps slots recolourable by storing them as reserved key colours. */
export const slotKeyColors: Colorize = (char) =>
  PALETTE[char] ?? SLOTS[char]?.key;

export function rampColors(selection: RampSelection): Colorize {
  return (char) => {
    const slot = SLOTS[char];
    if (!slot) return PALETTE[char];
    return RAMPS[slot.ramp][selection[slot.ramp]]?.[slot.shade];
  };
}

export function rasterize(grid: Grid, colorize: Colorize): Raster {
  const raster = createRaster(grid[0]?.length ?? 0, grid.length);
  grid.forEach((row, y) => {
    [...row].forEach((char, x) => {
      if (char === ".") return;
      const color = colorize(char);
      if (!color) throw new Error(`No colour for "${char}" at ${x},${y}`);
      setPixel(raster, x, y, color);
    });
  });
  return raster;
}

/** Draws one frame of the chosen parts and outlines the whole silhouette. */
export function composeAvatar(
  parts: readonly CharacterPart[],
  selection: RampSelection,
  direction: Direction,
  frame: AnimationFrame,
): Raster {
  const composed = createRaster(CHARACTER_SIZE.w, CHARACTER_SIZE.h);
  const colorize = rampColors(selection);
  const key = frameKey(direction, frame);
  const byLayer = new Map<CharacterLayer, CharacterPart>(
    parts.map((part) => [part.layer, part]),
  );
  for (const layer of LAYER_ORDER[direction]) {
    const part = byLayer.get(layer);
    if (part) blit(composed, rasterize(part.frames[key], colorize), 0, 0);
  }
  return addOutline(composed, OUTLINE_COLOR);
}
