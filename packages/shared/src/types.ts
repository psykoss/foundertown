export type Direction = "up" | "down" | "left" | "right";

/** A position measured in whole tiles, not pixels. */
export interface TilePosition {
  x: number;
  y: number;
}
