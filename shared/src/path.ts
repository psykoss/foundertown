import type { CollisionGrid } from "./grid.js";

export interface TilePos {
  x: number;
  y: number;
}

/**
 * 4-directional BFS. Returns the path EXCLUDING the start, or null if unreachable.
 * Seats are walked around: a route only steps onto one when it is the goal (you walk to a chair to
 * sit on it, not across it).
 */
export function findPath(grid: CollisionGrid, start: TilePos, goal: TilePos, maxNodes = 4000): TilePos[] | null {
  if (grid.isBlocked(goal.x, goal.y)) return null;
  if (start.x === goal.x && start.y === goal.y) return [];
  const w = grid.width;
  const prev = new Int32Array(w * grid.height).fill(-1);
  const startIdx = start.y * w + start.x;
  prev[startIdx] = startIdx;
  const queue = [startIdx];
  const goalIdx = goal.y * w + goal.x;
  let visited = 0;

  while (queue.length && visited < maxNodes) {
    const cur = queue.shift()!;
    visited++;
    if (cur === goalIdx) break;
    const cx = cur % w;
    const cy = (cur / w) | 0;
    for (const [dx, dy] of [[0, 1], [0, -1], [-1, 0], [1, 0]] as const) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!grid.canStep(cx, cy, nx, ny)) continue;
      const ni = ny * w + nx;
      if (ni !== goalIdx && grid.isSeat(nx, ny)) continue;
      if (prev[ni] !== -1) continue;
      prev[ni] = cur;
      queue.push(ni);
    }
  }
  if (prev[goalIdx] === -1) return null;
  const path: TilePos[] = [];
  for (let i = goalIdx; i !== startIdx; i = prev[i]!) path.push({ x: i % w, y: (i / w) | 0 });
  return path.reverse();
}
