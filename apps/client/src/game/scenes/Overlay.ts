import Phaser from "phaser";
import { NameTag } from "../render/nameTag";

/** Draws name tags at canvas resolution, unaffected by the world camera's zoom. */
export class Overlay extends Phaser.Scene {
  private readonly tags = new Map<string, NameTag>();

  constructor() {
    super("Overlay");
  }

  placeTag(id: string, name: string, x: number, y: number): void {
    let tag = this.tags.get(id);
    if (!tag) {
      tag = new NameTag(this, name, window.devicePixelRatio || 1);
      this.tags.set(id, tag);
    }
    tag.placeAbove(x, y);
  }
}
