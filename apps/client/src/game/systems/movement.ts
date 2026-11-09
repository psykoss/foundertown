import type { Direction, Point } from "@founder-town/shared";
import { isBlocked } from "./map";
import type { GameMap } from "./map";

/** Collision box around the feet anchor, in pixels. */
export const FEET_BOX = { halfWidth: 7, height: 6 };

/** Tracks held keys. The most recently pressed direction wins. */
export class DirectionInput {
  private held: Direction[] = [];

  press(direction: Direction): void {
    this.release(direction);
    this.held.push(direction);
  }

  release(direction: Direction): void {
    this.held = this.held.filter((held) => held !== direction);
  }

  clear(): void {
    this.held = [];
  }

  get current(): Direction | null {
    return this.held[this.held.length - 1] ?? null;
  }
}

function boxBlocked(map: GameMap, x: number, y: number): boolean {
  const size = map.tileSize;
  const left = Math.floor((x - FEET_BOX.halfWidth) / size);
  const right = Math.ceil((x + FEET_BOX.halfWidth) / size) - 1;
  const top = Math.floor((y - FEET_BOX.height) / size);
  const bottom = Math.ceil(y / size) - 1;
  for (let tileY = top; tileY <= bottom; tileY++) {
    for (let tileX = left; tileX <= right; tileX++) {
      if (isBlocked(map, tileX, tileY)) return true;
    }
  }
  return false;
}

/** Moves along one axis and stops flush against any blocked tile. */
export function moveWithCollision(
  map: GameMap,
  position: Point,
  direction: Direction,
  distance: number,
): Point {
  const size = map.tileSize;
  const { x, y } = position;
  switch (direction) {
    case "left": {
      const next = x - distance;
      if (!boxBlocked(map, next, y)) return { x: next, y };
      const edge = Math.floor((next - FEET_BOX.halfWidth) / size + 1) * size;
      return { x: edge + FEET_BOX.halfWidth, y };
    }
    case "right": {
      const next = x + distance;
      if (!boxBlocked(map, next, y)) return { x: next, y };
      const edge = (Math.ceil((next + FEET_BOX.halfWidth) / size) - 1) * size;
      return { x: edge - FEET_BOX.halfWidth, y };
    }
    case "up": {
      const next = y - distance;
      if (!boxBlocked(map, x, next)) return { x, y: next };
      const edge = Math.floor((next - FEET_BOX.height) / size + 1) * size;
      return { x, y: edge + FEET_BOX.height };
    }
    case "down": {
      const next = y + distance;
      if (!boxBlocked(map, x, next)) return { x, y: next };
      const edge = (Math.ceil(next / size) - 1) * size;
      return { x, y: edge };
    }
  }
}
