import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { WorldScene } from "./scenes/WorldScene";

export function createGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    pixelArt: true, // nearest-neighbour, no antialias, rounded pixels
    roundPixels: true,
    backgroundColor: "#1f1d1c",
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    scene: [BootScene, WorldScene],
    fps: { target: 60 },
    disableContextMenu: true,
  });
}
