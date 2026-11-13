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
const MONITOR_H = 22;
/** One display seen from the front, on its stand. The lit area is 25×14 at (ox + 1, 1). */
function monitor(c: Canvas, ox: number, screen: (x: number, y: number) => void) {
  rounded(c, ox, 0, MONITOR_W, 16, BEZEL);
  c.fill(ox + 1, 1, 25, 14, SCREEN);
  screen(ox + 1, 1);
  // stand: a neck and a flat foot, lit from the top left
  c.fill(ox + 11, 16, 5, 3, SILVER);
  c.fill(ox + 15, 16, 1, 3, GREY);
  c.fill(ox + 8, 19, 11, 1, SILVER_LIGHT);
  c.fill(ox + 7, 20, 13, 1, SILVER);
  c.fill(ox + 8, 21, 11, 1, GREY);
}

/** Window buttons, top left of a screen. */
function lights(c: Canvas, x: number, y: number) {
  c.set(x, y, CORAL);
  c.set(x + 2, y, YELLOW);
  c.set(x + 4, y, GREEN);
}

/** Two displays side by side: code on the left, a dashboard on the right. */
function dualMonitor(): Canvas {
  const c = new Canvas(MONITOR_W * 2 + 1, MONITOR_H);
  monitor(c, 0, (x, y) => {
    c.fill(x, y, 5, 14, BEZEL); // file list
    for (const row of [3, 5, 7, 9]) c.fill(x + 1, y + row, 3, 1, GREY_DARK);
    lights(c, x + 7, y + 1);
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
        c.fill(px, y + row, len, 1, color);
        px += len + 1;
      }
    }
  });
  monitor(c, MONITOR_W + 1, (x, y) => {
    lights(c, x + 1, y + 1);
    c.fill(x + 9, y + 1, 8, 1, GREY_DARK); // title
    // bars growing to the right, then a line climbing over a baseline
    [3, 5, 4, 7, 9].forEach((h, i) => c.fill(x + 2 + i * 2, y + 12 - h, 1, h, i === 4 ? GREEN : BLUE));
    c.fill(x + 1, y + 12, 11, 1, GREY_DARK);
    const climb = [10, 9, 9, 8, 6, 7, 5, 4, 4, 3];
    climb.forEach((row, i) => c.set(x + 14 + i, y + row, YELLOW));
    c.fill(x + 14, y + 12, 10, 1, GREY_DARK);
    c.fill(x + 14, y + 4, 4, 1, SKY); // the number that matters
  });
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
    { name: "mouse_mat", file: "office/mouse_mat.png", canvas: mouseMat() },
  ];
}
