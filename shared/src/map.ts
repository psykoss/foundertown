/**
 * Minimal Tiled JSON (.tmj) types + parsing into engine data.
 * The map is DATA: rooms, collisions, spawns, portals and furniture all come from Tiled.
 */
import { CollisionGrid } from "./grid.js";
import { DIRS, TILE, type Dir } from "./spec.js";

export interface TiledProperty {
  name: string;
  type: string;
  value: string | number | boolean;
}

export interface TiledObject {
  id: number;
  name: string;
  type?: string;
  class?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  gid?: number;
  properties?: TiledProperty[];
}

export interface TiledLayer {
  id: number;
  name: string;
  type: "tilelayer" | "objectgroup";
  width?: number;
  height?: number;
  data?: number[];
  objects?: TiledObject[];
  visible: boolean;
  opacity: number;
  properties?: TiledProperty[];
}

export interface TiledTile {
  id: number;
  image?: string;
  imagewidth?: number;
  imageheight?: number;
  properties?: TiledProperty[];
}

export interface TiledTileset {
  firstgid: number;
  name: string;
  tilewidth: number;
  tileheight: number;
  tilecount: number;
  columns: number;
  image?: string;
  imagewidth?: number;
  imageheight?: number;
  tiles?: TiledTile[];
}

export interface TiledMap {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: TiledLayer[];
  tilesets: TiledTileset[];
  orientation: "orthogonal";
  type: "map";
}

export function prop<T extends string | number | boolean>(
  props: TiledProperty[] | undefined,
  name: string,
  fallback: T,
): T {
  const p = props?.find((x) => x.name === name);
  return (p?.value as T) ?? fallback;
}

export interface FurnitureInstance {
  id: number;
  image: string; // file name, e.g. "desk.png"
  x: number; // pixel, bottom-left (Tiled tile-object convention)
  y: number;
  width: number;
  height: number;
  footprint: { w: number; h: number }; // tiles, anchored at bottom-left
  /** "floor" = drawn under characters (rugs); otherwise y-sorted */
  layer: string;
  /** depth offset in px (e.g. items standing on a counter) */
  z: number;
  /** A chair: the direction someone sitting on it faces ("" = not a seat). Seats have no footprint. */
  seat: Dir | "";
}

/** Somewhere to sit: standing still on this tile, a character sits down. */
export interface Seat {
  /** Tile the seat is on. */
  x: number;
  y: number;
  /** Facing while seated. */
  dir: Dir;
  /** Depth (px) of the chair itself — the sitter is drawn just behind or in front of it. */
  depth: number;
}

/** Tile property `seat` (a direction) of a prop, or "" if it is not one. */
export function seatDir(value: unknown): Dir | "" {
  return DIRS.includes(value as Dir) ? (value as Dir) : "";
}

/** The seat a piece of furniture offers, on the tile under its base. */
export function seatOf(f: FurnitureInstance): Seat | null {
  if (!f.seat) return null;
  return { x: Math.floor((f.x + f.width / 2) / TILE), y: Math.floor((f.y - 1) / TILE), dir: f.seat, depth: f.y + f.z };
}

export interface Spawn {
  name: string;
  tileX: number;
  tileY: number;
}

export interface Zone {
  name: string;
  kind: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A rectangle of tiles. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A department of the office layout as it stands in the world (see `office.ts`). */
export interface PlacedSpace extends Rect {
  id: string;
  kind: string;
  /** Terrain tile (gid) of its floor; 0 = the map has no floor for it. */
  floor: number;
}

export interface WorldData {
  width: number;
  height: number;
  grid: CollisionGrid;
  furniture: FurnitureInstance[];
  spawns: Spawn[];
  zones: Zone[];
  /** Floor the owner can lay spaces on (a zone of kind "build"), or null on a map that cannot be edited. */
  build: Rect | null;
  /** Spaces of the office layout laid over the map (`buildWorld`); a bare map has none. */
  spaces: PlacedSpace[];
  /** Chairs (from the map and from the office layout). Their tiles are also marked in the grid. */
  seats: Seat[];
}

function tileForGid(map: TiledMap, gid: number): { ts: TiledTileset; tile?: TiledTile } | null {
  const realGid = gid & 0x1fffffff; // strip flip flags
  let found: TiledTileset | null = null;
  for (const ts of map.tilesets) if (ts.firstgid <= realGid && (!found || ts.firstgid > found.firstgid)) found = ts;
  if (!found) return null;
  const localId = realGid - found.firstgid;
  return { ts: found, tile: found.tiles?.find((t) => t.id === localId) };
}

export function parseWorld(map: TiledMap): WorldData {
  const grid = new CollisionGrid(map.width, map.height);

  const collision = map.layers.find((l) => l.name === "collision" && l.type === "tilelayer");
  collision?.data?.forEach((gid, i) => {
    if (gid !== 0) grid.setBlocked(i % map.width, Math.floor(i / map.width));
  });

  // Thin walls: tiles in the "edges" layer carry a "side" property (W or N) on their tileset tile.
  const edgeLayer = map.layers.find((l) => l.name === "edges" && l.type === "tilelayer");
  edgeLayer?.data?.forEach((gid, i) => {
    if (!gid) return;
    const side = prop<string>(tileForGid(map, gid)?.tile?.properties, "side", "");
    if (side === "W" || side === "N") grid.blockEdge(i % map.width, Math.floor(i / map.width), side);
  });

  const furniture: FurnitureInstance[] = [];
  const spawns: Spawn[] = [];
  const zones: Zone[] = [];
  const seats: Seat[] = [];
  let build: Rect | null = null;

  for (const layer of map.layers) {
    if (layer.type !== "objectgroup" || !layer.objects) continue;
    for (const o of layer.objects) {
      const kind = o.type ?? o.class ?? "";
      if (o.gid) {
        const hit = tileForGid(map, o.gid);
        if (!hit?.tile?.image) continue;
        const fw = prop(hit.tile.properties, "footprintW", Math.round(o.width / TILE));
        const fh = prop(hit.tile.properties, "footprintH", 1);
        const image = hit.tile.image.split("/").pop()!;
        const layer = prop(hit.tile.properties, "layer", "");
        const z = prop(o.properties, "z", 0);
        const piece: FurnitureInstance = { id: o.id, image, x: o.x, y: o.y, width: o.width, height: o.height, footprint: { w: fw, h: fh }, layer, z, seat: seatDir(prop<string>(hit.tile.properties, "seat", "")) };
        furniture.push(piece);
        const seat = seatOf(piece);
        if (seat) {
          seats.push(seat);
          grid.setSeat(seat.x, seat.y);
        }
        const tx = Math.round(o.x / TILE);
        const tyBottom = Math.round(o.y / TILE) - 1;
        grid.blockRect(tx, tyBottom - fh + 1, fw, fh);
      } else if (kind === "spawn") {
        spawns.push({ name: o.name, tileX: Math.floor(o.x / TILE), tileY: Math.floor(o.y / TILE) });
      } else if (kind === "zone" && prop<string>(o.properties, "kind", "area") === "build") {
        build = { x: Math.round(o.x / TILE), y: Math.round(o.y / TILE), w: Math.round(o.width / TILE), h: Math.round(o.height / TILE) };
      } else if (kind === "zone") {
        zones.push({ name: o.name, kind: prop(o.properties, "kind", "area"), x: o.x, y: o.y, width: o.width, height: o.height });
      }
    }
  }

  return { width: map.width, height: map.height, grid, furniture, spawns, zones, build, spaces: [], seats };
}
