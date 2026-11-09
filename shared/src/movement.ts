import type { Dir } from "./spec.js";
import type { CollisionGrid } from "./grid.js";

export const DIR_VEC: Record<Dir, { dx: number; dy: number }> = {
  down: { dx: 0, dy: 1 },
  up: { dx: 0, dy: -1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

/** Pure movement state of a grid walker. Rendering interpolates between `from` and `to`. */
export interface WalkerState {
  tileX: number; // tile the walker is moving FROM (or standing on)
  tileY: number;
  toX: number; // tile the walker is moving TO (== tile when idle)
  toY: number;
  dir: Dir;
  progress: number; // 0..1 along the current step
  moving: boolean;
}

export function createWalker(tileX: number, tileY: number, dir: Dir = "down"): WalkerState {
  return { tileX, tileY, toX: tileX, toY: tileY, dir, progress: 0, moving: false };
}

/**
 * Advance a walker. `intent` is the direction the player wants (null = none).
 * Returns the new state (does not mutate). Deterministic: same inputs → same output,
 * so client prediction and server validation agree.
 */
export function stepWalker(
  s: WalkerState,
  intent: Dir | null,
  dtMs: number,
  stepMs: number,
  grid: CollisionGrid,
): WalkerState {
  let st = { ...s };

  if (st.moving) {
    st.progress += dtMs / stepMs;
    if (st.progress < 1) return st;
    // Arrived. Carry the leftover time into the next step so speed stays constant.
    const leftover = (st.progress - 1) * stepMs;
    st = { ...st, tileX: st.toX, tileY: st.toY, progress: 0, moving: false };
    if (intent) return tryStart(st, intent, grid, leftover, stepMs);
    return st;
  }

  if (intent) return tryStart(st, intent, grid, 0, stepMs);
  return st;
}

function tryStart(st: WalkerState, intent: Dir, grid: CollisionGrid, leftoverMs: number, stepMs: number): WalkerState {
  const { dx, dy } = DIR_VEC[intent];
  const nx = st.tileX + dx;
  const ny = st.tileY + dy;
  if (grid.isBlocked(nx, ny)) return { ...st, dir: intent, moving: false, progress: 0 }; // turn in place
  return { ...st, dir: intent, toX: nx, toY: ny, moving: true, progress: leftoverMs / stepMs };
}

/** Continuous position in tiles (for rendering). */
export function walkerPos(s: WalkerState): { x: number; y: number } {
  return {
    x: s.tileX + (s.toX - s.tileX) * s.progress,
    y: s.tileY + (s.toY - s.tileY) * s.progress,
  };
}

export function dirBetween(ax: number, ay: number, bx: number, by: number): Dir | null {
  if (bx > ax) return "right";
  if (bx < ax) return "left";
  if (by > ay) return "down";
  if (by < ay) return "up";
  return null;
}
