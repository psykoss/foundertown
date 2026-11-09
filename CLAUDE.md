# Founder Town — instructions for Claude Code

2D pixel-art social world (top-down 3/4 view) for startup founders. Phase 1 = **engine + asset pipeline + layered characters**. Game systems (pills, missions, multiplayer) come later — don't build them unless asked.

Full spec: `docs/spec.md`. Read it before changing anything in `shared/src/spec.ts`, the layer system or the asset pipeline.

## Stack
- pnpm workspaces: `shared/` (pure TS), `client/` (Vite + Phaser 3 + React), `server/` (empty — Colyseus later), `scripts/` (asset tooling, run with tsx), `art/` (source art)
- TypeScript strict everywhere. Vitest for `shared/`. Playwright (via `/tmp`-style scripts) for visual checks.

## Commands
- `pnpm dev` — run the client (http://localhost:5173)
- `pnpm test` — unit tests (shared logic)
- `pnpm typecheck`
- `pnpm assets` — placeholders (missing files only) → map (if missing) → validate
- `pnpm assets:validate` — enforce the pixel spec on every asset; must pass before committing art
- `pnpm tsx scripts/preview-avatar.ts` — render composed avatars to `docs/previews/`
- `pnpm assets:export` — export real Aseprite art (needs Aseprite CLI)

## Architecture rules (do not break)
1. **Rendering never owns state.** `client/src/state/store.ts` is the single client store. Phaser views read logic objects; they never mutate them.
2. **Logic vs view split.** `entities/Character.ts` (logic, no Phaser) vs `entities/CharacterView.ts` (render). Same pattern for anything new.
3. **`shared/` is pure.** No Phaser, no DOM, no Node APIs. Movement, collision, pathfinding, avatar schema, palette swap and map parsing live here so the future server runs the same code.
4. **Input → intents.** `InputController` produces directions/clicks; the scene applies them to logic.
5. **The map is data.** Rooms, collisions, furniture, spawns and zones come from Tiled (`client/public/assets/maps/town.tmj`). Never hardcode world content in code.
6. **UI is React over the canvas.** Panels, menus and builders are DOM, not Phaser.

## Pixel spec (summary — `shared/src/spec.ts` is the source of truth)
- Tile 32×32. Character frame 32×64, feet at row 61, anchored bottom-center.
- Integer zoom only, `pixelArt: true`, rounded camera. Never scale sprites by non-integers.
- Grid movement, one tile per `STEP_MS` (180 ms). 4 directions; `right` = `left` mirrored.
- Sheet template: 6 columns × 6 rows (192×384). Rows anim-major: idle_down, idle_up, idle_left, walk_down, walk_up, walk_left. Idle 4 frames, walk 6.
- Character art: pure black outline, key ramps for recolorable parts (skin = yellow keys, primary = magenta keys, secondary = cyan keys), fixed colors from `FIXED_COLORS`.
- Depth = feet / base y for characters and furniture. Ground layers < 0, `above` layer 2,000,000, debug 3,000,000.

## Characters
- Base body = `art/characters/reference/base_body.png` (down / up / left, 96×64). Idle and walk frames are derived from it by the shared motion model in `scripts/lib/pose.ts`. **All clothing drawers use `pose()` so they move with the body.**
- Items: `art/characters/items.json` (source) → copied to `client/public/assets/characters/items.json`. An item = slot + parts (layer + sheet) + channels (+ optional `unlock`).
- Layer draw order per direction: `LAYER_ORDER` in `shared/src/avatar.ts` (facing up, back layers move in front).
- The base body is split into `body` (torso/limbs) and `head` layers; `head` is drawn above top/outerwear so clothing never covers the chin. The chin/jaw extends below the head rows in the middle columns (`isChin` in `scripts/lib/pose.ts`: row 45 cols 10–21, row 46 cols 11–20) and is part of the head layer; shirts put the chin's cast shadow on row 47.
- The head is an oval (reference silhouette). Hair and headwear are cut from that silhouette (`fromHead`) and must not grow outside it — otherwise the head reads as round. Use `f.headReg()` for them: black outline only on the outer silhouette, the ramp's dark shade where hair meets skin (no black line across the forehead).
- Shading = the reference's cel shading (`volume: true` in `Region.paint`): one flat lit shade, a curved terminator (mid shade starts ~55% down at the sides, lower toward the center), darkest shade only in bottom corners; legs one shade darker (`dim`). Clothing is cut from the animated body silhouette (`fromBody`), sleeves are separate outlined shapes, edges meeting skin are soft. Details are limited to the head's cast shadow and arm/torso separation — no strands or noise.
- Compositor bakes each avatar once into a single texture (`client/src/game/avatar/compositor.ts`), cached by appearance.

## Workflow
- Work in vertical slices. Plan first, keep each slice runnable, commit when it works.
- After touching art or the generator: `pnpm assets:placeholders --force && pnpm assets:validate && pnpm tsx scripts/preview-avatar.ts`, then look at `docs/previews/`.
- After touching rendering: run the game and take a screenshot to check it — don't assume.
- Never overwrite real art with placeholders (`--force` only while all art is still generated).
- Update this file when an architecture decision changes.
