/**
 * What the studio draws over the office: the grid of the buildable floor while something is in
 * hand, the outline of every space, the selection with its resize handles, and the tint of the
 * space in hand (red where it does not fit). View only — it reads the studio state every frame.
 */
import Phaser from "phaser";
import { TILE, type OfficeLayout, type Rect, type Space } from "@ft/shared";
import type { Studio } from "../../state/store";
import { DEPTH_DEBUG } from "../world/WorldView";

const ACCENT = 0x7d83ff;
const BAD = 0xe5484d;
const GRID = 0x30325b;
/** Half the side of a resize handle, in screen px. */
export const HANDLE_PX = 5;

export class StudioOverlay {
  private g: Phaser.GameObjects.Graphics;

  constructor(private scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(DEPTH_DEBUG - 1);
  }

  /** `null` = the studio is closed. Sizes given in screen px are divided by the zoom, so lines keep their weight. */
  update(studio: Studio | null, office: OfficeLayout, build: Rect | null) {
    const g = this.g;
    g.clear();
    if (!studio || !build) return;
    const px = 1 / this.scene.cameras.main.zoom;
    const spaces = studio.preview?.layout.spaces ?? office.spaces;
    const box = (s: Rect) => [s.x * TILE, s.y * TILE, s.w * TILE, s.h * TILE] as const;

    if (studio.tool || studio.preview) {
      g.lineStyle(2 * px, GRID, 0.22);
      for (let x = build.x; x <= build.x + build.w; x++) g.lineBetween(x * TILE, build.y * TILE, x * TILE, (build.y + build.h) * TILE);
      for (let y = build.y; y <= build.y + build.h; y++) g.lineBetween(build.x * TILE, y * TILE, (build.x + build.w) * TILE, y * TILE);
    }

    for (const s of spaces) {
      const inHand = studio.preview?.id === s.id;
      const selected = studio.selected === s.id;
      if (inHand) {
        const color = studio.preview!.fits ? ACCENT : BAD;
        g.fillStyle(color, studio.preview!.fits ? 0.16 : 0.4).fillRect(...box(s));
        g.lineStyle(2 * px, color, 1).strokeRect(...box(s));
      } else if (selected) g.lineStyle(2 * px, ACCENT, 1).strokeRect(...box(s));
      else g.lineStyle(1 * px, GRID, 0.35).strokeRect(...box(s));
      if (selected && (!studio.preview || inHand)) this.handles(s, px);
    }
  }

  private handles(s: Space, px: number) {
    const g = this.g;
    const h = HANDLE_PX * px;
    const xs = [s.x * TILE, (s.x + s.w / 2) * TILE, (s.x + s.w) * TILE];
    const ys = [s.y * TILE, (s.y + s.h / 2) * TILE, (s.y + s.h) * TILE];
    for (const [i, x] of xs.entries())
      for (const [j, y] of ys.entries()) {
        if (i === 1 && j === 1) continue;
        g.fillStyle(0xffffff, 1).fillRect(x - h, y - h, h * 2, h * 2);
        g.lineStyle(1.5 * px, ACCENT, 1).strokeRect(x - h, y - h, h * 2, h * 2);
      }
  }
}
