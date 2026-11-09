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
  pink: ["#5a1e3c", "#a03c6a", "#d8689a", "#f4a6c6"],
};

export const CLOTH_RAMPS: Record<string, Ramp> = {
  charcoal: ["#1c1c24", "#30303c", "#4a4a58", "#686878"],
  white: ["#8e8a9c", "#c4c0d0", "#e6e4ee", "#ffffff"],
  navy: ["#141c38", "#22305c", "#344a86", "#4e68aa"],
  sky: ["#1e4a78", "#2f72a8", "#4a9ad0", "#7cc2ea"],
  forest: ["#14301e", "#22502e", "#367444", "#56985e"],
  mint: ["#2a6656", "#3e9078", "#5cb898", "#90dcbc"],
  mustard: ["#6a4a10", "#a8761c", "#d4a032", "#f0c860"],
  orange: ["#6e2a10", "#b04a1c", "#e07030", "#f8a060"],
  red: ["#5a1418", "#922028", "#c4343a", "#e86058"],
  plum: ["#381a3e", "#5c2c66", "#844490", "#ac6ab6"],
  beige: ["#6a5440", "#a08668", "#c8ae8c", "#e8d6b6"],
  denim: ["#1c2a44", "#2e4268", "#46608e", "#6884b0"],
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
  shadow: "#1a1420", // only with alpha, in the shadow layer
} as const;

/** Environment palette (tiles + furniture). */
export const ENV_RAMPS: Record<string, Ramp> = {
  grass: ["#2e5a32", "#3f7a3e", "#5a9a4c", "#7cba62"],
  path: ["#6e6258", "#8e8276", "#aea294", "#cec2b2"],
  wood: ["#4a2e1e", "#6e4630", "#94643e", "#b88656"],
  wallFace: ["#5a5468", "#7a7490", "#9c96b0", "#c2bed4"],
  wallTop: ["#2a2634", "#3c3648", "#504a5e", "#686078"],
  carpet: ["#3a2a4e", "#4e3a68", "#664e86", "#8268a6"],
  tileFloor: ["#8c8a96", "#aeacb8", "#cccad4", "#e6e4ec"],
  leaf: ["#1e4a2a", "#2e6a38", "#44904a", "#66b25e"],
  metal: ["#3a3e48", "#5a606c", "#828a96", "#b0b8c2"],
  water: ["#1a3e6a", "#245a92", "#3a7eb8", "#62a6d8"],
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
