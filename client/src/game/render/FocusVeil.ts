/**
 * Focus: while you stand in a space of the office, everything outside it is blurred and dimmed.
 * Four DOM bands over the canvas — above, below, left and right of the space — each blurring what
 * is behind it (`backdrop-filter`); the space itself is simply not covered. They sit under the name
 * tags, which stay readable, and are placed after the camera has moved, like name tags.
 * (One sheet with a hole cut by `clip-path` would be simpler, but browsers do not clip the blur with it.)
 */
import Phaser from "phaser";
import { worldToScreen } from "./camera";

export interface WorldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class FocusVeil {
  private el: HTMLDivElement;
  /** Above, below, left, right. */
  private bands: HTMLElement[];
  private rect: WorldRect | null = null;

  constructor(private scene: Phaser.Scene) {
    this.el = document.createElement("div");
    this.el.className = "focus-veil";
    this.bands = [0, 1, 2, 3].map(() => this.el.appendChild(document.createElement("i")));
    scene.game.canvas.parentElement!.appendChild(this.el);
    scene.events.on(Phaser.Scenes.Events.RENDER, this.sync, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  /** Focus on a rectangle of the world (px), or on nothing. The last one is kept while the veil fades out. */
  set(rect: WorldRect | null) {
    if (rect) this.rect = rect;
    this.el.classList.toggle("on", !!rect);
  }

  private sync() {
    if (!this.rect) return;
    const cam = this.scene.cameras.main;
    const a = worldToScreen(cam, this.rect.x, this.rect.y);
    const b = worldToScreen(cam, this.rect.x + this.rect.width, this.rect.y + this.rect.height);
    // the space on screen, kept inside the frame so every band has a real size
    const left = Phaser.Math.Clamp(Math.round(a.x), 0, cam.width), right = Phaser.Math.Clamp(Math.round(b.x), 0, cam.width);
    const top = Phaser.Math.Clamp(Math.round(a.y), 0, cam.height), bottom = Phaser.Math.Clamp(Math.round(b.y), 0, cam.height);
    const place = (band: HTMLElement, x: number, y: number, w: number, h: number) => (band.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px`);
    place(this.bands[0]!, 0, 0, cam.width, top);
    place(this.bands[1]!, 0, bottom, cam.width, cam.height - bottom);
    place(this.bands[2]!, 0, top, left, bottom - top);
    place(this.bands[3]!, right, top, cam.width - right, bottom - top);
  }

  destroy() {
    this.scene.events.off(Phaser.Scenes.Events.RENDER, this.sync, this);
    this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    this.el.remove();
  }
}
