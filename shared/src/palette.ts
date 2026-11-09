/**
 * Palette system.
 *
 * Recolorable art is drawn with KEY ramps (4 shades, dark → light).
 * At bake time each key ramp is swapped for a real ramp chosen by the player.
 * Pixels that are not key colors are kept as-is but must belong to the master palette.
 */

export type RGB = [number, number, number];
export type Ramp = [string, string, string, string]; // dark → light, "#rrggbb"

export const KEY_RAMPS = {
  skin: ["#404000", "#808000", "#c0c000", "#ffff00"],
  primary: ["#400040", "#800080", "#c000c0", "#ff00ff"],
  secondary: ["#004040", "#008080", "#00c0c0", "#00ffff"],
} as const satisfies Record<string, Ramp>;
export type Channel = keyof typeof KEY_RAMPS;

export const SKIN_RAMPS: Record<string, Ramp> = {
  porcelain: ["#8a4f3a", "#c47d5c", "#e8a888", "#ffd6bc"],
  light: ["#75412b", "#ab633b", "#d8885c", "#f9bf95"], // = reference base body
  tan: ["#5e321e", "#94532f", "#c47448", "#e6a072"],
  olive: ["#4e2c18", "#7e4a28", "#a8683c", "#c88c5a"],
  brown: ["#3a1e12", "#62341e", "#8a4e30", "#ae7048"],
  deep: ["#24120a", "#422214", "#603620", "#7e4e32"],
};

export const HAIR_RAMPS: Record<string, Ramp> = {
  black: ["#141018", "#241c2a", "#3a2f42", "#55485e"],
  brown: ["#2a1810", "#4e2e1c", "#74472b", "#9a6840"],
  auburn: ["#3a140e", "#6e2618", "#a03e24", "#c8603a"],
  blonde: ["#6e4a1c", "#b0823a", "#dcb05c", "#f2d88e"],
  gray: ["#3e3c44", "#6c6a74", "#9c9aa4", "#cfcdd6"],
  pink: ["#7b4e41", "#c25a52", "#e86c67", "#f3a7a0"],
};

/**
 * Palette extracted from the reference office screenshots (soft pastel office):
 * cream brick floors, lavender carpets, grey-green walls, mint gardens, blue fabrics, tan wood.
 */
export const RETRO = {
  cream: "#ede4da",
  lavender: "#888dc9",
  wall: "#6e7b7d",
  navy: "#30325b",
  mint: "#d3e3d2",
  purple: "#5c4ebe",
} as const;

export const CLOTH_RAMPS: Record<string, Ramp> = {
  white: ["#b2bdce", "#d6d8e8", "#efedf6", "#ffffff"],
  grey: ["#4b5062", "#626f7b", "#8995ab", "#b2bdce"],
  charcoal: ["#2b2c2b", "#30325b", "#4b5062", "#626f7b"],
  navy: ["#30325b", "#404ea7", "#52567b", "#7b7dae"],
  lavender: ["#565e82", "#7b7dae", "#888dc9", "#a3aad9"],
  purple: ["#3a2f78", "#5c43ab", "#8b58d3", "#b479ea"],
  blue: ["#404ea7", "#3e70c2", "#579be0", "#90d6f1"],
  teal: ["#396e9e", "#509ab9", "#66c1ce", "#b5dfd6"],
  green: ["#3b7057", "#528f5f", "#6fae81", "#abd8b5"],
  mustard: ["#c28433", "#efa948", "#f7d674", "#f9dbc2"],
  coral: ["#7b4e41", "#c25a52", "#e86c67", "#f3a7a0"],
  tan: ["#7b4e41", "#9f6e5c", "#cfa17e", "#e0b693"],
};

/** Fixed (non-recolorable) colors allowed in character art. */
export const FIXED_COLORS = {
  outline: "#000000", // character art uses a pure black outline (reference style)
  eyeWhite: "#fffefd",
  eye: "#222034",
  iris: "#663931",
  blush: "#f4845c",
  base0: "#9193a6", // base undershirt/shorts (dark → light)
  base1: "#c8c2d1",
  base2: "#ece9f0",
  base3: "#ffffff",
  glassFrame: "#24202c",
  glassLens: "#a8d8f0",
  shadow: "#30325b", // only with alpha, in the shadow layer
} as const;

/** Environment palette (tiles + furniture), extracted from the reference office. */
export const ENV_RAMPS: Record<string, Ramp> = {
  grass: ["#97c5a0", "#abd8b5", "#d3e3d2", "#ddeedc"], // mint garden floor
  path: ["#8995ab", "#b2bdce", "#d6d8e8", "#efedf6"], // pale stone
  floor: ["#e0b693", "#e8d3b4", "#ecdbc7", "#ede4da"], // cream brick floor
  wood: ["#7b4e41", "#9f6e5c", "#cfa17e", "#e0b693"], // tan wood (furniture, trims)
  wallFace: ["#596367", "#6e7b7d", "#839194", "#a3aeb2"], // grey-green wall
  wallTop: ["#4b5062", "#626f7b", "#839194", "#a3aeb2"],
  carpet: ["#565e82", "#7b7dae", "#888dc9", "#919ed6"], // lavender carpet
  tileFloor: ["#c4c6d8", "#d6d8e8", "#dde4f1", "#efedf6"], // lavender-white tiles
  leaf: ["#3b7057", "#528f5f", "#6fae81", "#96d975"],
  metal: ["#4b5062", "#626f7b", "#8995ab", "#b2bdce"],
  dark: ["#2b2c2b", "#30325b", "#4b5062", "#52567b"], // office chairs, frames
  fabric: ["#404ea7", "#3e70c2", "#579be0", "#90d6f1"], // blue upholstery
  water: ["#396e9e", "#509ab9", "#66c1ce", "#90d6f1"],
  accent: ["#ac5633", "#c28433", "#efa948", "#f7d674"], // amber (lights, koi, signage)
  coral: ["#7b4e41", "#c25a52", "#e86c67", "#f3a7a0"],
  paper: ["#c4c6d8", "#dbddeb", "#efedf6", "#ffffff"],
};

export function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbKey(r: number, g: number, b: number): number {
  return (r << 16) | (g << 8) | b;
}

/** All colors of the master palette (for validation and the .gpl export). */
export function masterPalette(): string[] {
  const set = new Set<string>();
  const add = (r: Record<string, readonly string[]>) => Object.values(r).forEach((ramp) => ramp.forEach((c) => set.add(c)));
  add(KEY_RAMPS);
  add(SKIN_RAMPS);
  add(HAIR_RAMPS);
  add(CLOTH_RAMPS);
  add(ENV_RAMPS);
  Object.values(FIXED_COLORS).forEach((c) => set.add(c));
  return [...set];
}

/** Build a lookup from key color (int) → replacement RGB for a set of channel ramps. */
export function buildSwapTable(swaps: Partial<Record<Channel, Ramp>>): Map<number, RGB> {
  const table = new Map<number, RGB>();
  for (const [channel, target] of Object.entries(swaps) as [Channel, Ramp][]) {
    KEY_RAMPS[channel].forEach((keyHex, i) => {
      const [r, g, b] = hexToRgb(keyHex);
      table.set(rgbKey(r, g, b), hexToRgb(target[i]!));
    });
  }
  return table;
}

/** In-place palette swap over RGBA pixel data. Pure — works in browser and Node. */
export function swapPixels(data: Uint8ClampedArray | Uint8Array, table: Map<number, RGB>): void {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const hit = table.get(rgbKey(data[i]!, data[i + 1]!, data[i + 2]!));
    if (hit) {
      data[i] = hit[0];
      data[i + 1] = hit[1];
      data[i + 2] = hit[2];
    }
  }
}
