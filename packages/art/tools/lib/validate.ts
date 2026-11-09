import { CHARACTER_PARTS } from "./derive";
import { CHARACTER_SIZE, FRAME_KEYS, TILE } from "@founder-town/shared";
import { PALETTE, PROPS, SLOTS, TILES } from "../../src/index";
import type { Grid } from "../../src/index";

export interface SpriteCheck {
  name: string;
  grid: Grid;
  width: number;
  height: number;
  allowed: ReadonlySet<string>;
}

const FIXED_CHARS = new Set([".", ...Object.keys(PALETTE)]);
const CHARACTER_CHARS = new Set([...FIXED_CHARS, ...Object.keys(SLOTS)]);

export function sizeErrors(sprite: SpriteCheck): string[] {
  const errors: string[] = [];
  if (sprite.grid.length !== sprite.height) {
    errors.push(
      `${sprite.name}: has ${sprite.grid.length} rows, expected ${sprite.height}`,
    );
  }
  sprite.grid.forEach((row, y) => {
    if (row.length !== sprite.width) {
      errors.push(
        `${sprite.name}: row ${y} is ${row.length}px, expected ${sprite.width}px`,
      );
    }
  });
  return errors;
}

export function charErrors(sprite: SpriteCheck): string[] {
  const errors: string[] = [];
  sprite.grid.forEach((row, y) => {
    [...row].forEach((char, x) => {
      if (!sprite.allowed.has(char)) {
        errors.push(`${sprite.name}: invalid char "${char}" at ${x},${y}`);
      }
    });
  });
  return errors;
}

/** Lists every sprite with the size and characters it must have. */
export function allSprites(): SpriteCheck[] {
  return [
    ...CHARACTER_PARTS.flatMap((part) =>
      FRAME_KEYS.map((key) => ({
        name: `${part.layer}/${part.id}/${key}`,
        grid: part.frames[key] ?? [],
        width: CHARACTER_SIZE.w,
        height: CHARACTER_SIZE.h,
        allowed: CHARACTER_CHARS,
      })),
    ),
    ...TILES.map((tile) => ({
      name: `tile/${tile.id}`,
      grid: tile.grid,
      width: TILE,
      height: TILE,
      allowed: FIXED_CHARS,
    })),
    ...PROPS.map((prop) => ({
      name: `prop/${prop.id}`,
      grid: prop.grid,
      width: prop.footprint.w * TILE,
      height: prop.footprint.h * TILE + prop.overhang,
      allowed: FIXED_CHARS,
    })),
  ];
}

export function assertValidArt(): void {
  const errors = allSprites().flatMap((sprite) => [
    ...sizeErrors(sprite),
    ...charErrors(sprite),
  ]);
  if (errors.length > 0) {
    throw new Error(`Invalid sprites:\n${errors.join("\n")}`);
  }
}
