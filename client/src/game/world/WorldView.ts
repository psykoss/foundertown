/**
 * Renders a parsed Tiled map. Depth model (see docs/spec.md §Depth):
 *   ground layers: < 0   |   furniture + characters: depth = feet/base y   |   above: 2_000_000
 */
import Phaser from "phaser";
import type { TiledMap, WorldData } from "@ft/shared";

export const DEPTH_ABOVE = 2_000_000;
export const DEPTH_DEBUG = 3_000_000;

export class WorldView {
  readonly map: Phaser.Tilemaps.Tilemap;
  readonly furniture: Phaser.GameObjects.Image[] = [];

  constructor(scene: Phaser.Scene, mapKey: string, raw: TiledMap, world: WorldData) {
    this.map = scene.make.tilemap({ key: mapKey });
    const terrain = this.map.addTilesetImage("terrain", "tiles:terrain");
    if (!terrain) throw new Error("terrain tileset missing");

    const under: [string, number][] = [["ground", -30], ["ground_detail", -20], ["walls", -10]];
    for (const [name, depth] of under) this.map.createLayer(name, terrain, 0, 0)?.setDepth(depth);
    this.map.createLayer("above", terrain, 0, 0)?.setDepth(DEPTH_ABOVE);

    for (const f of world.furniture) {
      const img = scene.add.image(f.x, f.y, `furn:${f.image.replace(/\.png$/, "")}`).setOrigin(0, 1);
      // base y — same rule as characters' feet; rugs lie under everything; counter items sit above their counter
      img.setDepth(f.layer === "floor" ? -5 : f.y + f.z);
      this.furniture.push(img);
    }
    void raw;
  }

  get widthPx() {
    return this.map.widthInPixels;
  }
  get heightPx() {
    return this.map.heightInPixels;
  }
}
