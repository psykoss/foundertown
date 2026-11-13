/** Terrain tileset layout: 8 columns × 2 rows of 32×32. Value = local tile id (Tiled gid = firstgid + id). */
export const TERRAIN = {
  grass0: 0, grass1: 1, grass2: 2, path: 3, wood: 4, carpet: 5, tileFloor: 6, water: 7,
  wallTop: 8, wallFace: 9, wallWindow: 10, collision: 11, doormat: 12, wallFaceLow: 13, hedge: 14, sand: 15,
  // floor textures from the prop library (art/props/floors)
  floorYellow: 16,
  // reference-style walls: horizontal = 2-row face with a thin cap line; vertical = thin band split across the
  // tile boundary (half in each tile) + an invisible edge wall (no blocked column, no gap)
  faceTop: 17, faceTopWindow: 18, faceBottom: 19, bandLeft: 20, bandRight: 21, bandBottom: 22, edgeW: 23,
  // department carpets of the private office (29–31 are free)
  floorHq: 24, floorSales: 25, floorMarketing: 26, floorFinance: 27, floorLegal: 28,
} as const;
export const TERRAIN_COLUMNS = 8;
export const TERRAIN_COUNT = 32;
/** Floor of each department (`DEPARTMENTS` ids in shared/src/office.ts) → written as the tile property `floor` in the office map. */
export const DEPARTMENT_FLOORS: Record<string, number> = {
  hq: TERRAIN.floorHq, product: TERRAIN.carpet, sales: TERRAIN.floorSales, marketing: TERRAIN.floorMarketing,
  finance: TERRAIN.floorFinance, legal: TERRAIN.floorLegal,
};
/** Chairs recolored per department from `office_chair` (dark → light, three shades): name suffix → colors. */
export const CHAIR_COLORS: Record<string, [string, string, string]> = {
  amber: ["#ac5633", "#c28433", "#efa948"],
  coral: ["#7b4e41", "#c25a52", "#e86c67"],
  blue: ["#404ea7", "#3e70c2", "#579be0"],
  green: ["#3b7057", "#528f5f", "#6fae81"],
  grey: ["#4b5062", "#626f7b", "#8995ab"],
};
export const LIBRARY_FLOORS: Record<number, string> = { 16: "floor_yellow_tile" }; // 17–20 unused (removed assets)
