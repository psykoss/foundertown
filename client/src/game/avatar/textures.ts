/** Registers baked avatar sheets as Phaser textures + animations. */
import Phaser from "phaser";
import {
  ANIMS, FRAME_H, FRAME_W, SHEET_COLS, SHEET_DIRS, SHEET_ROWS, sheetFrame,
  type AnimName, type Avatar, type ItemRegistry, type SheetDir,
} from "@ft/shared";
import { avatarHash, bakeAvatar } from "./compositor";

export const animKey = (tex: string, anim: AnimName, dir: SheetDir) => `${tex}:${anim}_${dir}`;

const pending = new Map<string, Promise<string>>();

export function ensureAvatarTexture(scene: Phaser.Scene, a: Avatar, reg: ItemRegistry): Promise<string> {
  const key = `avatar:${avatarHash(a)}`;
  if (scene.textures.exists(key)) return Promise.resolve(key);
  let p = pending.get(key);
  if (!p) {
    p = bakeAvatar(a, reg).then((canvas) => {
      if (!scene.textures.exists(key)) {
        const tex = scene.textures.addCanvas(key, canvas)!;
        for (let i = 0; i < SHEET_COLS * SHEET_ROWS; i++)
          tex.add(i, 0, (i % SHEET_COLS) * FRAME_W, Math.floor(i / SHEET_COLS) * FRAME_H, FRAME_W, FRAME_H);
        for (const anim of Object.keys(ANIMS) as AnimName[])
          for (const dir of SHEET_DIRS) {
            const k = animKey(key, anim, dir);
            if (scene.anims.exists(k)) continue;
            scene.anims.create({
              key: k,
              frames: Array.from({ length: ANIMS[anim].frames }, (_, f) => ({ key, frame: sheetFrame(anim, dir, f) })),
              frameRate: ANIMS[anim].fps,
              repeat: -1,
            });
          }
      }
      pending.delete(key);
      return key;
    });
    pending.set(key, p);
  }
  return p;
}
