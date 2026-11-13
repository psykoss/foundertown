/** Tile-based collision grid. Pure data, used by client prediction and (later) server validation. */
export class CollisionGrid {
  readonly width: number;
  readonly height: number;
  private readonly blocked: Uint8Array;
  /** Thin walls on tile edges: bit 1 = wall on the WEST edge of the tile, bit 2 = wall on its NORTH edge. */
  private readonly edges: Uint8Array;
  /** Tiles that hold a seat: free to step onto, but not somewhere a route passes through. */
  private readonly seats: Uint8Array;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.blocked = new Uint8Array(width * height);
    this.edges = new Uint8Array(width * height);
    this.seats = new Uint8Array(width * height);
  }

  setSeat(x: number, y: number): void {
    if (this.inBounds(x, y)) this.seats[y * this.width + x] = 1;
  }

  isSeat(x: number, y: number): boolean {
    return this.inBounds(x, y) && this.seats[y * this.width + x] === 1;
  }

  /** Put a thin wall on the west (between x-1 and x) or north (between y-1 and y) edge of a tile. */
  blockEdge(x: number, y: number, side: "W" | "N"): void {
    if (this.inBounds(x, y)) this.edges[y * this.width + x]! |= side === "W" ? 1 : 2;
  }

  hasEdge(x: number, y: number, side: "W" | "N"): boolean {
    return this.inBounds(x, y) && (this.edges[y * this.width + x]! & (side === "W" ? 1 : 2)) !== 0;
  }

  /** Can a walker step from (x,y) to the 4-neighbour (nx,ny)? Checks the target tile and thin walls between. */
  canStep(x: number, y: number, nx: number, ny: number): boolean {
    if (this.isBlocked(nx, ny)) return false;
    if (nx === x + 1) return !this.hasEdge(nx, ny, "W");
    if (nx === x - 1) return !this.hasEdge(x, y, "W");
    if (ny === y + 1) return !this.hasEdge(nx, ny, "N");
    if (ny === y - 1) return !this.hasEdge(x, y, "N");
    return true;
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
