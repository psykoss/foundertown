/** Dev overlays: F1 grid · F2 collision · F3 depth anchors + zones. */
import Phaser from "phaser";
import { TILE, type WorldData } from "@ft/shared";
import { store } from "../../state/store";
import { DEPTH_DEBUG } from "../world/WorldView";

export class DebugOverlay {
  private static_: Phaser.GameObjects.Graphics;
  private dynamic: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, private world: WorldData) {
    this.static_ = scene.add.graphics().setDepth(DEPTH_DEBUG);
    this.dynamic = scene.add.graphics().setDepth(DEPTH_DEBUG + 1);
    scene.input.keyboard!.on("keydown", (e: KeyboardEvent) => {
      const flag = ({ F1: "grid", F2: "collision", F3: "depth" } as const)[e.key as "F1" | "F2" | "F3"];
      if (!flag) return;
      e.preventDefault();
      store.set((s) => ({ debug: { ...s.debug, [flag]: !s.debug[flag] } }));
    });
    store.watch((s) => s.debug, () => this.redrawStatic());
    this.redrawStatic();
  }

  /** The map or the office layout changed. */
  setWorld(world: WorldData) {
    this.world = world;
    this.redrawStatic();
  }

  private redrawStatic() {
    const g = this.static_;
    const { debug } = store.get();
    const { width, height, grid, zones } = this.world;
    g.clear();
    if (debug.collision) {
      g.fillStyle(0xff3355, 0.35);
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (grid.isBlocked(x, y)) g.fillRect(x * TILE, y * TILE, TILE, TILE);
      g.lineStyle(3, 0xff3355, 0.9); // thin edge walls
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          if (grid.hasEdge(x, y, "W")) g.lineBetween(x * TILE, y * TILE, x * TILE, (y + 1) * TILE);
          if (grid.hasEdge(x, y, "N")) g.lineBetween(x * TILE, y * TILE, (x + 1) * TILE, y * TILE);
        }
    }
    if (debug.grid) {
      g.lineStyle(1, 0xffffff, 0.12);
      for (let x = 0; x <= width; x++) g.lineBetween(x * TILE, 0, x * TILE, height * TILE);
      for (let y = 0; y <= height; y++) g.lineBetween(0, y * TILE, width * TILE, y * TILE);
    }
    if (debug.depth) {
      g.lineStyle(1, 0x44ddff, 0.9);
      for (const z of zones) g.strokeRect(z.x, z.y, z.width, z.height);
    }
  }

  /** Per-frame: depth anchors of anything sorted by y. */
  update(anchors: { x: number; y: number }[]) {
    const g = this.dynamic;
    g.clear();
    if (!store.get().debug.depth) return;
    g.fillStyle(0xffdd00, 1);
    for (const a of anchors) g.fillRect(a.x - 1, a.y - 1, 3, 3);
  }
}
