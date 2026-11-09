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
  paint(c: Canvas, ox = 0, oy = 0, opts: { outline?: boolean; flat?: boolean; outlineColor?: string } = {}): void {
    const outline = opts.outline ?? true;
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (!this.has(x, y)) continue;
        const edge = !this.has(x - 1, y) || !this.has(x + 1, y) || !this.has(x, y - 1) || !this.has(x, y + 1);
        let shade = 2;
        if (opts.flat) shade = 2;
        else if (edge && outline) shade = 0;
        else if (!this.has(x - 2, y) || !this.has(x, y - 2)) shade = 3;
        else if (!this.has(x + 2, y) || !this.has(x, y + 2)) shade = 1;
        c.set(ox + x, oy + y, shade === 0 && opts.outlineColor ? opts.outlineColor : this.ramp[shade]!);
      }
  }
}

export { rng } from "../../shared/src/random.js";
