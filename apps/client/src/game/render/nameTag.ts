import type Phaser from "phaser";

const HEIGHT = 22;
const PADDING_X = 9;
const DOT_SIZE = 7;
const DOT_GAP = 6;
const FONT_SIZE = 12;
const BACKGROUND = "rgba(24, 26, 34, 0.94)";
const DOT_COLOR = "#3ddc84";
const TEXT_COLOR = "#ffffff";

function evenCeil(value: number): number {
  return Math.ceil(value / 2) * 2;
}

/** Draws the tag once, at device resolution, and reuses it for equal names. */
function createTagTexture(
  scene: Phaser.Scene,
  name: string,
  scale: number,
): string {
  const key = `nametag-${scale}-${name}`;
  if (scene.textures.exists(key)) return key;

  const font = `600 ${FONT_SIZE * scale}px system-ui, sans-serif`;
  const measure = document.createElement("canvas").getContext("2d");
  if (!measure) throw new Error("Could not measure the name tag");
  measure.font = font;
  const textWidth = measure.measureText(name).width;

  const padding = PADDING_X * scale;
  const dot = DOT_SIZE * scale;
  const gap = DOT_GAP * scale;
  const width = evenCeil(padding * 2 + dot + gap + textWidth);
  const height = evenCeil(HEIGHT * scale);

  const texture = scene.textures.createCanvas(key, width, height);
  if (!texture) throw new Error(`Could not create texture ${key}`);
  const context = texture.getContext();
  context.fillStyle = BACKGROUND;
  context.beginPath();
  context.roundRect(0, 0, width, height, height / 2);
  context.fill();
  context.fillStyle = DOT_COLOR;
  context.beginPath();
  context.arc(padding + dot / 2, height / 2, dot / 2, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = TEXT_COLOR;
  context.font = font;
  context.textBaseline = "middle";
  context.fillText(
    name,
    Math.round(padding + dot + gap),
    Math.round(height / 2),
  );
  texture.refresh();
  return key;
}

/**
 * A status pill drawn in canvas pixels with no camera zoom, so its text maps
 * 1:1 to the screen and stays sharp.
 */
export class NameTag {
  private readonly image: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, name: string, scale: number) {
    this.image = scene.add
      .image(0, 0, createTagTexture(scene, name, scale))
      .setOrigin(0, 0);
  }

  /** Centres the tag above a canvas position, on whole pixels. */
  placeAbove(x: number, y: number): void {
    this.image.setPosition(
      Math.round(x - this.image.width / 2),
      Math.round(y - this.image.height),
    );
  }
}
