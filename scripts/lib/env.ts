/** Terrain tileset layout: 8 columns × 2 rows of 32×32. Value = local tile id (Tiled gid = firstgid + id). */
export const TERRAIN = {
  grass0: 0, grass1: 1, grass2: 2, path: 3, wood: 4, carpet: 5, tileFloor: 6, water: 7,
  wallTop: 8, wallFace: 9, wallWindow: 10, collision: 11, doormat: 12, wallFaceLow: 13, hedge: 14, sand: 15,
  // floor textures from the prop library (art/props/floors)
  floorYellow: 16,
  // reference-style walls: horizontal = 2-row face with a thin cap line; vertical = thin band split across the
  // tile boundary (half in each tile) + an invisible edge wall (no blocked column, no gap)
  faceTop: 17, faceTopWindow: 18, faceBottom: 19, bandLeft: 20, bandRight: 21, bandBottom: 22, edgeW: 23,
} as const;
export const TERRAIN_COLUMNS = 8;
export const TERRAIN_COUNT = 24;
export const LIBRARY_FLOORS: Record<number, string> = { 16: "floor_yellow_tile" }; // 17–20 unused (removed assets)
