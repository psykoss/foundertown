/**
 * Tiny pixel-art toolkit for generating placeholder assets in Node.
 * Shapes are drawn as REGIONS (masks) with a 4-shade ramp, then auto-shaded:
 *   edge → ramp[0] (colored outline), 1px inside top-left → ramp[3] (highlight),
 *   1px inside bottom-right → ramp[1] (shadow), interior → ramp[2] (base).
 */
import { PNG } from "pngjs";
import fs from "node:fs";
import path from "node:path";
import { hexToRgb } from "../../shared/src/palette.js";

export type Ramp4 = readonly [string, string, string, string];

export class Canvas {
  readonly w: number;
  readonly h: number;
  readonly data: Uint8Array;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.data = new Uint8Array(w * h * 4);
  }

  set(x: number, y: number, hex: string, alpha = 255): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const [r, g, b] = hexToRgb(hex);
    const i = (y * this.w + x) * 4;
    this.data[i] = r;
    this.data[i + 1] = g;
    this.data[i + 2] = b;
    this.data[i + 3] = alpha;
  }

  fill(x: number, y: number, w: number, h: number, hex: string, alpha = 255): void {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, hex, alpha);
  }

  /** Copy another canvas onto this one (alpha > 0 overwrites). */
  blit(src: Canvas, dx: number, dy: number, flipX = false): void {
    for (let y = 0; y < src.h; y++)
      for (let x = 0; x < src.w; x++) {
        const sx = flipX ? src.w - 1 - x : x;
        const si = (y * src.w + sx) * 4;
        if (src.data[si + 3] === 0) continue;
        const tx = dx + x;
        const ty = dy + y;
        if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) continue;
        const ti = (ty * this.w + tx) * 4;
        for (let k = 0; k < 4; k++) this.data[ti + k] = src.data[si + k]!;
      }
  }

  save(file: string): void {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const png = new PNG({ width: this.w, height: this.h });
    png.data = Buffer.from(this.data);
    fs.writeFileSync(file, PNG.sync.write(png));
  }

  static load(file: string): Canvas {
    const png = PNG.sync.read(fs.readFileSync(file));
    const c = new Canvas(png.width, png.height);
    c.data.set(png.data);
    return c;
  }
}

/** A region is a mask + a ramp; draw shapes into it, then `paint` it onto a canvas. */
export class Region {
  readonly w: number;
  readonly h: number;
  readonly mask: Uint8Array;
  constructor(w: number, h: number, readonly ramp: Ramp4) {
    this.w = w;
    this.h = h;
    this.mask = new Uint8Array(w * h);
  }
  has(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h && this.mask[y * this.w + x] === 1;
  }
  px(x: number, y: number, on = true): this {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.mask[y * this.w + x] = on ? 1 : 0;
    return this;
  }
  rect(x: number, y: number, w: number, h: number, on = true): this {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.px(xx, yy, on);
    return this;
  }
  /** Rect with 1px cut corners. */
  round(x: number, y: number, w: number, h: number, r = 1): this {
    this.rect(x, y, w, h);
    for (let i = 0; i < r; i++) {
      for (let j = 0; j < r - i; j++) {
        this.px(x + j, y + i, false).px(x + w - 1 - j, y + i, false);
        this.px(x + j, y + h - 1 - i, false).px(x + w - 1 - j, y + h - 1 - i, false);
      }
    }
    return this;
  }
  ellipse(cx: number, cy: number, rx: number, ry: number): this {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.px(x, y);
      }
    return this;
  }
  /** Auto-shade and paint into canvas at offset. `light` controls highlight side. */
  paint(
    c: Canvas,
    ox = 0,
    oy = 0,
    opts: {
      outline?: boolean;
      flat?: boolean;
      outlineColor?: string;
      inside?: (x: number, y: number) => boolean;
      /** Round-volume shading: light from top-front, darker toward the sides and bottom. */
      volume?: boolean;
    } = {},
  ): void {
    const run = (x: number, y: number, dx: number, dy: number) => {
      let n = 0;
      while (this.has(x + dx * (n + 1), y + dy * (n + 1))) n++;
      return n;
    };
    const outline = opts.outline ?? true;
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (!this.has(x, y)) continue;
        const edge = !this.has(x - 1, y) || !this.has(x + 1, y) || !this.has(x, y - 1) || !this.has(x, y + 1);
        let shade = 2;
        if (opts.flat) shade = 2;
        else if (edge && outline) shade = 0;
        else if (opts.volume) {
          // position inside the shape's row/column span → 0..1
          const l = run(x, y, -1, 0), r = run(x, y, 1, 0), t = run(x, y, 0, -1), b = run(x, y, 0, 1);
          const u = l / Math.max(1, l + r); // 0 = left edge, 1 = right edge
          const v = t / Math.max(1, t + b); // 0 = top, 1 = bottom
          const side = Math.abs(u - 0.42) * 2; // light slightly from the left
          let light = 1 - side * side * 0.9 - v * 0.55;
          if (t <= 1 && side < 0.6) light += 0.35; // top highlight band
          if (b === 1) light -= 0.25; // contact shadow on the bottom row
          shade = light > 0.78 ? 3 : light > 0.32 ? 2 : light > -0.1 ? 1 : 0;
          if (shade === 0 && l > 0 && r > 0 && b > 0) shade = 1; // keep darkest shade for edges
        } else if (!this.has(x - 2, y) || !this.has(x, y - 2)) shade = 3;
        else if (!this.has(x + 2, y) || !this.has(x, y + 2)) shade = 1;
        // Edges that only touch the silhouette's interior (e.g. hair meeting skin) get the ramp's dark shade,
        // not the black outline — black is reserved for the outer silhouette.
        let color = this.ramp[shade]!;
        if (shade === 0 && opts.outlineColor) {
          const outside = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].filter(([nx, ny]) => !this.has(nx!, ny!));
          const soft = !!opts.inside && outside.every(([nx, ny]) => opts.inside!(nx!, ny!));
          color = soft ? this.ramp[0]! : opts.outlineColor;
        }
        c.set(ox + x, oy + y, color);
      }
  }
}

export { rng } from "../../shared/src/random.js";
