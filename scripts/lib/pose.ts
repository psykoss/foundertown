/**
 * Reference skeleton for the character template, measured from the base body
 * (art/characters/reference/base_body.png). ALL layers derive their shapes and motion from this,
 * which is what guarantees clothing lines up with the body on every frame.
 *
 * Motion model (shared by the body animator and every clothing drawer):
 *   head + upper body are fixed (bobbing read as the head sinking into the torso)
 *   walk: legs lift (front/back) or stride (side); idle is static
 */
import type { AnimName, SheetDir } from "../../shared/src/spec.js";

export interface R {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const MOTION = {
  idleHead: [0, 0, 0, 0], // head never moves (it sank into the torso)
  walkBob: [0, 0, 0, 0, 0, 0], // no body bob: only legs animate
  liftA: [0, 2, 1, 0, 0, 0],
  liftB: [0, 0, 0, 0, 2, 1],
  sideStride: [0, 1, 2, 0, -1, -2],
} as const;

/** Rows at or below this belong to the legs (moved by lift/stride), above to the upper body. */
export const LEG_TOP: Record<SheetDir, number> = { down: 55, up: 55, left: 57 };
/** Rows at or above this belong to the head (idle bob). */
export const HEAD_BOTTOM: Record<SheetDir, number> = { down: 44, up: 44, left: 45 };
/** Front/back: columns < this are the screen-left leg. */
export const LEG_SPLIT_X = 16;

export interface FrameMotion {
  headDy: number;
  bodyDy: number;
  liftL: number; // front/back: screen-left leg lift
  liftR: number;
  stride: number; // side: + = far leg back
}

export function motion(dir: SheetDir, anim: AnimName, f: number): FrameMotion {
  if (anim === "idle") return { headDy: MOTION.idleHead[f]!, bodyDy: 0, liftL: 0, liftR: 0, stride: 0 };
  const bob = MOTION.walkBob[f]!;
  if (dir === "left") return { headDy: bob, bodyDy: bob, liftL: 0, liftR: 0, stride: MOTION.sideStride[f]! };
  return { headDy: bob, bodyDy: bob, liftL: MOTION.liftA[f]!, liftR: MOTION.liftB[f]!, stride: 0 };
}

export interface Pose {
  dir: SheetDir;
  m: FrameMotion;
  head: R;
  torso: R;
  hip: R;
  /** front/back: [screen-left, screen-right]; side: [far, near] */
  arms: [R, R];
  legs: [R, R];
  feet: [R, R];
  eyes: { x: number; y: number }[];
}

const dy = (r: R, d: number): R => ({ ...r, y: r.y + d });
const dx = (r: R, d: number): R => ({ ...r, x: r.x + d });

export function pose(dir: SheetDir, anim: AnimName, f: number): Pose {
  const m = motion(dir, anim, f);
  if (dir === "left") {
    const s = m.stride;
    return {
      dir, m,
      head: dy({ x: 8, y: 29, w: 16, h: 17 }, m.headDy),
      torso: dy({ x: 11, y: 46, w: 9, h: 9 }, m.bodyDy),
      hip: dy({ x: 11, y: 52, w: 9, h: 5 }, m.bodyDy),
      arms: [dy({ x: 13, y: 47, w: 5, h: 8 }, m.bodyDy), dy({ x: 13, y: 47, w: 5, h: 8 }, m.bodyDy)],
      legs: [dx({ x: 12, y: 56, w: 7, h: 6 }, s), dx({ x: 12, y: 56, w: 7, h: 6 }, -s)],
      feet: [dx({ x: 12, y: 58, w: 7, h: 4 }, s), dx({ x: 12, y: 58, w: 7, h: 4 }, -s)],
      eyes: [{ x: 11, y: 41 + m.headDy }],
    };
  }
  return {
    dir, m,
    head: dy({ x: 6, y: 29, w: 20, h: 16 }, m.headDy),
    torso: dy({ x: 9, y: 44, w: 14, h: 11 }, m.bodyDy),
    hip: dy({ x: 10, y: 52, w: 12, h: 4 }, m.bodyDy),
    arms: [dy({ x: 6, y: 45, w: 5, h: 10 }, m.bodyDy), dy({ x: 21, y: 45, w: 5, h: 10 }, m.bodyDy)],
    legs: [{ x: 10, y: 55 - m.liftL, w: 5, h: 7 }, { x: 17, y: 55 - m.liftR, w: 5, h: 7 }],
    feet: [{ x: 10, y: 58 - m.liftL, w: 5, h: 4 }, { x: 17, y: 58 - m.liftR, w: 5, h: 4 }],
    eyes: [{ x: 11, y: 41 + m.headDy }, { x: 18, y: 41 + m.headDy }],
  };
}
