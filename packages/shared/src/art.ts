import type { Direction } from "./types";

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  w: number;
  h: number;
}

export interface Rect extends Point, Size {}

export const CHARACTER_SIZE: Size = { w: 32, h: 48 };

/** Feet centre, measured from the top-left of the character canvas. */
export const CHARACTER_ANCHOR: Point = { x: 16, y: 46 };

export const DIRECTIONS = [
  "down",
  "left",
  "right",
  "up",
] as const satisfies readonly Direction[];

export const ANIMATION_FRAMES = ["idle", 0, 1, 2, 3] as const;
export const WALK_FRAMES = [0, 1, 2, 3] as const;

export type AnimationFrame = (typeof ANIMATION_FRAMES)[number];
export type FrameKey = `${Direction}_${AnimationFrame}`;

export function frameKey(
  direction: Direction,
  frame: AnimationFrame,
): FrameKey {
  return `${direction}_${frame}`;
}

export const FRAME_KEYS: readonly FrameKey[] = DIRECTIONS.flatMap((direction) =>
  ANIMATION_FRAMES.map((frame) => frameKey(direction, frame)),
);

export const CHARACTER_LAYERS = [
  "body",
  "hairBack",
  "bottom",
  "shoes",
  "top",
  "hairFront",
  "accessory",
] as const;

export type CharacterLayer = (typeof CHARACTER_LAYERS)[number];

export const RAMP_NAMES = [
  "hair",
  "top",
  "skin",
  "bottom",
  "shoes",
  "accessory",
] as const;

export type RampName = (typeof RAMP_NAMES)[number];

export interface Ramp {
  light: string;
  dark: string;
}

/** The chosen ramp for each recolourable group, by name. */
export type RampSelection = Readonly<Record<RampName, string>>;

export interface Slot {
  ramp: RampName;
  shade: keyof Ramp;
  /** Reserved colour that stands in for this slot in the character atlas. */
  key: string;
}

export interface CharacterAtlasMeta {
  canvas: Size;
  anchor: Point;
  layerOrder: Readonly<Record<Direction, readonly CharacterLayer[]>>;
  /** Slot definitions by slot character. */
  slots: Readonly<Record<string, Slot>>;
  ramps: Readonly<Record<RampName, Readonly<Record<string, Ramp>>>>;
  outline: string;
}

export interface PropMeta {
  /** In tiles. */
  footprint: Size;
  /** In pixels, above the footprint. */
  overhang: number;
  /** In pixels, relative to the footprint's top-left corner. */
  collision: Rect;
  /** The footprint's top-left corner inside the atlas frame. */
  origin: Point;
}
