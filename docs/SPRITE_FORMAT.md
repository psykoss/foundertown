# Sprite format

Sprite sources in `packages/art/src` are pure data. `npm run art:build` compiles them into PNG atlases plus Phaser atlas JSON in `apps/client/public/assets`.

## Grids

A sprite is an array of strings with one character per pixel. Every row in a sprite has the same length.

| Character       | Meaning                                       |
| --------------- | --------------------------------------------- |
| `.`             | Transparent                                   |
| A `PALETTE` key | Fixed colour from `palette.ts`                |
| A `SLOTS` key   | Recolourable pixel, filled from a colour ramp |

## Colour slots

Slots are only valid in character layers. Each ramp has a light and a dark shade.

| Light | Dark | Ramp      |
| ----- | ---- | --------- |
| `h`   | `H`  | hair      |
| `t`   | `T`  | top       |
| `s`   | `S`  | skin      |
| `b`   | `B`  | bottom    |
| `e`   | `E`  | shoes     |
| `a`   | `A`  | accessory |

`PALETTE` keys and `SLOTS` keys never overlap.

## Characters

- Canvas: 32×48 for every layer. Anchor: feet centre at (16, 46).
- The lowest body pixels sit on row 45 in every frame, directly above the anchor.
- Layers: `body`, `hairBack`, `bottom`, `shoes`, `top`, `hairFront`, `accessory`.
- A part fills one layer and is drawn in three views, aligned to the body: `front`, `side` (facing right) and `back`. Left is the mirror of right, with shading kept on the right.
- Walk frames are derived by `tools/lib/derive.ts`, with the same edits on every layer: frames 0 and 2 step (front and back lift one foot; sides split the leg block into a stride), and frames 1 and 3 raise the upper body 1px.
- Directions: `down`, `left`, `right`, `up`.
- Frames: `idle`, `0`, `1`, `2`, `3`. The frame key is `${dir}_${frame}`, for example `down_idle` or `left_2`.
- Draw order per direction is defined in `characters/layerOrder.ts`.
- The outermost row and column on each side stay transparent, leaving room for the outline.

## Outline

Outlines are never drawn in grids. A 1px outline is added as a post-process: every transparent pixel with an opaque orthogonal neighbour becomes `OUTLINE_COLOR`.

- Characters: applied once to the composed silhouette at compose time, so layers never get internal outlines.
- Props: applied at build time. Each prop frame grows by 1px on every side to fit it.
- Tiles: no outline, so they join seamlessly.

## Tiles

32×32, fixed palette characters only.

## Props

Fixed palette characters only.

| Field       | Unit   | Meaning                                                          |
| ----------- | ------ | ---------------------------------------------------------------- |
| `footprint` | tiles  | Width and height occupied on the map                             |
| `overhang`  | pixels | Extra art above the footprint, which draws over the tiles behind |
| `collision` | pixels | Blocking box, relative to the footprint's top-left corner        |

Grid width is `footprint.w × 32`. Grid height is `footprint.h × 32 + overhang`. The collision box must fit inside the footprint.

## Atlas output

| Files                               | Frame names                          |
| ----------------------------------- | ------------------------------------ |
| `characters.png`, `characters.json` | `${layer}/${partId}/${dir}_${frame}` |
| `tiles.png`, `tiles.json`           | `${tileId}`                          |
| `props.png`, `props.json`           | `${propId}`                          |

The JSON uses Phaser's JSON Hash atlas format, with extra data in `meta`:

- `characters.json`: `canvas`, `anchor`, `layerOrder`, `slots`, `ramps`, `outline`.
- `props.json`: `props`, keyed by prop id, with `footprint`, `overhang`, `collision` and `origin` (the footprint's top-left corner inside the frame).

Character atlases are not recoloured or outlined. Slot pixels are stored as the reserved key colours listed in `meta.slots`, so the client can replace them with ramp colours when it composes an avatar, then add the outline.
