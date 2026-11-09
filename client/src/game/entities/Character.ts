/**
 * Character LOGIC. No Phaser here — this is what will be synced with the server later.
 */
import {
  createWalker, dirBetween, stepWalker, STEP_MS,
  type Avatar, type CollisionGrid, type Dir, type TilePos, type WalkerState,
} from "@ft/shared";

export class Character {
  walker: WalkerState;
  path: TilePos[] = [];

  constructor(
    readonly id: string,
    public name: string,
    public avatar: Avatar,
    tileX: number,
    tileY: number,
    dir: Dir = "down",
  ) {
    this.walker = createWalker(tileX, tileY, dir);
  }

  /** The tile the character occupies logically (destination if mid-step). */
  get tile(): TilePos {
    const w = this.walker;
    return w.moving ? { x: w.toX, y: w.toY } : { x: w.tileX, y: w.tileY };
  }

  setPath(path: TilePos[]) {
    this.path = path;
  }

  /** `keyIntent` (direct control) always overrides path following. */
  update(dtMs: number, keyIntent: Dir | null, grid: CollisionGrid) {
    let intent: Dir | null = keyIntent;
    if (keyIntent) this.path = [];
    else if (this.path.length) {
      const at = this.tile;
      while (this.path.length && this.path[0]!.x === at.x && this.path[0]!.y === at.y) this.path.shift();
      const next = this.path[0];
      intent = next ? dirBetween(at.x, at.y, next.x, next.y) : null;
    }
    const before = this.walker;
    this.walker = stepWalker(this.walker, intent, dtMs, STEP_MS, grid);
    // Path blocked (e.g. map changed) → give up instead of pushing against a wall forever.
    if (intent && !keyIntent && !before.moving && !this.walker.moving) this.path = [];
  }
}
