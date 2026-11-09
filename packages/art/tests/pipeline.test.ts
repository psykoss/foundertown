import { CHARACTER_PARTS, partsForAvatar } from "../tools/lib/derive";
import {
  CHARACTER_SIZE,
  DEFAULT_AVATAR,
  FRAME_KEYS,
} from "@founder-town/shared";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_RAMPS,
  OUTLINE_COLOR,
  PROPS,
  RAMPS,
  SLOTS,
  TILES,
} from "../src/index";
import { packAtlas } from "../tools/lib/atlas";
import { buildAtlases } from "../tools/lib/atlases";
import {
  composeAvatar,
  rampColors,
  rasterize,
  slotKeyColors,
} from "../tools/lib/compile";
import { addOutline, createRaster, isOpaque } from "../tools/lib/raster";

function pixel(raster: ReturnType<typeof createRaster>, x: number, y: number) {
  const offset = (y * raster.width + x) * 4;
  const [r, g, b] = raster.data.subarray(offset, offset + 3);
  return `#${[r, g, b].map((v) => (v ?? 0).toString(16).padStart(2, "0")).join("")}`;
}

describe("rasterize", () => {
  it("leaves dots transparent and fills slots from the ramp", () => {
    const raster = rasterize([".s"], rampColors(DEFAULT_RAMPS));
    expect(isOpaque(raster, 0, 0)).toBe(false);
    expect(pixel(raster, 1, 0)).toBe(RAMPS.skin["light"]?.light);
  });

  it("stores slots as key colours for the atlas", () => {
    expect(pixel(rasterize(["h"], slotKeyColors), 0, 0)).toBe(SLOTS["h"]?.key);
  });

  it("throws on a character with no colour", () => {
    expect(() => rasterize(["?"], slotKeyColors)).toThrow('No colour for "?"');
  });
});

describe("addOutline", () => {
  it("outlines orthogonal neighbours only", () => {
    const source = rasterize(["...", ".k.", "..."], slotKeyColors);
    const outlined = addOutline(source, "#123456");
    expect(pixel(outlined, 1, 0)).toBe("#123456");
    expect(pixel(outlined, 0, 1)).toBe("#123456");
    expect(isOpaque(outlined, 0, 0)).toBe(false);
  });
});

describe("composeAvatar", () => {
  it("outlines the silhouette but not the seams between layers", () => {
    const avatar = composeAvatar(
      partsForAvatar(DEFAULT_AVATAR),
      DEFAULT_RAMPS,
      "down",
      "idle",
    );
    expect(avatar.width).toBe(CHARACTER_SIZE.w);
    expect(avatar.height).toBe(CHARACTER_SIZE.h);
    expect(pixel(avatar, 11, 46)).toBe(OUTLINE_COLOR);
    expect(pixel(avatar, 15, 30)).not.toBe(OUTLINE_COLOR);
  });
});

describe("packAtlas", () => {
  it("places frames without overlap, inside the image", () => {
    const entries = [3, 5, 2, 7].map((size, index) => ({
      name: `f${index}`,
      raster: createRaster(size, size),
    }));
    const { image, json } = packAtlas(entries, "a.png");
    const rects = Object.values(json.frames).map(({ frame }) => frame);
    for (const [index, a] of rects.entries()) {
      expect(a.x + a.w).toBeLessThanOrEqual(image.width);
      expect(a.y + a.h).toBeLessThanOrEqual(image.height);
      for (const b of rects.slice(index + 1)) {
        const apart =
          a.x + a.w <= b.x ||
          b.x + b.w <= a.x ||
          a.y + a.h <= b.y ||
          b.y + b.h <= a.y;
        expect(apart).toBe(true);
      }
    }
  });

  it("rejects duplicate frame names", () => {
    const entry = { name: "same", raster: createRaster(1, 1) };
    expect(() => packAtlas([entry, entry], "a.png")).toThrow("Duplicate frame");
  });
});

describe("buildAtlases", () => {
  const atlases = buildAtlases();

  it("includes every frame", () => {
    expect(Object.keys(atlases["characters"]?.json.frames ?? {})).toHaveLength(
      CHARACTER_PARTS.length * FRAME_KEYS.length,
    );
    expect(Object.keys(atlases["tiles"]?.json.frames ?? {})).toHaveLength(
      TILES.length,
    );
    expect(Object.keys(atlases["props"]?.json.frames ?? {})).toHaveLength(
      PROPS.length,
    );
  });

  it("keeps the 1px outline padding on props", () => {
    for (const prop of PROPS) {
      const frame = atlases["props"]?.json.frames[prop.id]?.frame;
      expect(frame?.w).toBe(prop.grid[0]!.length + 2);
      expect(frame?.h).toBe(prop.grid.length + 2);
    }
  });

  it("is deterministic", () => {
    const again = buildAtlases();
    expect(again["characters"]?.image.data).toEqual(
      atlases["characters"]?.image.data,
    );
  });
});
