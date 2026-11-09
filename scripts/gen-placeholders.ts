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
import { pose, HEAD_BOTTOM, LEG_TOP, LEG_SPLIT_X, type Pose, type R } from "./lib/pose.js";
import {
  ANIMS, ANIM_ORDER, FRAME_H, FRAME_W, SHEET_DIRS, SHEET_H, SHEET_W, TILE, sheetRow,
  type AnimName, type SheetDir,
} from "../shared/src/spec.js";
import { ENV_RAMPS, FIXED_COLORS, KEY_RAMPS, masterPalette } from "../shared/src/palette.js";
import type { ItemRegistry } from "../shared/src/avatar.js";
import { TERRAIN } from "./lib/env.js";

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
  reg(ch: Ch | Ramp4, inside?: (x: number, y: number) => boolean): Region {
    const r = new Region(FRAME_W, FRAME_H, typeof ch === "string" ? KEY_RAMPS[ch] : ch);
    this.ops.push(() => r.paint(this.c, 0, 0, { outlineColor: BLACK, inside, volume: true }));
    return r;
  }
  /** Region for hair/headwear: black outline only on the head silhouette, soft edge where it meets skin. */
  headReg(ch: Ch): Region {
    const m = headMask(this.p);
    return this.reg(ch, (x, y) => x >= 0 && y >= 0 && x < FRAME_W && y < FRAME_H && m[y * FRAME_W + x] === 1);
  }
  /** Shift a painted key-ramp pixel one shade darker (d=-1) or lighter (d=+1). Outline/fixed colors untouched. */
  shift(x: number, y: number, d: -1 | 1) {
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
  detail(r: Region, d: -1 | 1, when: (x: number, y: number) => boolean) {
    for (let y = 0; y < FRAME_H; y++) for (let x = 0; x < FRAME_W; x++) if (r.has(x, y) && when(x, y)) this.shift(x, y, d);
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
        const isHead = y <= HEAD_BOTTOM[dir];
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

/** Head silhouette (from the reference body) for a pose, shifted with the head bob. */
function headMask(p: Pose): Uint8Array {
  const src = BASE[p.dir].head;
  const m = new Uint8Array(FRAME_W * FRAME_H);
  for (let y = 0; y <= HEAD_BOTTOM[p.dir]; y++)
    for (let x = 0; x < FRAME_W; x++) {
      const ty = y + p.m.headDy;
      if (hexAt(src, x, y) && ty >= 0 && ty < FRAME_H) m[ty * FRAME_W + x] = 1;
    }
  return m;
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
  "body/body_01.png": (f) => animate(BASE[f.dir].body, f.p, f.c),
  "body/head_01.png": (f) => animate(BASE[f.dir].head, f.p, f.c),
  "face/face_01.png": (f) => animate(BASE[f.dir].face, f.p, f.c),

  // ── hair ──
  "hair/hair_short_01.png": (f) => hairCap(f, 2),
  "hair/hair_long_01_front.png": (f) => hairCap(f, 11),
  "hair/hair_long_01_back.png": (f) => {
    const h = f.p.head;
    const r = f.reg("primary");
    if (f.dir === "down") r.round(h.x, h.y + 8, h.w, 16, 2);
    else if (f.dir === "up") r.round(h.x, h.y + 6, h.w, 18, 3);
    else r.round(h.x + 8, h.y + 6, 9, 17, 2);
    f.detail(r, -1, (x, y) => r.has(x - 1, y) && r.has(x + 1, y) && (x - h.x) % 3 === 1 && y % 4 !== 0);
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
    const { p } = f;
    const t = p.torso;
    jacket(f, 1);
    if (f.dir === "down") {
      f.reg("primary").round(p.head.x + 4, p.head.y + p.head.h - 3, p.head.w - 8, 4, 1);
      f.dot(t.x + 5, t.y + 3, KEY_RAMPS.secondary[3]);
      f.dot(t.x + 5, t.y + 4, KEY_RAMPS.secondary[2]);
      f.dot(t.x + 8, t.y + 3, KEY_RAMPS.secondary[3]);
      f.dot(t.x + 8, t.y + 4, KEY_RAMPS.secondary[2]);
    } else if (f.dir === "up") {
      f.reg("primary").round(t.x + 2, t.y - 1, t.w - 4, 6, 2);
    } else {
      f.reg("primary").round(t.x + 4, t.y - 2, 6, 6, 1);
    }
  },
  "outerwear/outer_blazer_01.png": (f) => {
    const t = f.p.torso;
    jacket(f, 0);
    if (f.dir === "down") {
      const v = f.reg("secondary");
      for (let i = 0; i < 6; i++) v.rect(t.x + 5 + Math.floor(i / 2), t.y + 1 + i, 4 - 2 * Math.floor(i / 2), 1);
      f.dot(t.x + 6, t.y + 8, BLACK);
    } else if (f.dir === "left") {
      f.reg("secondary").rect(t.x, t.y + 1, 3, 4);
    }
  },

  // ── bottoms ──
  "bottom/bottom_pants_01.png": (f) => legsWear(f, 99),
  "bottom/bottom_shorts_01.png": (f) => legsWear(f, 3),
  "bottom/bottom_skirt_01.png": (f) => {
    const hip = f.p.hip;
    const r = f.reg("primary");
    for (let i = 0; i < 7; i++) {
      const spread = Math.floor(i / 3);
      r.rect(hip.x - spread, hip.y + i, hip.w + spread * 2, 1);
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

function hairCap(f: Frame, sideLen: number) {
  const { p } = f;
  const h = p.head;
  const r = f.headReg("primary");
  if (f.dir === "down") {
    fromHead(r, p, (x, y) => y <= h.y + 7 || (y <= h.y + 6 + sideLen && (x <= h.x + 3 || x >= h.x + h.w - 4)));
    r.rect(h.x + 4, h.y + 8, 6, 1).rect(h.x + 4, h.y + 9, 3, 1); // swept fringe
  } else if (f.dir === "up") {
    // back of the head: cover down to the nape, leave the ears as skin
    const nape = h.y + 13 + Math.max(0, sideLen - 5);
    fromHead(r, p, (x, y) => y <= h.y + 8 || (y <= nape && x >= h.x + 2 && x <= h.x + h.w - 3));
  } else {
    fromHead(r, p, (x, y) => y <= h.y + 7 || (x >= h.x + 9 && y <= h.y + 6 + Math.max(6, sideLen)));
    r.rect(h.x + 1, h.y + 8, 4, 1); // fringe tip
  }
  hairDetail(f, r);
}

function sleeve(f: Frame, arm: R, len: number) {
  const h = Math.min(len, arm.h - 2);
  const r = f.reg("primary");
  rr(r, { x: arm.x, y: arm.y, w: arm.w, h }, 1);
  if (h >= 6) f.detail(r, -1, (x, y) => y === arm.y + 4 && r.has(x - 1, y) && r.has(x + 1, y)); // elbow crease
}

/** Folds on a torso region: shadow under the head, armpit creases, hem. */
function torsoDetail(f: Frame, body: Region) {
  const t = f.p.torso;
  const inner = (x: number, y: number) => body.has(x - 1, y) && body.has(x + 1, y) && body.has(x, y - 1);
  if (f.dir === "left") {
    f.detail(body, -1, (x, y) => inner(x, y) && y <= t.y + 2 && x <= t.x + 5); // under the chin
    f.detail(body, -1, (x, y) => inner(x, y) && y >= t.y + 4 && y <= t.y + 6 && x === t.x + 6);
    return;
  }
  const cx = t.x + t.w / 2;
  // cast shadow of the head on the chest/back
  f.detail(body, -1, (x, y) => inner(x, y) && y <= t.y + 2 && Math.abs(x + 0.5 - cx) <= 4);
  // armpit creases
  f.detail(body, -1, (x, y) => inner(x, y) && (y === t.y + 4 || y === t.y + 5) && (x === t.x + 2 || x === t.x + t.w - 3));
  f.detail(body, -1, (x, y) => inner(x, y) && y === t.y + 6 && (x === t.x + 3 || x === t.x + t.w - 4));
}

function shirt(f: Frame, sleeveLen: number, collar: boolean) {
  const { p } = f;
  if (f.dir === "left") {
    const body = f.reg("primary");
    rr(body, { ...p.torso, h: p.torso.h - 1 }, 1);
    torsoDetail(f, body);
    sleeve(f, p.arms[1], sleeveLen);
  } else {
    p.arms.forEach((a) => sleeve(f, a, sleeveLen));
    const body = f.reg("primary");
    rr(body, { ...p.torso, x: p.torso.x + 1, w: p.torso.w - 2, h: p.torso.h - 1 }, 1);
    if (f.dir === "down") body.rect(p.torso.x + 6, p.torso.y, 2, 1, false); // neckline
    torsoDetail(f, body);
  }
  if (collar && f.dir === "down") f.reg("secondary").rect(p.torso.x + 4, p.torso.y, 6, 2);
}

function jacket(f: Frame, widen: number) {
  const { p } = f;
  const t = p.torso;
  if (f.dir === "left") {
    const body = f.reg("primary");
    rr(body, { x: t.x - widen, y: t.y, w: t.w + widen * 2, h: t.h }, 1);
    torsoDetail(f, body);
    sleeve(f, p.arms[1], 99);
  } else {
    p.arms.forEach((a) => sleeve(f, a, 99));
    const body = f.reg("primary");
    rr(body, { x: t.x + 1 - widen, y: t.y, w: t.w - 2 + widen * 2, h: t.h + widen }, 1);
    torsoDetail(f, body);
  }
}

function legsWear(f: Frame, len: number) {
  const { p } = f;
  for (const leg of p.legs) {
    const r = f.reg("primary");
    rr(r, { x: leg.x, y: leg.y - 1, w: leg.w, h: Math.min(len, leg.h - 1) });
    if (len > 4) f.detail(r, -1, (x, y) => y === leg.y + 2 && r.has(x - 1, y) && r.has(x + 1, y) && x % 2 === 0); // knee fold
  }
  const hip = f.reg("primary");
  rr(hip, p.hip, 1);
  if (f.dir !== "left") f.detail(hip, -1, (x, y) => (x === 15 || x === 16) && y >= p.hip.y + 2); // crotch seam
  f.detail(hip, -1, (x, y) => y === p.hip.y + 1 && hip.has(x - 1, y) && hip.has(x + 1, y) && x % 3 === 0); // waistband
}

function footwear(f: Frame, shaft: number) {
  const { p } = f;
  const feet = f.dir === "left" ? [p.feet[0], p.feet[1]] : p.feet;
  feet.forEach((ft) => {
    const r = f.reg("primary");
    r.round(ft.x, ft.y - shaft, ft.w, ft.h + shaft, 1);
    if (f.dir === "left") r.rect(ft.x - 1, ft.y + 1, 2, ft.h - 1); // toe
    f.reg("secondary").rect(ft.x + (f.dir === "left" ? -1 : 0), ft.y + ft.h - 2, ft.w + (f.dir === "left" ? 1 : 0), 1);
  });
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
  const c = new Canvas(8 * TILE, 2 * TILE);
  const at = (id: number) => ({ ox: (id % 8) * TILE, oy: Math.floor(id / 8) * TILE });
  const noise = (id: number, ramp: Ramp4, seed: number, density: number, base = 2) => {
    const { ox, oy } = at(id);
    const rand = rng(seed);
    c.fill(ox, oy, TILE, TILE, ramp[base]!);
    for (let i = 0; i < TILE * TILE * density; i++) {
      const x = Math.floor(rand() * TILE);
      const y = Math.floor(rand() * TILE);
      c.set(ox + x, oy + y, rand() < 0.5 ? ramp[base - 1]! : ramp[Math.min(3, base + 1)]!);
    }
    return { ox, oy, rand };
  };

  // grass variants
  noise(TERRAIN.grass0, E.grass!, 1, 0.06);
  const g1 = noise(TERRAIN.grass1, E.grass!, 2, 0.06);
  for (let i = 0; i < 5; i++) {
    const x = Math.floor(g1.rand() * 28) + 2;
    const y = Math.floor(g1.rand() * 26) + 4;
    c.set(g1.ox + x, g1.oy + y, E.grass![3]!);
    c.set(g1.ox + x, g1.oy + y - 1, E.grass![3]!);
    c.set(g1.ox + x + 1, g1.oy + y, E.grass![1]!);
  }
  const g2 = noise(TERRAIN.grass2, E.grass!, 3, 0.06);
  for (let i = 0; i < 4; i++) {
    const x = Math.floor(g2.rand() * 26) + 3;
    const y = Math.floor(g2.rand() * 26) + 3;
    const col = i % 2 ? "#ffffff" : "#f0c860";
    c.set(g2.ox + x, g2.oy + y, col);
    c.set(g2.ox + x + 1, g2.oy + y, col);
    c.set(g2.ox + x, g2.oy + y + 1, col);
    c.set(g2.ox + x + 1, g2.oy + y + 1, E.grass![0]!);
  }

  // stone path: offset bricks
  {
    const { ox, oy } = at(TERRAIN.path);
    const r = E.path!;
    c.fill(ox, oy, TILE, TILE, r[1]!);
    for (let row = 0; row < 4; row++) {
      const off = row % 2 ? 8 : 0;
      for (let col = -1; col < 3; col++) {
        const bx = col * 16 + off;
        const reg = new Region(TILE, TILE, r);
        reg.rect(Math.max(0, bx + 1), row * 8 + 1, Math.min(15, 15 + Math.min(0, bx)), 7);
        reg.paint(c, ox, oy);
      }
    }
  }
  // wood planks
  {
    const { ox, oy } = at(TERRAIN.wood);
    const r = E.wood!;
    c.fill(ox, oy, TILE, TILE, r[2]!);
    for (let y = 0; y < TILE; y += 8) {
      c.fill(ox, oy + y + 7, TILE, 1, r[0]!);
      c.fill(ox, oy + y, TILE, 1, r[3]!);
      const seam = (y * 7 + 11) % 28;
      c.fill(ox + seam, oy + y, 1, 7, r[1]!);
    }
  }
  // carpet
  {
    const { ox, oy } = at(TERRAIN.carpet);
    const r = E.carpet!;
    c.fill(ox, oy, TILE, TILE, r[1]!);
    for (let y = 0; y < TILE; y += 4) for (let x = (y / 4) % 2 ? 2 : 0; x < TILE; x += 4) c.set(ox + x, oy + y, r[2]!);
  }
  // tile floor
  {
    const { ox, oy } = at(TERRAIN.tileFloor);
    const r = E.tileFloor!;
    c.fill(ox, oy, TILE, TILE, r[2]!);
    for (let i = 0; i < TILE; i += 16) {
      c.fill(ox + i, oy, 1, TILE, r[1]!);
      c.fill(ox, oy + i, TILE, 1, r[1]!);
      c.fill(ox + i + 1, oy + 1, 1, TILE - 1, r[3]!);
    }
  }
  // water
  {
    const w = noise(TERRAIN.water, E.water!, 7, 0.02);
    for (let i = 0; i < 4; i++) {
      const x = Math.floor(w.rand() * 24) + 2;
      const y = Math.floor(w.rand() * 28) + 2;
      c.fill(w.ox + x, w.oy + y, 5, 1, E.water![3]!);
    }
  }
  // wall top (cap): dark with lighter rim
  {
    const { ox, oy } = at(TERRAIN.wallTop);
    const r = E.wallTop!;
    c.fill(ox, oy, TILE, TILE, r[1]!);
    c.fill(ox, oy, TILE, 2, r[3]!);
    c.fill(ox, oy + TILE - 2, TILE, 2, r[0]!);
    for (let y = 6; y < TILE - 2; y += 8) c.fill(ox, oy + y, TILE, 1, r[2]!);
  }
  // wall face: vertical panel with highlight band and baseboard at bottom
  const wallFace = (id: number, base: boolean) => {
    const { ox, oy } = at(id);
    const r = E.wallFace!;
    c.fill(ox, oy, TILE, TILE, r[2]!);
    c.fill(ox, oy, TILE, 1, r[0]!);
    c.fill(ox, oy + 1, TILE, 2, r[3]!);
    for (let x = 0; x < TILE; x += 16) c.fill(ox + x, oy + 3, 1, TILE - 3, r[1]!);
    if (base) {
      c.fill(ox, oy + TILE - 5, TILE, 4, E.wood![1]!);
      c.fill(ox, oy + TILE - 5, TILE, 1, E.wood![3]!);
      c.fill(ox, oy + TILE - 1, TILE, 1, E.wood![0]!);
    }
    return { ox, oy };
  };
  wallFace(TERRAIN.wallFace, false);
  wallFace(TERRAIN.wallFaceLow, true);
  {
    const { ox, oy } = wallFace(TERRAIN.wallWindow, false);
    const frame = new Region(TILE, TILE, E.metal!);
    frame.rect(5, 6, 22, 22);
    frame.paint(c, ox, oy);
    c.fill(ox + 7, oy + 8, 18, 18, E.water![3]!);
    c.fill(ox + 15, oy + 8, 2, 18, E.metal![2]!);
    c.fill(ox + 7, oy + 16, 18, 1, E.metal![2]!);
    for (let i = 0; i < 6; i++) c.set(ox + 9 + i, oy + 22 - i, "#ffffff");
  }
  // collision marker (only visible in Tiled; hidden in game)
  {
    const { ox, oy } = at(TERRAIN.collision);
    for (let i = 0; i < TILE; i++) {
      c.set(ox + i, oy + i, "#e07030", 160);
      c.set(ox + TILE - 1 - i, oy + i, "#c4343a", 160);
      c.set(ox + i, oy, "#c4343a", 160);
      c.set(ox + i, oy + TILE - 1, "#c4343a", 160);
      c.set(ox, oy + i, "#c4343a", 160);
      c.set(ox + TILE - 1, oy + i, "#c4343a", 160);
    }
  }
  // doormat
  {
    const { ox, oy } = at(TERRAIN.doormat);
    c.fill(ox, oy, TILE, TILE, E.wood![2]!);
    const reg = new Region(TILE, TILE, E.carpet!);
    reg.round(3, 6, 26, 20, 2).paint(c, ox, oy);
  }
  // hedge
  {
    const h = noise(TERRAIN.hedge, E.leaf!, 9, 0.25);
    c.fill(h.ox, h.oy + TILE - 3, TILE, 3, E.leaf![0]!);
    c.fill(h.ox, h.oy, TILE, 2, E.leaf![3]!);
  }
  noise(TERRAIN.sand, E.path!, 11, 0.08, 3 - 1);
  return c;
}

/** Furniture: individual images (Tiled "collection of images" tileset). footprint in tiles. */
const FURNITURE: { name: string; w: number; h: number; fw: number; fh: number; draw: (c: Canvas) => void }[] = [
  {
    name: "desk", w: 64, h: 64, fw: 2, fh: 1,
    draw: (c) => {
      new Region(64, 64, E.wood!).round(1, 26, 62, 12, 1).paint(c);
      new Region(64, 64, E.wood!).rect(3, 37, 58, 22).paint(c);
      new Region(64, 64, E.metal!).rect(5, 59, 3, 4).paint(c);
      new Region(64, 64, E.metal!).rect(56, 59, 3, 4).paint(c);
      // laptop
      new Region(64, 64, E.metal!).round(20, 14, 22, 14, 1).paint(c);
      c.fill(22, 16, 18, 10, E.water![2]!);
      c.fill(23, 17, 8, 1, E.water![3]!);
      new Region(64, 64, E.metal!).rect(17, 28, 28, 4).paint(c);
      // mug
      new Region(64, 64, E.wallFace!).round(49, 22, 6, 7, 1).paint(c);
    },
  },
  {
    name: "chair", w: 32, h: 48, fw: 1, fh: 1,
    draw: (c) => {
      new Region(32, 48, E.carpet!).round(7, 8, 18, 20, 2).paint(c);
      new Region(32, 48, E.carpet!).round(6, 26, 20, 8, 1).paint(c);
      new Region(32, 48, E.metal!).rect(15, 34, 3, 8).paint(c);
      new Region(32, 48, E.metal!).rect(8, 42, 16, 3).paint(c);
    },
  },
  {
    name: "plant", w: 32, h: 64, fw: 1, fh: 1,
    draw: (c) => {
      const leaf = new Region(32, 64, E.leaf!);
      leaf.ellipse(16, 22, 10, 12).ellipse(9, 32, 6, 7).ellipse(23, 31, 6, 7).ellipse(16, 12, 6, 7);
      leaf.paint(c);
      new Region(32, 64, E.wood!).round(9, 40, 14, 20, 2).paint(c);
      c.fill(10, 41, 12, 2, E.wood![0]!);
    },
  },
  {
    name: "sofa", w: 96, h: 64, fw: 3, fh: 1,
    draw: (c) => {
      new Region(96, 64, E.carpet!).round(4, 20, 88, 22, 3).paint(c);
      new Region(96, 64, E.carpet!).round(1, 32, 12, 26, 2).paint(c);
      new Region(96, 64, E.carpet!).round(83, 32, 12, 26, 2).paint(c);
      new Region(96, 64, E.carpet!).round(12, 40, 36, 18, 2).paint(c);
      new Region(96, 64, E.carpet!).round(48, 40, 36, 18, 2).paint(c);
    },
  },
  {
    name: "counter", w: 96, h: 64, fw: 3, fh: 1,
    draw: (c) => {
      new Region(96, 64, E.wallTop!).round(0, 22, 96, 10, 1).paint(c);
      new Region(96, 64, E.wood!).rect(2, 31, 92, 31).paint(c);
      for (let x = 10; x < 90; x += 16) c.fill(x, 34, 1, 26, E.wood![1]!);
      // espresso machine
      new Region(96, 64, E.metal!).round(10, 4, 22, 22, 2).paint(c);
      c.fill(14, 10, 4, 3, "#c4343a");
      new Region(96, 64, E.metal!).rect(17, 18, 8, 3).paint(c);
      // cups
      for (const x of [44, 52, 60]) new Region(96, 64, E.tileFloor!).round(x, 16, 6, 7, 1).paint(c);
      // register
      new Region(96, 64, E.wallTop!).round(72, 10, 16, 14, 1).paint(c);
      c.fill(75, 12, 10, 5, "#5cb898");
    },
  },
  {
    name: "table_round", w: 64, h: 64, fw: 2, fh: 1,
    draw: (c) => {
      new Region(64, 64, E.metal!).rect(29, 38, 6, 20).paint(c);
      new Region(64, 64, E.metal!).round(18, 56, 28, 5, 1).paint(c);
      new Region(64, 64, E.wood!).ellipse(32, 34, 26, 10).paint(c);
      new Region(64, 64, E.tileFloor!).round(22, 26, 6, 7, 1).paint(c);
      new Region(64, 64, E.tileFloor!).round(38, 28, 6, 7, 1).paint(c);
    },
  },
  {
    name: "bookshelf", w: 64, h: 96, fw: 2, fh: 1,
    draw: (c) => {
      new Region(64, 96, E.wood!).rect(2, 4, 60, 90).paint(c);
      const colors: Ramp4[] = [E.carpet!, E.leaf!, E.water!, E.wood!, E.wallFace!];
      for (let s = 0; s < 4; s++) {
        const y = 10 + s * 21;
        c.fill(6, y, 52, 17, E.wood![0]!);
        let x = 7;
        let k = s;
        while (x < 54) {
          const bw = 3 + ((k * 7) % 4);
          const bh = 12 + ((k * 5) % 5);
          new Region(64, 96, colors[k % colors.length]!).rect(x, y + 17 - bh, bw, bh).paint(c);
          x += bw + 1;
          k++;
        }
      }
    },
  },
  {
    name: "whiteboard", w: 64, h: 64, fw: 2, fh: 1,
    draw: (c) => {
      new Region(64, 64, E.metal!).rect(8, 40, 3, 22).paint(c);
      new Region(64, 64, E.metal!).rect(53, 40, 3, 22).paint(c);
      new Region(64, 64, E.metal!).round(2, 4, 60, 40, 1).paint(c);
      c.fill(5, 7, 54, 34, "#ffffff");
      c.fill(9, 12, 22, 1, E.water![1]!);
      c.fill(9, 16, 30, 1, E.water![1]!);
      c.fill(9, 20, 16, 1, "#c4343a");
      new Region(64, 64, E.leaf!).rect(38, 22, 16, 14).paint(c);
    },
  },
  {
    name: "tree", w: 64, h: 96, fw: 2, fh: 1,
    draw: (c) => {
      new Region(64, 96, E.wood!).rect(26, 56, 12, 36).paint(c);
      const leaves = new Region(64, 96, E.leaf!);
      leaves.ellipse(32, 34, 26, 24).ellipse(18, 50, 12, 10).ellipse(46, 50, 12, 10);
      leaves.paint(c);
      const rand = rng(42);
      for (let i = 0; i < 40; i++) {
        const x = Math.floor(rand() * 40) + 12;
        const y = Math.floor(rand() * 34) + 16;
        if (leaves.has(x, y) && leaves.has(x + 1, y + 1)) c.set(x, y, E.leaf![3]!);
      }
    },
  },
  {
    name: "bench", w: 64, h: 48, fw: 2, fh: 1,
    draw: (c) => {
      new Region(64, 48, E.wood!).rect(2, 10, 60, 6).paint(c);
      new Region(64, 48, E.wood!).rect(2, 18, 60, 6).paint(c);
      new Region(64, 48, E.wood!).rect(0, 26, 64, 8).paint(c);
      new Region(64, 48, E.metal!).rect(6, 33, 4, 12).paint(c);
      new Region(64, 48, E.metal!).rect(54, 33, 4, 12).paint(c);
    },
  },
  {
    name: "lamp", w: 32, h: 96, fw: 1, fh: 1,
    draw: (c) => {
      new Region(32, 96, E.metal!).rect(14, 20, 4, 70).paint(c);
      new Region(32, 96, E.metal!).round(10, 88, 12, 6, 1).paint(c);
      new Region(32, 96, E.metal!).round(8, 8, 16, 14, 2).paint(c);
      c.fill(11, 12, 10, 7, "#f0c860");
      c.fill(12, 13, 4, 2, "#ffffff");
    },
  },
  {
    name: "pill_station", w: 32, h: 64, fw: 1, fh: 1,
    draw: (c) => {
      new Region(32, 64, E.wallTop!).round(4, 6, 24, 54, 3).paint(c);
      new Region(32, 64, E.water!).round(7, 10, 18, 24, 2).paint(c);
      // capsule icon
      c.fill(11, 18, 5, 6, "#c4343a");
      c.fill(16, 18, 5, 6, "#ffffff");
      c.fill(12, 17, 8, 1, E.wallTop![0]!);
      c.fill(12, 24, 8, 1, E.wallTop![0]!);
      new Region(32, 64, E.metal!).round(9, 40, 14, 10, 1).paint(c);
    },
  },
];

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
  for (const f of FURNITURE) {
    const c = new Canvas(f.w, f.h);
    f.draw(c);
    save(c, `furniture/${f.name}.png`);
  }
  fs.writeFileSync(
    path.join(OUT, "furniture/furniture.json"),
    JSON.stringify(FURNITURE.map(({ name, w, h, fw, fh }) => ({ name, w, h, footprintW: fw, footprintH: fh })), null, 2),
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
