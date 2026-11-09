# Style

All sizes are in native pixels. They are measured by `npm run art:measure`, which writes `docs/references/native/measurements.json`.

## Reference scales

Each screenshot was captured at its own non-integer scale.

| Reference           | Screen px per native px | Use                                                               |
| ------------------- | ----------------------- | ----------------------------------------------------------------- |
| `ref-1`             | 2.250                   | Measurements, colours                                             |
| `ref-2`             | about 1.4               | Not used: too small to recover the grid                           |
| `ref-3`             | 3.940                   | Measurements, colours                                             |
| `ref-4`             | 2.785                   | Avatar colours                                                    |
| `ref-5`             | 3.800                   | Avatar colours; low confidence, the capture is blurred            |
| `ref-6`             | 2.905                   | Front-view avatar grid; source screenshot no longer in the folder |
| `ref-7`             | about 1.9               | Colours only                                                      |
| `ref-8` to `ref-11` | 8.000                   | Character structure: front, right, back, left                     |

## Grid

| Item          | Size | Evidence                                                               |
| ------------- | ---- | ---------------------------------------------------------------------- |
| Tile          | 32   | Desks repeat every 96 (3 tiles); grey floor repeats at multiples of 32 |
| Floor pattern | 96   | Grey floor differs least at a 96 offset                                |

## Characters

Measured at exactly 8 screen pixels per native pixel from four views of one avatar (`ref-8` to `ref-11`). Heights include large hair; the skull and body are the fixed part. One back-view reading is partly hidden by the name tag, so its top rows are inferred from the front view.

| Item                    | Front and back                                 | Side                                            |
| ----------------------- | ---------------------------------------------- | ----------------------------------------------- |
| Outlined size           | 20 wide, up to 40 tall                         | 8–9 wide body; up to 23 wide with hair, 40 tall |
| Head rows, hair to chin | 25 of 40 (62%)                                 | 24 of 40                                        |
| Body rows               | 15 of 40                                       | 16 of 40                                        |
| Ears                    | Stick out 1px each side, 3 rows                | One, inside the head                            |
| Arms                    | 3 wide, against the torso, hands notched below | One, drawn over the torso                       |
| Torso                   | 12 wide                                        | 5 wide                                          |
| Legs                    | Two, 3 wide, 4-column gap                      | One block, 5 wide                               |
| Feet                    | 4 wide, turned outward                         | 6 wide, toe forward                             |
| Eye                     | 3 wide, 3 tall                                 | 3 wide, 2 tall                                  |

The canvas is unchanged: 32×48 with the feet anchor at (16, 46).

## Outline

- 1px, closed, orthogonal, around the whole silhouette. No gaps and no internal outlines.
- Characters: `#232032`. In the crispest references the outline is pure black; `#232032` is kept as the softer choice.
- Props: `#2f3159`.
- Tiles and floors: none.

## Shading

- Maximum 2 tones per material: light and dark.
- Light comes from the top-left. The dark tone goes on the bottom and right edges.
- Highlights are 1px, on top-left edges only.
- References sometimes use 3 tones plus a highlight, for example the blue cap in `ref-3`. The 2-tone limit is a deliberate simplification.

## Perspective

| Surface | View              | Numbers                                                                                             |
| ------- | ----------------- | --------------------------------------------------------------------------------------------------- |
| Floors  | Straight top-down | Pattern on the 32 grid                                                                              |
| Walls   | Front face only   | 64 tall (2 tiles): 4 cap, 59 face, 1 base line. Short walls are 48: 5 cap, 42 face, 1 base line     |
| Props   | 3/4 front         | Top surface plus a visible front face                                                               |
| Desk    | 3/4 front         | 96 wide (3 tiles), 40 tall: 1 top edge, 27 surface, 3 lip, 9 front. Footprint 3×1 tiles, overhang 8 |

## Shadows

- Characters: none. Floor pixels directly below the feet match the surrounding floor in `ref-3`.
- Props: 1–2px soft contact shadow on the surface they stand on, from `ref-1`.

## Name tag

The tag is UI, not pixel art. It is drawn at screen resolution with smooth edges. Sizes are expressed in native pixels so it scales with the world.

| Item            | Value                           |
| --------------- | ------------------------------- |
| Height          | 20                              |
| Corner radius   | 10 (full pill)                  |
| Left padding    | 6                               |
| Status dot      | 8 diameter, `#5dbf66`           |
| Dot to text gap | 7                               |
| Text cap height | 8, white, medium weight         |
| Background      | `#27262b`                       |
| Pointer         | Centred below the pill, 5 tall  |
| Shadow          | Soft drop shadow below the pill |
| Tag to avatar   | Height ratio 20:35              |

A selected player's tag is indigo with an avatar chip, and the avatar gets a blue glow. This state appears in a later screenshot and has not been measured.

## Colour

`packages/art/src/palette.ts` holds:

- 32 fixed colours extracted from `ref-1`, `ref-3` and `ref-7`.
- 6 skin ramps. `light`, `tan` and `deep` are sampled; `pale`, `sand` and `brown` are interpolated, because the references show only 3 distinct skin tones.
- 8 hair ramps and 12 clothes ramps, sampled from reference avatars.
