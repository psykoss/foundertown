export interface Raster {
  width: number;
  height: number;
  data: Uint8ClampedArray<ArrayBuffer>;
}

export function createRaster(width: number, height: number): Raster {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

export function setPixel(raster: Raster, x: number, y: number, hex: string) {
  const value = Number.parseInt(hex.slice(1), 16);
  const offset = (y * raster.width + x) * 4;
  raster.data[offset] = (value >> 16) & 255;
  raster.data[offset + 1] = (value >> 8) & 255;
  raster.data[offset + 2] = value & 255;
  raster.data[offset + 3] = 255;
}

export function isOpaque(raster: Raster, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= raster.width || y >= raster.height) return false;
  return raster.data[(y * raster.width + x) * 4 + 3] !== 0;
}

/** Copies the opaque pixels of `source` onto `target`. */
export function blit(target: Raster, source: Raster, dx: number, dy: number) {
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      if (!isOpaque(source, x, y)) continue;
      const from = (y * source.width + x) * 4;
      target.data.set(
        source.data.subarray(from, from + 4),
        ((y + dy) * target.width + x + dx) * 4,
      );
    }
  }
}

/** Returns a copy with a 1px orthogonal outline in the transparent pixels. */
export function addOutline(source: Raster, hex: string): Raster {
  const result = createRaster(source.width, source.height);
  result.data.set(source.data);
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      if (isOpaque(source, x, y)) continue;
      const touchesSprite =
        isOpaque(source, x - 1, y) ||
        isOpaque(source, x + 1, y) ||
        isOpaque(source, x, y - 1) ||
        isOpaque(source, x, y + 1);
      if (touchesSprite) setPixel(result, x, y, hex);
    }
  }
  return result;
}

/** Returns a copy with `amount` transparent pixels added on every side. */
export function pad(source: Raster, amount: number): Raster {
  const result = createRaster(
    source.width + amount * 2,
    source.height + amount * 2,
  );
  blit(result, source, amount, amount);
  return result;
}
