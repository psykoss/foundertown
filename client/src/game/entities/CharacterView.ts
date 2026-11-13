/**
 * Character RENDERING. Reads a Character every frame; never mutates it.
 *
 * Sitting is a pose of the view: the scene says which seat the character is on (standing still on
 * a chair's tile), and the view hops it up onto the seat, turns it the way the chair faces and
 * draws it behind the chair, so head and shoulders show over the chair's back. Everyone derives it
 * from the same tile, so nothing about sitting is sent over the network.
 */
import Phaser from "phaser";
import { FEET_Y, FRAME_H, TILE, sheetDirFor, walkerPos, avatarKey, type ItemRegistry, type Seat } from "@ft/shared";
import type { Character } from "./Character";
import { animKey, ensureAvatarTexture } from "../avatar/textures";
import { NameTag } from "../render/NameTag";

/** Feet sit this many px above the bottom edge of their tile. */
const FEET_INSET = 3;
/** Clickable part of a frame: the drawn body, not the empty margin around it. */
const BODY = new Phaser.Geom.Rectangle(6, 24, 20, 40);
/** Sitting down and standing up take this long. */
const SIT_MS = 260;
/** Seated, the body rides this many px higher: up on the seat, shoulders level with the top of the chair's back. */
const SIT_LIFT = 7;
/** Extra height at the middle of the move — a small hop onto (or off) the chair. */
const SIT_HOP = 4;

export class CharacterView {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly label: NameTag;
  private tex: string | null = null;
  private appearance = "";
  /** False while characters are out of the picture (the studio shows the office alone). */
  private shown = true;
  /** The chair being sat on (null = standing), and how far the sit has got: 0 standing … 1 seated. */
  private seat: Seat | null = null;
  private sit = 0;

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

  /** Sit on a seat (the character is standing still on its tile), or stand up with `null`. */
  setSeat(seat: Seat | null) {
    this.seat = seat;
  }

  /** Feet position in world pixels. */
  feet(): { x: number; y: number } {
    const p = walkerPos(this.character.walker);
    return { x: Math.round(p.x * TILE + TILE / 2), y: Math.round(p.y * TILE + TILE - FEET_INSET) };
  }

  update() {
    const { x, y } = this.feet();
    // sitting: ease toward the pose, with a hop in the middle of the move
    const step = this.scene.game.loop.delta / SIT_MS;
    this.sit = this.seat ? Math.min(1, this.sit + step) : Math.max(0, this.sit - step);
    const t = this.sit * this.sit * (3 - 2 * this.sit);
    const lift = Math.round(SIT_LIFT * t + SIT_HOP * Math.sin(Math.PI * t));
    // on the chair the body is behind its back; anywhere else it is sorted by its feet
    this.sprite.setPosition(x, y - lift).setDepth(this.seat ? this.seat.depth - 0.5 : y);
    this.label.setWorldPosition(x, y - 35 - lift);
    this.label.setName(this.character.name);
    if (!this.tex) return;
    const w = this.character.walker;
    const { sheetDir, flipX } = sheetDirFor(this.seat ? this.seat.dir : w.dir);
    this.sprite.setFlipX(flipX);
    this.sprite.anims.play(animKey(this.tex, w.moving ? "walk" : "idle", sheetDir), true);
  }

  destroy() {
    this.sprite.destroy();
    this.label.destroy();
  }
}
