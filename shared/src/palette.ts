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
  rose: ["#5e3a40", "#8a5560", "#b07a82", "#d1a3a6"], // dusty rose (retro palette)
};

/**
 * Retro dim-pastel palette. Anchors: cream #e8d8c9 · slate #4b607f · orange #f3701e · charcoal #1f1d1c.
 * Every ramp is muted/desaturated so the whole game reads as one warm, dusty retro scheme.
 */
export const RETRO = {
  cream: "#e8d8c9",
  slate: "#4b607f",
  orange: "#f3701e",
  charcoal: "#1f1d1c",
} as const;

export const CLOTH_RAMPS: Record<string, Ramp> = {
  charcoal: ["#1a1918", "#2a2826", "#3d3a37", "#55514c"],
  cream: ["#9c8f82", "#c4b5a6", "#e8d8c9", "#f6efe7"],
  slate: ["#263142", "#37465e", "#4b607f", "#6f84a3"],
  dusk: ["#2b2f45", "#3d4360", "#565e82", "#7a82a4"],
  sage: ["#3a4535", "#55644c", "#768767", "#9dab88"],
  teal: ["#24403f", "#36595a", "#4f7a78", "#76a09b"],
  mustard: ["#6b5124", "#94723a", "#bf9752", "#dcbc7d"],
  orange: ["#8a3c12", "#c2561a", "#f3701e", "#f7a066"],
  rust: ["#5c2a20", "#83402f", "#a85a45", "#c98370"],
  rose: ["#6b4148", "#8f5c63", "#b37f84", "#d3a7a8"],
  plum: ["#3d2d3d", "#574257", "#755c74", "#977f95"],
  beige: ["#6e6052", "#958473", "#b9a893", "#d6c7b3"],
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
  shadow: "#1f1d1c", // only with alpha, in the shadow layer
} as const;

/** Environment palette (tiles + furniture). */
/** Environment palette (tiles + furniture) — same retro dim-pastel family. */
export const ENV_RAMPS: Record<string, Ramp> = {
  grass: ["#3c4637", "#56634c", "#748366", "#98a585"],
  path: ["#6e655c", "#90867a", "#b1a595", "#cfc2b1"],
  wood: ["#4a3329", "#6c4b3a", "#8f6a51", "#b48d6d"],
  wallFace: ["#8c7f71", "#b0a292", "#d2c4b4", "#e8d8c9"],
  wallTop: ["#1f1d1c", "#2c3240", "#3b4558", "#4b607f"],
  carpet: ["#4f3530", "#6e4a3f", "#8f6352", "#b2826c"],
  tileFloor: ["#9a9084", "#bab0a3", "#d6cbbe", "#ebe1d5"],
  leaf: ["#2e3a2f", "#435441", "#5f7258", "#839578"],
  metal: ["#2b2f38", "#454c5a", "#677082", "#959dab"],
  water: ["#263247", "#374863", "#4b607f", "#7187a6"],
  accent: ["#8a3c12", "#c2561a", "#f3701e", "#f7a066"], // retro orange (lights, signage, pills)
  paper: ["#9c8f82", "#c4b5a6", "#e8d8c9", "#f6efe7"], // cream (screens, cups, whiteboards)
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
