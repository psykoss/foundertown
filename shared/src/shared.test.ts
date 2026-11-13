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
  DEPARTMENTS, DESK_SETUP, SPACE_MAX, SPACE_MIN, TILE, buildWorld, floorUsed, footprintOf, keepInside, mapOf, nearestFree, resizeSpace, sanitizeLayout, spaceAt, spaceFits,
  type Space,
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

describe("office", () => {
  const build = { x: 0, y: 3, w: 40, h: 23 };
  const space = (id: string, kind: string, x: number, y: number, w: number, h: number): Space => ({ id, kind, x, y, w, h });
  /** A bare office map: no tile layers, the prop and floor tilesets the layout needs, a 40×23 floor to build on. */
  const prop = (id: number, name: string, w: number, h: number, fw: number, fh: number, seat = "") => ({
    id, image: `../furniture/office/${name}.png`, imagewidth: w, imageheight: h,
    properties: [{ name: "footprintW", type: "int", value: fw }, { name: "footprintH", type: "int", value: fh }, ...(seat ? [{ name: "seat", type: "string", value: seat }] : [])],
  });
  const map: TiledMap = {
    type: "map", orientation: "orthogonal", width: 40, height: 26, tilewidth: 32, tileheight: 32,
    layers: [{ id: 1, name: "markers", type: "objectgroup", visible: true, opacity: 1, objects: [
      { id: 1, name: "floor", type: "zone", x: 0, y: 96, width: 1280, height: 736, properties: [{ name: "kind", type: "string", value: "build" }] },
    ] }],
    tilesets: [
      { firstgid: 1, name: "terrain", tilewidth: 32, tileheight: 32, tilecount: 32, columns: 8, tiles: DEPARTMENTS.map((d, i) => ({ id: 10 + i, properties: [{ name: "floor", type: "string", value: d.id }] })) },
      { firstgid: 33, name: "props", tilewidth: 160, tileheight: 160, tilecount: 9, columns: 0, tiles: [
        prop(5, "dual_monitor", 55, 25, 0, 0), prop(6, "mac_mini", 13, 10, 0, 0), prop(7, "mouse_mat", 21, 13, 0, 0), prop(8, "keyboard", 23, 8, 0, 0),
        prop(0, "desk", 85, 37, 3, 1), prop(1, "office_chair", 22, 20, 0, 0, "up"), prop(2, "plant_tree", 36, 62, 1, 1), prop(3, "plant_small", 28, 46, 1, 1), prop(4, "plant_pot", 11, 13, 0, 0),
      ] },
    ],
  };

  it("plays private lobbies on the office map", () => {
    expect(mapOf(MAIN_LOBBY)).toBe("town");
    expect(mapOf("abcd1234efgh")).toBe("office");
  });

  it("reads the buildable floor from the map, not as a zone", () => {
    const world = buildWorld(map);
    expect(world.build).toEqual(build);
    expect(world.zones).toEqual([]);
    expect(world.spaces).toEqual([]);
  });

  it("lets a space stand only where it fits", () => {
    const a = space("a", "sales", 2, 4, 10, 6);
    expect(spaceFits([], a, build)).toBe(true);
    expect(spaceFits([a], space("b", "finance", 11, 4, 9, 5), build)).toBe(false); // overlaps a
    expect(spaceFits([a], space("b", "finance", 12, 4, 9, 5), build)).toBe(true); // side by side, no gap needed
    expect(spaceFits([a], { ...a, x: 3 }, build)).toBe(true); // moving a itself
    expect(spaceFits([], space("c", "hq", 0, 2, 9, 6), build)).toBe(false); // on the back wall
    expect(spaceFits([], space("c", "hq", 32, 4, 9, 6), build)).toBe(false); // past the right edge
    expect(spaceFits([], space("c", "hq", 0, 3, SPACE_MIN.w - 1, 6), build)).toBe(false);
    expect(spaceFits([], space("c", "hq", 0, 3, SPACE_MAX.w + 1, 6), build)).toBe(false);
  });

  it("keeps a dragged or stretched space on the floor and within its size limits", () => {
    expect(keepInside(space("a", "hq", -3, 0, 9, 6), build)).toMatchObject({ x: 0, y: 3 });
    expect(keepInside(space("a", "hq", 38, 30, 9, 6), build)).toMatchObject({ x: 31, y: 20 });
    const s = space("a", "product", 10, 10, 9, 7);
    expect(resizeSpace(s, "e", 21, 0, build)).toMatchObject({ x: 10, w: 12, h: 7 });
    expect(resizeSpace(s, "e", 0, 0, build)).toMatchObject({ x: 10, w: SPACE_MIN.w }); // cannot shrink below one desk
    expect(resizeSpace(s, "e", 99, 0, build)).toMatchObject({ x: 10, w: SPACE_MAX.w });
    expect(resizeSpace(s, "nw", 8, 8, build)).toMatchObject({ x: 8, y: 8, w: 11, h: 9 }); // the far corner stays put
    expect(resizeSpace(s, "n", 0, -5, build)).toMatchObject({ y: 5, h: 12 }); // stops at the largest size
    expect(resizeSpace(space("a", "product", 10, 4, 9, 7), "n", 0, -5, build)).toMatchObject({ y: 3, h: 8 }); // and at the wall
    expect(resizeSpace(s, "s", 0, 99, build)).toMatchObject({ y: 10, h: SPACE_MAX.h });
  });

  it("stores only layouts that are well formed and fit", () => {
    const a = space("a", "sales", 2, 4, 10, 6);
    const raw = { spaces: [a, { ...a, id: "b" }, space("c", "nope", 20, 4, 9, 5), { ...a, id: "Bad Id", x: 20 }, space("d", "legal", 20, 4, 7, 7), { id: "e", kind: "hq", x: 1.5, y: 12, w: 9, h: 6 }, null, space("a", "hq", 28, 12, 9, 6)] };
    expect(sanitizeLayout(raw, build)).toEqual({ spaces: [a, space("d", "legal", 20, 4, 7, 7)] });
    expect(sanitizeLayout(raw, null)).toEqual({ spaces: [] }); // a map with nothing to build on
    expect(sanitizeLayout("nope", build)).toEqual({ spaces: [] });
    expect(floorUsed({ spaces: [a] }, build)).toBeCloseTo(60 / 920);
  });

  it("furnishes every department at every size without leaving the space or stacking furniture", () => {
    for (const d of DEPARTMENTS)
      for (let w = SPACE_MIN.w; w <= SPACE_MAX.w; w++)
        for (let h = SPACE_MIN.h; h <= SPACE_MAX.h; h++) {
          const s = space("a", d.id, 5, 6, w, h);
          const world = buildWorld(map, { spaces: [s] });
          const taken = new Set<string>();
          const desks = world.furniture.filter((f) => f.image === "desk.png");
          expect(desks.length, `${d.id} ${w}×${h}`).toBeGreaterThan(0);
          for (const f of world.furniture) {
            const fp = footprintOf(f);
            for (let y = fp.y; y < fp.y + fp.h; y++)
              for (let x = fp.x; x < fp.x + fp.w; x++) {
                expect(spaceAt([s], x, y), `${d.id} ${w}×${h}: ${f.image} at ${x},${y}`).toBe(s);
                expect(taken.has(`${x},${y}`), `${d.id} ${w}×${h}: two things on ${x},${y}`).toBe(false);
                taken.add(`${x},${y}`);
                expect(world.grid.isBlocked(x, y)).toBe(true);
              }
          }
          // every desk has its chair: a seat inside the space, on a free tile, that can be walked to from the floor outside
          expect(world.seats.length, `${d.id} ${w}×${h}`).toBe(desks.length);
          for (const seat of world.seats) {
            expect(spaceAt([s], seat.x, seat.y), `${d.id} ${w}×${h}: seat at ${seat.x},${seat.y}`).toBe(s);
            expect(taken.has(`${seat.x},${seat.y}`), `${d.id} ${w}×${h}: seat under furniture at ${seat.x},${seat.y}`).toBe(false);
            expect(world.grid.isSeat(seat.x, seat.y)).toBe(true);
            expect(findPath(world.grid, { x: 0, y: 4 }, seat), `${d.id} ${w}×${h}: seat at ${seat.x},${seat.y}`).not.toBeNull();
          }
        }
  });

  it("lays the layout over the map: floors, zones, collisions", () => {
    const s = space("a", "finance", 4, 6, 9, 5);
    const world = buildWorld(map, { spaces: [s] });
    expect(world.spaces).toEqual([{ ...s, floor: 1 + 10 + DEPARTMENTS.findIndex((d) => d.id === "finance") }]);
    expect(world.zones).toEqual([{ name: "Finance", kind: "space", x: 4 * TILE, y: 6 * TILE, width: 9 * TILE, height: 5 * TILE }]);
    // finance: two desks along the back; with no finance chair in this map the plain office chair stands in
    expect(world.furniture.filter((f) => f.image === "desk.png").map(footprintOf)).toEqual([{ x: 5, y: 7, w: 3, h: 1 }, { x: 9, y: 7, w: 3, h: 1 }]);
    // each chair is a seat facing its desk, on the tile below the middle of the desk — free to step onto
    const chairs = world.furniture.filter((f) => f.image === "office_chair.png");
    expect(world.seats).toEqual([{ x: 6, y: 8, dir: "up", depth: chairs[0]!.y }, { x: 10, y: 8, dir: "up", depth: chairs[1]!.y }]);
    expect(world.grid.isBlocked(6, 8)).toBe(false);
    // a route goes around a chair, and onto it only when the chair is where you are going
    expect(findPath(world.grid, { x: 5, y: 8 }, { x: 7, y: 8 })).toEqual([{ x: 5, y: 9 }, { x: 6, y: 9 }, { x: 7, y: 9 }, { x: 7, y: 8 }]);
    expect(findPath(world.grid, { x: 5, y: 8 }, { x: 6, y: 8 })).toEqual([{ x: 6, y: 8 }]);
    expect(findPath(world.grid, { x: 6, y: 8 }, { x: 7, y: 8 })).toEqual([{ x: 7, y: 8 }]); // standing up and walking off
    expect(world.grid.isBlocked(5, 7)).toBe(true);
    expect(world.grid.isBlocked(4, 7)).toBe(false);
    // every desk carries its computer, inside the desk's own outline (85×37 px, 6 px into its three tiles) and drawn over it
    for (const desk of world.furniture.filter((f) => f.image === "desk.png")) {
      const on = world.furniture.filter((f) => DESK_SETUP.some((d) => `${d.prop}.png` === f.image) && f.x >= desk.x && f.x + f.width <= desk.x + desk.width);
      expect(on.map((f) => f.image).sort()).toEqual(["dual_monitor.png", "keyboard.png", "mac_mini.png", "mouse_mat.png"]);
      // nothing in the front row of the desk sits on anything else there
      const front = on.filter((f) => f.image !== "dual_monitor.png").sort((a, b) => a.x - b.x);
      for (let i = 1; i < front.length; i++) expect(front[i]!.x).toBeGreaterThanOrEqual(front[i - 1]!.x + front[i - 1]!.width);
      for (const f of on) {
        expect(f.y).toBeLessThanOrEqual(desk.y - 9); // on the desk top, not on its front edge
        expect(f.y + f.z).toBeGreaterThan(desk.y);
        expect(f.footprint).toEqual({ w: 0, h: 0 });
      }
    }
    // someone under a desk is moved to the nearest free tile; someone on free floor stays
    expect(nearestFree(world, 6, 7)).toEqual({ x: 6, y: 6 });
    expect(nearestFree(world, 4, 7)).toEqual({ x: 4, y: 7 });
    expect(buildWorld(map).grid.isBlocked(5, 7)).toBe(false); // the bare map is untouched
  });
});
