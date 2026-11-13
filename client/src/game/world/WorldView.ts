/**
 * Renders a parsed Tiled map. Depth model (see docs/spec.md §Depth):
 *   ground layers: < 0   |   furniture + characters: depth = feet/base y   |   above: 2_000_000
 */
import Phaser from "phaser";
import { TILE, type WorldData } from "@ft/shared";

export const DEPTH_ABOVE = 2_000_000;
export const DEPTH_DEBUG = 3_000_000;

/**
 * Copy of a tileset texture with every tile's edge pixels repeated 1px outward (margin 1, spacing 2).
 * At fractional zoom the GPU can sample just outside a tile; without this it picks up the neighbouring
 * tile in the sheet and a 1px line flashes between tile columns.
 */
function extrudedTileset(scene: Phaser.Scene, key: string): string {
  const out = `${key}:extruded`;
  if (scene.textures.exists(out)) return out;
  const src = scene.textures.get(key).getSourceImage() as HTMLImageElement;
  const cols = Math.floor(src.width / TILE);
  const rows = Math.floor(src.height / TILE);
  const step = TILE + 2;
  const canvas = scene.textures.createCanvas(out, cols * step, rows * step)!;
  const ctx = canvas.getContext();
  ctx.imageSmoothingEnabled = false;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const sx = c * TILE, sy = r * TILE;
      const dx = c * step + 1, dy = r * step + 1;
      // stretch the tile over its 34×34 cell (fills edges + corners with the border pixels), then the tile itself
      ctx.drawImage(src, sx, sy, TILE, 1, dx, dy - 1, TILE, 1);
      ctx.drawImage(src, sx, sy + TILE - 1, TILE, 1, dx, dy + TILE, TILE, 1);
      ctx.drawImage(src, sx, sy, 1, TILE, dx - 1, dy, 1, TILE);
      ctx.drawImage(src, sx + TILE - 1, sy, 1, TILE, dx + TILE, dy, 1, TILE);
      ctx.drawImage(src, sx, sy, 1, 1, dx - 1, dy - 1, 1, 1);
      ctx.drawImage(src, sx + TILE - 1, sy, 1, 1, dx + TILE, dy - 1, 1, 1);
      ctx.drawImage(src, sx, sy + TILE - 1, 1, 1, dx - 1, dy + TILE, 1, 1);
      ctx.drawImage(src, sx + TILE - 1, sy + TILE - 1, 1, 1, dx + TILE, dy + TILE, 1, 1);
      ctx.drawImage(src, sx, sy, TILE, TILE, dx, dy, TILE, TILE);
    }
  canvas.refresh();
  return out;
}

/** Under the walls and rugs, over the map's own ground: the carpets of the office layout. */
const DEPTH_SPACES = -25;

export class WorldView {
  readonly map: Phaser.Tilemaps.Tilemap;
  private spaces: Phaser.Tilemaps.TilemapLayer | null;
  private furniture: Phaser.GameObjects.Image[] = [];

  /** Draws the map's tile layers; `setWorld` adds everything that can change (office floors, furniture). */
  constructor(private scene: Phaser.Scene, mapKey: string) {
    this.map = scene.make.tilemap({ key: mapKey });
    const terrain = this.map.addTilesetImage("terrain", extrudedTileset(scene, "tiles:terrain"), TILE, TILE, 1, 2);
    if (!terrain) throw new Error("terrain tileset missing");

    const under: [string, number][] = [["ground", -30], ["ground_detail", -20], ["walls", -10]];
    for (const [name, depth] of under) this.map.createLayer(name, terrain, 0, 0)?.setDepth(depth);
    this.map.createLayer("above", terrain, 0, 0)?.setDepth(DEPTH_ABOVE);
    this.spaces = this.map.createBlankLayer("spaces", terrain, 0, 0)?.setDepth(DEPTH_SPACES) ?? null;
  }

  /** Redraw what the world data describes on top of the map: the floor of every space, and all furniture. */
  setWorld(world: WorldData) {
    this.spaces?.fill(-1);
    for (const s of world.spaces) if (s.floor) this.spaces?.fill(s.floor, s.x, s.y, s.w, s.h);

    for (const img of this.furniture) img.destroy();
    this.furniture = world.furniture.map((f) => {
      const img = this.scene.add.image(f.x, f.y, `furn:${f.image.replace(/\.png$/, "")}`).setOrigin(0, 1);
      // base y — same rule as characters' feet; rugs lie under everything; counter items sit above their counter
      return img.setDepth(f.layer === "floor" ? -5 : f.y + f.z);
    });
  }

  destroy() {
    for (const img of this.furniture) img.destroy();
    this.furniture = [];
    this.map.destroy();
  }

  get widthPx() {
    return this.map.widthInPixels;
  }
  get heightPx() {
    return this.map.heightInPixels;
  }
}
