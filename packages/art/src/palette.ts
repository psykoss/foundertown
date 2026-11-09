import { DEFAULT_AVATAR } from "@founder-town/shared";
import type { Ramp, RampName, RampSelection, Slot } from "@founder-town/shared";

export type { Ramp, RampName, RampSelection, Slot };

/**
 * The 32 fixed colours, extracted from docs/references by tools/measure-ref.ts.
 * Each key is the character used in grids.
 */
export const PALETTE: Readonly<Record<string, string>> = {
  k: "#2f3159", // prop outline, navy
  O: "#4a4f63", // furniture shadow
  o: "#5a616c", // furniture front
  W: "#626f7b", // wall shadow
  w: "#6e7b7d", // wall face
  x: "#8792a9", // slate
  y: "#97a3a7", // grey floor
  Y: "#a3aeb2", // grey floor light
  X: "#b2bdce", // desk lip
  v: "#d6d8e8", // wall cap
  R: "#efedf6", // pale surface
  r: "#fcfdfd", // desk surface
  g: "#ece3d9", // cream floor
  G: "#efd1a2", // floor seam
  D: "#cfa17e", // wood light
  m: "#c2846a", // terracotta
  d: "#9f6e5c", // wood mid
  n: "#6d403c", // wood dark
  c: "#888dc9", // carpet shadow
  C: "#919ed6", // carpet light
  q: "#7b7dae", // muted violet
  p: "#5c43ab", // deep violet
  j: "#b178ed", // lilac
  P: "#e671aa", // pink
  u: "#3e70c2", // blue dark
  i: "#579be0", // blue
  z: "#b5dfd6", // window glass
  Z: "#ddeedc", // grass
  N: "#96d975", // lime
  L: "#6fae81", // leaf light
  l: "#528f5f", // leaf mid
  f: "#3b7057", // leaf dark
};

/** Character outline. Darker and less blue than the prop outline. */
export const OUTLINE_COLOR = "#232032";

/** Clothes share one set of 12 ramps across top, bottom, shoes and accessory. */
const CLOTHES: Readonly<Record<string, Ramp>> = {
  indigo: { light: "#7583f3", dark: "#3b3da6" },
  violet: { light: "#9facf9", dark: "#572c7a" },
  magenta: { light: "#ce4ab7", dark: "#a33d92" },
  rose: { light: "#e26c91", dark: "#a94051" },
  red: { light: "#bb465a", dark: "#682828" },
  green: { light: "#78b55c", dark: "#3b7255" },
  lime: { light: "#a1d966", dark: "#619352" },
  teal: { light: "#68c4d0", dark: "#5666a1" },
  gold: { light: "#e6d557", dark: "#c8a547" },
  denim: { light: "#5666a1", dark: "#32335e" },
  white: { light: "#f1eef6", dark: "#b1bdce" },
  silver: { light: "#a3aeb3", dark: "#616772" },
};

/**
 * Sampled from reference avatars, except the skin ramps marked as interpolated,
 * because the references show only three distinct skin tones.
 */
export const RAMPS: Readonly<Record<RampName, Readonly<Record<string, Ramp>>>> =
  {
    skin: {
      pale: { light: "#f8d9b8", dark: "#e0b08a" }, // interpolated
      light: { light: "#f4c19c", dark: "#ce8d6b" },
      sand: { light: "#dfa578", dark: "#b8835f" }, // interpolated
      tan: { light: "#cc8c65", dark: "#a17355" },
      brown: { light: "#a06a4b", dark: "#7e4f3a" }, // interpolated
      deep: { light: "#7e4f3a", dark: "#62443b" },
    },
    hair: {
      black: { light: "#42444c", dark: "#232032" },
      charcoal: { light: "#545356", dark: "#333439" },
      espresso: { light: "#62443b", dark: "#493231" },
      brown: { light: "#7e4f3a", dark: "#62443b" },
      auburn: { light: "#7e3d2e", dark: "#682828" },
      blonde: { light: "#c8a547", dark: "#886b53" },
      silver: { light: "#c9b5a8", dark: "#8f817e" },
      pink: { light: "#e26c91", dark: "#a94051" },
    },
    top: CLOTHES,
    bottom: CLOTHES,
    shoes: CLOTHES,
    accessory: CLOTHES,
  };

export const DEFAULT_RAMPS: RampSelection = DEFAULT_AVATAR.colors;

export const SLOTS: Readonly<Record<string, Slot>> = {
  h: { ramp: "hair", shade: "light", key: "#ff00a0" },
  H: { ramp: "hair", shade: "dark", key: "#ff00a1" },
  t: { ramp: "top", shade: "light", key: "#ff00b0" },
  T: { ramp: "top", shade: "dark", key: "#ff00b1" },
  s: { ramp: "skin", shade: "light", key: "#ff00c0" },
  S: { ramp: "skin", shade: "dark", key: "#ff00c1" },
  b: { ramp: "bottom", shade: "light", key: "#ff00d0" },
  B: { ramp: "bottom", shade: "dark", key: "#ff00d1" },
  e: { ramp: "shoes", shade: "light", key: "#ff00e0" },
  E: { ramp: "shoes", shade: "dark", key: "#ff00e1" },
  a: { ramp: "accessory", shade: "light", key: "#ff00f0" },
  A: { ramp: "accessory", shade: "dark", key: "#ff00f1" },
};
