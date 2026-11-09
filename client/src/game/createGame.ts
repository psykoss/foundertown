import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { WorldScene } from "./scenes/WorldScene";

export function createGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    pixelArt: true, // nearest-neighbour, no antialias, rounded pixels
    roundPixels: true,
    backgroundColor: "#30325b",
    // resizeInterval 0: follow the parent every frame, so the canvas tracks the frame while the sidebar slides
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight, resizeInterval: 0 },
    scene: [BootScene, WorldScene],
    fps: { target: 60 },
    disableContextMenu: true,
  });
}
