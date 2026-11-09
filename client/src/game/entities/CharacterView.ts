/**
 * Character RENDERING. Reads a Character every frame; never mutates it.
 */
import Phaser from "phaser";
import { FEET_Y, FRAME_H, TILE, sheetDirFor, walkerPos, avatarKey, type ItemRegistry } from "@ft/shared";
import type { Character } from "./Character";
import { animKey, ensureAvatarTexture } from "../avatar/textures";

/** Feet sit this many px above the bottom edge of their tile. */
const FEET_INSET = 3;

export class CharacterView {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly label: Phaser.GameObjects.Text;
  private tex: string | null = null;
  private appearance = "";

  constructor(
    private scene: Phaser.Scene,
    readonly character: Character,
    private registry: ItemRegistry,
  ) {
    this.sprite = scene.add.sprite(0, 0, "__DEFAULT").setOrigin(0.5, (FEET_Y + 1) / FRAME_H).setVisible(false);
    this.label = scene.add
      .text(0, 0, character.name, {
        fontFamily: "ui-monospace, Menlo, monospace",
        fontSize: "8px",
        color: "#ffffff",
        backgroundColor: "#5c4ebe",
        padding: { x: 3, y: 1 },
        resolution: 4,
      })
      .setOrigin(0.5, 1);
    this.refreshAvatar();
  }

  /** Re-bake if the character's appearance changed. */
  refreshAvatar() {
    const key = avatarKey(this.character.avatar);
    if (key === this.appearance) return;
    this.appearance = key;
    ensureAvatarTexture(this.scene, this.character.avatar, this.registry).then((tex) => {
      if (key !== this.appearance || !this.sprite.active) return; // superseded
      this.tex = tex;
      this.sprite.setTexture(tex).setVisible(true);
      this.sprite.anims.stop();
    });
  }

  /** Feet position in world pixels. */
  feet(): { x: number; y: number } {
    const p = walkerPos(this.character.walker);
    return { x: Math.round(p.x * TILE + TILE / 2), y: Math.round(p.y * TILE + TILE - FEET_INSET) };
  }

  update() {
    const { x, y } = this.feet();
    this.sprite.setPosition(x, y).setDepth(y);
    this.label.setPosition(x, y - 35).setDepth(1_000_000 + y);
    if (this.label.text !== this.character.name) this.label.setText(this.character.name);
    if (!this.tex) return;
    const w = this.character.walker;
    const { sheetDir, flipX } = sheetDirFor(w.dir);
    this.sprite.setFlipX(flipX);
    this.sprite.anims.play(animKey(this.tex, w.moving ? "walk" : "idle", sheetDir), true);
  }

  destroy() {
    this.sprite.destroy();
    this.label.destroy();
  }
}
