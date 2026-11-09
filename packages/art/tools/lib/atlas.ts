import { blit, createRaster } from "./raster";
import type { Raster } from "./raster";

export interface AtlasEntry {
  name: string;
  raster: Raster;
}

export interface PhaserFrame {
  frame: { x: number; y: number; w: number; h: number };
  rotated: false;
  trimmed: false;
  spriteSourceSize: { x: 0; y: 0; w: number; h: number };
  sourceSize: { w: number; h: number };
}

export interface PhaserAtlas {
  frames: Record<string, PhaserFrame>;
  meta: {
    image: string;
    format: "RGBA8888";
    size: { w: number; h: number };
    scale: "1";
    [extra: string]: unknown;
  };
}

export interface Atlas {
  image: Raster;
  json: PhaserAtlas;
}

const PADDING = 1;
const MAX_SIZE = 4096;

/** Packs entries into shelves. The same input always gives the same output. */
export function packAtlas(
  entries: readonly AtlasEntry[],
  imageName: string,
  meta: Readonly<Record<string, unknown>> = {},
): Atlas {
  const sorted = [...entries].sort(
    (a, b) =>
      b.raster.height - a.raster.height ||
      (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
  );
  const area = sorted.reduce(
    (sum, { raster }) =>
      sum + (raster.width + PADDING) * (raster.height + PADDING),
    0,
  );
  const widest = Math.max(0, ...sorted.map(({ raster }) => raster.width));
  const shelfWidth = Math.max(widest, Math.ceil(Math.sqrt(area)));

  const placed: { entry: AtlasEntry; x: number; y: number }[] = [];
  let x = 0;
  let y = 0;
  let shelfHeight = 0;
  let width = 0;
  for (const entry of sorted) {
    if (x > 0 && x + entry.raster.width > shelfWidth) {
      x = 0;
      y += shelfHeight + PADDING;
      shelfHeight = 0;
    }
    placed.push({ entry, x, y });
    x += entry.raster.width + PADDING;
    width = Math.max(width, x - PADDING);
    shelfHeight = Math.max(shelfHeight, entry.raster.height);
  }
  const height = y + shelfHeight;
  if (width > MAX_SIZE || height > MAX_SIZE) {
    throw new Error(
      `${imageName}: atlas is ${width}x${height}, over the limit`,
    );
  }

  const image = createRaster(width, height);
  const frames: Record<string, PhaserFrame> = {};
  for (const { entry, x: frameX, y: frameY } of placed) {
    const { width: w, height: h } = entry.raster;
    if (frames[entry.name]) throw new Error(`Duplicate frame ${entry.name}`);
    blit(image, entry.raster, frameX, frameY);
    frames[entry.name] = {
      frame: { x: frameX, y: frameY, w, h },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w, h },
      sourceSize: { w, h },
    };
  }

  return {
    image,
    json: {
      frames,
      meta: {
        ...meta,
        image: imageName,
        format: "RGBA8888",
        size: { w: width, h: height },
        scale: "1",
      },
    },
  };
}
