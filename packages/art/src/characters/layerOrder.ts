import type { CharacterLayer, Direction } from "@founder-town/shared";

const FACING_CAMERA: readonly CharacterLayer[] = [
  "hairBack",
  "body",
  "bottom",
  "shoes",
  "top",
  "hairFront",
  "accessory",
];

/** Draw order, first to last. When facing away, back hair is nearest the viewer. */
export const LAYER_ORDER: Readonly<
  Record<Direction, readonly CharacterLayer[]>
> = {
  down: FACING_CAMERA,
  left: FACING_CAMERA,
  right: FACING_CAMERA,
  up: ["body", "bottom", "shoes", "top", "hairFront", "hairBack", "accessory"],
};
