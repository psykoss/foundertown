import { CHARACTER_PARTS } from "./derive";
import {
  CHARACTER_ANCHOR,
  CHARACTER_SIZE,
  FRAME_KEYS,
} from "@founder-town/shared";
import type { CharacterAtlasMeta, PropMeta } from "@founder-town/shared";
import {
  LAYER_ORDER,
  OUTLINE_COLOR,
  PROPS,
  RAMPS,
  SLOTS,
  TILES,
} from "../../src/index";
import { packAtlas } from "./atlas";
import type { Atlas } from "./atlas";
import { fixedColors, rasterize, slotKeyColors } from "./compile";
import { addOutline, pad } from "./raster";
import { assertValidArt } from "./validate";

const OUTLINE_PADDING = 1;

export function renderProp(prop: (typeof PROPS)[number]) {
  return addOutline(
    pad(rasterize(prop.grid, fixedColors), OUTLINE_PADDING),
    OUTLINE_COLOR,
  );
}

/** Validates all art and compiles it. Returns atlases by base file name. */
export function buildAtlases(): Record<string, Atlas> {
  assertValidArt();

  const characterMeta: CharacterAtlasMeta = {
    canvas: CHARACTER_SIZE,
    anchor: CHARACTER_ANCHOR,
    layerOrder: LAYER_ORDER,
    slots: SLOTS,
    ramps: RAMPS,
    outline: OUTLINE_COLOR,
  };

  const propMeta: Record<string, PropMeta> = Object.fromEntries(
    PROPS.map((prop) => [
      prop.id,
      {
        footprint: prop.footprint,
        overhang: prop.overhang,
        collision: prop.collision,
        origin: { x: OUTLINE_PADDING, y: OUTLINE_PADDING + prop.overhang },
      },
    ]),
  );

  return {
    characters: packAtlas(
      CHARACTER_PARTS.flatMap((part) =>
        FRAME_KEYS.map((key) => ({
          name: `${part.layer}/${part.id}/${key}`,
          raster: rasterize(part.frames[key], slotKeyColors),
        })),
      ),
      "characters.png",
      { ...characterMeta },
    ),
    tiles: packAtlas(
      TILES.map((tile) => ({
        name: tile.id,
        raster: rasterize(tile.grid, fixedColors),
      })),
      "tiles.png",
    ),
    props: packAtlas(
      PROPS.map((prop) => ({ name: prop.id, raster: renderProp(prop) })),
      "props.png",
      { props: propMeta },
    ),
  };
}
