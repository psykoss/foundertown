/** Terrain tileset layout: 8 columns × 2 rows of 32×32. Value = local tile id (Tiled gid = firstgid + id). */
export const TERRAIN = {
  grass0: 0, grass1: 1, grass2: 2, path: 3, wood: 4, carpet: 5, tileFloor: 6, water: 7,
  wallTop: 8, wallFace: 9, wallWindow: 10, collision: 11, doormat: 12, wallFaceLow: 13, hedge: 14, sand: 15,
} as const;
export const TERRAIN_COLUMNS = 8;
export const TERRAIN_COUNT = 16;
