/** Tile-based collision grid. Pure data, used by client prediction and (later) server validation. */
export class CollisionGrid {
  readonly width: number;
  readonly height: number;
  private readonly blocked: Uint8Array;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.blocked = new Uint8Array(width * height);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  isBlocked(x: number, y: number): boolean {
    return !this.inBounds(x, y) || this.blocked[y * this.width + x] === 1;
  }

  setBlocked(x: number, y: number, value = true): void {
    if (this.inBounds(x, y)) this.blocked[y * this.width + x] = value ? 1 : 0;
  }

  /** Block a rectangle of tiles (x,y = top-left tile). */
  blockRect(x: number, y: number, w: number, h: number): void {
    for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) this.setBlocked(tx, ty);
  }
}
