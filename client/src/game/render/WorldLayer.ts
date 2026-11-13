/**
 * A DOM layer that moves and scales with the world: its children are laid out in world pixels
 * (CSS `left`/`top`) and the layer is transformed exactly as the camera draws the canvas, so they
 * stay glued to the floor. React fills it through a portal (`SpaceChips` in ui/Studio.tsx) — the
 * scene only keeps the transform in step, after the camera has moved (like name tags).
 */
import Phaser from "phaser";
import { worldToScreen } from "./camera";

export const WORLD_LAYER_CLASS = "world-layer";

export class WorldLayer {
  private el: HTMLDivElement;
  private zoom = 0;

  constructor(private scene: Phaser.Scene) {
    this.el = document.createElement("div");
    this.el.className = WORLD_LAYER_CLASS;
    scene.game.canvas.parentElement!.appendChild(this.el); // stacked by z-index: over the canvas, under the veil and the name tags
    scene.events.on(Phaser.Scenes.Events.RENDER, this.sync, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  private sync() {
    const cam = this.scene.cameras.main;
    const o = worldToScreen(cam, 0, 0);
    this.el.style.transform = `translate(${o.x.toFixed(2)}px, ${o.y.toFixed(2)}px) scale(${cam.zoom.toFixed(4)})`;
    if (cam.zoom !== this.zoom) this.el.style.setProperty("--zoom", String((this.zoom = cam.zoom))); // children size themselves against it
  }

  destroy() {
    this.scene.events.off(Phaser.Scenes.Events.RENDER, this.sync, this);
    this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    this.el.remove();
  }
}
