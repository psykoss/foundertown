/**
 * Floor feedback for click-to-walk: a light shadow on the tile under the pointer, and a short blink
 * of that shadow on the tile you clicked. View only — the scene tells it what to show.
 */
import Phaser from "phaser";
import { TILE, type TilePos } from "@ft/shared";

/** Above the ground, walls and rugs; below furniture and characters. */
const DEPTH = -4;
const HOVER_ALPHA = 0.12;
const BLINK_ALPHA = 0.26;
const INSET = 2;

export class TileCursor {
  private hover: Phaser.GameObjects.Graphics;
  private blink: Phaser.GameObjects.Graphics;
  private tween: Phaser.Tweens.Tween | null = null;

  constructor(private scene: Phaser.Scene) {
    this.hover = this.shadow().setAlpha(HOVER_ALPHA);
    this.blink = this.shadow();
  }

  private shadow(): Phaser.GameObjects.Graphics {
    const g = this.scene.add.graphics().setDepth(DEPTH).setVisible(false);
    g.fillStyle(0x000000, 1);
    g.fillRoundedRect(INSET, INSET, TILE - INSET * 2, TILE - INSET * 2, 5);
    return g;
  }

  /** Show the hover shadow on a tile, or hide it with `null`. */
  setHover(tile: TilePos | null) {
    this.hover.setVisible(!!tile);
    if (tile) this.hover.setPosition(tile.x * TILE, tile.y * TILE);
  }

  /** Blink the shadow twice on the clicked tile. */
  click(tile: TilePos) {
    this.tween?.stop();
    this.blink.setPosition(tile.x * TILE, tile.y * TILE).setAlpha(0).setVisible(true);
    this.tween = this.scene.tweens.add({
      targets: this.blink,
      alpha: BLINK_ALPHA,
      duration: 160,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: 1,
      onComplete: () => this.blink.setVisible(false),
    });
  }
}
