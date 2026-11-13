/**
 * Character RENDERING. Reads a Character every frame; never mutates it.
 */
import Phaser from "phaser";
import { FEET_Y, FRAME_H, TILE, sheetDirFor, walkerPos, avatarKey, type ItemRegistry } from "@ft/shared";
import type { Character } from "./Character";
import { animKey, ensureAvatarTexture } from "../avatar/textures";
import { NameTag } from "../render/NameTag";

/** Feet sit this many px above the bottom edge of their tile. */
const FEET_INSET = 3;
/** Clickable part of a frame: the drawn body, not the empty margin around it. */
const BODY = new Phaser.Geom.Rectangle(6, 24, 20, 40);

export class CharacterView {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly label: NameTag;
  private tex: string | null = null;
  private appearance = "";
  /** False while characters are out of the picture (the studio shows the office alone). */
  private shown = true;

  constructor(
    private scene: Phaser.Scene,
    readonly character: Character,
    private registry: ItemRegistry,
  ) {
    this.sprite = scene.add.sprite(0, 0, "__DEFAULT").setOrigin(0.5, (FEET_Y + 1) / FRAME_H).setVisible(false);
    this.label = new NameTag(scene, character.name);
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
      this.sprite.setTexture(tex).setVisible(this.shown);
      this.sprite.anims.stop();
    });
  }

  /** Make the character clickable — its body and its name tag. */
  onClick(cb: () => void) {
    this.label.onClick(cb);
    this.sprite.setInteractive({ hitArea: BODY, hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true }).on("pointerdown", cb);
  }

  /** Show or hide the character and its name tag. */
  setShown(on: boolean) {
    if (on === this.shown) return;
    this.shown = on;
    this.sprite.setVisible(on && !!this.tex);
    this.label.setShown(on);
  }

  /** Feet position in world pixels. */
  feet(): { x: number; y: number } {
    const p = walkerPos(this.character.walker);
    return { x: Math.round(p.x * TILE + TILE / 2), y: Math.round(p.y * TILE + TILE - FEET_INSET) };
  }

  update() {
    const { x, y } = this.feet();
    this.sprite.setPosition(x, y).setDepth(y);
    this.label.setWorldPosition(x, y - 35);
    this.label.setName(this.character.name);
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
