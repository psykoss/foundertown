/** Pixel-perfect camera: integer zoom only, rounded follow, clamped to the map. */
import Phaser from "phaser";
import { MIN_VISIBLE_WORLD_H } from "@ft/shared";

export function integerZoom(viewH: number): number {
  return Math.max(1, Math.floor(viewH / MIN_VISIBLE_WORLD_H));
}

export function setupCamera(scene: Phaser.Scene, target: Phaser.GameObjects.Sprite, worldW: number, worldH: number, onZoom: (z: number) => void) {
  const cam = scene.cameras.main;
  cam.setRoundPixels(true);
  cam.setBackgroundColor("#30325b");

  const apply = () => {
    const z = integerZoom(scene.scale.height);
    cam.setZoom(z);
    // If the map is smaller than the viewport, let the camera center it instead of clamping.
    const vw = scene.scale.width / z;
    const vh = scene.scale.height / z;
    cam.setBounds(Math.min(0, (worldW - vw) / 2), Math.min(0, (worldH - vh) / 2), Math.max(worldW, vw), Math.max(worldH, vh));
    onZoom(z);
  };
  apply();
  scene.scale.on(Phaser.Scale.Events.RESIZE, apply);
  cam.startFollow(target, true, 0.18, 0.18);
}
