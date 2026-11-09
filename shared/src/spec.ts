/**
 * The pixel spec. Every asset and every system follows these numbers.
 * Changing anything here is a breaking change for ALL art — don't, without a migration plan.
 */

export const TILE = 32;

/** Character frame: 1 tile wide, 2 tiles tall. Anchor = bottom-center (feet). */
export const FRAME_W = 32;
export const FRAME_H = 64;
/** Feet position inside a frame (pixel row of the ground contact). */
export const FEET_Y = 61;

/** Directions in sheet row order. `right` is NOT in sheets: it's `left` mirrored (v1). */
export const SHEET_DIRS = ["down", "up", "left"] as const;
export const DIRS = ["down", "up", "left", "right"] as const;
export type Dir = (typeof DIRS)[number];
export type SheetDir = (typeof SHEET_DIRS)[number];

export const ANIMS = {
  idle: { frames: 4, fps: 4 },
  walk: { frames: 6, fps: 12 },
} as const;
export type AnimName = keyof typeof ANIMS;
export const ANIM_ORDER: AnimName[] = ["idle", "walk"];

/** Sheet template: columns = max frames, rows = anim × sheetDir (anim-major). */
export const SHEET_COLS = Math.max(...Object.values(ANIMS).map((a) => a.frames));
export const SHEET_ROWS = ANIM_ORDER.length * SHEET_DIRS.length;
export const SHEET_W = SHEET_COLS * FRAME_W;
export const SHEET_H = SHEET_ROWS * FRAME_H;

export function sheetRow(anim: AnimName, dir: SheetDir): number {
  return ANIM_ORDER.indexOf(anim) * SHEET_DIRS.length + SHEET_DIRS.indexOf(dir);
}

/** Frame index (row-major) inside a template sheet. */
export function sheetFrame(anim: AnimName, dir: SheetDir, frame: number): number {
  return sheetRow(anim, dir) * SHEET_COLS + frame;
}

/** Map a facing direction to the sheet direction + whether to mirror. */
export function sheetDirFor(dir: Dir): { sheetDir: SheetDir; flipX: boolean } {
  return dir === "right" ? { sheetDir: "left", flipX: true } : { sheetDir: dir, flipX: false };
}

/** Milliseconds to cross one tile. */
export const STEP_MS = 180;

/** Camera: we pick the largest integer zoom that still shows at least this much world height. */
export const MIN_VISIBLE_WORLD_H = 300;
