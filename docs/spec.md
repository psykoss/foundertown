# Founder Town — Engine & Art Spec (v1)

## 1. Scope of phase 1
Engine, asset pipeline, environment and layered character builder. Single player + wandering NPCs (stand-ins for remote players). No server, no game systems yet.

## 2. Architecture

```
client (browser)
  React UI (HUD, character builder)  ──reads/writes──▶  store (single source of client state)
  Phaser: BootScene → WorldScene                          ▲
    InputController → intents ─────────▶ Character (logic) ┘
    WorldView / CharacterView (render, read-only)
shared (pure TS): spec, palette, grid, movement, pathfinding, avatar schema, map parsing
server (later): Colyseus rooms reusing shared/ for authoritative movement
scripts: placeholder generator, map generator, validator, Aseprite export, previews
```

Frame update order: input → logic → render → debug → HUD (4 Hz).

## 3. World rules
| Rule | Value |
|---|---|
| Tile | 32×32 |
| View | top-down 3/4 — floors from above, walls/furniture show their front face |
| Movement | grid, 4-dir, 180 ms/tile, keyboard (most recent key wins) or click-to-walk (BFS) |
| Camera | integer zoom = floor(viewport height / 300), follow with rounding, clamped to map |
| Depth | `depth = feet y` (characters) / `base y` (furniture); `ground*`/`walls` < 0; `above` = 2,000,000 |

## 4. Character template
- Frame 32×64, feet on row 61, origin bottom-center. Body proportions follow the reference (big head rows 29–44, body 44–61).
- Sheet 128×384: 4 columns × 6 rows, rows `idle_down, idle_up, idle_left, walk_down, walk_up, walk_left`; idle 4 frames, walk 4 frames at 8 fps.
- `right` is `left` mirrored at render time (v1). Asymmetric items will need a real `right` row later.
- Idle: static base body. Walk: 4-frame cycle imported from the reference recording (`art/characters/reference/base_walk.png`): real leg strides and arm swing; front/back alternate step/pass frames with a 1px whole-body lift on pass frames (side: 1px drop). The head never moves relative to the body.

### Layers (back → front, facing down/left)
`shadow, back_accessory, hair_back, body, bottom, shoes, top, outerwear, head, face, hair_front, headwear, face_accessory, hand_item`
The head is its own layer, drawn **over clothing** so it overlaps the shoulders (clothing must never cover the chin). Facing up: hair_back and back_accessory move in front. See `LAYER_ORDER`.

### Slots → items
`body, face, hair, top, outerwear*, bottom, shoes, headwear*, face_accessory*, back_accessory*` (* optional).
One item can use several layers (long hair = `hair_back` + `hair_front`).

### Color
- Recolorable art is painted with key ramps (4 shades, dark → light):
  skin `#404000 #808000 #c0c000 #ffff00`, primary `#400040 #800080 #c000c0 #ff00ff`, secondary `#004040 #008080 #00c0c0 #00ffff`.
- At bake time keys are swapped for the chosen ramp (skin tones, hair colors, cloth colors in `shared/src/palette.ts`).
- Fixed colors: black outline `#000000`, eyes, blush, base undershirt greys, glasses. Anything else fails validation.
- The shadow layer is the only layer allowed to use alpha.

### Avatar data (what gets saved / synced)
```json
{ "skin": "light", "slots": { "hair": { "id": "hair_short_01", "primary": "brown" }, "outerwear": null, ... } }
```

## 5. Map (Tiled)
`client/public/assets/maps/town.tmj` (the main lobby) and `office.tmj` (a private lobby: an empty floor), tilesets embedded.

| Layer | Type | Purpose |
|---|---|---|
| ground | tiles | floors, grass, paths, water |
| ground_detail | tiles | rugs, decals |
| walls | tiles | wall caps + 3/4 wall faces, hedges |
| collision | tiles (hidden) | any tile = blocked |
| objects | tile objects | furniture from the `furniture` image-collection tileset; y-sorted with characters; tile props `footprintW/H` block tiles automatically |
| above | tiles | always over characters (roof edges, tree tops) |
| markers | objects | `spawn` points, `zone` rectangles (`kind` prop: room, pills…) |

Buildings: the back wall shows its face (2 tiles), side and front walls show only their cap; doors are gaps in the front wall.

### Office layout (private lobbies)
A private lobby's map has a `zone` of kind `build`: the floor its owner can lay departments on. The layout is data stored per owner — `{ spaces: [{ id, kind, x, y, w, h }] }`, tiles — and `buildWorld(map, layout)` in `shared/src/office.ts` lays it over the map on the client and the server alike: each space paints its department's carpet (the terrain tile whose `floor` property is the department id), gets its furniture from `furnish` (derived from department and size, so a space can be resized freely), blocks the furniture's tiles, and becomes a zone of kind `space`. Spaces never overlap and have no walls. Sizes: 5×4 to 18×12 tiles, at most 24 spaces.

## 6. Asset pipeline
```
art/characters/reference/base_body.png   reference body (source of all body frames)
art/characters/items.json                item registry (hand-edited)
art/palette/master.gpl                   master palette for Aseprite (generated)
scripts/gen-placeholders.ts              template-correct placeholder art (characters, terrain, furniture)
scripts/gen-map.ts                       starter map (only if missing)
scripts/validate-assets.ts               size/grid/palette/map checks — CI gate
scripts/export-aseprite.sh               real art: .aseprite (tags idle_down…) → sheets
scripts/preview-avatar.ts                composed avatars → docs/previews/
```
Replacing art = drop a PNG with the same path and template → no code changes.

## 7. Roadmap
1. ✅ Repo, tooling, pixel-perfect render
2. ✅ Placeholder generator + validator
3. ✅ Tilemap, camera, y-sort, debug overlay
4. ✅ Character logic + grid movement + animation
5. ✅ Layer compositor + palette swap
6. ✅ Character builder
7. ⏳ Real art pass (Aseprite): body anims, clothing, tilesets → `assets:export`
8. ✅ Accounts + onboarding (Supabase), Colyseus lobbies with validated movement, proximity voice + video calls, invites
9. Next phases: chat, rooms/portals, founder pills
