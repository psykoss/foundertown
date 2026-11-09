import Phaser from "phaser";
import { Boot } from "./scenes/Boot";
import { Overlay } from "./scenes/Overlay";
import { Preload } from "./scenes/Preload";
import { Room } from "./scenes/Room";

function evenCeil(value: number): number {
  return Math.ceil(value / 2) * 2;
}

/**
 * Sizes the canvas in device pixels. Even dimensions keep the camera's centre
 * on a whole pixel.
 */
function canvasSize() {
  const ratio = window.devicePixelRatio || 1;
  return {
    width: evenCeil(window.innerWidth * ratio),
    height: evenCeil(window.innerHeight * ratio),
    zoom: 1 / ratio,
  };
}

export function createGame(parent: string): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: "#1f2430",
    render: {
      pixelArt: true,
      roundPixels: true,
    },
    scale: {
      mode: Phaser.Scale.NONE,
      ...canvasSize(),
    },
    scene: [Boot, Preload, Room, Overlay],
  });

  window.addEventListener("resize", () => {
    const { width, height, zoom } = canvasSize();
    game.scale.setZoom(zoom);
    game.scale.resize(width, height);
  });

  return game;
}
