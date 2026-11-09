import { describe, expect, it } from "vitest";
import {
  CollisionGrid,
  createWalker,
  stepWalker,
  walkerPos,
  findPath,
  buildSwapTable,
  swapPixels,
  KEY_RAMPS,
  hexToRgb,
  CLOTH_RAMPS,
  sheetFrame,
  SHEET_COLS,
  sheetDirFor,
  avatarKey,
  DEFAULT_AVATAR,
  sanitizeAvatar,
  parseWorld,
  type TiledMap,
} from "./index.js";

describe("movement", () => {
  const grid = new CollisionGrid(5, 5);
  grid.setBlocked(2, 1);

  it("moves one tile per step and interpolates", () => {
    let w = createWalker(1, 1);
    w = stepWalker(w, "down", 0, 100, grid);
    expect(w.moving).toBe(true);
    w = stepWalker(w, "down", 50, 100, grid);
    expect(walkerPos(w).y).toBeCloseTo(1.5);
    w = stepWalker(w, null, 50, 100, grid);
    expect(w).toMatchObject({ tileX: 1, tileY: 2, moving: false });
  });

  it("turns in place against a wall", () => {
    let w = createWalker(1, 1, "down");
    w = stepWalker(w, "right", 16, 100, grid);
    expect(w).toMatchObject({ tileX: 1, tileY: 1, dir: "right", moving: false });
  });

  it("chains steps keeping constant speed", () => {
    let w = createWalker(0, 0);
    w = stepWalker(w, "down", 0, 100, grid);
    w = stepWalker(w, "down", 130, 100, grid);
    expect(w.tileY).toBe(1);
    expect(w.progress).toBeCloseTo(0.3);
  });

  it("blocks out of bounds", () => {
    const w = stepWalker(createWalker(0, 0), "up", 16, 100, grid);
    expect(w.moving).toBe(false);
  });
});

describe("pathfinding", () => {
  it("routes around walls", () => {
    const g = new CollisionGrid(5, 3);
    g.blockRect(2, 0, 1, 2);
    const p = findPath(g, { x: 0, y: 0 }, { x: 4, y: 0 })!;
    expect(p.at(-1)).toEqual({ x: 4, y: 0 });
    expect(p.some((t) => t.x === 2 && t.y === 2)).toBe(true);
  });
  it("returns null for blocked goal", () => {
    const g = new CollisionGrid(3, 3);
    g.setBlocked(2, 2);
    expect(findPath(g, { x: 0, y: 0 }, { x: 2, y: 2 })).toBeNull();
  });
});

describe("palette swap", () => {
  it("replaces key ramp pixels only", () => {
    const [r, g, b] = hexToRgb(KEY_RAMPS.primary[2]);
    const px = new Uint8ClampedArray([r, g, b, 255, 10, 20, 30, 255]);
    swapPixels(px, buildSwapTable({ primary: CLOTH_RAMPS.red! }));
    expect([...px.slice(0, 3)]).toEqual(hexToRgb(CLOTH_RAMPS.red![2]));
    expect([...px.slice(4, 7)]).toEqual([10, 20, 30]);
  });
});

describe("sheet template", () => {
  it("indexes frames anim-major", () => {
    expect(sheetFrame("idle", "down", 0)).toBe(0);
    expect(sheetFrame("walk", "down", 2)).toBe(3 * SHEET_COLS + 2);
    expect(sheetDirFor("right")).toEqual({ sheetDir: "left", flipX: true });
  });
});

describe("avatar", () => {
  it("has stable cache keys", () => {
    expect(avatarKey(DEFAULT_AVATAR)).toBe(avatarKey(structuredClone(DEFAULT_AVATAR)));
  });
  it("sanitizes unknown items", () => {
    const reg = { version: 1, items: [{ id: "body_01", slot: "body" as const, name: "", parts: [], channels: [] }] };
    const a = sanitizeAvatar({ skin: "nope", slots: { headwear: { id: "ghost" } } }, reg);
    expect(a.skin).toBe("light");
    expect(a.slots.headwear).toBeNull();
  });
});

describe("map parsing", () => {
  it("builds collisions from layer + furniture footprints", () => {
    const map: TiledMap = {
      width: 4, height: 4, tilewidth: 32, tileheight: 32, orientation: "orthogonal", type: "map",
      tilesets: [{ firstgid: 1, name: "f", tilewidth: 64, tileheight: 64, tilecount: 1, columns: 0,
        tiles: [{ id: 0, image: "../f/desk.png", properties: [{ name: "footprintW", type: "int", value: 2 }] }] }],
      layers: [
        { id: 1, name: "collision", type: "tilelayer", data: [1, 0, 0, 0, ...Array(12).fill(0)], visible: true, opacity: 1 },
        { id: 2, name: "objects", type: "objectgroup", visible: true, opacity: 1,
          objects: [{ id: 5, name: "", x: 64, y: 128, width: 64, height: 48, gid: 1 },
                    { id: 6, name: "main", type: "spawn", x: 16, y: 48, width: 0, height: 0 }] },
      ],
    };
    const w = parseWorld(map);
    expect(w.grid.isBlocked(0, 0)).toBe(true);
    expect(w.grid.isBlocked(2, 3)).toBe(true);
    expect(w.grid.isBlocked(3, 3)).toBe(true);
    expect(w.grid.isBlocked(2, 2)).toBe(false);
    expect(w.spawns[0]).toEqual({ name: "main", tileX: 0, tileY: 1 });
  });
});
