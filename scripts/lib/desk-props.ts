/**
 * Drawn props: small things that stand on a desk, authored here pixel by pixel instead of cut from
 * the prop sheets (art/props). Same rules as the rest of the environment art: colors of the prop
 * palette, flat fills, no black outlines, a soft edge in the object's own darker shade.
 * `gen-placeholders.ts` writes them to assets/furniture and lists them in furniture.json.
 * Where they stand on a desk is `DESK_SETUP` in shared/src/office.ts.
 */
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

const MONITOR_W = 27;
/** Height of a display's face, and of the whole prop (face + its lean + stand). */
const FACE_H = 16;
const MONITOR_H = 25;
/** The displays are turned in toward the chair: their faces drop 1 px for every SLOPE px toward the outer edge. */
const SLOPE = 4;

/**
 * One display on its stand, turned toward the chair. `lean` is the side that comes forward (the
 * outer one): seen from above and in front, that edge sits lower, so the face is drawn flat and
 * then slid down column by column. `screen` draws the lit 25×14 area at (1, 1) of the flat face.
 */
function monitor(c: Canvas, ox: number, lean: "left" | "right", screen: (face: Canvas) => void) {
  const face = new Canvas(MONITOR_W, FACE_H);
  rounded(face, 0, 0, MONITOR_W, FACE_H, BEZEL);
  face.fill(1, 1, 25, 14, SCREEN);
  screen(face);
  const drop = (x: number) => Math.floor((lean === "left" ? MONITOR_W - 1 - x : x) / SLOPE);
  // stand first (the face hangs in front of the neck): a neck under the middle of the face and a flat foot, lit from the top left
  const top = FACE_H + drop(13);
  c.fill(ox + 11, top - 2, 5, 5, SILVER);
  c.fill(ox + 15, top - 2, 1, 5, GREY);
  c.fill(ox + 8, top + 3, 11, 1, SILVER_LIGHT);
  c.fill(ox + 7, top + 4, 13, 1, SILVER);
  c.fill(ox + 8, top + 5, 11, 1, GREY);
  for (let x = 0; x < MONITOR_W; x++)
    for (let y = 0; y < FACE_H; y++) {
      const i = (y * MONITOR_W + x) * 4;
      if (!face.data[i + 3]) continue;
      const o = ((y + drop(x)) * c.w + ox + x) * 4;
      for (let k = 0; k < 4; k++) c.data[o + k] = face.data[i + k]!;
    }
}

/** Window buttons, top left of a screen. */
function lights(c: Canvas, x: number, y: number) {
  c.set(x, y, CORAL);
  c.set(x + 2, y, YELLOW);
  c.set(x + 4, y, GREEN);
}

/** Two displays side by side, angled in toward the chair: code on the left, a dashboard on the right. */
function dualMonitor(): Canvas {
  const c = new Canvas(MONITOR_W * 2 + 1, MONITOR_H);
  monitor(c, 0, "left", (f) => {
    const x = 1, y = 1;
    f.fill(x, y, 5, 14, BEZEL); // file list
    for (const row of [3, 5, 7, 9]) f.fill(x + 1, y + row, 3, 1, GREY_DARK);
    lights(f, x + 7, y + 1);
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
      let px = x + 7 + indent;
      for (const [len, color] of parts) {
        f.fill(px, y + row, len, 1, color);
        px += len + 1;
      }
    }
  });
  monitor(c, MONITOR_W + 1, "right", (f) => {
    const x = 1, y = 1;
    lights(f, x + 1, y + 1);
    f.fill(x + 9, y + 1, 8, 1, GREY_DARK); // title
    // bars growing to the right over a baseline
    [3, 5, 4, 7, 9].forEach((h, i) => f.fill(x + 2 + i * 2, y + 12 - h, 1, h, i === 4 ? GREEN : BLUE));
    f.fill(x + 1, y + 12, 11, 1, GREY_DARK);
    // figures down the right: plain rows, which stay readable on a face seen at an angle
    f.fill(x + 14, y + 4, 4, 1, SKY);
    f.fill(x + 14, y + 6, 9, 1, YELLOW);
    f.fill(x + 14, y + 8, 6, 1, GREEN);
    f.fill(x + 14, y + 10, 8, 1, SKY);
    f.fill(x + 14, y + 12, 10, 1, GREY_DARK);
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
