/**
 * Name tag: a DOM chip floating over a character. DOM (not Phaser text) so it stays crisp at any
 * zoom while the canvas itself is upscaled pixel art. Positioned after the camera has moved.
 */
import Phaser from "phaser";
import { worldToScreen } from "./camera";

const LAYER_CLASS = "nametags";
/** Zoom at which the tag is drawn at its CSS size (12px text); it scales proportionally from there. */
const TAG_ZOOM = 2;
/** CSS px between the tag's box and the point it is anchored to (room for the pointer). */
const TAG_GAP = 6;

function layerFor(scene: Phaser.Scene): HTMLElement {
  const parent = scene.game.canvas.parentElement!;
  let layer = parent.querySelector<HTMLElement>(`.${LAYER_CLASS}`);
  if (!layer) {
    layer = document.createElement("div");
    layer.className = LAYER_CLASS;
    parent.appendChild(layer);
  }
  return layer;
}

export class NameTag {
  private el: HTMLDivElement;
  private textEl: HTMLSpanElement;
  private name = "";
  private worldX = 0;
  private worldY = 0;

  constructor(private scene: Phaser.Scene, name: string) {
    this.el = document.createElement("div");
    this.el.className = "nametag";
    const dot = document.createElement("span");
    dot.className = "nametag-dot";
    dot.append(document.createElement("i"), document.createElement("i"), document.createElement("i")); // sound bars, shown while speaking
    this.textEl = document.createElement("span");
    this.el.append(dot, this.textEl);
    this.setName(name);
    layerFor(scene).appendChild(this.el);

    // RENDER fires after the camera's follow/scroll for this frame is resolved.
    scene.events.on(Phaser.Scenes.Events.RENDER, this.sync, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  setName(name: string) {
    if (name === this.name) return;
    this.name = name;
    this.textEl.textContent = name;
  }

  /** Swap the status dot for moving sound bars while the character is talking. */
  setSpeaking(on: boolean) {
    this.el.classList.toggle("speaking", on);
  }

  /** Make the tag clickable (e.g. the player's own tag opens their profile). */
  onClick(cb: () => void) {
    this.el.classList.add("clickable");
    this.el.addEventListener("click", cb);
  }

  /** World position of the tag's pointer tip (just above the character's head). */
  setWorldPosition(x: number, y: number) {
    this.worldX = x;
    this.worldY = y;
  }

  private sync() {
    // Locked to the character: unrounded position and a size proportional to the zoom, so the tag moves
    // and grows with the world instead of stepping pixel by pixel.
    const cam = this.scene.cameras.main;
    const p = worldToScreen(cam, this.worldX, this.worldY);
    const k = cam.zoom / TAG_ZOOM;
    this.el.style.transform = `translate(${p.x.toFixed(2)}px, ${p.y.toFixed(2)}px) scale(${k.toFixed(4)}) translate(-50%, calc(-100% - ${TAG_GAP}px))`;
    this.el.style.zIndex = String(Math.round(this.worldY));
  }

  destroy() {
    this.scene.events.off(Phaser.Scenes.Events.RENDER, this.sync, this);
    this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    this.el.remove();
  }
}
