/**
 * The office of a private lobby. Its owner lays out departments ("spaces") on the open floor of the
 * office map; a space is a rectangle of tiles with its own carpet and furniture, and no walls.
 *
 * Pure data + rules: the client edits and renders with them, the server validates with them, so a
 * layout means the same floor, the same furniture and the same collisions on both sides.
 * The layout is the only thing stored (`OfficeLayout`); the furniture of a space is derived from its
 * department and size (`furnish`), because spaces can be resized freely.
 */
import { parseWorld, prop, seatDir, seatOf, type FurnitureInstance, type Rect, type TiledMap, type WorldData } from "./map.js";
import type { Dir } from "./spec.js";
import { TILE } from "./spec.js";

/** How a department arranges its desks (see `furnish`). */
type Arrangement = "founder" | "rows" | "islands" | "staggered" | "wings" | "nook";

export interface Department {
  id: string;
  label: string;
  /** One line under the name in the catalog. */
  hint: string;
  /** What the room is for. */
  about: string;
  /** Accent of its chip and its minimap tint — a color of the game's ramps. */
  color: string;
  /** Prop its desks are paired with (falls back to `office_chair` on a map without it). */
  chair: string;
  arrangement: Arrangement;
  /** Size in tiles when first placed. */
  size: { w: number; h: number };
}

/**
 * The departments an office can have. `id` is also the `floor` property of the department's carpet
 * tile in the office map's terrain tileset.
 */
export const DEPARTMENTS: Department[] = [
  {
    id: "hq", label: "HQ", hint: "Founder's desk", color: "#efa948", chair: "office_chair_amber", arrangement: "founder", size: { w: 9, h: 6 },
    about: "Weekly goals, your 3–5 key metrics, the decisions log, and investor and advisor notes. The room that tells you whether the company is working.",
  },
  {
    id: "product", label: "Product", hint: "Roadmap and the current build", color: "#888dc9", chair: "office_chair", arrangement: "rows", size: { w: 9, h: 7 },
    about: "Roadmap, current build, bugs, and user feedback.",
  },
  {
    id: "sales", label: "Sales", hint: "Leads, pipeline and deals", color: "#e86c67", chair: "office_chair_coral", arrangement: "islands", size: { w: 10, h: 6 },
    about: "Leads, pipeline stages, follow-ups, demos and closed deals. Its own room, so selling never gets skipped.",
  },
  {
    id: "marketing", label: "Marketing", hint: "Content, channels and brand", color: "#579be0", chair: "office_chair_blue", arrangement: "staggered", size: { w: 9, h: 8 },
    about: "Content calendar, social channels, brand assets, and what is driving signups.",
  },
  {
    id: "finance", label: "Finance", hint: "Runway, burn and revenue", color: "#6fae81", chair: "office_chair_green", arrangement: "wings", size: { w: 9, h: 5 },
    about: "Runway, monthly burn, revenue, invoices, subscriptions, and tax deadlines.",
  },
  {
    id: "legal", label: "Legal & Admin", hint: "Documents and compliance", color: "#8995ab", chair: "office_chair_grey", arrangement: "nook", size: { w: 7, h: 7 },
    about: "Company documents, contracts, IP, accounts and passwords, and compliance.",
  },
];

export function department(id: string): Department | undefined {
  return DEPARTMENTS.find((d) => d.id === id);
}

/** One department placed on the floor. Position and size are in tiles. */
export interface Space extends Rect {
  id: string;
  /** DEPARTMENTS id */
  kind: string;
}

export interface OfficeLayout {
  spaces: Space[];
}

export const EMPTY_OFFICE: OfficeLayout = { spaces: [] };
/** Smallest space: one desk with its chair and room to walk around it. */
export const SPACE_MIN = { w: 5, h: 4 } as const;
export const SPACE_MAX = { w: 18, h: 12 } as const;
export const MAX_SPACES = 24;
const SPACE_ID = /^[a-z0-9]{1,16}$/;

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (r: Rect, outer: Rect) => r.x >= outer.x && r.y >= outer.y && r.x + r.w <= outer.x + outer.w && r.y + r.h <= outer.y + outer.h;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Is this a legal size for a space? */
export function validSize(w: number, h: number): boolean {
  return w >= SPACE_MIN.w && h >= SPACE_MIN.h && w <= SPACE_MAX.w && h <= SPACE_MAX.h;
}

/**
 * Can `space` stand here: a legal size, inside the buildable floor, and not on top of another space
 * (a space with the same id is the one being moved or resized, and is ignored)?
 */
export function spaceFits(spaces: Space[], space: Space, build: Rect): boolean {
  return validSize(space.w, space.h) && inside(space, build) && !spaces.some((o) => o.id !== space.id && overlaps(o, space));
}

/** Move a rectangle the shortest way back onto the buildable floor (its size is kept). */
export function keepInside<T extends Rect>(r: T, build: Rect): T {
  return { ...r, x: clamp(r.x, build.x, build.x + build.w - r.w), y: clamp(r.y, build.y, build.y + build.h - r.h) };
}

export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

/**
 * Drag one edge or corner of a space to tile (tx, ty): the opposite side stays put, and the result
 * is kept between the smallest and largest size and inside the buildable floor.
 */
export function resizeSpace<T extends Rect>(s: T, handle: Handle, tx: number, ty: number, build: Rect): T {
  let { x, y, w, h } = s;
  if (handle.includes("e")) w = clamp(tx - x + 1, SPACE_MIN.w, Math.min(SPACE_MAX.w, build.x + build.w - x));
  if (handle.includes("s")) h = clamp(ty - y + 1, SPACE_MIN.h, Math.min(SPACE_MAX.h, build.y + build.h - y));
  if (handle.includes("w")) {
    const right = x + w;
    x = clamp(tx, Math.max(build.x, right - SPACE_MAX.w), right - SPACE_MIN.w);
    w = right - x;
  }
  if (handle.includes("n")) {
    const bottom = y + h;
    y = clamp(ty, Math.max(build.y, bottom - SPACE_MAX.h), bottom - SPACE_MIN.h);
    h = bottom - y;
  }
  return { ...s, x, y, w, h };
}

/**
 * A layout as it may be stored and shared: only well-formed spaces of known departments that fit
 * the floor, in their original order (a space that collides with an earlier one is dropped).
 */
export function sanitizeLayout(raw: unknown, build: Rect | null): OfficeLayout {
  const list = (raw as { spaces?: unknown } | null)?.spaces;
  if (!build || !Array.isArray(list)) return { spaces: [] };
  const spaces: Space[] = [];
  for (const item of list.slice(0, MAX_SPACES * 4)) {
    const s = item as Partial<Space> | null;
    if (!s || typeof s.id !== "string" || !SPACE_ID.test(s.id) || typeof s.kind !== "string" || !department(s.kind)) continue;
    if (![s.x, s.y, s.w, s.h].every(Number.isInteger)) continue;
    const space: Space = { id: s.id, kind: s.kind, x: s.x!, y: s.y!, w: s.w!, h: s.h! };
    if (spaces.some((o) => o.id === space.id) || !spaceFits(spaces, space, build)) continue;
    spaces.push(space);
    if (spaces.length === MAX_SPACES) break;
  }
  return { spaces };
}

/** Share of the buildable floor taken by spaces, 0–1. */
export function floorUsed(layout: OfficeLayout, build: Rect | null): number {
  if (!build) return 0;
  return layout.spaces.reduce((sum, s) => sum + s.w * s.h, 0) / (build.w * build.h);
}

// ── furniture ──────────────────────────────────────────────────────────────────

/** A prop of the map's prop tileset, by name (file name without `.png`). */
export interface PropInfo {
  name: string;
  /** File name, as `FurnitureInstance.image`. */
  image: string;
  /** Image path as written in the map (relative to the map file). */
  path: string;
  w: number;
  h: number;
  footprint: { w: number; h: number };
  layer: string;
  /** Facing of someone sitting on it ("" = not a seat). */
  seat: Dir | "";
}

/** The props a map can place, and the terrain tile (gid) of each department's floor. */
export interface MapLibrary {
  props: Map<string, PropInfo>;
  floors: Map<string, number>;
}

export function mapLibrary(map: TiledMap): MapLibrary {
  const props = new Map<string, PropInfo>();
  const floors = new Map<string, number>();
  for (const ts of map.tilesets)
    for (const t of ts.tiles ?? []) {
      const floor = prop<string>(t.properties, "floor", "");
      if (floor) floors.set(floor, ts.firstgid + t.id);
      if (!t.image) continue;
      const image = t.image.split("/").pop()!;
      const w = t.imagewidth ?? 0;
      props.set(image.replace(/\.png$/, ""), {
        name: image.replace(/\.png$/, ""), image, path: t.image, w, h: t.imageheight ?? 0,
        footprint: { w: prop(t.properties, "footprintW", Math.round(w / TILE)), h: prop(t.properties, "footprintH", 1) },
        layer: prop(t.properties, "layer", ""),
        seat: seatDir(prop<string>(t.properties, "seat", "")),
      });
    }
  return { props, floors };
}

/** A prop standing in a space: on tile (tx, ty) of the space, centered across `span` tiles, nudged by (dx, dy) px. */
interface Placement {
  prop: string;
  tx: number;
  ty: number;
  span: number;
  dy: number;
  dx: number;
  /** Depth offset (things standing on a desk). */
  z: number;
}

const DESK_W = 3;
/** A desk with its chair: 3 tiles wide, 2 deep (desk row, then the chair row). */
const STATION_H = 2;

/**
 * The furniture of a `w`×`h` space of a department, in tiles relative to the space. The outer ring
 * of tiles carries nothing but corner plants, so spaces can touch and still be walked around.
 * Chairs are seats: nothing blocks their tile, and standing on it sits you down at the desk.
 */
function arrange(dept: Department, w: number, h: number): Placement[] {
  const out: Placement[] = [];
  const put = (name: string, tx: number, ty: number, span = 1, dy = 0, dx = 0, z = 0) => out.push({ prop: name, tx, ty, span, dy, dx, z });
  let desks = 0;
  /** A desk on row `ty` with its chair on the row below; every third desk carries a small plant. */
  const station = (tx: number, ty: number) => {
    put("desk", tx, ty, DESK_W);
    put(dept.chair, tx, ty + 1, DESK_W, -6);
    if (desks++ % 3 === 0) put("plant_pot", tx + 2, ty, 1, -22, 4, 30);
  };
  /** How many stations fit side by side / one below the other with `gap` free tiles between them. */
  const across = (gap: number) => Math.max(1, Math.floor((w - 2 + gap) / (DESK_W + gap)));
  const down = (gap: number) => Math.max(1, Math.floor((h - 2 + gap) / (STATION_H + gap)));
  /** Left tile of a centered run of `n` stations. */
  const start = (n: number, gap: number) => Math.floor((w - (n * DESK_W + (n - 1) * gap)) / 2);
  const corners = (name: string, bottom = false) => {
    put(name, 0, 0);
    put(name, w - 1, 0);
    if (bottom && h >= 6) {
      put("plant_small", 0, h - 1);
      put("plant_small", w - 1, h - 1);
    }
  };

  switch (dept.arrangement) {
    case "founder": {
      // one desk in the middle of the room, plants in the corners; a wide room adds a desk on each side
      const ty = h >= 6 ? 2 : 1;
      const mid = Math.floor((w - DESK_W) / 2);
      station(mid, ty);
      if (mid - 2 >= 1 + DESK_W) {
        station(1, ty);
        station(w - 1 - DESK_W, ty);
      }
      corners("plant_tree", true);
      break;
    }
    case "rows": {
      // a tight grid of desks
      const n = across(1), m = down(1), x0 = start(n, 1);
      for (let r = 0; r < m; r++) for (let c = 0; c < n; c++) station(x0 + c * (DESK_W + 1), 1 + r * (STATION_H + 1));
      break;
    }
    case "islands": {
      // desks standing apart, wide aisles between them
      const n = across(2), m = down(2), x0 = start(n, 2);
      const y0 = 1 + Math.floor((h - 2 - (m * STATION_H + (m - 1) * 2)) / 2);
      for (let r = 0; r < m; r++) for (let c = 0; c < n; c++) station(x0 + c * (DESK_W + 2), y0 + r * (STATION_H + 2));
      if (x0 > 1) corners("plant_small");
      break;
    }
    case "staggered": {
      // every other row is shifted half a desk, with a plant at each end
      const n = across(1), m = down(1), x0 = start(n, 1);
      for (let r = 0; r < m; r++) {
        const ty = 1 + r * (STATION_H + 1);
        const shifted = r % 2 === 1 && n > 1;
        for (let c = 0; c < (shifted ? n - 1 : n); c++) station(x0 + c * (DESK_W + 1) + (shifted ? 2 : 0), ty);
        if (shifted) {
          put("plant_small", x0, ty);
          put("plant_small", x0 + n * (DESK_W + 1) - 2, ty);
        }
      }
      break;
    }
    case "wings": {
      // a row of desks at the back, another at the front of a deep room, open floor between them
      const n = across(1), x0 = start(n, 1);
      for (let c = 0; c < n; c++) station(x0 + c * (DESK_W + 1), 1);
      if (h >= 8) for (let c = 0; c < n; c++) station(x0 + c * (DESK_W + 1), h - 1 - STATION_H);
      if (x0 > 1) corners("plant_tree");
      break;
    }
    case "nook": {
      // desks down the left side (and the right side of a wide room), plants on the far wall
      const m = down(1);
      const two = w >= 2 * DESK_W + 4;
      for (let r = 0; r < m; r++) {
        station(1, 1 + r * (STATION_H + 1));
        if (two) station(w - 1 - DESK_W, 1 + r * (STATION_H + 1));
      }
      if (!two) {
        put("plant_tree", w - 1, 0);
        if (h >= 6) put("plant_small", w - 1, h - 1);
      }
      break;
    }
  }
  return out;
}

/** Tile area a piece of furniture blocks (Tiled objects are anchored bottom-left). */
export function footprintOf(f: FurnitureInstance): Rect {
  const tyBottom = Math.round(f.y / TILE) - 1;
  return { x: Math.round(f.x / TILE), y: tyBottom - f.footprint.h + 1, w: f.footprint.w, h: f.footprint.h };
}

/** The furniture of a space, placed in the world. Props the map does not have are left out. */
export function furnish(space: Space, lib: MapLibrary, firstId = 0): FurnitureInstance[] {
  const dept = department(space.kind);
  if (!dept) return [];
  const out: FurnitureInstance[] = [];
  for (const p of arrange(dept, space.w, space.h)) {
    const info = lib.props.get(p.prop) ?? (p.prop === dept.chair ? lib.props.get("office_chair") : undefined);
    if (!info) continue;
    out.push({
      id: firstId + out.length,
      image: info.image,
      x: (space.x + p.tx) * TILE + Math.round((p.span * TILE - info.w) / 2) + p.dx,
      y: (space.y + p.ty + 1) * TILE + p.dy,
      width: info.w,
      height: info.h,
      footprint: info.footprint,
      layer: info.layer,
      z: p.z,
      seat: info.seat,
    });
  }
  return out;
}

/** First id given to furniture that comes from the layout (map objects keep their Tiled ids). */
const LAYOUT_FURNITURE_ID = 100_000;

/**
 * The world of a lobby: the map, plus the office layout laid over it (floors, furniture, collisions,
 * one zone per space). The layout is applied as given — `sanitizeLayout` it first unless it is a
 * preview that may show spaces that do not fit.
 */
export function buildWorld(map: TiledMap, layout: OfficeLayout = EMPTY_OFFICE): WorldData {
  const world = parseWorld(map);
  if (!layout.spaces.length) return world;
  const lib = mapLibrary(map);
  for (const space of layout.spaces) {
    const dept = department(space.kind);
    if (!dept) continue;
    for (const f of furnish(space, lib, LAYOUT_FURNITURE_ID + world.furniture.length)) {
      world.furniture.push(f);
      const fp = footprintOf(f);
      world.grid.blockRect(fp.x, fp.y, fp.w, fp.h);
      const seat = seatOf(f);
      if (seat) {
        world.seats.push(seat);
        world.grid.setSeat(seat.x, seat.y);
      }
    }
    world.spaces.push({ ...space, floor: lib.floors.get(dept.id) ?? 0 });
    world.zones.push({ name: dept.label, kind: "space", x: space.x * TILE, y: space.y * TILE, width: space.w * TILE, height: space.h * TILE });
  }
  return world;
}

/** The space a tile belongs to, if any. */
export function spaceAt<T extends Rect>(spaces: T[], tx: number, ty: number): T | undefined {
  return spaces.find((s) => tx >= s.x && ty >= s.y && tx < s.x + s.w && ty < s.y + s.h);
}

/** Closest tile to (x, y) that can be stood on (itself if free) — where someone goes when furniture lands on them. */
export function nearestFree(world: WorldData, x: number, y: number): { x: number; y: number } | null {
  const { grid, width, height } = world;
  for (let r = 0; r < Math.max(width, height); r++) {
    // the ring of tiles r steps away: the closest free one wins
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || grid.isBlocked(x + dx, y + dy)) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = { x: x + dx, y: y + dy };
        }
      }
    if (best) return best;
  }
  return null;
}
