import type { Point } from "@founder-town/shared";

interface TiledProperty {
  name: string;
  value: unknown;
}

interface TiledObject {
  name: string;
  x: number;
  y: number;
}

interface TiledLayer {
  name: string;
  type: string;
  data?: number[];
  objects?: TiledObject[];
}

interface TiledTileset {
  firstgid: number;
  tiles?: { id: number; properties?: TiledProperty[] }[];
}

interface TiledMap {
  width: number;
  height: number;
  tilewidth: number;
  layers: TiledLayer[];
  tilesets: TiledTileset[];
}

export interface MapProp {
  id: string;
  /** Top-left corner of the prop's footprint, in pixels. */
  x: number;
  y: number;
}

export interface GameMap {
  width: number;
  height: number;
  tileSize: number;
  /** Atlas frame names by tile index. Null means no tile. */
  floor: (string | null)[];
  walls: (string | null)[];
  blocked: boolean[];
  props: MapProp[];
  spawn: Point;
}

// Tiled stores tile flip flags in the top bits of each GID.
const GID_MASK = 0x0fffffff;

function layerNamed(map: TiledMap, name: string, type: string): TiledLayer {
  const layer = map.layers.find(
    (candidate) => candidate.name === name && candidate.type === type,
  );
  if (!layer) throw new Error(`Map is missing ${type} "${name}"`);
  return layer;
}

function tileData(map: TiledMap, name: string): number[] {
  const data = layerNamed(map, name, "tilelayer").data;
  if (data?.length !== map.width * map.height) {
    throw new Error(`Map layer "${name}" has the wrong number of tiles`);
  }
  return data;
}

function frameNames(map: TiledMap): Map<number, string> {
  const names = new Map<number, string>();
  for (const tileset of map.tilesets) {
    for (const tile of tileset.tiles ?? []) {
      const frame = tile.properties?.find((p) => p.name === "frame")?.value;
      if (typeof frame === "string")
        names.set(tileset.firstgid + tile.id, frame);
    }
  }
  return names;
}

export function parseMap(raw: unknown): GameMap {
  const map = raw as TiledMap;
  const names = frameNames(map);
  const toFrames = (name: string) =>
    tileData(map, name).map((gid) => {
      const id = gid & GID_MASK;
      if (id === 0) return null;
      const frame = names.get(id);
      if (!frame) throw new Error(`Map tile ${id} has no frame property`);
      return frame;
    });

  const spawn = layerNamed(map, "spawn", "objectgroup").objects?.[0];
  if (!spawn) throw new Error("Map has no spawn point");

  return {
    width: map.width,
    height: map.height,
    tileSize: map.tilewidth,
    floor: toFrames("floor"),
    walls: toFrames("walls"),
    blocked: tileData(map, "collision").map((gid) => gid !== 0),
    props: (layerNamed(map, "props", "objectgroup").objects ?? []).map(
      ({ name, x, y }) => ({ id: name, x, y }),
    ),
    spawn: { x: spawn.x, y: spawn.y },
  };
}

/** Anything outside the map counts as blocked. */
export function isBlocked(map: GameMap, tileX: number, tileY: number): boolean {
  if (tileX < 0 || tileY < 0 || tileX >= map.width || tileY >= map.height) {
    return true;
  }
  return map.blocked[tileY * map.width + tileX] ?? true;
}
