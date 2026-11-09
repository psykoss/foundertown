/**
 * Generates PLACEHOLDER art that follows the exact template (frame size, grid, key ramps,
 * master palette). Real art (exported from Aseprite) replaces these files 1:1 with no code changes.
 *
 *   pnpm assets:placeholders            → only writes files that don't exist yet
 *   pnpm assets:placeholders --force    → overwrites (never use once real art is in place)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Canvas, Region, rng, type Ramp4 } from "./lib/pixel.js";
import { pose, isChin, HEAD_BOTTOM, LEG_TOP, LEG_SPLIT_X, WALK_REF, type Pose, type R } from "./lib/pose.js";
import {
  ANIMS, ANIM_ORDER, FRAME_H, FRAME_W, SHEET_DIRS, SHEET_H, SHEET_W, TILE, sheetRow,
  type AnimName, type SheetDir,
} from "../shared/src/spec.js";
import { ENV_RAMPS, FIXED_COLORS, KEY_RAMPS, masterPalette } from "../shared/src/palette.js";
import type { ItemRegistry } from "../shared/src/avatar.js";
import { TERRAIN, TERRAIN_COUNT, LIBRARY_FLOORS } from "./lib/env.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "client/public/assets");
const FORCE = process.argv.includes("--force");
let written = 0;
let skipped = 0;

function save(c: Canvas, rel: string) {
  const file = path.join(OUT, rel);
  if (fs.existsSync(file) && !FORCE) {
    skipped++;
    return;
  }
  c.save(file);
  written++;
}

// ───────────────────────────── character frame helpers ─────────────────────────────

type Ch = keyof typeof KEY_RAMPS;
const BLACK = FIXED_COLORS.outline;

class Frame {
  private ops: (() => void)[] = [];
  constructor(readonly p: Pose, readonly c: Canvas) {}
  get dir(): SheetDir {
    return this.p.dir;
  }
  /** A shaded region with the black outline used by all character art. */
  reg(
    ch: Ch | Ramp4,
    inside?: (x: number, y: number) => boolean,
    dim = 0,
    shadeAt?: (x: number, y: number) => number | undefined,
  ): Region {
    const r = new Region(FRAME_W, FRAME_H, typeof ch === "string" ? KEY_RAMPS[ch] : ch);
    this.ops.push(() => r.paint(this.c, 0, 0, { outlineColor: BLACK, inside, volume: true, dim, shadeAt }));
    return r;
  }
  /** Region for clothing: soft edge where it meets the body/head, black on the outer silhouette. */
  bodyReg(ch: Ch, dim = 0): Region {
    const m = bodyMask(this.p);
    const hm = headMask(this.p);
    return this.reg(ch, (x, y) => x >= 0 && y >= 0 && x < FRAME_W && y < FRAME_H && (m[y * FRAME_W + x] === 1 || hm[y * FRAME_W + x] === 1), dim);
  }
  /** Region for hair/headwear: black outline only on the head silhouette, soft edge where it meets skin. */
  headReg(ch: Ch): Region {
    const m = headMask(this.p);
    const shades = headShades(this.p);
    return this.reg(
      ch,
      (x, y) => x >= 0 && y >= 0 && x < FRAME_W && y < FRAME_H && m[y * FRAME_W + x] === 1,
      0,
      (x, y) => shades[y * FRAME_W + x]! >= 0 ? shades[y * FRAME_W + x] : undefined,
    );
  }
  /** Shift a painted key-ramp pixel one shade darker (d=-1) or lighter (d=+1). Outline/fixed colors untouched. */
  shift(x: number, y: number, d: number) {
    this.ops.push(() => {
      const h = hexAt(this.c, x, y);
      if (!h) return;
      for (const ramp of Object.values(KEY_RAMPS) as readonly string[][]) {
        const i = ramp.indexOf(h);
        if (i >= 0) {
          const j = Math.max(0, Math.min(3, i + d));
          if (j !== i) this.c.set(x, y, ramp[j]!);
          return;
        }
      }
    });
  }
  /** Apply `shift` to every pixel of a region matching a predicate (call AFTER the region's shapes are set). */
  detail(r: Region, d: number, when: (x: number, y: number) => boolean) {
    for (let y = 0; y < FRAME_H; y++) for (let x = 0; x < FRAME_W; x++) if (r.has(x, y) && when(x, y)) this.shift(x, y, d);
  }
  /** Paint the pixels of the given classes in a key ramp, keeping each pixel's reference shade. */
  recolor(ch: Ch, when: (cls: number, x: number, y: number) => boolean, dim = 0) {
    const { cls, shade } = classes(this.p);
    this.ops.push(() => {
      for (let y = 0; y < FRAME_H; y++)
        for (let x = 0; x < FRAME_W; x++) {
          const i = y * FRAME_W + x;
          if (shade[i]! < 0 || !when(cls[i]!, x, y)) continue;
          this.c.set(x, y, KEY_RAMPS[ch][Math.max(0, shade[i]! - dim)]!);
        }
    });
  }
  dot(x: number, y: number, hex: string, alpha = 255) {
    this.ops.push(() => this.c.set(x, y, hex, alpha));
  }
  flush() {
    this.ops.forEach((o) => o());
  }
}

const rr = (reg: Region, r: R, round = 0) => (round ? reg.round(r.x, r.y, r.w, r.h, round) : reg.rect(r.x, r.y, r.w, r.h));
const grow = (r: R, d: number): R => ({ x: r.x - d, y: r.y - d, w: r.w + 2 * d, h: r.h + 2 * d });

type Drawer = (f: Frame) => void;

// ── Base body: animated from the reference art (not drawn procedurally) ──

const REF_SKIN = ["#75412b", "#ab633b", "#d8885c", "#f9bf95"]; // reference skin ramp, dark → light
const FACE_COLORS = new Set<string>([FIXED_COLORS.eye, FIXED_COLORS.iris, FIXED_COLORS.eyeWhite, FIXED_COLORS.base2, FIXED_COLORS.base3, FIXED_COLORS.blush]);
const DARKER: Record<string, string> = {
  [KEY_RAMPS.skin[3]]: KEY_RAMPS.skin[2], [KEY_RAMPS.skin[2]]: KEY_RAMPS.skin[1], [KEY_RAMPS.skin[1]]: KEY_RAMPS.skin[0],
  [FIXED_COLORS.base3]: FIXED_COLORS.base2, [FIXED_COLORS.base2]: FIXED_COLORS.base1, [FIXED_COLORS.base1]: FIXED_COLORS.base0,
};
const hexAt = (c: Canvas, x: number, y: number) => {
  const i = (y * c.w + x) * 4;
  return c.data[i + 3] ? "#" + [c.data[i]!, c.data[i + 1]!, c.data[i + 2]!].map((v) => v.toString(16).padStart(2, "0")).join("") : null;
};

/** Split the reference into BODY (skin → key ramp) and FACE (eyes, blush) per direction. */
function loadBase(): Record<SheetDir, { body: Canvas; head: Canvas; face: Canvas }> {
  const strip = Canvas.load(path.join(ROOT, "art/characters/reference/base_body.png"));
  const out = {} as Record<SheetDir, { body: Canvas; head: Canvas; face: Canvas }>;
  (["down", "up", "left"] as SheetDir[]).forEach((dir, i) => {
    const body = new Canvas(FRAME_W, FRAME_H);
    const head = new Canvas(FRAME_W, FRAME_H);
    const face = new Canvas(FRAME_W, FRAME_H);
    for (let y = 0; y < FRAME_H; y++)
      for (let x = 0; x < FRAME_W; x++) {
        const h = hexAt(strip, i * FRAME_W + x, y);
        if (!h) continue;
        const skin = REF_SKIN.indexOf(h);
        const isHead = y <= HEAD_BOTTOM[dir] || isChin(dir, x, y);
        const target = isHead ? head : body;
        if (isHead && FACE_COLORS.has(h)) {
          face.set(x, y, h);
          head.set(x, y, KEY_RAMPS.skin[3]);
        } else target.set(x, y, skin >= 0 ? KEY_RAMPS.skin[skin]! : h);
      }
    out[dir] = { body, head, face };
  });
  return out;
}

/** Apply the shared motion model to a base frame. */
function animate(src: Canvas, p: Pose, out: Canvas) {
  const { dir, m } = p;
  const put = (x: number, y: number, h: string, darken = false) => out.set(x, y, darken ? (DARKER[h] ?? h) : h);
  // legs (far first on side view)
  for (let y = LEG_TOP[dir]; y < FRAME_H; y++)
    for (let x = 0; x < FRAME_W; x++) {
      const h = hexAt(src, x, y);
      if (!h) continue;
      if (dir === "left") {
        if (m.stride) put(x + m.stride, y, h, true);
      } else put(x, y - (x < LEG_SPLIT_X ? m.liftL : m.liftR), h);
    }
  if (dir === "left")
    for (let y = LEG_TOP[dir]; y < FRAME_H; y++)
      for (let x = 0; x < FRAME_W; x++) {
        const h = hexAt(src, x, y);
        if (h) put(x - m.stride, y, h);
      }
  // upper body, then head on top
  for (let y = HEAD_BOTTOM[dir] + 1; y < LEG_TOP[dir]; y++)
    for (let x = 0; x < FRAME_W; x++) {
      const h = hexAt(src, x, y);
      if (h) put(x, y + m.bodyDy, h);
    }
  for (let y = 0; y <= HEAD_BOTTOM[dir]; y++)
    for (let x = 0; x < FRAME_W; x++) {
      const h = hexAt(src, x, y);
      if (h) put(x, y + m.headDy, h);
    }
}

const BASE = loadBase();

type Parts = { body: Canvas; head: Canvas; face: Canvas };

/** Walk frames imported from the reference recording, split into body / head / face like the base. */
function loadWalk(): Record<SheetDir, Parts[]> {
  const strip = Canvas.load(path.join(ROOT, "art/characters/reference/base_walk.png"));
  const out = {} as Record<SheetDir, Parts[]>;
  WALK_REF.rows.forEach((dir, row) => {
    out[dir] = [];
    for (let f = 0; f < WALK_REF.frames; f++) {
      const { dy } = WALK_REF.motion[dir][f]!;
      const parts: Parts = { body: new Canvas(FRAME_W, FRAME_H), head: new Canvas(FRAME_W, FRAME_H), face: new Canvas(FRAME_W, FRAME_H) };
      for (let y = 0; y < FRAME_H; y++)
        for (let x = 0; x < FRAME_W; x++) {
          const h = hexAt(strip, f * FRAME_W + x, row * FRAME_H + y);
          if (!h) continue;
          const skin = REF_SKIN.indexOf(h);
          const isHead = y - dy <= HEAD_BOTTOM[dir] || isChin(dir, x, y - dy);
          if (isHead && FACE_COLORS.has(h)) {
            parts.face.set(x, y, h);
            parts.head.set(x, y, KEY_RAMPS.skin[3]);
          } else (isHead ? parts.head : parts.body).set(x, y, skin >= 0 ? KEY_RAMPS.skin[skin]! : h);
        }
      out[dir].push(parts);
    }
  });
  return out;
}
const WALK = loadWalk();

/** The base-body part for a frame, already positioned (idle: base + motion model; walk: reference frame). */
const sourceCache = new Map<string, Canvas>();
function source(p: Pose, part: keyof Parts): Canvas {
  if (p.anim === "walk") return WALK[p.dir][p.f]![part];
  const key = `${p.dir}:${p.anim}:${p.f}:${part}`;
  let c = sourceCache.get(key);
  if (!c) {
    c = new Canvas(FRAME_W, FRAME_H);
    animate(BASE[p.dir][part], p, c);
    sourceCache.set(key, c);
  }
  return c;
}

/** Head silhouette (from the reference body) for a pose, shifted with the head bob. */
function headMask(p: Pose): Uint8Array {
  const src = source(p, "head"); // includes the chin/nape rows below HEAD_BOTTOM
  const m = new Uint8Array(FRAME_W * FRAME_H);
  for (let y = 0; y < FRAME_H; y++) for (let x = 0; x < FRAME_W; x++) if (hexAt(src, x, y)) m[y * FRAME_W + x] = 1;
  return m;
}

/**
 * Shade index (0–3) of the reference head at each pixel, -1 where not skin.
 * Hair and headwear copy this, so they carry exactly the reference head's shading.
 */
function headShades(p: Pose): Int8Array {
  const src = source(p, "head");
  const out = new Int8Array(FRAME_W * FRAME_H).fill(-1);
  for (let y = 0; y < FRAME_H; y++)
    for (let x = 0; x < FRAME_W; x++) {
      const h = hexAt(src, x, y);
      if (!h) continue;
      const i = (KEY_RAMPS.skin as readonly string[]).indexOf(h);
      if (i >= 0) out[y * FRAME_W + x] = i;
    }
  return out;
}

/**
 * Pixel classes of a frame's base body — clothing is a recolor of these, so it keeps the reference
 * outline, contour and shading exactly, and hands are never covered.
 *   TANK  base undershirt pixels       SHORTS base shorts pixels
 *   ARM   skin connected to the shoulders (arms + hands, incl. hands crossing the hips)
 *   LEG   skin of the legs              FOOT the lowest 3 leg pixels per column
 *   TORSO_SKIN bare skin between the undershirt straps (upper chest/back) — covered by every top
 */
const C = { NONE: 0, OUTLINE: 1, TANK: 2, SHORTS: 3, ARM: 4, HAND: 5, LEG: 6, FOOT: 7, TORSO_SKIN: 8 } as const;
const BASE_GREYS = [FIXED_COLORS.base0, FIXED_COLORS.base1, FIXED_COLORS.base2, FIXED_COLORS.base3] as string[];
const HIP_LINE: Record<SheetDir, number> = { down: 52, up: 52, left: 54 };
interface Classes { cls: Uint8Array; shade: Int8Array }
const classCache = new Map<string, Classes>();
function classes(p: Pose): Classes {
  const key = `${p.dir}:${p.anim}:${p.f}`;
  const hit = classCache.get(key);
  if (hit) return hit;
  const src = source(p, "body");
  const N = FRAME_W * FRAME_H;
  const cls = new Uint8Array(N);
  const shade = new Int8Array(N).fill(-1);
  const skin = new Uint8Array(N);
  const hip = HIP_LINE[p.dir] + p.m.bodyDy;
  for (let y = 0; y < FRAME_H; y++)
    for (let x = 0; x < FRAME_W; x++) {
      const h = hexAt(src, x, y);
      if (!h) continue;
      const i = y * FRAME_W + x;
      const k = (KEY_RAMPS.skin as readonly string[]).indexOf(h);
      // on the body, the near-white eye color is a sampled undershirt highlight → treat as base3
      const g = h === FIXED_COLORS.eyeWhite ? 3 : BASE_GREYS.indexOf(h);
      if (h === BLACK) cls[i] = C.OUTLINE;
      // undershirt white highlight (base3) reads as a stain on colored cloth → fold it into the main tone
      else if (g >= 0) { cls[i] = y < hip ? C.TANK : C.SHORTS; shade[i] = Math.min(g, 2); }
      // skin's main fill is its lightest shade (3) while cloth's main fill is shade 2 → offset skin by one
      else if (k >= 0) { skin[i] = 1; shade[i] = Math.max(0, k - 1); }
    }
  // skin components: touching rows above the hips → arm (shoulders, arms, hands); else → leg
  const seen = new Uint8Array(N);
  for (let i0 = 0; i0 < N; i0++) {
    if (!skin[i0] || seen[i0]) continue;
    const comp: number[] = [];
    const st = [i0];
    seen[i0] = 1;
    while (st.length) {
      const i = st.pop()!;
      comp.push(i);
      const x = i % FRAME_W, y = (i / FRAME_W) | 0;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
        if (nx < 0 || ny < 0 || nx >= FRAME_W || ny >= FRAME_H) continue;
        const j = ny * FRAME_W + nx;
        if (skin[j] && !seen[j]) { seen[j] = 1; st.push(j); }
      }
    }
    const minY = Math.min(...comp.map((i) => (i / FRAME_W) | 0));
    const maxY = Math.max(...comp.map((i) => (i / FRAME_W) | 0));
    const isArm = minY < hip - 2;
    const xs = comp.map((i) => i % FRAME_W);
    const betweenStraps = p.dir !== "left" && Math.min(...xs) >= 11 && Math.max(...xs) <= 20;
    for (const i of comp)
      cls[i] = !isArm ? C.LEG : betweenStraps ? C.TORSO_SKIN : ((i / FRAME_W) | 0) >= maxY - 2 ? C.HAND : C.ARM;
  }
  // feet: lowest 3 leg pixels of each column
  for (let x = 0; x < FRAME_W; x++) {
    let n = 0;
    for (let y = FRAME_H - 1; y >= 0 && n < 3; y--) {
      const i = y * FRAME_W + x;
      if (cls[i] === C.LEG) { cls[i] = C.FOOT; n++; }
      else if (n > 0 && cls[i] !== C.OUTLINE) break;
    }
  }
  const out = { cls, shade };
  classCache.set(key, out);
  return out;
}

/** Body silhouette (torso, arms, legs — animated) for a pose. */
const bodyMaskCache = new Map<string, Uint8Array>();
function bodyMask(p: Pose): Uint8Array {
  const key = `${p.dir}:${p.anim}:${p.f}`;
  let m = bodyMaskCache.get(key);
  if (!m) {
    const c = source(p, "body");
    m = new Uint8Array(FRAME_W * FRAME_H);
    for (let i = 0; i < m.length; i++) m[i] = c.data[i * 4 + 3] ? 1 : 0;
    bodyMaskCache.set(key, m);
  }
  return m;
}

/** Fill a region with (body mask ∩ predicate) — clothing follows the body's real contour. */
function fromBody(r: Region, p: Pose, keep: (x: number, y: number) => boolean, growPx = 0): Region {
  const m = bodyMask(p);
  for (let y = 0; y < FRAME_H; y++)
    for (let x = 0; x < FRAME_W; x++) {
      if (!m[y * FRAME_W + x] || !keep(x, y)) continue;
      for (let oy = -growPx; oy <= growPx; oy++)
        for (let ox = -growPx; ox <= growPx; ox++) if (Math.abs(ox) + Math.abs(oy) <= growPx && oy >= 0) r.px(x + ox, y + oy);
    }
  return r;
}

/** Fill a region with (head mask ∩ predicate), grown by `grow` px for volume. */
function fromHead(r: Region, p: Pose, keep: (x: number, y: number) => boolean, growPx = 0): Region {
  const m = headMask(p);
  const base: [number, number][] = [];
  for (let y = 0; y < FRAME_H; y++) for (let x = 0; x < FRAME_W; x++) if (m[y * FRAME_W + x] && keep(x, y)) base.push([x, y]);
  for (const [x, y] of base)
    for (let oy = -growPx; oy <= growPx; oy++)
      for (let ox = -growPx; ox <= growPx; ox++) if (Math.abs(ox) + Math.abs(oy) <= growPx && (oy <= 0 || keep(x, y + oy))) r.px(x + ox, y + oy);
  return r;
}

const drawers: Record<string, Drawer> = {
  "body/shadow_01.png": (f) => {
    for (let y = 57; y <= 63; y++)
      for (let x = 5; x <= 26; x++) {
        const dx = (x + 0.5 - 16) / 10;
        const dy = (y + 0.5 - 61) / 2.4;
        if (dx * dx + dy * dy <= 1) f.dot(x, y, FIXED_COLORS.shadow, 70);
      }
  },
  "body/body_01.png": (f) => f.c.blit(source(f.p, "body"), 0, 0),
  "body/head_01.png": (f) => f.c.blit(source(f.p, "head"), 0, 0),
  "face/face_01.png": (f) => f.c.blit(source(f.p, "face"), 0, 0),

  // ── hair ──
  "hair/hair_short_01.png": (f) => hairCap(f, 2),
  "hair/hair_long_01_front.png": (f) => hairCap(f, 11),
  "hair/hair_long_01_back.png": (f) => {
    const h = f.p.head;
    const r = f.reg("primary");
    if (f.dir === "down") r.round(h.x, h.y + 8, h.w, 16, 2);
    else if (f.dir === "up") r.round(h.x, h.y + 6, h.w, 18, 3);
    else r.round(h.x + 8, h.y + 6, 9, 17, 2);
    // ears stay visible (this layer is drawn over the head in the back view)
    for (let y = 0; y < FRAME_H; y++) for (let x = 0; x < FRAME_W; x++) if (isEar(f, x, y)) r.px(x, y, false);
  },
  "hair/hair_bun_01.png": (f) => {
    const h = f.p.head;
    const bun = f.reg("primary");
    if (f.dir === "left") bun.ellipse(h.x + h.w - 3, h.y, 4, 3.6);
    else bun.ellipse(h.x + h.w / 2, h.y - 1, 4.5, 3.8);
    hairCap(f, 4);
  },

  // ── tops ──
  "top/top_tee_01.png": (f) => shirt(f, 4, false),
  "top/top_longsleeve_01.png": (f) => shirt(f, 7, true),

  // ── outerwear ──
  "outerwear/outer_hoodie_01.png": (f) => {
    // body + sleeves recolored; the hood is the top rows of the garment one shade darker (it folds behind
    // the neck), drawstrings are two accent pixels — all inside the reference silhouette
    const y0 = 45 + f.p.m.bodyDy;
    jacket(f);
    if (f.dir === "down") {
      f.recolor("primary", (c, _x, y) => (isTorso(c) || c === C.ARM) && y <= y0 + 2, 1);
      f.recolor("secondary", (c, x, y) => isTorso(c) && (x === 14 || x === 17) && y >= y0 + 3 && y <= y0 + 5);
    } else if (f.dir === "up") {
      f.recolor("primary", (c, x, y) => isTorso(c) && y <= y0 + 5 && x >= 12 && x <= 19, 1);
    } else {
      f.recolor("primary", (c, x, y) => (isTorso(c) || c === C.ARM) && y <= y0 + 3 && x >= 15, 1);
    }
  },
  "outerwear/outer_blazer_01.png": (f) => {
    // open jacket: the shirt shows in a V down the front
    const y0 = 45 + f.p.m.bodyDy;
    jacket(f);
    if (f.dir === "down") {
      f.recolor("secondary", (c, x, y) => isTorso(c) && y >= y0 + 1 && y <= y0 + 7 && Math.abs(x + 0.5 - 16) <= Math.max(0, 3 - Math.floor((y - y0 - 1) / 2)));
      f.recolor("primary", (c, x, y) => isTorso(c) && x === 15 && y === y0 + 8, 2); // button
    } else if (f.dir === "left") {
      f.recolor("secondary", (c, x, y) => isTorso(c) && x <= 13 && y <= y0 + 5);
    }
  },

  // ── bottoms ──
  "bottom/bottom_pants_01.png": (f) => legsWear(f, 99),
  "bottom/bottom_shorts_01.png": (f) => legsWear(f, 3),
  "bottom/bottom_skirt_01.png": (f) => {
    // shorts recolored + a flare drawn around them (never over hands/arms)
    const { cls } = classes(f.p);
    let top = FRAME_H, bottom = 0, left = FRAME_W, right = 0;
    for (let y = 0; y < FRAME_H; y++)
      for (let x = 0; x < FRAME_W; x++)
        if (cls[y * FRAME_W + x] === C.SHORTS) {
          top = Math.min(top, y); bottom = Math.max(bottom, y); left = Math.min(left, x); right = Math.max(right, x);
        }
    if (top > bottom) return;
    const r = f.reg("primary");
    for (let y = top - 1; y <= bottom + 2; y++) {
      const spread = Math.max(0, Math.floor((y - top) / 3));
      r.rect(left - spread, y, right - left + 1 + spread * 2, 1);
    }
    for (let y = 0; y < FRAME_H; y++)
      for (let x = 0; x < FRAME_W; x++) {
        const c = cls[y * FRAME_W + x]!;
        if (c === C.HAND || c === C.ARM || c === C.TORSO_SKIN || c === C.TANK) r.px(x, y, false);
      }
  },

  // ── shoes ──
  "shoes/shoes_sneakers_01.png": (f) => footwear(f, 0),
  "shoes/shoes_boots_01.png": (f) => footwear(f, 2),

  // ── headwear ──
  "headwear/head_cap_01.png": (f) => {
    const h = f.p.head;
    fromHead(f.headReg("primary"), f.p, (_x, y) => y <= h.y + 6);
    const brim = f.reg("secondary");
    if (f.dir === "down") brim.round(h.x + 3, h.y + 6, h.w - 6, 2, 1); // brim stays inside the oval
    else if (f.dir === "left") brim.round(h.x - 4, h.y + 5, 9, 3, 1);
    else brim.rect(h.x + 6, h.y + 6, h.w - 12, 2);
  },
  "headwear/head_beanie_01.png": (f) => {
    const h = f.p.head;
    fromHead(f.headReg("primary"), f.p, (_x, y) => y <= h.y + 7);
    fromHead(f.headReg("secondary"), f.p, (_x, y) => y >= h.y + 6 && y <= h.y + 7); // cuff follows the oval
  },

  // ── accessories ──
  "face_accessory/glasses_01.png": (f) => {
    if (f.dir === "up") return;
    const lens = (x: number, y: number) => {
      for (let i = 0; i < 5; i++) {
        f.dot(x + i, y - 1, FIXED_COLORS.glassFrame);
        f.dot(x + i, y + 3, FIXED_COLORS.glassFrame);
      }
      for (let j = 0; j < 3; j++) {
        f.dot(x, y + j, FIXED_COLORS.glassFrame);
        f.dot(x + 4, y + j, FIXED_COLORS.glassFrame);
      }
      f.dot(x + 3, y, FIXED_COLORS.glassLens);
    };
    const eyes = f.p.eyes;
    if (f.dir === "down") {
      lens(eyes[0]!.x - 1, eyes[0]!.y);
      lens(eyes[1]!.x - 1, eyes[1]!.y);
      f.dot(15, eyes[0]!.y, FIXED_COLORS.glassFrame);
      f.dot(16, eyes[0]!.y, FIXED_COLORS.glassFrame);
    } else {
      lens(eyes[0]!.x - 1, eyes[0]!.y);
      for (let x = eyes[0]!.x + 4; x < eyes[0]!.x + 10; x++) f.dot(x, eyes[0]!.y, FIXED_COLORS.glassFrame);
    }
  },
  "back_accessory/backpack_01.png": (f) => {
    const t = f.p.torso;
    if (f.dir === "down") {
      f.reg("primary").round(t.x + 1, t.y - 2, t.w - 2, 6, 2);
    } else if (f.dir === "up") {
      f.reg("primary").round(t.x, t.y + 1, t.w, 11, 3);
      f.reg("secondary").round(t.x + 3, t.y + 6, t.w - 6, 5, 1);
    } else {
      f.reg("primary").round(t.x + t.w - 3, t.y, 7, 10, 2);
    }
  },
};

/** Hair strands + highlight sheen, so hair reads as hair and not a flat cap. */
function hairDetail(f: Frame, r: Region) {
  const h = f.p.head;
  const inner = (x: number, y: number) => r.has(x - 1, y) && r.has(x + 1, y) && r.has(x, y - 1) && r.has(x, y + 1);
  if (f.dir === "up") {
    // vertical strands falling down the back of the head
    f.detail(r, -1, (x, y) => inner(x, y) && y >= h.y + 4 && (x - h.x) % 3 === 1 && (y + x) % 5 !== 0);
    f.detail(r, 1, (x, y) => inner(x, y) && y >= h.y + 2 && y <= h.y + 3 && x >= h.x + 6 && x <= h.x + 11);
  } else if (f.dir === "down") {
    // strands sweeping from the crown toward the fringe
    f.detail(r, -1, (x, y) => inner(x, y) && y >= h.y + 3 && (x + Math.floor((y - h.y) / 2)) % 4 === 0);
    f.detail(r, 1, (x, y) => inner(x, y) && y === h.y + 2 && x >= h.x + 5 && x <= h.x + 10);
  } else {
    f.detail(r, -1, (x, y) => inner(x, y) && y >= h.y + 3 && (x - Math.floor((y - h.y) / 2)) % 4 === 0);
    f.detail(r, 1, (x, y) => inner(x, y) && y === h.y + 2 && x >= h.x + 3 && x <= h.x + 8);
  }
}

/**
 * Exactly the ear pixels of the reference head — hair leaves only these uncovered.
 *   front/back: the bump outside the oval + its inner shade line → cols 6–8 / 23–25, rows 38–42
 *   side:       13 px — cols 18–19 on rows 39 & 43, cols 18–20 on rows 40–42
 */
function isEar(f: Frame, x: number, y: number): boolean {
  const h = f.p.head;
  const ry = y - h.y; // row relative to the head top (29)
  if (f.dir === "left") {
    // 13 px, same shape as the reference ear: 2 / 3 / 3 / 3 / 2 rows (dark edge toward the hair)
    const rx = x - h.x; // col relative to the head left (8)
    if (ry === 10 || ry === 14) return rx >= 10 && rx <= 11;
    return ry >= 11 && ry <= 13 && rx >= 10 && rx <= 12;
  }
  return (x <= h.x + 2 || x >= h.x + h.w - 3) && ry >= 9 && ry <= 13;
}

function hairCap(f: Frame, sideLen: number) {
  const { p } = f;
  const h = p.head;
  const r = f.headReg("primary");
  const headBottom = HEAD_BOTTOM[f.dir] + p.m.headDy;
  const ear = (x: number, y: number) => isEar(f, x, y);
  if (f.dir === "down") {
    fromHead(r, p, (x, y) => !ear(x, y) && (y <= h.y + 7 || (y <= h.y + 6 + sideLen && (x <= h.x + 3 || x >= h.x + h.w - 4))));
    r.rect(h.x + 4, h.y + 8, 6, 1).rect(h.x + 4, h.y + 9, 3, 1); // swept fringe
  } else if (f.dir === "up") {
    // the whole back of the head is hair, down to the collar; the ears stay visible
    fromHead(r, p, (x, y) => y <= headBottom + 2 && !ear(x, y));
  } else {
    // top + the whole back half of the head down to the nape, around the ear
    // no sideburn: below the hairline, hair only from the ear backwards
    fromHead(r, p, (x, y) => !ear(x, y) && (y <= h.y + 7 || (x >= h.x + 10 && y <= headBottom)));
    r.rect(h.x + 1, h.y + 8, 4, 1); // fringe tip
  }
}

// Clothing = recolor of the base body's pixel classes (see `classes()`): it keeps the reference outline,
// contour and shading, sleeves follow the arms, pants follow the legs, hands stay visible over hips.

const isFrontBack = (f: Frame) => f.dir !== "left";

const isTorso = (c: number) => c === C.TANK || c === C.TORSO_SKIN;

function shirt(f: Frame, sleeveRows: number, collar: boolean) {
  const y0 = 45 + f.p.m.bodyDy;
  f.recolor("primary", (c, _x, y) => isTorso(c) || (c === C.ARM && y < y0 + sleeveRows));
  if (collar && f.dir === "down") f.recolor("secondary", (c, x, y) => c === C.TANK && y <= y0 + 2 && x >= 13 && x <= 18);
}

function jacket(f: Frame) {
  f.recolor("primary", (c) => isTorso(c) || c === C.ARM);
}

function legsWear(f: Frame, len: number) {
  const legTop = (isFrontBack(f) ? 55 : 57) + f.p.m.bodyDy;
  f.recolor("primary", (c, _x, y) => c === C.SHORTS || (c === C.LEG && y <= legTop + len));
}

function footwear(f: Frame, shaft: number) {
  const { cls } = classes(f.p);
  const isFoot = (x: number, y: number) => y >= 0 && y < FRAME_H && cls[y * FRAME_W + x] === C.FOOT;
  // boots: also the leg pixels just above the foot
  const inShaft = (x: number, y: number) => {
    for (let d = 1; d <= shaft; d++) if (isFoot(x, y + d)) return true;
    return false;
  };
  f.recolor("primary", (c, x, y) => c === C.FOOT || (shaft > 0 && c === C.LEG && inShaft(x, y)));
  // sole: bottom foot pixel of each column
  f.recolor("secondary", (c, x, y) => c === C.FOOT && !isFoot(x, y + 1));
}

function buildSheet(drawer: Drawer): Canvas {
  const sheet = new Canvas(SHEET_W, SHEET_H);
  for (const anim of ANIM_ORDER as AnimName[])
    for (const dir of SHEET_DIRS)
      for (let i = 0; i < ANIMS[anim].frames; i++) {
        const fc = new Canvas(FRAME_W, FRAME_H);
        const f = new Frame(pose(dir, anim, i), fc);
        drawer(f);
        f.flush();
        sheet.blit(fc, i * FRAME_W, sheetRow(anim, dir) * FRAME_H);
      }
  return sheet;
}

// ───────────────────────────── environment ─────────────────────────────

const E = ENV_RAMPS as Record<string, Ramp4>;


function terrainTileset(): Canvas {
  // Reference style: flat pastel fills, joints/patterns 1 shade off the fill, no outlines.
  const c = new Canvas(8 * TILE, (TERRAIN_COUNT / 8) * TILE);
  const at = (id: number) => ({ ox: (id % 8) * TILE, oy: Math.floor(id / 8) * TILE });
  for (const [id, name] of Object.entries(LIBRARY_FLOORS)) {
    const { ox, oy } = at(Number(id));
    c.blit(Canvas.load(path.join(ROOT, "art/props/floors", name + ".png")), ox, oy);
  }

  /** Running-bond bricks: fill + 1px joints in a slightly darker tone. */
  const bricks = (id: number, fill: string, joint: string, bw: number, bh: number) => {
    const { ox, oy } = at(id);
    c.fill(ox, oy, TILE, TILE, fill);
    for (let y = 0; y < TILE; y += bh) {
      c.fill(ox, oy + y + bh - 1, TILE, 1, joint);
      const off = (y / bh) % 2 ? bw / 2 : 0;
      for (let x = off; x < TILE + bw; x += bw) if (x < TILE) c.fill(ox + x, oy + y, 1, bh - 1, joint);
    }
    return { ox, oy };
  };

  // grass: flat mint with a few soft lighter/darker specks (like the reference garden floor)
  const grass = (id: number, seed: number, extra: (ox: number, oy: number, rand: () => number) => void) => {
    const { ox, oy } = at(id);
    const rand = rng(seed);
    const g = E.grass!;
    c.fill(ox, oy, TILE, TILE, g[2]!);
    for (let i = 0; i < 18; i++) c.set(ox + Math.floor(rand() * TILE), oy + Math.floor(rand() * TILE), g[3]!);
    for (let i = 0; i < 6; i++) c.set(ox + Math.floor(rand() * TILE), oy + Math.floor(rand() * TILE), g[1]!);
    extra(ox, oy, rand);
  };
  grass(TERRAIN.grass0, 1, () => {});
  grass(TERRAIN.grass1, 2, (ox, oy, rand) => {
    for (let i = 0; i < 4; i++) {
      const x = 3 + Math.floor(rand() * 26), y = 4 + Math.floor(rand() * 24);
      c.set(ox + x, oy + y, E.grass![0]!); c.set(ox + x - 1, oy + y - 1, E.grass![1]!); c.set(ox + x + 1, oy + y - 1, E.grass![1]!);
    }
  });
  grass(TERRAIN.grass2, 3, (ox, oy, rand) => {
    for (let i = 0; i < 3; i++) {
      const x = 3 + Math.floor(rand() * 26), y = 3 + Math.floor(rand() * 26);
      const col = i % 2 ? E.paper![3]! : E.accent![3]!;
      c.set(ox + x, oy + y, col); c.set(ox + x + 1, oy + y, col); c.set(ox + x, oy + y + 1, col); c.set(ox + x + 1, oy + y + 1, E.accent![2]!);
    }
  });

  bricks(TERRAIN.path, E.path![2]!, E.path![1]!, 16, 8); // pale stone paving
  bricks(TERRAIN.wood, E.floor![3]!, E.floor![2]!, 16, 8); // cream brick office floor (reference)

  // lavender carpet: two-tone zigzag
  {
    const { ox, oy } = at(TERRAIN.carpet);
    const r = E.carpet!;
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const band = Math.floor((y + Math.abs(((x % 16) - 8))) / 8) % 2;
        c.set(ox + x, oy + y, band ? r[2]! : r[3]!);
      }
  }
  // lavender-white tiles with a soft rosette
  {
    const { ox, oy } = at(TERRAIN.tileFloor);
    const r = E.tileFloor!;
    c.fill(ox, oy, TILE, TILE, r[2]!);
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const dx = Math.abs((x % 16) - 7.5), dy = Math.abs((y % 16) - 7.5);
        if (Math.round(dx + dy) === 6 || (dx < 1.5 && dy < 1.5)) c.set(ox + x, oy + y, r[1]!);
        else if (dx > 6.5 && dy > 6.5) c.set(ox + x, oy + y, r[3]!);
      }
  }
  // water: blue with light ripples
  {
    const { ox, oy } = at(TERRAIN.water);
    const rand = rng(7);
    c.fill(ox, oy, TILE, TILE, E.water![1]!);
    for (let i = 0; i < 5; i++) {
      const x = 2 + Math.floor(rand() * 24), y = 2 + Math.floor(rand() * 28);
      c.fill(ox + x, oy + y, 5, 1, E.water![3]!);
      c.fill(ox + x + 1, oy + y + 1, 3, 1, E.water![2]!);
    }
  }
  // wall cap: grey-green with a lighter inner line (reference wall tops)
  {
    const { ox, oy } = at(TERRAIN.wallTop);
    const r = E.wallTop!;
    c.fill(ox, oy, TILE, TILE, r[2]!);
    c.fill(ox, oy + 3, TILE, 1, r[3]!);
    c.fill(ox, oy + TILE - 4, TILE, 1, r[3]!);
    c.fill(ox, oy + TILE - 1, TILE, 1, r[1]!);
  }
  // wall face: flat grey-green, soft top band, tan wood baseboard on the low row
  const wallFace = (id: number, base: boolean) => {
    const { ox, oy } = at(id);
    const r = E.wallFace!;
    c.fill(ox, oy, TILE, TILE, r[1]!);
    c.fill(ox, oy, TILE, 2, r[2]!);
    for (let x = 0; x < TILE; x += 16) c.fill(ox + x, oy + 2, 1, TILE - 2, r[0]!);
    if (base) {
      c.fill(ox, oy + TILE - 5, TILE, 4, E.wood![3]!);
      c.fill(ox, oy + TILE - 1, TILE, 1, E.wood![2]!);
    }
    return { ox, oy };
  };
  wallFace(TERRAIN.wallFace, false);
  wallFace(TERRAIN.wallFaceLow, true);
  {
    const { ox, oy } = wallFace(TERRAIN.wallWindow, false);
    c.fill(ox + 4, oy + 5, 24, 23, E.dark![1]!);
    c.fill(ox + 6, oy + 7, 9, 9, E.water![3]!); c.fill(ox + 17, oy + 7, 9, 9, E.water![3]!);
    c.fill(ox + 6, oy + 18, 9, 8, E.water![2]!); c.fill(ox + 17, oy + 18, 9, 8, E.water![2]!);
    c.fill(ox + 7, oy + 8, 3, 1, E.paper![3]!);
  }
  // collision marker (Tiled only; hidden in game)
  {
    const { ox, oy } = at(TERRAIN.collision);
    for (let i = 0; i < TILE; i++) {
      for (const [x, y] of [[i, i], [TILE - 1 - i, i], [i, 0], [i, TILE - 1], [0, i], [TILE - 1, i]] as const)
        c.set(ox + x, oy + y, E.coral![2]!, 160);
    }
  }
  // doormat: lavender rug on cream floor
  {
    const { ox, oy } = bricks(TERRAIN.doormat, E.floor![3]!, E.floor![2]!, 16, 8);
    c.fill(ox + 3, oy + 6, 26, 20, E.carpet![1]!);
    c.fill(ox + 4, oy + 7, 24, 18, E.carpet![2]!);
  }
  // hedge
  {
    const { ox, oy } = at(TERRAIN.hedge);
    const rand = rng(9);
    c.fill(ox, oy, TILE, TILE, E.leaf![1]!);
    for (let i = 0; i < 60; i++) c.set(ox + Math.floor(rand() * TILE), oy + Math.floor(rand() * TILE), rand() < 0.6 ? E.leaf![2]! : E.leaf![0]!);
    c.fill(ox, oy, TILE, 2, E.leaf![3]!);
  }
  // sand / pond border: white-lavender
  {
    const { ox, oy } = at(TERRAIN.sand);
    c.fill(ox, oy, TILE, TILE, E.paper![3]!);
    c.fill(ox, oy + TILE - 1, TILE, 1, E.paper![2]!);
  }
  return c;
}

// ───────────────────────────── run ─────────────────────────────

function main() {
  const reg: ItemRegistry = JSON.parse(fs.readFileSync(path.join(ROOT, "art/characters/items.json"), "utf8"));
  const missing: string[] = [];
  for (const item of reg.items)
    for (const part of item.parts) {
      const drawer = drawers[part.sheet];
      if (!drawer) {
        if (!fs.existsSync(path.join(OUT, "characters", part.sheet))) missing.push(part.sheet);
        continue;
      }
      save(buildSheet(drawer), path.join("characters", part.sheet));
    }
  fs.mkdirSync(path.join(OUT, "characters"), { recursive: true });
  fs.copyFileSync(path.join(ROOT, "art/characters/items.json"), path.join(OUT, "characters/items.json"));

  save(terrainTileset(), "tilesets/terrain.png");
  // Prop library (art/props, built by scripts/tools/build_props.py) → assets/furniture + manifest
  const lib = JSON.parse(fs.readFileSync(path.join(ROOT, "art/props/props.json"), "utf8")) as {
    props: { name: string; file: string; w: number; h: number; footprintW: number; footprintH: number }[];
  };
  for (const p of lib.props) {
    const dst = path.join(OUT, "furniture", p.file);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(path.join(ROOT, "art/props", p.file), dst);
  }
  fs.writeFileSync(
    path.join(OUT, "furniture/furniture.json"),
    JSON.stringify(lib.props.map((p) => ({ ...p, layer: p.name.startsWith("rug_") ? "floor" : "" })), null, 1),
  );

  // Master palette for Aseprite (.gpl)
  const gpl = ["GIMP Palette", "Name: Founder Town master", "Columns: 4", "#"];
  for (const hex of masterPalette()) {
    const n = parseInt(hex.slice(1), 16);
    gpl.push(`${(n >> 16) & 255}\t${(n >> 8) & 255}\t${n & 255}\t${hex}`);
  }
  fs.writeFileSync(path.join(ROOT, "art/palette/master.gpl"), gpl.join("\n") + "\n");

  console.log(`placeholders: ${written} written, ${skipped} kept (use --force to overwrite)`);
  if (missing.length) {
    console.error("Missing sheets with no placeholder drawer:\n  " + missing.join("\n  "));
    process.exit(1);
  }
}

main();
