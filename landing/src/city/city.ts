/**
 * The static city, baked into one mesh. A grid: roads on every multiple of 10 (2 wide), blocks
 * between them (an 8×8 sidewalk slab with a 6×6 lot inside). The land starts at −11; beyond is the bay.
 * The camera looks at (0, 0) — the crossing of Market Street (z = 0, cable car) and the bridge road (x = 0).
 *
 * Screen directions: +x runs down-right, +z down-left, so the far corner (−11, −11) is top center
 * and fronts worth seeing face +z or +x.
 *
 * Besides the mesh this returns the places the animation needs: where people walk, stand and sit,
 * which windows flicker, where lights blink.
 */
import type * as THREE from "three";
import { Builder, SHADE, pick, type Rand } from "./voxel";
import {
  BLACK, LIT, WHITE, YC, amber, carpet, coral, dark, fabric, floor, grass, green, lavender, leaf, metal, mustard, stone, tan, teal, tile, wall,
  water, wood,
} from "./palette";

/** Height of the sidewalk slabs: everything on a block stands on this. */
export const G = 0.08;
/** Land spans LAND0..LAND1 on both axes. */
export const LAND0 = -11;
export const LAND1 = 75;
/** Block indices (road k is at 10k). */
const B0 = -1;
const B1 = 6;
/** How far a wall decal sits off its wall. */
const e = 0.012;

export interface Rect { x0: number; z0: number; x1: number; z1: number }
export interface Spot { x: number; z: number; y: number; kind: "stand" | "cheer" | "sit" }
export interface Twinkle { side: "L" | "R"; x: number; y: number; z: number; w: number; h: number; seed: number }
export interface Blink { x: number; y: number; z: number; size: number; hex: string; seed: number }
export interface Point { x: number; y: number; z: number }

export interface City {
  mesh: THREE.Mesh;
  /** Sidewalk loops people walk around. */
  rings: Rect[];
  /** Open areas people wander in (`n` people, standing at height `y`). */
  areas: { rect: Rect; n: number; y: number }[];
  spots: Spot[];
  twinkles: Twinkle[];
  blinks: Blink[];
  steam: Point[];
  fountains: Point[];
  flags: Point[];
  /** Street corners with a traffic light. */
  lights: { x: number; z: number }[];
  /** Demo-day screen: where the growing chart is drawn. */
  chart: Point;
  rocket: Point;
  wheel: Point & { r: number };
  seaLions: Point[];
}

// ── small pieces ───────────────────────────────────────────────────────────────

/** 3×5 pixel font, rows top to bottom. */
const FONT: Record<string, string> = {
  A: "010101111101101", D: "110101101101110", E: "111100110100111", G: "011100101101011", H: "101101111101101", I: "111010010010111",
  M: "101111111101101", N: "111101101101101", O: "111101101101111", R: "110101110101101", Y: "101101010010010",
};

/** Text on a +z-facing wall, reading along +x. (x, y) is its top-left corner. */
function textL(b: Builder, s: string, x: number, y: number, z: number, pw: number, ph: number, hex: string) {
  [...s].forEach((ch, i) => {
    const g = FONT[ch];
    if (!g) return;
    for (let row = 0; row < 5; row++) for (let c = 0; c < 3; c++) if (g[row * 3 + c] === "1") b.left(x + (i * 4 + c) * pw, y - (row + 1) * ph, z, pw, ph, hex, 1);
  });
}

/** The accelerator's mark: a white Y. Bitmap 5×5, drawn on a +z wall. */
const Y_MARK = ["10001", "10001", "01010", "00100", "00100"];
function markL(b: Builder, x: number, y: number, z: number, p: number) {
  Y_MARK.forEach((row, r) => [...row].forEach((v, c) => v === "1" && b.left(x + c * p, y - (r + 1) * p, z, p, p, WHITE, 1)));
}
function tree(b: Builder, r: Rand, x: number, z: number, y = G) {
  const s = 0.8 + r() * 0.5;
  b.box(x - 0.07, y, z - 0.07, 0.14, 0.5 * s, 0.14, wood[0]);
  b.box(x - 0.42 * s, y + 0.5 * s, z - 0.42 * s, 0.84 * s, 0.5 * s, 0.84 * s, leaf[1], leaf[2]);
  b.box(x - 0.28 * s, y + 1.0 * s, z - 0.28 * s, 0.56 * s, 0.34 * s, 0.56 * s, leaf[2], leaf[3]);
}

function palm(b: Builder, r: Rand, x: number, z: number, y = G) {
  const h = 1.5 + r() * 0.7;
  for (let k = 0; k < 4; k++) b.box(x - 0.06 + (k % 2) * 0.03, y + (k * h) / 4, z - 0.06, 0.12, h / 4, 0.12, wood[k % 2 ? 1 : 2]);
  const t = y + h;
  b.box(x - 0.6, t, z - 0.1, 1.2, 0.07, 0.2, leaf[2], leaf[3]);
  b.box(x - 0.1, t, z - 0.6, 0.2, 0.07, 1.2, leaf[1], leaf[2]);
  b.box(x - 0.2, t + 0.07, z - 0.2, 0.4, 0.1, 0.4, leaf[2], leaf[3]);
}

function lamp(b: Builder, x: number, z: number) {
  b.box(x - 0.03, G, z - 0.03, 0.06, 1.15, 0.06, dark[1]);
  b.box(x - 0.09, G + 1.15, z - 0.09, 0.18, 0.09, 0.18, dark[2], LIT);
}

function bench(b: Builder, x: number, z: number, y = G) {
  b.box(x, y + 0.14, z, 0.7, 0.06, 0.24, wood[2]);
  b.box(x, y, z, 0.06, 0.14, 0.24, dark[1]);
  b.box(x + 0.64, y, z, 0.06, 0.14, 0.24, dark[1]);
}

/** Striped shop awning hanging off a +z wall. */
function awning(b: Builder, x: number, y: number, z: number, w: number, hexA: string, hexB = WHITE) {
  const n = Math.round(w / 0.28);
  for (let k = 0; k < n; k++) b.box(x + (k * w) / n, y, z, w / n, 0.07, 0.42, k % 2 ? hexB : hexA);
}

/** Table with a sun umbrella. */
function cafeTable(b: Builder, x: number, z: number, hex: string) {
  b.box(x - 0.2, G + 0.26, z - 0.2, 0.4, 0.05, 0.4, WHITE);
  b.box(x - 0.03, G, z - 0.03, 0.06, 1.0, 0.06, metal[1]);
  b.box(x - 0.45, G + 1.0, z - 0.45, 0.9, 0.07, 0.9, hex, WHITE);
  b.box(x - 0.25, G + 1.07, z - 0.25, 0.5, 0.07, 0.5, hex);
}

// ── buildings ──────────────────────────────────────────────────────────────────

interface Style { body: string; base: string; win: string[]; band?: boolean }
const STYLES: Style[] = [
  { body: stone[2], base: stone[0], win: [fabric[1], fabric[2], water[1]] },
  { body: fabric[2], base: fabric[0], win: [fabric[3], water[3], WHITE], band: true },
  { body: wall[2], base: wall[0], win: [fabric[2], water[2], stone[3]] },
  { body: floor[1], base: wood[1], win: [fabric[1], fabric[0], water[1]] },
  { body: carpet[2], base: carpet[0], win: [stone[3], fabric[3], tile[3]], band: true },
  { body: teal[2], base: teal[0], win: [teal[3], WHITE, water[3]], band: true },
  { body: wood[2], base: wood[0], win: [fabric[1], fabric[2], stone[3]] },
  { body: stone[3], base: metal[1], win: [fabric[0], fabric[1], navy()] },
];
function navy() {
  return dark[1];
}

/** Rows of windows on both visible walls of a box, from `y0` up, one row per `fh`. */
function windows(b: Builder, c: City, r: Rand, x: number, z: number, w: number, d: number, y0: number, rows: number, st: Style, fh = 1) {
  for (const side of ["L", "R"] as const) {
    const len = side === "L" ? w : d;
    const n = Math.max(1, Math.floor((len - 0.3) / 0.6));
    const step = (len - 0.3) / n;
    const ww = st.band ? step - 0.06 : 0.36;
    for (let f = 0; f < rows; f++) {
      const y = y0 + f * fh + 0.28;
      for (let k = 0; k < n; k++) {
        const a = 0.15 + k * step + (step - ww) / 2;
        const hex = r() < 0.13 ? LIT : pick(r, st.win);
        if (side === "L") b.left(x + a, y, z + d + e, ww, 0.55, hex);
        else b.right(x + w + e, y, z + a, ww, 0.55, hex);
        if (r() < 0.08) c.twinkles.push(side === "L" ? { side, x: x + a, y, z: z + d + e, w: ww, h: 0.55, seed: r() } : { side, x: x + w + e, y, z: z + a, w: ww, h: 0.55, seed: r() });
      }
    }
  }
}

/** Something on a flat roof at height y. */
function roofKit(b: Builder, c: City, r: Rand, x: number, z: number, w: number, d: number, y: number) {
  const k = Math.floor(r() * 7);
  if (k === 0 || w < 1.4) {
    // antenna with a beacon
    b.box(x + w / 2 - 0.04, y, z + d / 2 - 0.04, 0.08, 1.5, 0.08, metal[1]);
    c.blinks.push({ x: x + w / 2 - 0.07, y: y + 1.5, z: z + d / 2 - 0.07, size: 0.14, hex: coral[2], seed: r() });
  } else if (k === 1) {
    // water tank on legs
    b.box(x + 0.3, y, z + 0.3, 0.7, 0.25, 0.7, dark[1]);
    b.box(x + 0.25, y + 0.25, z + 0.25, 0.8, 0.7, 0.8, wood[1], wood[2]);
    b.box(x + 0.4, y + 0.95, z + 0.4, 0.5, 0.14, 0.5, wood[0]);
  } else if (k === 2) {
    // roof garden
    b.box(x + 0.2, y, z + 0.2, w - 0.4, 0.08, d - 0.4, grass[0], grass[1]);
    tree(b, r, x + 0.7, z + 0.7, y + 0.08);
    if (w > 2) tree(b, r, x + w - 0.7, z + d - 0.7, y + 0.08);
  } else if (k === 3) {
    // solar panels
    for (let i = 0; x + 0.25 + i * 0.6 + 0.45 < x + w; i++) b.box(x + 0.25 + i * 0.6, y, z + 0.25, 0.45, 0.06, d - 0.5, fabric[0], fabric[1]);
  } else if (k === 4) {
    // helipad
    b.top(x + 0.2, y + 0.004, z + 0.2, w - 0.4, d - 0.4, coral[1]);
    b.top(x + w / 2 - 0.3, y + 0.008, z + d / 2 - 0.3, 0.12, 0.6, WHITE);
    b.top(x + w / 2 + 0.18, y + 0.008, z + d / 2 - 0.3, 0.12, 0.6, WHITE);
    b.top(x + w / 2 - 0.3, y + 0.008, z + d / 2 - 0.06, 0.6, 0.12, WHITE);
  } else {
    // air conditioning + vent (steam)
    b.box(x + 0.3, y, z + 0.3, 0.6, 0.3, 0.5, metal[2], metal[3]);
    b.box(x + w - 0.8, y, z + d - 0.7, 0.4, 0.4, 0.4, metal[1], dark[0]);
    if (r() < 0.5) c.steam.push({ x: x + w - 0.6, y: y + 0.4, z: z + d - 0.5 });
  }
}

/** Office tower. Returns its roof height. */
function tower(b: Builder, c: City, r: Rand, x: number, z: number, w: number, d: number, floors: number, st: Style = pick(r, STYLES)): number {
  const h = floors + 0.4;
  b.box(x, 0, z, w, h, d, st.body);
  b.left(x, 0, z + d + e, w, 1.05, st.base);
  b.right(x + w + e, 0, z, d, 1.05, st.base);
  // lobby: glass doors and shop windows
  b.left(x + w / 2 - 0.35, G, z + d + 2 * e, 0.7, 0.78, BLACK);
  b.left(x + w / 2 - 0.3, G, z + d + 3 * e, 0.28, 0.72, fabric[3]);
  b.left(x + w / 2 + 0.02, G, z + d + 3 * e, 0.28, 0.72, fabric[3]);
  if (d > 1.6) b.right(x + w + 2 * e, G + 0.25, z + 0.3, d - 0.6, 0.55, fabric[2]);
  windows(b, c, r, x, z, w, d, 1, floors - 1, st);
  b.box(x - 0.06, h, z - 0.06, w + 0.12, 0.14, d + 0.12, st.base);
  roofKit(b, c, r, x, z, w, d, h + 0.14);
  return h + 0.14;
}

/** Stepped white pyramid with a spire — the skyline's needle. */
function pyramid(b: Builder, c: City, r: Rand, x: number, z: number, s: number) {
  const levels = 8;
  for (let k = 0; k < levels; k++) {
    const o = (k * s * 0.42) / levels;
    const side = s - 2 * o;
    b.box(x + o, k, z + o, side, 1, side, stone[3]);
    if (k > 0) {
      b.left(x + o + 0.1, k + 0.3, z + o + side + e, side - 0.2, 0.42, fabric[k % 2 ? 1 : 2]);
      b.right(x + o + side + e, k + 0.3, z + o + 0.1, side - 0.2, 0.42, fabric[k % 2 ? 2 : 1]);
    } else {
      b.left(x + 0.2, 0.1, z + s + e, s - 0.4, 0.7, dark[1]);
      b.right(x + s + e, 0.1, z + 0.2, s - 0.4, 0.7, dark[1]);
    }
  }
  const m = x + s / 2;
  const n = z + s / 2;
  b.box(m - 0.12, levels, n - 0.12, 0.24, 0.5, 0.24, stone[2]);
  b.box(m - 0.05, levels + 0.5, n - 0.05, 0.1, 0.9, 0.1, stone[1]);
  c.blinks.push({ x: m - 0.08, y: levels + 1.4, z: n - 0.08, size: 0.16, hex: coral[2], seed: r() });
}

/** Victorian row house, front on +z: bay window, steps, gable. */
function paintedLady(b: Builder, c: City, r: Rand, x: number, z: number, w: number, d: number, hex: string, trim: string) {
  const h = 2.1 + r() * 0.35;
  b.box(x, 0, z, w, h, d, hex);
  const f = z + d;
  // gable + roof
  const ridge = h + 0.75;
  b.tri([x, h, f], [x + w, h, f], [x + w / 2, ridge, f], hex, SHADE.left);
  b.quad([x + w / 2, ridge, z], [x + w, h, z], [x + w, h, f + 0.06], [x + w / 2, ridge, f + 0.06], dark[2], 0.62);
  b.left(x - 0.03, h - 0.06, f + e, w + 0.06, 0.08, trim, 0.95);
  b.left(x + w / 2 - 0.12, h + 0.18, f + e, 0.24, 0.26, fabric[1]);
  // bay window (two storeys) and its windows
  b.box(x + 0.1, 0.95, f, w * 0.5, 1.0, 0.22, trim);
  b.left(x + 0.16, 1.1, f + 0.22 + e, w * 0.5 - 0.12, 0.62, r() < 0.3 ? LIT : fabric[2]);
  c.twinkles.push({ side: "L", x: x + 0.16, y: 1.1, z: f + 0.22 + e, w: w * 0.5 - 0.12, h: 0.62, seed: r() });
  b.left(x + 0.16, G + 0.2, f + e, w * 0.5 - 0.12, 0.5, fabric[1]);
  // door and steps
  b.left(x + w - 0.5, G + 0.2, f + e, 0.34, 0.74, dark[1]);
  b.left(x + w - 0.5, 1.2, f + e, 0.34, 0.5, fabric[2]);
  b.box(x + w - 0.56, 0, f, 0.46, G + 0.2, 0.2, stone[1]);
  b.box(x + w - 0.56, 0, f + 0.2, 0.46, G + 0.1, 0.18, stone[1]);
  // side windows
  b.right(x + w + e, 1.2, z + 0.3, 0.36, 0.5, fabric[1]);
  b.right(x + w + e, 1.2, z + d - 0.7, 0.36, 0.5, fabric[2]);
}

/** Low shop or house with a flat roof and an awning. */
function shop(b: Builder, c: City, r: Rand, x: number, z: number, w: number, d: number, floors: number, hex: string, awn: string) {
  const h = floors * 1.05 + 0.25;
  b.box(x, 0, z, w, h, d, hex);
  b.left(x + 0.2, G + 0.2, z + d + e, w - 0.9, 0.62, fabric[2]);
  b.left(x + w - 0.55, G, z + d + e, 0.36, 0.82, dark[1]);
  awning(b, x + 0.1, 1.0, z + d, w - 0.2, awn);
  if (floors > 1) windows(b, c, r, x, z, w, d, 1.05, floors - 1, { body: hex, base: hex, win: [fabric[1], fabric[2], stone[3]] }, 1.05);
  b.right(x + w + e, G + 0.25, z + 0.3, d - 0.6, 0.55, fabric[1]);
  b.box(x - 0.05, h, z - 0.05, w + 0.1, 0.1, d + 0.1, dark[2]);
  if (r() < 0.6) roofKit(b, c, r, x, z, w, d, h + 0.1);
}

// ── blocks ─────────────────────────────────────────────────────────────────────

/** Crowd standing in loose groups inside a rect. */
function groups(c: City, r: Rand, rect: Rect, n: number, kind: Spot["kind"] = "stand", y = G) {
  for (let g = 0; g < n; g++) {
    const gx = rect.x0 + r() * (rect.x1 - rect.x0);
    const gz = rect.z0 + r() * (rect.z1 - rect.z0);
    const size = 2 + Math.floor(r() * 3);
    for (let k = 0; k < size; k++) {
      const a = (k / size) * Math.PI * 2 + r();
      c.spots.push({ x: gx + Math.cos(a) * 0.36, z: gz + Math.sin(a) * 0.36, y, kind });
    }
  }
}

/**
 * The accelerator: an orange block with the white Y, a launch pad and a plaza full of founders.
 * It sits on the outer side of its block so the page's headline does not cover it.
 */
function accelerator(b: Builder, c: City, r: Rand) {
  const x = -7.95, z = 3.7, w = 3.4, d = 2.4, h = 2.75;
  b.box(x, 0, z, w, h, d, YC);
  const f = z + d;
  b.left(x, 0, f + e, w, 0.14, BLACK, 1);
  b.right(x + w + e, 0, z, d, 0.14, BLACK, 1);
  // entrance
  b.left(x + 1.0, G, f + e, 1.4, 1.05, BLACK, 1);
  b.left(x + 1.07, G, f + 2 * e, 0.6, 0.96, fabric[3]);
  b.left(x + 1.73, G, f + 2 * e, 0.6, 0.96, fabric[3]);
  b.box(x + 0.85, 1.2, f, 1.7, 0.08, 0.5, BLACK);
  // windows, black frames
  for (const [wx, wy] of [[0.12, 0.35], [2.5, 0.35], [0.2, 1.6], [1.31, 1.6], [2.42, 1.6]] as const) {
    b.left(x + wx, wy, f + e, 0.78, 0.78, BLACK, 1);
    b.left(x + wx + 0.07, wy + 0.07, f + 2 * e, 0.64, 0.64, r() < 0.4 ? LIT : fabric[2]);
    c.twinkles.push({ side: "L", x: x + wx + 0.07, y: wy + 0.07, z: f + 3 * e, w: 0.64, h: 0.64, seed: r() });
  }
  for (const [wz, wy] of [[0.2, 0.35], [1.3, 0.35], [0.2, 1.6], [1.3, 1.6]] as const) {
    b.right(x + w + e, wy, z + wz, 0.9, 0.78, BLACK, 1);
    b.right(x + w + 2 * e, wy + 0.07, z + wz + 0.07, 0.76, 0.64, fabric[1]);
  }
  b.box(x - 0.07, h, z - 0.07, w + 0.14, 0.16, d + 0.14, BLACK, "#2b2c2b");
  // the sign: an orange cube with the Y
  const sx = x + 1.0, sz = z + 0.5, sy = h + 0.16;
  b.box(sx + 0.55, sy, sz + 0.55, 0.3, 0.45, 0.3, BLACK);
  b.box(sx, sy + 0.45, sz, 1.4, 1.4, 1.4, YC);
  markL(b, sx + 0.15, sy + 0.45 + 1.25, sz + 1.4 + e, 0.22);
  // flag
  b.box(x + w - 0.4, sy, z + 0.3, 0.06, 1.7, 0.06, BLACK);
  c.flags.push({ x: x + w - 0.34, y: sy + 1.25, z: z + 0.32 });
  // plaza: orange carpet to the door, banners, launch pad
  b.top(x + 1.15, G + 0.004, f, 1.1, 8.95 - f, YC);
  for (const bx of [x + 0.3, x + 2.75]) {
    b.box(bx, G, f + 1.1, 0.06, 1.7, 0.06, BLACK);
    b.box(bx + 0.06, G + 0.7, f + 1.1, 0.5, 0.95, 0.04, YC);
    markL(b, bx + 0.12, G + 1.55, f + 1.14 + e, 0.075);
  }
  b.box(-4.35, G, 6.9, 1.1, 0.12, 1.1, metal[1], metal[2]);
  b.box(-3.4, G, 7.0, 0.08, 1.5, 0.08, coral[1]);
  c.rocket = { x: -3.8, y: G + 0.12, z: 7.45 };
  c.steam.push({ x: -3.8, y: G + 0.1, z: 7.9 });
  // the rest of the lot: a glass pavilion and some shade
  shop(b, c, r, -4.2, 2.3, 2.1, 1.9, 1, WHITE, YC);
  tree(b, r, -7.3, 2.8);
  tree(b, r, -5.6, 2.9);
  palm(b, r, -2.5, 5.2);
  palm(b, r, -2.5, 8.5);
  bench(b, -3.3, 5.0);
  groups(c, r, { x0: -7.4, z0: 6.9, x1: -5.2, z1: 8.6 }, 5);
  groups(c, r, { x0: -4.9, z0: 6.5, x1: -4.5, z1: 8.6 }, 3, "cheer");
  c.areas.push({ rect: { x0: -7.8, z0: 6.4, x1: -2.6, z1: 8.8 }, n: 8, y: G });
}

/** Demo day: a stage, a big screen with a chart that only goes up, and an audience. */
function demoDay(b: Builder, c: City, r: Rand) {
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) b.top(2 + i, G + 0.003, 2 + j, 1, 1, (i + j) % 2 ? tile[1] : tile[2]);
  const x = 2.4, z = 2.3, w = 5.2;
  b.box(x, 0, z, w, 3.1, 0.3, dark[0]);
  const f = z + 0.3 + e;
  b.left(x + 0.12, 0.5, f, w - 0.24, 2.48, BLACK, 1);
  textL(b, "DEMO", x + 0.3, 2.8, f + e, 0.2, 0.18, WHITE);
  textL(b, "DAY", x + 0.3, 1.72, f + e, 0.2, 0.18, YC);
  c.chart = { x: x + 3.45, y: 0.75, z: f + e };
  // stage, speakers, light truss
  b.box(x, 0, z + 0.3, w, 0.36, 1.35, wood[0], wood[2]);
  b.box(x + 0.05, 0.36, z + 0.4, 0.4, 0.7, 0.4, BLACK);
  b.box(x + w - 0.45, 0.36, z + 0.4, 0.4, 0.7, 0.4, BLACK);
  [0.3, 1.4, 2.5, 3.6, 4.7].forEach((o, i) => c.blinks.push({ x: x + o, y: 3.1, z: z + 0.1, size: 0.16, hex: [YC, WHITE, LIT, YC, WHITE][i]!, seed: r() }));
  b.box(x + 2.2, 0.36, z + 0.9, 0.3, 0.42, 0.2, dark[1]); // lectern
  c.spots.push({ x: x + 2.75, z: z + 1.15, y: 0.36, kind: "stand" });
  // audience
  for (let ax = 2.7; ax < 7.5; ax += 0.52) for (let az = 4.5; az < 7.7; az += 0.52) if (r() < 0.72) c.spots.push({ x: ax + r() * 0.2, z: az + r() * 0.2, y: G, kind: "cheer" });
}

/** Waterfront hall with a clock tower, and a market on the plaza in front. */
function ferryBuilding(b: Builder, c: City, r: Rand) {
  const x = -7.7, z = -7.6;
  b.box(x, 0, z, 5.4, 1.5, 2.2, floor[2]);
  for (let k = 0; k < 8; k++) {
    b.left(x + 0.2 + k * 0.64, G, z + 2.2 + e, 0.44, 0.9, dark[1]);
    b.left(x + 0.26 + k * 0.64, G + 0.86, z + 2.2 + 2 * e, 0.32, 0.12, dark[1]);
  }
  for (let k = 0; k < 3; k++) b.right(x + 5.4 + e, G + 0.3, z + 0.25 + k * 0.65, 0.42, 0.7, fabric[1]);
  b.box(x - 0.06, 1.5, z - 0.06, 5.52, 0.12, 2.32, wood[2], coral[1]);
  // clock tower
  const tx = x + 2.1, tz = z + 0.5;
  b.box(tx, 1.62, tz, 1.2, 2.4, 1.2, floor[2]);
  b.box(tx - 0.08, 4.02, tz - 0.08, 1.36, 0.14, 1.36, floor[0]);
  b.box(tx + 0.1, 4.16, tz + 0.1, 1.0, 1.0, 1.0, floor[3]);
  b.left(tx + 0.3, 4.36, tz + 1.1 + e, 0.4, 0.6, dark[1]);
  b.right(tx + 1.1 + e, 4.36, tz + 0.3, 0.4, 0.6, dark[1]);
  b.box(tx + 0.3, 5.16, tz + 0.3, 0.6, 0.5, 0.6, floor[2], coral[1]);
  b.box(tx + 0.56, 5.66, tz + 0.56, 0.08, 0.9, 0.08, metal[1]);
  c.flags.push({ x: tx + 0.64, y: 6.2, z: tz + 0.58 });
  // clock faces
  b.left(tx + 0.3, 2.9, tz + 1.2 + e, 0.6, 0.6, WHITE, 1);
  b.left(tx + 0.57, 3.2, tz + 1.2 + 2 * e, 0.06, 0.24, BLACK);
  b.left(tx + 0.57, 3.17, tz + 1.2 + 2 * e, 0.2, 0.06, BLACK);
  b.right(tx + 1.2 + e, 2.9, tz + 0.3, 0.6, 0.6, WHITE, 0.85);
  b.right(tx + 1.2 + 2 * e, 3.2, tz + 0.57, 0.06, 0.24, BLACK);
  // farmers' market
  const awn = [coral[2], mustard[1], teal[2], YC];
  for (let k = 0; k < 4; k++) {
    const sx = -7.5 + k * 1.4, sz = -3.9;
    b.box(sx, G, sz, 0.9, 0.34, 0.5, wood[2]);
    for (let q = 0; q < 3; q++) b.box(sx + 0.08 + q * 0.27, G + 0.34, sz + 0.1, 0.2, 0.1, 0.3, [coral[2], amber[2], leaf[2]][q]!);
    b.box(sx - 0.05, G, sz - 0.1, 0.05, 1.0, 0.05, metal[1]);
    b.box(sx + 0.9, G, sz - 0.1, 0.05, 1.0, 0.05, metal[1]);
    awning(b, sx - 0.1, G + 1.0, sz - 0.15, 1.1, awn[k]!);
    c.spots.push({ x: sx + 0.45, z: sz - 0.3, y: G, kind: "stand" });
  }
  palm(b, r, -7.7, -2.4);
  palm(b, r, -2.4, -2.4);
  palm(b, r, -2.4, -5.0);
  c.areas.push({ rect: { x0: -7.6, z0: -3.2, x1: -2.4, z1: -2.3 }, n: 9, y: G });
}

/** Downtown: the pyramid and three towers. */
function downtown(b: Builder, c: City, r: Rand) {
  pyramid(b, c, r, 2.4, -7.6, 2.7);
  tower(b, c, r, 5.6, -7.6, 2.1, 2.2, 6, STYLES[1]);
  tower(b, c, r, 2.4, -4.4, 2.4, 2.1, 4, STYLES[3]);
  // the tall glass one, with a lit crown
  const h = tower(b, c, r, 5.4, -4.6, 2.3, 2.3, 7, STYLES[5]);
  b.box(5.6, h, -4.4, 1.9, 0.6, 1.9, teal[3]);
  b.box(5.8, h + 0.6, -4.2, 1.5, 0.3, 1.5, WHITE, LIT);
}

/** A row of painted Victorian houses facing a park. */
function paintedLadies(b: Builder, c: City, r: Rand, ox: number, oz: number) {
  const hues = [[coral[3], WHITE], [mustard[2], WHITE], [teal[3], WHITE], [lavender[3], WHITE]] as const;
  for (let k = 0; k < 4; k++) paintedLady(b, c, r, ox + 0.15 + k * 1.45, oz + 0.3, 1.36, 2.1, hues[k]![0], hues[k]![1]);
  b.box(ox, G, oz + 3, 6, 0.05, 3, grass[0], grass[1]);
  b.top(ox + 2.7, G + 0.054, oz + 3, 0.6, 3, floor[2]);
  tree(b, r, ox + 0.7, oz + 5.2, G + 0.05);
  tree(b, r, ox + 5.3, oz + 4.0, G + 0.05);
  tree(b, r, ox + 4.4, oz + 5.5, G + 0.05);
  bench(b, ox + 1.5, oz + 3.3, G + 0.05);
  // picnic blankets
  b.top(ox + 1.2, G + 0.056, oz + 4.5, 0.9, 0.7, coral[2]);
  b.top(ox + 3.8, G + 0.056, oz + 4.6, 0.9, 0.7, mustard[2]);
  for (const [px, pz] of [[1.45, 4.75], [1.85, 4.95], [4.05, 4.85], [4.45, 5.0]] as const) c.spots.push({ x: ox + px, z: oz + pz, y: G + 0.05, kind: "sit" });
  c.areas.push({ rect: { x0: ox + 0.3, z0: oz + 3.2, x1: ox + 5.7, z1: oz + 5.8 }, n: 5, y: G + 0.05 });
}

/** Where it all starts: a garage with a desk in the doorway. Plus a coffee shop and a food truck. */
function garageBlock(b: Builder, c: City, r: Rand) {
  // the house
  const x = 12.3, z = 2.4, w = 3.3, d = 2.5, h = 1.65;
  b.box(x, 0, z, w, h, d, floor[2]);
  const f = z + d;
  b.box(x - 0.12, h, z - 0.12, w + 0.24, 0.14, d + 0.24, coral[0], coral[1]);
  b.box(x + 0.3, h + 0.14, z + 0.3, w - 0.6, 0.3, d - 0.6, coral[0], coral[1]);
  b.left(x + 0.25, G, f + e, 1.75, 1.15, "#2b2c2b", 1); // the open garage
  b.left(x + 0.35, G + 0.7, f + 2 * e, 0.7, 0.08, wood[1]);
  b.left(x + 0.4, G + 0.78, f + 2 * e, 0.14, 0.16, coral[2]);
  b.left(x + 0.6, G + 0.78, f + 2 * e, 0.14, 0.2, fabric[2]);
  b.left(x + 1.3, G + 0.3, f + 2 * e, 0.5, 0.6, WHITE); // whiteboard
  b.left(x + 1.36, G + 0.5, f + 3 * e, 0.3, 0.05, YC);
  b.left(x + 1.36, G + 0.66, f + 3 * e, 0.2, 0.05, fabric[1]);
  b.left(x + 2.3, G, f + e, 0.36, 0.8, wood[0]);
  b.left(x + 2.75, G + 0.35, f + e, 0.4, 0.45, fabric[2]);
  b.right(x + w + e, G + 0.35, z + 0.4, 0.5, 0.45, fabric[1]);
  b.right(x + w + e, G + 0.35, z + 1.5, 0.5, 0.45, LIT);
  b.top(x + 0.2, G + 0.003, f, 1.85, 8.9 - f, stone[1]); // driveway
  // desk in the doorway: two monitors, a lamp
  b.box(x + 0.5, G, f + 0.5, 1.2, 0.36, 0.5, wood[2]);
  b.box(x + 0.6, G + 0.36, f + 0.56, 0.34, 0.26, 0.06, BLACK);
  b.box(x + 1.1, G + 0.36, f + 0.56, 0.34, 0.26, 0.06, BLACK);
  c.twinkles.push({ side: "L", x: x + 0.63, y: G + 0.39, z: f + 0.62 + e, w: 0.28, h: 0.2, seed: 0.31 });
  c.twinkles.push({ side: "L", x: x + 1.13, y: G + 0.39, z: f + 0.62 + e, w: 0.28, h: 0.2, seed: 0.77 });
  c.spots.push({ x: x + 0.8, z: f + 1.25, y: G, kind: "sit" }, { x: x + 1.3, z: f + 1.25, y: G, kind: "sit" }, { x: x + 1.95, z: f + 0.9, y: G, kind: "stand" });
  tree(b, r, x + 2.8, f + 1.2);
  // coffee shop
  const cx = 15.9, cz = 2.4;
  b.box(cx, 0, cz, 1.9, 1.5, 2.1, wood[2]);
  b.left(cx + 0.15, G + 0.2, cz + 2.1 + e, 1.0, 0.7, fabric[2]);
  b.left(cx + 1.3, G, cz + 2.1 + e, 0.4, 0.85, dark[1]);
  awning(b, cx, 1.05, cz + 2.1, 1.9, BLACK, YC);
  b.right(cx + 1.9 + e, G + 0.3, cz + 0.3, 1.4, 0.6, fabric[1]);
  b.box(cx - 0.05, 1.5, cz - 0.05, 2.0, 0.1, 2.2, dark[1]);
  // a cup on the roof
  b.box(cx + 0.6, 1.6, cz + 0.8, 0.6, 0.55, 0.6, WHITE);
  b.box(cx + 1.2, 1.75, cz + 0.98, 0.16, 0.26, 0.2, WHITE);
  b.top(cx + 0.68, 2.154, cz + 0.88, 0.44, 0.44, wood[0]);
  c.steam.push({ x: cx + 0.9, y: 2.2, z: cz + 1.1 });
  cafeTable(b, 16.3, 5.6, YC);
  cafeTable(b, 17.4, 6.6, BLACK);
  cafeTable(b, 16.2, 7.4, YC);
  for (const [px, pz] of [[16.0, 5.9], [16.65, 5.75], [17.1, 6.9], [17.75, 6.75], [15.9, 7.7], [16.55, 7.55]] as const) c.spots.push({ x: px, z: pz, y: G, kind: "sit" });
  for (let q = 0; q < 4; q++) c.spots.push({ x: 17.4, z: 4.8 + q * 0.42, y: G, kind: "stand" });
  // food truck
  const fx = 12.5, fz = 7.0;
  b.box(fx, 0.2, fz, 2.0, 0.95, 0.85, WHITE);
  b.left(fx, 0.2, fz + 0.85 + e, 2.0, 0.22, YC, 1);
  b.left(fx + 0.5, 0.62, fz + 0.85 + e, 1.2, 0.4, BLACK);
  awning(b, fx + 0.4, 1.05, fz + 0.85, 1.4, YC, BLACK);
  b.box(fx + 2.0, 0.2, fz + 0.05, 0.5, 0.65, 0.75, YC);
  b.right(fx + 2.5 + e, 0.5, fz + 0.12, 0.6, 0.28, fabric[3]);
  b.left(fx + 0.25, 0.02, fz + 0.86, 0.3, 0.26, BLACK);
  b.left(fx + 1.7, 0.02, fz + 0.86, 0.3, 0.26, BLACK);
  c.steam.push({ x: fx + 0.5, y: 1.2, z: fz + 0.3 });
  for (let q = 0; q < 3; q++) c.spots.push({ x: 13.0 + q * 0.42, z: 8.3, y: G, kind: "stand" });
  c.areas.push({ rect: { x0: 14.6, z0: 5.2, x1: 15.6, z1: 7.8 }, n: 3, y: G });
}

/** Park with a pond, a fountain, palms and people on the grass. */
function park(b: Builder, c: City, r: Rand, ox: number, oz: number, pond = true) {
  b.box(ox, G, oz, 6, 0.05, 6, grass[0], grass[1]);
  const y = G + 0.05;
  b.top(ox, y + 0.004, oz + 2.7, 6, 0.6, floor[2]);
  b.top(ox + 2.7, y + 0.004, oz, 0.6, 6, floor[2]);
  if (pond) {
    b.top(ox + 1.9, y + 0.006, oz + 1.9, 2.2, 2.2, stone[1]);
    b.top(ox + 2.1, y + 0.008, oz + 2.1, 1.8, 1.8, water[2]);
    b.top(ox + 2.3, y + 0.01, oz + 2.5, 0.5, 0.2, water[3]);
    b.box(ox + 2.85, y, oz + 2.85, 0.3, 0.3, 0.3, stone[2]);
    c.fountains.push({ x: ox + 3, y: y + 0.3, z: oz + 3 });
  }
  for (const [tx, tz] of [[0.6, 0.7], [5.3, 0.6], [0.7, 5.3], [5.2, 5.3], [1.6, 4.3], [4.6, 1.5]] as const) (r() < 0.45 ? palm : tree)(b, r, ox + tx, oz + tz, y);
  bench(b, ox + 0.5, oz + 2.3, y);
  bench(b, ox + 4.7, oz + 3.4, y);
  for (let k = 0; k < 3; k++) {
    const px = ox + 0.6 + r() * 4.6, pz = oz + 0.6 + r() * 4.6;
    b.top(px, y + 0.006, pz, 0.8, 0.6, pick(r, [coral[2], mustard[2], lavender[3], YC]));
    c.spots.push({ x: px + 0.25, z: pz + 0.3, y, kind: "sit" }, { x: px + 0.6, z: pz + 0.35, y, kind: "sit" });
  }
  c.areas.push({ rect: { x0: ox + 0.3, z0: oz + 0.3, x1: ox + 5.7, z1: oz + 5.7 }, n: 6, y });
}

/** Hill with the three-pronged red and white broadcast tower. */
function towerHill(b: Builder, c: City, r: Rand, ox: number, oz: number) {
  b.box(ox, G, oz, 6, 0.5, 6, leaf[1], grass[0]);
  b.box(ox + 0.8, G + 0.5, oz + 0.8, 4.4, 0.5, 4.4, leaf[1], grass[1]);
  b.box(ox + 1.7, G + 1.0, oz + 1.7, 2.6, 0.4, 2.6, leaf[2], grass[1]);
  const y = G + 1.4;
  for (const [mx, mz] of [[2.2, 2.2], [3.6, 2.4], [2.8, 3.6]] as const) {
    for (let k = 0; k < 9; k++) b.box(ox + mx, y + k * 0.75, oz + mz, 0.14, 0.75, 0.14, k % 2 ? WHITE : coral[2]);
    c.blinks.push({ x: ox + mx - 0.02, y: y + 6.75, z: oz + mz - 0.02, size: 0.18, hex: coral[2], seed: r() });
  }
  for (const by of [2.2, 4.4, 6.0]) {
    b.box(ox + 2.2, y + by, oz + 2.25, 1.5, 0.1, 0.1, WHITE);
    b.box(ox + 2.85, y + by, oz + 2.3, 0.1, 0.1, 1.4, WHITE);
  }
  tree(b, r, ox + 0.5, oz + 5.2, G + 0.5);
  tree(b, r, ox + 5.2, oz + 0.6, G + 0.5);
}

/** Any block that is not a landmark. Closer to the water → taller. */
function genericBlock(b: Builder, c: City, r: Rand, i: number, j: number) {
  const ox = i * 10 + 2, oz = j * 10 + 2;
  const waterfront = j === -1 || i === -1;
  const k = r();
  if (waterfront || k < 0.4) {
    const slots = [[0.3, 0.3], [3.3, 0.3], [0.3, 3.3], [3.3, 3.3]] as const;
    for (const [sx, sz] of slots) {
      if (r() < 0.12) {
        tree(b, r, ox + sx + 1.2, oz + sz + 1.2);
        bench(b, ox + sx + 0.6, oz + sz + 1.9);
        continue;
      }
      tower(b, c, r, ox + sx, oz + sz, 2.0 + r() * 0.5, 2.0 + r() * 0.5, (waterfront ? 4 : 2) + Math.floor(r() * (waterfront ? 6 : 5)));
    }
  } else if (k < 0.6) paintedLadies(b, c, r, ox, oz);
  else if (k < 0.75) park(b, c, r, ox, oz, r() < 0.6);
  else {
    const hues = [floor[2], coral[3], lavender[3], teal[3], stone[3], mustard[3], green[3], tan[3]];
    const awn = [coral[2], YC, teal[2], BLACK, mustard[1]];
    for (const [sx, sz] of [[0.2, 0.3], [3.2, 0.3], [0.2, 3.4]] as const) shop(b, c, r, ox + sx, oz + sz, 2.5, 2.1, 1 + Math.floor(r() * 3), pick(r, hues), pick(r, awn));
    cafeTable(b, ox + 4.0, oz + 4.2, pick(r, awn));
    cafeTable(b, ox + 5.1, oz + 5.2, pick(r, awn));
    c.spots.push({ x: ox + 3.7, z: oz + 4.5, y: G, kind: "sit" }, { x: ox + 4.35, z: oz + 4.4, y: G, kind: "sit" }, { x: ox + 4.8, z: oz + 5.5, y: G, kind: "sit" });
    tree(b, r, ox + 5.3, oz + 3.6);
  }
}

// ── ground, water's edge, bridge ───────────────────────────────────────────────

function ground(b: Builder, c: City, r: Rand) {
  const span = LAND1 - LAND0;
  b.top(LAND0, 0, LAND0, span, span, metal[0]);
  // Market Street: brick, with the cable car rails
  b.top(LAND0, 0.003, -1, span, 2, floor[0]);
  for (const rz of [-0.3, 0.24]) b.top(-9, 0.006, rz, span - 3, 0.06, metal[1]);
  // waterfront promenade
  b.top(LAND0, 0.004, LAND0, span, 0.35, stone[2]);
  b.top(LAND0, 0.004, LAND0, 0.35, span, stone[2]);

  for (let k = B0; k <= B1; k++) {
    const road = k * 10;
    for (let q = LAND0 + 0.5; q < LAND1; q += 1) {
      if (Math.abs(q + 0.25 - Math.round(q / 10) * 10) < 1.7) continue; // no dashes inside crossings
      b.top(road - 0.04, 0.005, q, 0.08, 0.5, stone[2]);
      if (k !== 0) b.top(q, 0.005, road - 0.04, 0.5, 0.08, stone[2]);
    }
  }
  // zebra crossings on every approach
  for (let a = B0; a <= B1; a++)
    for (let d = B0; d <= B1; d++) {
      const x = a * 10, z = d * 10;
      for (let q = 0; q < 6; q++) {
        const o = -0.9 + q * 0.33;
        b.top(x + o, 0.006, z + 1.05, 0.18, 0.45, stone[3]);
        b.top(x + 1.05, 0.006, z + o, 0.45, 0.18, stone[3]);
        if (d > B0 || a === 0) b.top(x + o, 0.006, z - 1.5, 0.18, 0.45, stone[3]);
        if (a > B0) b.top(x - 1.5, 0.006, z + o, 0.45, 0.18, stone[3]);
      }
      // traffic light on the near corner
      b.box(x + 1.1, G, z + 1.1, 0.07, 1.25, 0.07, dark[0]);
      b.box(x + 1.04, G + 1.25, z + 1.04, 0.19, 0.42, 0.19, BLACK);
      c.lights.push({ x: x + 1.04, z: z + 1.04 });
    }

  for (let i = B0; i <= B1; i++)
    for (let j = B0; j <= B1; j++) {
      const x = i * 10 + 1, z = j * 10 + 1;
      b.box(x, 0, z, 8, G, 8, stone[1], stone[2]);
      c.rings.push({ x0: x + 0.5, z0: z + 0.5, x1: x + 7.5, z1: z + 7.5 });
      // street furniture along the curb
      for (const o of [0.18, 7.82]) {
        lamp(b, x + o, z + 4);
        lamp(b, x + 4, z + o);
      }
      for (const q of [2.1, 5.9]) {
        tree(b, r, x + q, z + 7.84);
        tree(b, r, x + 7.84, z + q);
        if (r() < 0.5) b.box(x + q + 0.9, G, z + 0.12, 0.12, 0.26, 0.12, coral[2]); // hydrant
        if (r() < 0.5) b.box(x + 0.1, G, z + q + 0.9, 0.2, 0.34, 0.16, fabric[1]); // mailbox
      }
    }
}

/** The red suspension bridge: the x = 0 road carried north across the bay. */
function bridge(b: Builder) {
  const red = coral[1], hi = coral[2], end = -78;
  b.box(-1.15, -0.3, end, 2.3, 0.3, LAND0 - end, red, metal[0]);
  for (let q = end; q < LAND0; q += 1) b.top(-0.04, 0.005, q, 0.08, 0.5, stone[2]);
  for (const rx of [-1.15, 1.07]) b.box(rx, 0, end, 0.08, 0.22, LAND0 - end, hi);
  const towers = [-17, -41];
  const top = 6.3;
  for (const tz of towers) {
    for (const lx of [-1.55, 1.15]) {
      b.box(lx, -0.6, tz - 0.3, 0.4, top + 0.6, 0.6, red);
      b.box(lx - 0.05, top, tz - 0.35, 0.5, 0.18, 0.7, hi);
    }
    for (const by of [1.9, 3.5, 5.1, 6.0]) b.box(-1.15, by, tz - 0.2, 2.3, by > 5.9 ? 0.3 : 0.22, 0.4, red);
    b.box(-1.8, -0.6, tz - 0.6, 3.6, 0.5, 1.2, stone[1], stone[2]); // footing
  }
  // main cables + suspenders on both sides
  const cableY = (z: number): number => {
    const [t1, t0] = towers as [number, number];
    if (z > t1) return 0.25 + ((top - 0.25) * (LAND0 - z)) / (LAND0 - t1); // land anchor → first tower
    if (z < t0) return Math.max(0.25, top - (t0 - z) * 0.5);
    const mid = (t0 + t1) / 2, half = (t1 - t0) / 2;
    return 0.6 + (top - 0.6) * ((z - mid) / half) ** 2;
  };
  for (const cx of [-1.4, 1.3]) {
    for (let z = end; z < LAND0; z += 0.4) {
      const y = cableY(z);
      b.box(cx, y - 0.1, z, 0.1, 0.1, 0.4, hi);
      if (Math.round(z * 10) % 12 === 0 && y > 0.5) b.box(cx + 0.03, 0.2, z, 0.04, y - 0.3, 0.04, red);
    }
  }
}

function waterfront(b: Builder, c: City, r: Rand) {
  // pier A: a warehouse and the sea lions' float
  for (let q = 0; q < 4; q++) b.box(-12.5 - q * 2, -0.6, -6.6, 0.2, 0.5, 0.2, wood[0]);
  b.box(-19, -0.14, -7, 8, 0.14, 2.2, wood[1], wood[2]);
  b.box(-18.4, 0, -6.8, 3.4, 0.9, 1.5, coral[3]);
  b.box(-18.5, 0.9, -6.9, 3.6, 0.12, 1.7, coral[0], coral[1]);
  for (let k = 0; k < 4; k++) b.left(-18.2 + k * 0.8, 0.2, -5.3 + e, 0.5, 0.5, k % 2 ? fabric[1] : dark[1]);
  b.box(-15.2, -0.5, -3.9, 1.7, 0.12, 1.1, wood[1], wood[2]);
  for (const [sx, sz] of [[-15.0, -3.7], [-14.4, -3.4], [-14.0, -3.75], [-14.7, -3.15]] as const) c.seaLions.push({ x: sx, y: -0.38, z: sz });
  c.areas.push({ rect: { x0: -14.6, z0: -5.2, x1: -11.4, z1: -4.95 }, n: 3, y: 0 });
  // pier B: the observation wheel
  for (let q = 0; q < 4; q++) b.box(-12.5 - q * 2, -0.6, 4.8, 0.2, 0.5, 0.2, wood[0]);
  b.box(-19.5, -0.14, 3, 8.5, 0.14, 2.4, wood[1], wood[2]);
  const wx = -16.6, wy = 2.5, wz = 3.7, R = 1.8;
  for (const lx of [wx - 0.9, wx + 0.82]) b.box(lx, 0, wz - 0.1, 0.1, wy, 0.1, WHITE);
  b.box(wx - 0.12, wy - 0.12, wz - 0.16, 0.24, 0.24, 0.2, YC);
  for (let k = 0; k < 40; k++) {
    const a = (k / 40) * Math.PI * 2;
    b.box(wx + Math.cos(a) * R - 0.06, wy + Math.sin(a) * R - 0.06, wz - 0.05, 0.12, 0.12, 0.08, WHITE);
  }
  b.box(wx - R, wy - 0.03, wz - 0.03, 2 * R, 0.06, 0.04, stone[1]);
  b.box(wx - 0.03, wy - R, wz - 0.03, 0.06, 2 * R, 0.04, stone[1]);
  c.wheel = { x: wx, y: wy, z: wz, r: R };
  // stalls on the pier
  for (let k = 0; k < 2; k++) {
    b.box(-14.4 + k * 1.5, 0, 3.2, 1.0, 0.8, 0.7, [teal[2], mustard[2]][k]!);
    awning(b, -14.5 + k * 1.5, 0.8, 3.9, 1.2, [coral[2], YC][k]!);
  }
  c.areas.push({ rect: { x0: -19, z0: 4.7, x1: -11.4, z1: 5.2 }, n: 6, y: 0 });
  // railing posts along the promenade
  for (let q = LAND0 + 1; q < 40; q += 1.5) {
    b.box(LAND0 + 0.04, 0, q, 0.06, 0.26, 0.06, stone[0]);
    if (Math.abs(q) > 1.6) b.box(q, 0, LAND0 + 0.04, 0.06, 0.26, 0.06, stone[0]);
  }
  // the island: rock, an old block and a lighthouse
  const ix = -15, iz = -14;
  b.box(ix, -0.6, iz, 3.4, 0.75, 3, wall[1], wall[2]);
  b.box(ix + 0.5, 0.15, iz + 0.5, 2.3, 0.4, 2, wall[2], leaf[1]);
  b.box(ix + 0.7, 0.55, iz + 1.0, 1.6, 0.6, 0.9, floor[2]);
  for (let k = 0; k < 3; k++) b.left(ix + 0.85 + k * 0.5, 0.75, iz + 1.9 + e, 0.26, 0.24, dark[1]);
  b.box(ix + 2.3, 0.55, iz + 0.6, 0.34, 1.5, 0.34, WHITE);
  b.box(ix + 2.26, 2.05, iz + 0.56, 0.42, 0.12, 0.42, coral[1]);
  c.blinks.push({ x: ix + 2.36, y: 2.17, z: iz + 0.66, size: 0.22, hex: LIT, seed: r() });
}

// ── assembly ───────────────────────────────────────────────────────────────────

export function buildCity(r: Rand): City {
  const b = new Builder();
  const c: City = {
    mesh: null as unknown as THREE.Mesh, rings: [], areas: [], spots: [], twinkles: [], blinks: [], steam: [], fountains: [], flags: [], lights: [],
    chart: { x: 0, y: 0, z: 0 }, rocket: { x: 0, y: 0, z: 0 }, wheel: { x: 0, y: 0, z: 0, r: 1 }, seaLions: [],
  };
  ground(b, c, r);
  bridge(b);
  waterfront(b, c, r);
  /** Build a block that was written for one lot on another, shifting what it drew and registered. */
  const moved = (dx: number, dz: number, build: () => void) => {
    const lists = [c.spots, c.twinkles, c.blinks, c.steam, c.fountains, c.flags] as { x: number; z: number }[][];
    const from = lists.map((l) => l.length), areas = c.areas.length;
    b.dx = dx;
    b.dz = dz;
    build();
    b.dx = b.dz = 0;
    lists.forEach((l, i) => l.slice(from[i]).forEach((p) => ((p.x += dx), (p.z += dz))));
    for (const a of c.areas.slice(areas)) (a.rect.x0 += dx), (a.rect.x1 += dx), (a.rect.z0 += dz), (a.rect.z1 += dz);
  };

  // Landmarks ring the center, which the headline covers; the block under it is a park.
  for (let i = B0; i <= B1; i++)
    for (let j = B0; j <= B1; j++) {
      const key = `${i},${j}`;
      if (key === "-1,0") accelerator(b, c, r);
      else if (key === "0,0") park(b, c, r, 2, 2);
      else if (key === "1,0") {
        moved(10, 0, () => demoDay(b, c, r));
        c.chart.x += 10;
      } else if (key === "-1,-1") ferryBuilding(b, c, r);
      else if (key === "0,-1") downtown(b, c, r);
      else if (key === "0,1") moved(-10, 10, () => garageBlock(b, c, r));
      else if (key === "-1,1") paintedLadies(b, c, r, -8, 12);
      else if (key === "2,0") towerHill(b, c, r, 22, 2);
      else genericBlock(b, c, r, i, j);
    }
  c.mesh = b.mesh();
  return c;
}
