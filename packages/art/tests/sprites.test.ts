import { CHARACTER_PARTS, partsForAvatar } from "../tools/lib/derive";
import {
  CHARACTER_ANCHOR,
  CHARACTER_LAYERS,
  CHARACTER_SIZE,
  DEFAULT_AVATAR,
  DIRECTIONS,
  FRAME_KEYS,
  TILE,
} from "@founder-town/shared";
import { describe, expect, it } from "vitest";
import {
  CHARACTER_PART_SOURCES,
  DEFAULT_RAMPS,
  LAYER_ORDER,
  OUTLINE_COLOR,
  PALETTE,
  PROPS,
  RAMPS,
  SLOTS,
} from "../src/index";
import { composeAvatar } from "../tools/lib/compile";
import { isOpaque } from "../tools/lib/raster";
import { allSprites, charErrors, sizeErrors } from "../tools/lib/validate";
import type { SpriteCheck } from "../tools/lib/validate";

const HEX = /^#[0-9a-fA-F]{6}$/;
const sprites = allSprites().map((sprite) => [sprite.name, sprite] as const);

describe("every sprite", () => {
  it.each(sprites)("%s has the right dimensions", (_name, sprite) => {
    expect(sizeErrors(sprite)).toEqual([]);
  });

  it.each(sprites)("%s only uses valid characters", (_name, sprite) => {
    expect(charErrors(sprite)).toEqual([]);
  });
});

describe("the validators", () => {
  const good: SpriteCheck = {
    name: "sample",
    grid: ["..", ".."],
    width: 2,
    height: 2,
    allowed: new Set(["."]),
  };

  it("accepts a valid sprite", () => {
    expect([...sizeErrors(good), ...charErrors(good)]).toEqual([]);
  });

  it("reports a row that is too long", () => {
    expect(sizeErrors({ ...good, grid: ["...", ".."] })).toEqual([
      "sample: row 0 is 3px, expected 2px",
    ]);
  });

  it("reports a missing row", () => {
    expect(sizeErrors({ ...good, grid: [".."] })).toHaveLength(1);
  });

  it("reports an unknown character", () => {
    expect(charErrors({ ...good, grid: ["..", ".?"] })).toEqual([
      'sample: invalid char "?" at 1,1',
    ]);
  });
});

describe("character parts", () => {
  it.each(CHARACTER_PARTS.map((part) => [part.id, part.layer, part] as const))(
    "%s %s has every direction and frame",
    (_id, _layer, part) => {
      expect(Object.keys(part.frames).sort()).toEqual([...FRAME_KEYS].sort());
    },
  );

  it("share one anchor and canvas", () => {
    for (const part of CHARACTER_PARTS) {
      expect(part.anchor).toEqual(CHARACTER_ANCHOR);
      for (const key of FRAME_KEYS) {
        expect(part.frames[key].length).toBe(CHARACTER_SIZE.h);
        expect(part.frames[key][0]?.length).toBe(CHARACTER_SIZE.w);
      }
    }
  });

  it("leave a transparent edge for the outline", () => {
    for (const part of CHARACTER_PARTS) {
      for (const key of FRAME_KEYS) {
        const grid = part.frames[key];
        expect(grid[0]).toMatch(/^\.+$/);
        expect(grid[grid.length - 1]).toMatch(/^\.+$/);
        for (const row of grid) {
          expect(row[0]).toBe(".");
          expect(row[row.length - 1]).toBe(".");
        }
      }
    }
  });

  it("place the body's feet directly above the anchor", () => {
    for (const part of CHARACTER_PARTS.filter((p) => p.layer === "body")) {
      for (const key of FRAME_KEYS) {
        const lowest = part.frames[key].findLastIndex((row) =>
          /[^.]/.test(row),
        );
        expect(lowest).toBe(CHARACTER_ANCHOR.y - 1);
      }
    }
  });
});

describe("default avatar, front idle", () => {
  it("matches the outlined size in docs/STYLE.md", () => {
    const avatar = composeAvatar(
      partsForAvatar(DEFAULT_AVATAR),
      DEFAULT_RAMPS,
      "down",
      "idle",
    );
    const xs: number[] = [];
    const ys: number[] = [];
    for (let y = 0; y < avatar.height; y++) {
      for (let x = 0; x < avatar.width; x++) {
        if (isOpaque(avatar, x, y)) {
          xs.push(x);
          ys.push(y);
        }
      }
    }
    expect(Math.max(...xs) - Math.min(...xs) + 1).toBe(20);
    expect(Math.max(...ys) - Math.min(...ys) + 1).toBe(36);
  });
});

describe("derived frames", () => {
  const body = CHARACTER_PARTS.find((part) => part.layer === "body");
  const source = CHARACTER_PART_SOURCES.find((part) => part.layer === "body");

  it("uses each drawn view unchanged for idle", () => {
    expect(body?.frames.down_idle).toEqual(source?.front);
    expect(body?.frames.right_idle).toEqual(source?.side);
    expect(body?.frames.up_idle).toEqual(source?.back);
  });

  it("makes every walk frame differ from idle", () => {
    for (const direction of DIRECTIONS) {
      for (const frame of [0, 1, 2, 3] as const) {
        expect(body?.frames[`${direction}_${frame}`]).not.toEqual(
          body?.frames[`${direction}_idle`],
        );
      }
    }
  });

  it("removes the face from the back view", () => {
    expect(body?.frames.up_idle.join("")).not.toMatch(/[kr]/);
  });

  it("mirrors left from right and keeps the shaded side on the right", () => {
    const right = body?.frames.right_idle[20] ?? "";
    const left = body?.frames.left_idle[20] ?? "";
    expect(left.replace(/S/g, "s")).toBe(
      [...right.replace(/S/g, "s")].reverse().join(""),
    );
    expect(left.trimEnd().replace(/\.+$/, "").endsWith("S")).toBe(true);
  });
});

describe("layer order", () => {
  it.each(DIRECTIONS)("%s draws every layer exactly once", (direction) => {
    expect([...LAYER_ORDER[direction]].sort()).toEqual(
      [...CHARACTER_LAYERS].sort(),
    );
  });
});

describe("props", () => {
  it.each(PROPS.map((prop) => [prop.id, prop] as const))(
    "%s has a collision box inside its footprint",
    (_id, prop) => {
      const { x, y, w, h } = prop.collision;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + w).toBeLessThanOrEqual(prop.footprint.w * TILE);
      expect(y + h).toBeLessThanOrEqual(prop.footprint.h * TILE);
    },
  );
});

describe("palette", () => {
  const paletteChars = Object.keys(PALETTE);
  const slotChars = Object.keys(SLOTS);
  const slotKeys = Object.values(SLOTS).map((slot) => slot.key);

  it("uses single-character keys, excluding transparent", () => {
    for (const char of [...paletteChars, ...slotChars]) {
      expect(char).toHaveLength(1);
      expect(char).not.toBe(".");
    }
  });

  it("keeps palette and slot characters separate", () => {
    expect(paletteChars.filter((char) => char in SLOTS)).toEqual([]);
  });

  it("only contains #RRGGBB colours", () => {
    const ramps = Object.values(RAMPS).flatMap((group) =>
      Object.values(group).flatMap((ramp) => [ramp.light, ramp.dark]),
    );
    for (const color of [
      ...Object.values(PALETTE),
      ...ramps,
      ...slotKeys,
      OUTLINE_COLOR,
    ]) {
      expect(color).toMatch(HEX);
    }
  });

  it("reserves unique slot key colours", () => {
    expect(new Set(slotKeys).size).toBe(slotKeys.length);
    expect(
      slotKeys.filter((key) => Object.values(PALETTE).includes(key)),
    ).toEqual([]);
  });

  it("gives every slot a ramp with at least one colour set", () => {
    for (const slot of Object.values(SLOTS)) {
      expect(Object.keys(RAMPS[slot.ramp]).length).toBeGreaterThan(0);
    }
  });
});
