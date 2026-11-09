import type {
  CharacterLayer,
  FrameKey,
  Point,
  Rect,
  Size,
} from "@founder-town/shared";

/** One string per row, one character per pixel. See docs/SPRITE_FORMAT.md. */
export type Grid = readonly string[];

/** A part as authored: three drawn views, aligned to the body. */
export interface CharacterPartSource {
  id: string;
  layer: CharacterLayer;
  anchor: Point;
  /** Facing the viewer. */
  front: Grid;
  /** Facing right. Left is mirrored from this. */
  side: Grid;
  /** Facing away. */
  back: Grid;
}

/** A part with all 20 frames, produced by tools/lib/derive.ts. */
export interface CharacterPart {
  id: string;
  layer: CharacterLayer;
  anchor: Point;
  frames: Readonly<Record<FrameKey, Grid>>;
}

export interface Tile {
  id: string;
  grid: Grid;
}

export interface Prop {
  id: string;
  /** In tiles. */
  footprint: Size;
  /** In pixels, above the footprint. */
  overhang: number;
  /** In pixels, relative to the footprint's top-left corner. */
  collision: Rect;
  grid: Grid;
}
