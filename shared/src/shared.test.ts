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
  sanitizeFounder, sanitizeName, isLobby, voiceVolume, BUILDING_MAX, MAIN_LOBBY, VOICE,
  weekDays, startOfWeek, monthDays, sameDay, layoutDay, dueReminders, sanitizeMeetings, MIN_BLOCK_MIN, type Meeting,
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

describe("thin walls (edges)", () => {
  it("blocks crossing an edge but not standing next to it", () => {
    const g = new CollisionGrid(3, 2);
    g.blockEdge(1, 0, "W"); // wall between (0,0) and (1,0)
    expect(g.canStep(0, 0, 1, 0)).toBe(false);
    expect(g.canStep(1, 0, 0, 0)).toBe(false);
    expect(g.canStep(0, 1, 1, 1)).toBe(true);
    let w = createWalker(0, 0);
    w = stepWalker(w, "right", 16, 100, g);
    expect(w).toMatchObject({ tileX: 0, moving: false, dir: "right" });
    const p = findPath(g, { x: 0, y: 0 }, { x: 1, y: 0 })!;
    expect(p.length).toBe(3); // goes around through row 1
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
    swapPixels(px, buildSwapTable({ primary: CLOTH_RAMPS.coral! }));
    expect([...px.slice(0, 3)]).toEqual(hexToRgb(CLOTH_RAMPS.coral![2]));
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

describe("founder profile", () => {
  it("drops unknown answers and trims text", () => {
    const f = sanitizeFounder({ stage: "series_a", building: "  x ".padEnd(200, "y"), goals: ["learn", "nope", "learn"], heard: 7 });
    expect(f.stage).toBe("series_a");
    expect(f.building.length).toBe(BUILDING_MAX);
    expect(f.goals).toEqual(["learn"]);
    expect(f.heard).toBe("");
    expect(sanitizeFounder(null)).toEqual({ stage: "", building: "", goals: [], heard: "" });
  });
  it("falls back for empty names", () => {
    expect(sanitizeName("  ")).toBe("Founder");
    expect(sanitizeName("a".repeat(40)).length).toBe(24);
  });
});

describe("protocol", () => {
  it("accepts the main lobby and well-formed codes only", () => {
    expect(isLobby(MAIN_LOBBY)).toBe(true);
    expect(isLobby("a1b2c3d4e5f6")).toBe(true);
    expect(isLobby("short")).toBe(false);
    expect(isLobby("../etc/passwd")).toBe(false);
    expect(isLobby(undefined)).toBe(false);
  });
  it("fades voice with distance", () => {
    expect(voiceVolume(0)).toBe(1);
    expect(voiceVolume(VOICE.full)).toBe(1);
    expect(voiceVolume(VOICE.silent)).toBe(0);
    expect(voiceVolume((VOICE.full + VOICE.silent) / 2)).toBeCloseTo(0.5);
    expect(VOICE.disconnect).toBeGreaterThan(VOICE.connect);
  });
});

describe("calendar", () => {
  const at = (day: number, h: number, m = 0) => new Date(2026, 10, day, h, m).getTime(); // November 2026
  const meet = (id: string, start: number, end: number): Meeting => ({ id, title: id, start, end, notes: "" });

  it("finds the week and the month grid", () => {
    // 12 Nov 2026 is a Thursday
    expect(weekDays(at(12, 15), 0).map((d) => d.getDate())).toEqual([8, 9, 10, 11, 12, 13, 14]);
    expect(weekDays(at(12, 15), 1).map((d) => d.getDate())).toEqual([9, 10, 11, 12, 13, 14, 15]);
    expect(startOfWeek(at(8, 0), 1).getDate()).toBe(2); // a Sunday belongs to the week that started on Monday
    const month = monthDays(at(12, 15), 0);
    expect(month).toHaveLength(42);
    expect([month[0]!.getMonth(), month[0]!.getDate()]).toEqual([10, 1]); // 1 Nov 2026 is a Sunday
    expect(sameDay(at(12, 0), at(12, 23, 59))).toBe(true);
    expect(sameDay(at(12, 23, 59), at(13, 0))).toBe(false);
  });

  it("lays overlapping meetings side by side", () => {
    const blocks = layoutDay([meet("a", at(12, 9), at(12, 10)), meet("b", at(12, 9, 30), at(12, 11)), meet("c", at(12, 10), at(12, 10, 30)), meet("d", at(12, 14), at(12, 15))], at(12, 0));
    const by = Object.fromEntries(blocks.map((b) => [b.meeting.id, b]));
    expect([by.a!.from, by.a!.to]).toEqual([540, 600]);
    expect([by.a!.lane, by.b!.lane, by.c!.lane]).toEqual([0, 1, 0]); // c reuses a's lane once a is over
    expect([by.a!.lanes, by.b!.lanes, by.c!.lanes, by.d!.lanes]).toEqual([2, 2, 2, 1]);
  });

  it("clips a meeting to each day it touches", () => {
    const late = meet("late", at(12, 23), at(13, 1));
    expect(layoutDay([late], at(12, 0)).map((b) => [b.from, b.to])).toEqual([[1380, 1440]]);
    expect(layoutDay([late], at(13, 0)).map((b) => [b.from, b.to])).toEqual([[0, 60]]);
    expect(layoutDay([late], at(14, 0))).toEqual([]);
    // a 5-minute meeting still gets a readable block
    expect(layoutDay([meet("short", at(12, 9), at(12, 9, 5))], at(12, 0))[0]!.to).toBe(540 + MIN_BLOCK_MIN);
  });

  it("reminds once before and once at the start", () => {
    const m = meet("m", at(12, 9), at(12, 10));
    const both = { soon: true, now: true };
    expect(dueReminders([m], at(12, 8, 54), at(12, 8, 55), both)).toEqual([{ meeting: m, kind: "soon" }]);
    expect(dueReminders([m], at(12, 8, 55), at(12, 8, 56), both)).toEqual([]);
    expect(dueReminders([m], at(12, 8, 59), at(12, 9), both)).toEqual([{ meeting: m, kind: "now" }]);
    expect(dueReminders([m], at(12, 8, 54), at(12, 8, 55), { soon: false, now: true })).toEqual([]);
    // the tab slept through both moments: only "now" is said
    expect(dueReminders([m], at(12, 8), at(12, 9, 1), both)).toEqual([{ meeting: m, kind: "now" }]);
  });

  it("drops malformed stored meetings", () => {
    expect(sanitizeMeetings("nope")).toEqual([]);
    expect(sanitizeMeetings([{ id: "x", title: " Demo ", start: 2, end: 3 }, { id: "y", title: "bad", start: 5, end: 5 }, null, { id: "z", title: "", start: 0, end: 1 }]))
      .toEqual([{ id: "z", title: "Meeting", start: 0, end: 1, notes: "" }, { id: "x", title: "Demo", start: 2, end: 3, notes: "" }]);
  });
});
