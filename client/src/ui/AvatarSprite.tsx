/**
 * Draws a composed avatar (same compositor as the game) into a small canvas.
 * `crop` picks a region of the 32×64 frame; `scale` is real screen pixels per sprite pixel (always an integer — sprites opt out of the UI zoom).
 */
import { useEffect, useRef } from "react";
import { ANIMS, FRAME_H, FRAME_W, SHEET_COLS, sheetDirFor, sheetFrame, type AnimName, type Avatar, type Dir } from "@ft/shared";
import { useStore } from "../state/store";
import { bakeAvatar } from "../game/avatar/compositor";

export interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Regions of the character frame used for thumbnails. */
export const CROP = {
  frame: { x: 0, y: 0, w: FRAME_W, h: FRAME_H },
  /** Whole character with room for tall hair/hats, no empty rows above — the name tag sits right on top. */
  stage: { x: 0, y: 24, w: FRAME_W, h: FRAME_H - 24 },
  full: { x: 2, y: 25, w: 28, h: 39 },
  bust: { x: 2, y: 26, w: 28, h: 30 },
  head: { x: 4, y: 23, w: 24, h: 25 },
  torso: { x: 4, y: 40, w: 24, h: 18 },
  legs: { x: 6, y: 48, w: 20, h: 16 },
} as const satisfies Record<string, Crop>;

interface Props {
  avatar: Avatar;
  crop?: Crop;
  scale?: number;
  dir?: Dir;
  anim?: AnimName;
  /** Play the animation; otherwise the first frame is drawn once. */
  animate?: boolean;
  className?: string;
}

function drawFrame(c: HTMLCanvasElement, sheet: HTMLCanvasElement, crop: Crop, dir: Dir, anim: AnimName, frame: number) {
  const ctx = c.getContext("2d");
  if (!ctx) return;
  const { sheetDir, flipX } = sheetDirFor(dir);
  const idx = sheetFrame(anim, sheetDir, frame);
  const sx = (idx % SHEET_COLS) * FRAME_W;
  const sy = Math.floor(idx / SHEET_COLS) * FRAME_H;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.save();
  if (flipX) {
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1);
  }
  // mirrored frames crop the mirrored region so the same part of the character stays in view
  const cx = flipX ? FRAME_W - crop.x - crop.w : crop.x;
  ctx.drawImage(sheet, sx + cx, sy + crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
  ctx.restore();
}

export function AvatarSprite({ avatar, crop = CROP.frame, scale = 2, dir = "down", anim = "idle", animate = false, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const registry = useStore((s) => s.registry)!;

  useEffect(() => {
    let alive = true;
    let raf = 0;
    bakeAvatar(avatar, registry).then((sheet) => {
      if (!alive || !ref.current) return;
      if (!animate) return drawFrame(ref.current, sheet, crop, dir, anim, 0);
      const start = performance.now();
      let last = -1;
      const tick = (t: number) => {
        const f = Math.floor(((t - start) / 1000) * ANIMS[anim].fps) % ANIMS[anim].frames;
        if (f !== last && ref.current) drawFrame(ref.current, sheet, crop, dir, anim, (last = f));
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [avatar, registry, crop, dir, anim, animate]);

  return (
    <canvas
      ref={ref}
      className={"sprite" + (className ? " " + className : "")}
      width={crop.w}
      height={crop.h}
      style={{ width: crop.w * scale, height: crop.h * scale }}
    />
  );
}

/** PNG of the avatar's front idle frame, scaled up — for the "download" button. */
export async function avatarPng(avatar: Avatar, registry: Parameters<typeof bakeAvatar>[1], scale = 8): Promise<string> {
  const sheet = await bakeAvatar(avatar, registry);
  const small = document.createElement("canvas");
  small.width = FRAME_W;
  small.height = FRAME_H;
  drawFrame(small, sheet, CROP.frame, "down", "idle", 0);
  const out = document.createElement("canvas");
  out.width = FRAME_W * scale;
  out.height = FRAME_H * scale;
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
}
