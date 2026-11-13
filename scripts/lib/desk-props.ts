/**
 * Drawn props: small things that stand on a desk, authored here pixel by pixel instead of cut from
 * the prop sheets (art/props). Same rules as the rest of the environment art: colors of the prop
 * palette, flat fills, no black outlines, a soft edge in the object's own darker shade.
 * `gen-placeholders.ts` writes them to assets/furniture and lists them in furniture.json.
 * Where they stand on a desk is `DESK_SETUP` in shared/src/office.ts.
 */
import { hexToRgb } from "../../shared/src/palette.js";
import { Canvas } from "./pixel.js";

const BEZEL = "#2b2c2b", SCREEN = "#30325b";
const BLUE = "#579be0", SKY = "#90d6f1", GREEN = "#6fae81", YELLOW = "#f7d674", CORAL = "#e86c67";
const WHITE = "#ffffff", PAPER = "#efedf6", SILVER_LIGHT = "#d6d8e8", SILVER = "#b2bdce", GREY = "#8995ab", GREY_DARK = "#626f7b";
const MAT = "#565e82", MAT_EDGE = "#52567b";

export interface DrawnProp {
  name: string;
  /** Path under assets/furniture. */
  file: string;
  canvas: Canvas;
}

/** A rectangle with its four corner pixels left out. */
function rounded(c: Canvas, x: number, y: number, w: number, h: number, color: string) {
  c.fill(x + 1, y, w - 2, 1, color);
  c.fill(x, y + 1, w, h - 2, color);
  c.fill(x + 1, y + h - 1, w - 2, 1, color);
}

/**
 * The displays are turned 20° in toward the chair, like an open book facing whoever sits there.
 * A 27 px wide display turned 20° shows cos 20° of its width; its outer edge comes forward, so it
 * is drawn taller than the inner edge at the back — reaching a little higher, and lower still
 * (we look down on the desk, so nearer also means lower).
 */
const FACE_W = 25;
/** Height of the inner edge; the lit area behind the bezel is (FACE_W − 2) × (INNER_H − 2). */
const INNER_H = 16;
const LIT_W = FACE_W - 2;
const LIT_H = INNER_H - 2;
/** How much higher and lower the outer edge reaches than the inner one. */
const RISE = 2;
const DROP = 4;
const MONITOR_H = RISE + INNER_H + DROP + 4;

/**
 * One display on its stand. `outer` is the side that comes forward. `screen` draws the flat lit
 * area; it is then fitted column by column into the face, spread out toward the nearer edge.
 */
function monitor(c: Canvas, ox: number, outer: "left" | "right", screen: (lit: Canvas) => void) {
  const lit = new Canvas(LIT_W, LIT_H);
  lit.fill(0, 0, LIT_W, LIT_H, SCREEN);
  screen(lit);
  /** Top and bottom row of the face in a column (0 = left). */
  const span = (col: number) => {
    const t = (outer === "left" ? FACE_W - 1 - col : col) / (FACE_W - 1); // 0 at the inner edge … 1 at the outer
    return { top: RISE - Math.round(RISE * t), bottom: RISE + INNER_H - 1 + Math.round(DROP * t) };
  };
  // stand first (the face hangs in front of the neck): a neck under the middle and a flat foot, lit from the top left
  const mid = Math.floor(FACE_W / 2);
  const under = span(mid).bottom;
  c.fill(ox + mid - 2, under - 1, 5, 5, SILVER);
  c.fill(ox + mid + 2, under - 1, 1, 5, GREY);
  c.fill(ox + mid - 5, under + 4, 11, 1, SILVER_LIGHT);
  c.fill(ox + mid - 6, under + 5, 13, 1, SILVER);
  c.fill(ox + mid - 5, under + 6, 11, 1, GREY);
  for (let col = 0; col < FACE_W; col++) {
    const { top, bottom } = span(col);
    const side = col === 0 || col === FACE_W - 1;
    const rows = bottom - top - 1; // lit rows in this column
    for (let y = top; y <= bottom; y++) {
      const cap = y === top || y === bottom;
      if (side && cap) continue; // rounded corner
      if (side || cap) {
        c.set(ox + col, y, BEZEL);
        continue;
      }
      c.set(ox + col, y, SCREEN);
    }
    if (side) continue;
    // what is on the screen: each flat row lands where it falls in this (taller) column and stays one
    // pixel thick; only shapes that run down the screen (bars, the file list) are filled in between
    const at = (row: number) => top + 1 + Math.floor((row * rows) / LIT_H);
    const pixel = (row: number) => (row < LIT_H ? lit.data.subarray((row * LIT_W + col - 1) * 4, (row * LIT_W + col - 1) * 4 + 3).join() : "");
    const ground = hexToRgb(SCREEN).join();
    for (let row = 0; row < LIT_H; row++) {
      const color = pixel(row);
      if (color === ground) continue;
      const to = color === pixel(row + 1) ? at(row + 1) - 1 : at(row);
      for (let y = at(row); y <= to; y++) {
        const o = (y * c.w + ox + col) * 4;
        const i = (row * LIT_W + col - 1) * 4;
        for (let k = 0; k < 4; k++) c.data[o + k] = lit.data[i + k]!;
      }
    }
  }
}

/** Window buttons, top left of a screen. */
function lights(c: Canvas, x: number, y: number) {
  c.set(x, y, CORAL);
  c.set(x + 2, y, YELLOW);
  c.set(x + 4, y, GREEN);
}

/** Two displays side by side, each turned 20° in toward the chair: code on the left, a dashboard on the right. */
function dualMonitor(): Canvas {
  const c = new Canvas(FACE_W * 2 + 1, MONITOR_H);
  monitor(c, 0, "left", (f) => {
    f.fill(0, 0, 4, LIT_H, BEZEL); // file list
    for (const row of [3, 5, 7, 9]) f.fill(1, row, 2, 1, GREY_DARK);
    lights(f, 5, 1);
    // lines of code: [row, indent, [length, color]…]
    const lines: [number, number, [number, string][]][] = [
      [3, 0, [[4, CORAL], [7, SKY]]],
      [5, 2, [[6, BLUE], [3, YELLOW]]],
      [7, 2, [[3, GREEN], [8, SKY]]],
      [9, 4, [[7, BLUE]]],
      [11, 2, [[5, YELLOW], [4, GREEN]]],
      [12, 0, [[2, CORAL]]],
    ];
    for (const [row, indent, parts] of lines) {
      let px = 5 + indent;
      for (const [len, color] of parts) {
        f.fill(px, row, len, 1, color);
        px += len + 1;
      }
    }
  });
  monitor(c, FACE_W + 1, "right", (f) => {
    lights(f, 1, 1);
    f.fill(8, 1, 8, 1, GREY_DARK); // title
    // bars growing to the right over a baseline
    [3, 5, 4, 7, 9].forEach((h, i) => f.fill(2 + i * 2, 12 - h, 1, h, i === 4 ? GREEN : BLUE));
    f.fill(1, 12, 11, 1, GREY_DARK);
    // figures down the right: plain rows, which stay readable on a face seen at an angle
    f.fill(13, 4, 4, 1, SKY);
    f.fill(13, 6, 9, 1, YELLOW);
    f.fill(13, 8, 6, 1, GREEN);
    f.fill(13, 10, 8, 1, SKY);
    f.fill(13, 12, 9, 1, GREY_DARK);
  });
  return c;
}

/** A slim keyboard from above: silver body, three rows of white keys, the wide one in the front row. */
function keyboard(): Canvas {
  const c = new Canvas(23, 8);
  rounded(c, 0, 0, 23, 7, SILVER);
  for (const row of [1, 3]) for (let x = 1; x < 21; x += 3) c.fill(x, row, 2, 1, WHITE);
  c.fill(1, 5, 2, 1, WHITE);
  c.fill(4, 5, 2, 1, WHITE);
  c.fill(7, 5, 8, 1, WHITE); // space bar
  c.fill(16, 5, 2, 1, WHITE);
  c.fill(19, 5, 2, 1, WHITE);
  c.fill(1, 7, 21, 1, GREY);
  return c;
}

/** Mac mini from above and a little in front: silver lid, lower front face with its light. */
function macMini(): Canvas {
  const c = new Canvas(13, 10);
  rounded(c, 0, 0, 13, 7, SILVER_LIGHT);
  c.fill(1, 0, 11, 1, PAPER); // light along the back edge
  c.fill(6, 3, 1, 2, GREY); // mark on the lid
  c.fill(0, 6, 13, 3, SILVER);
  c.set(10, 7, WHITE); // power light
  c.fill(2, 7, 3, 1, GREY); // ports
  c.fill(1, 9, 11, 1, GREY);
  return c;
}

/** Mouse mat with a white mouse on its right half. */
function mouseMat(): Canvas {
  const c = new Canvas(21, 13);
  rounded(c, 0, 0, 21, 13, MAT);
  c.fill(1, 12, 19, 1, MAT_EDGE);
  c.fill(20, 1, 1, 11, MAT_EDGE);
  // the mouse: a low white pebble, shaded along its near edge
  const mx = 12, my = 2;
  c.fill(mx + 1, my, 3, 1, WHITE);
  c.fill(mx, my + 1, 5, 6, WHITE);
  c.fill(mx, my + 7, 5, 1, SILVER_LIGHT);
  c.fill(mx + 1, my + 8, 3, 1, SILVER);
  return c;
}

export function deskProps(): DrawnProp[] {
  return [
    { name: "dual_monitor", file: "office/dual_monitor.png", canvas: dualMonitor() },
    { name: "mac_mini", file: "office/mac_mini.png", canvas: macMini() },
    { name: "keyboard", file: "office/keyboard.png", canvas: keyboard() },
    { name: "mouse_mat", file: "office/mouse_mat.png", canvas: mouseMat() },
  ];
}
