import { desk } from "./props/desk";
import { floorWood } from "./tiles/floors";
import { wallPlain } from "./tiles/walls";
import type { CharacterPartSource, Prop, Tile } from "./types";

export * from "./characters/layerOrder";
export * from "./palette";
export * from "./types";

export const CHARACTER_PART_SOURCES: readonly CharacterPartSource[] = [];

export const TILES: readonly Tile[] = [floorWood, wallPlain];

export const PROPS: readonly Prop[] = [desk];
