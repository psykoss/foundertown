import { DEFAULT_AVATAR } from "@founder-town/shared";
import type { CharacterAtlasMeta, Point } from "@founder-town/shared";
import { describe, expect, it } from "vitest";
import { avatarHash, composeAvatarSheet } from "./avatarComposer";
import type { PixelImage } from "./avatarComposer";

const meta: CharacterAtlasMeta = {
  canvas: { w: 3, h: 3 },
  anchor: { x: 1, y: 2 },
  layerOrder: {
    down: ["body", "top"],
    left: ["body", "top"],
    right: ["body", "top"],
    up: ["top", "body"],
  },
  slots: {
    s: { ramp: "skin", shade: "light", key: "#ff00c0" },
    t: { ramp: "top", shade: "light", key: "#ff00b0" },
  },
  ramps: {
    hair: {},
    top: { teal: { light: "#112233", dark: "#000000" } },
    skin: { light: { light: "#445566", dark: "#000000" } },
    bottom: {},
    shoes: {},
    accessory: {},
  },
  outline: "#010203",
};

function atlas(): PixelImage {
  // Two 3x3 frames, each with one key-coloured centre pixel.
  const data = new Uint8ClampedArray(6 * 3 * 4);
  data.set([0xff, 0x00, 0xc0, 255], (1 * 6 + 1) * 4);
  data.set([0xff, 0x00, 0xb0, 255], (1 * 6 + 4) * 4);
  return { width: 6, height: 3, data };
}

function find(name: string): Point | undefined {
  if (name.startsWith("body/")) return { x: 0, y: 0 };
  if (name.startsWith("top/")) return { x: 3, y: 0 };
  return undefined;
}

function pixel(image: PixelImage, x: number, y: number): string {
  const offset = (y * image.width + x) * 4;
  return [...image.data.subarray(offset, offset + 4)].join(",");
}

describe("composeAvatarSheet", () => {
  const sheet = composeAvatarSheet(atlas(), find, meta, DEFAULT_AVATAR);

  it("makes a 5-column, 4-row sheet", () => {
    expect([sheet.width, sheet.height]).toEqual([15, 12]);
  });

  it("draws by layer order and replaces key colours", () => {
    expect(pixel(sheet, 1, 1)).toBe("17,34,51,255");
    expect(pixel(sheet, 1, 10)).toBe("68,85,102,255");
  });

  it("outlines the composed silhouette", () => {
    expect(pixel(sheet, 1, 0)).toBe("1,2,3,255");
    expect(pixel(sheet, 0, 0)).toBe("0,0,0,0");
  });

  it("throws on an unknown ramp", () => {
    const config = {
      ...DEFAULT_AVATAR,
      colors: { ...DEFAULT_AVATAR.colors, skin: "nope" },
    };
    expect(() => composeAvatarSheet(atlas(), find, meta, config)).toThrow(
      'Unknown skin ramp "nope"',
    );
  });
});

describe("avatarHash", () => {
  it("is equal for equal configs and differs when a colour changes", () => {
    expect(avatarHash({ ...DEFAULT_AVATAR })).toBe(avatarHash(DEFAULT_AVATAR));
    expect(
      avatarHash({
        ...DEFAULT_AVATAR,
        colors: { ...DEFAULT_AVATAR.colors, top: "coral" },
      }),
    ).not.toBe(avatarHash(DEFAULT_AVATAR));
  });
});
