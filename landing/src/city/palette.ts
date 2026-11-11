/** The game's own color ramps (dark → light), re-exported by name so the city never invents a color. */
import { CLOTH_RAMPS, ENV_RAMPS, HAIR_RAMPS, SKIN_RAMPS, type Ramp } from "@ft/shared";

const env = (k: string): Ramp => ENV_RAMPS[k]!;
const cloth = (k: string): Ramp => CLOTH_RAMPS[k]!;

export const floor = env("floor"), wood = env("wood"), wall = env("wallFace"), carpet = env("carpet"), tile = env("tileFloor"),
  leaf = env("leaf"), metal = env("metal"), dark = env("dark"), fabric = env("fabric"), water = env("water"), amber = env("accent"),
  grass = env("grass"), stone = env("path");
export const coral = cloth("coral"), mustard = cloth("mustard"), teal = cloth("teal"), lavender = cloth("lavender"), purple = cloth("purple"),
  green = cloth("green"), white = cloth("white"), navy = cloth("navy"), tan = cloth("tan");

export const SKINS = Object.values(SKIN_RAMPS).map((r) => r[3]);
export const HAIRS = Object.values(HAIR_RAMPS).map((r) => r[1]);
export const SHIRTS = Object.values(CLOTH_RAMPS).map((r) => r[2]);
export const PANTS = [navy[0], navy[2], dark[0], dark[2], tan[1], metal[1], fabric[0]];

/** The landing page's two accents. */
export const YC = "#ff6600";
export const BLACK = "#141018";
export const WHITE = "#ffffff";
/** A lit window. */
export const LIT = amber[3];
