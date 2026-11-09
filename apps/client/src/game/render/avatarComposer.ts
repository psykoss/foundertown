import {
  ANIMATION_FRAMES,
  DIRECTIONS,
  WALK_FRAMES,
  frameKey,
} from "@founder-town/shared";
import type {
  AvatarConfig,
  CharacterAtlasMeta,
  CharacterLayer,
  Direction,
  Point,
} from "@founder-town/shared";
import type Phaser from "phaser";

export const CHARACTER_ATLAS = "characters";

const WALK_FRAME_RATE = 8;

export interface PixelImage {
  width: number;
  height: number;
  data: Uint8ClampedArray<ArrayBuffer>;
}

type FindFrame = (name: string) => Point | undefined;

function rgbOf(hex: string): number {
  return Number.parseInt(hex.slice(1), 16);
}

function partIdFor(config: AvatarConfig, layer: CharacterLayer): string | null {
  switch (layer) {
    case "body":
      return config.body;
    case "hairBack":
    case "hairFront":
      return config.hair;
    case "bottom":
      return config.bottom;
    case "shoes":
      return config.shoes;
    case "top":
      return config.top;
    case "accessory":
      return config.accessory;
  }
}

/** Maps each slot's key colour to the avatar's chosen colour. */
function recolourTable(
  meta: CharacterAtlasMeta,
  config: AvatarConfig,
): Map<number, number> {
  return new Map(
    Object.values(meta.slots).map((slot) => {
      const rampName = config.colors[slot.ramp];
      const ramp = meta.ramps[slot.ramp][rampName];
      if (!ramp) throw new Error(`Unknown ${slot.ramp} ramp "${rampName}"`);
      return [rgbOf(slot.key), rgbOf(ramp[slot.shade])];
    }),
  );
}

function addOutline(cell: PixelImage, outline: number): void {
  const { width, height, data } = cell;
  const source = data.slice();
  const opaque = (x: number, y: number) =>
    x >= 0 &&
    y >= 0 &&
    x < width &&
    y < height &&
    source[(y * width + x) * 4 + 3] !== 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (opaque(x, y)) continue;
      if (
        opaque(x - 1, y) ||
        opaque(x + 1, y) ||
        opaque(x, y - 1) ||
        opaque(x, y + 1)
      ) {
        const offset = (y * width + x) * 4;
        data[offset] = (outline >> 16) & 255;
        data[offset + 1] = (outline >> 8) & 255;
        data[offset + 2] = outline & 255;
        data[offset + 3] = 255;
      }
    }
  }
}

/** Draws one outlined frame of the avatar. Parts absent from the atlas are skipped. */
function composeCell(
  atlas: PixelImage,
  findFrame: FindFrame,
  meta: CharacterAtlasMeta,
  config: AvatarConfig,
  recolour: Map<number, number>,
  direction: Direction,
  key: string,
): PixelImage {
  const { w, h } = meta.canvas;
  const cell: PixelImage = {
    width: w,
    height: h,
    data: new Uint8ClampedArray(w * h * 4),
  };
  for (const layer of meta.layerOrder[direction]) {
    const partId = partIdFor(config, layer);
    const origin = partId && findFrame(`${layer}/${partId}/${key}`);
    if (!origin) continue;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const from = ((origin.y + y) * atlas.width + origin.x + x) * 4;
        if (atlas.data[from + 3] === 0) continue;
        const rgb =
          ((atlas.data[from] ?? 0) << 16) |
          ((atlas.data[from + 1] ?? 0) << 8) |
          (atlas.data[from + 2] ?? 0);
        const color = recolour.get(rgb) ?? rgb;
        const to = (y * w + x) * 4;
        cell.data[to] = (color >> 16) & 255;
        cell.data[to + 1] = (color >> 8) & 255;
        cell.data[to + 2] = color & 255;
        cell.data[to + 3] = 255;
      }
    }
  }
  addOutline(cell, rgbOf(meta.outline));
  return cell;
}

/** Composes all frames into one sheet: a row per direction, a column per frame. */
export function composeAvatarSheet(
  atlas: PixelImage,
  findFrame: FindFrame,
  meta: CharacterAtlasMeta,
  config: AvatarConfig,
): PixelImage {
  const { w, h } = meta.canvas;
  const width = ANIMATION_FRAMES.length * w;
  const height = DIRECTIONS.length * h;
  const data = new Uint8ClampedArray(width * height * 4);
  const recolour = recolourTable(meta, config);
  DIRECTIONS.forEach((direction, row) => {
    ANIMATION_FRAMES.forEach((frame, column) => {
      const cell = composeCell(
        atlas,
        findFrame,
        meta,
        config,
        recolour,
        direction,
        frameKey(direction, frame),
      );
      for (let y = 0; y < h; y++) {
        data.set(
          cell.data.subarray(y * w * 4, (y + 1) * w * 4),
          ((row * h + y) * width + column * w) * 4,
        );
      }
    });
  });
  return { width, height, data };
}

/** Returns a short hash that is stable for equal configs (FNV-1a). */
export function avatarHash(config: AvatarConfig): string {
  const { colors } = config;
  const text = [
    config.body,
    config.hair,
    config.top,
    config.bottom,
    config.shoes,
    config.accessory ?? "",
    colors.hair,
    colors.top,
    colors.skin,
    colors.bottom,
    colors.shoes,
    colors.accessory,
  ].join("|");
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function walkAnimationKey(
  textureKey: string,
  direction: Direction,
): string {
  return `${textureKey}:walk_${direction}`;
}

function readAtlasPixels(scene: Phaser.Scene): PixelImage {
  const image = scene.textures
    .get(CHARACTER_ATLAS)
    .getSourceImage() as HTMLImageElement;
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Could not read the character atlas");
  context.drawImage(image, 0, 0);
  const { data } = context.getImageData(0, 0, image.width, image.height);
  return { width: image.width, height: image.height, data };
}

/**
 * Builds the avatar's texture and walk animations, and returns the texture key.
 * Equal configs share one texture.
 */
export function composeAvatar(
  scene: Phaser.Scene,
  config: AvatarConfig,
): string {
  const key = `avatar-${avatarHash(config)}`;
  if (scene.textures.exists(key)) return key;

  const atlasTexture = scene.textures.get(CHARACTER_ATLAS);
  const meta = (atlasTexture.customData as { meta: CharacterAtlasMeta }).meta;
  const sheet = composeAvatarSheet(
    readAtlasPixels(scene),
    (name) => {
      if (!atlasTexture.has(name)) return undefined;
      const frame = atlasTexture.get(name);
      return { x: frame.cutX, y: frame.cutY };
    },
    meta,
    config,
  );

  const texture = scene.textures.createCanvas(key, sheet.width, sheet.height);
  if (!texture) throw new Error(`Could not create texture ${key}`);
  texture
    .getContext()
    .putImageData(new ImageData(sheet.data, sheet.width, sheet.height), 0, 0);
  texture.refresh();

  const { w, h } = meta.canvas;
  DIRECTIONS.forEach((direction, row) => {
    ANIMATION_FRAMES.forEach((frame, column) => {
      texture.add(frameKey(direction, frame), 0, column * w, row * h, w, h);
    });
    scene.anims.create({
      key: walkAnimationKey(key, direction),
      frames: WALK_FRAMES.map((frame) => ({
        key,
        frame: frameKey(direction, frame),
      })),
      frameRate: WALK_FRAME_RATE,
      repeat: -1,
    });
  });
  return key;
}
