# Architecture

Founder Town is a 2D top-down virtual space, organised as an npm-workspaces monorepo.

## Rules

1. `game/` (Phaser) never imports React or `ui/`. `ui/` never imports Phaser.
   They communicate only through `bridge/events.ts` (typed events).
2. `packages/art/src` is pure data: grids, palette, anchors, footprints.
   No canvas or Phaser code.
3. The client loads only generated PNG atlases + JSON, never art source.
4. Maps are Tiled `.tmj` files in `apps/client/public/maps`.
5. Pixel-perfect rendering: integer zoom only, `pixelArt: true`, `roundPixels`.
6. Shared constants and types live in `packages/shared` only.

`apps/client/src/main.tsx` is the composition root. It is the only file that
may start both the game and the React UI.

## Layout

```
founder-town/
├── CLAUDE.md
├── docs/
│   ├── ARCHITECTURE.md   STYLE.md   SPRITE_FORMAT.md
│   └── references/                 # Gather screenshots (style reference only)
├── packages/
│   ├── shared/                     # types, constants (TILE), avatar schema, net protocol
│   └── art/
│       ├── src/
│       │   ├── palette.ts
│       │   ├── characters/ body/ hair/ tops/ bottoms/ shoes/ accessories/ layerOrder.ts
│       │   ├── tiles/  floors.ts  walls.ts
│       │   └── props/  desk.ts  plant.ts …
│       ├── tools/  build.ts (grids → PNG atlas + JSON)   export-png.ts   lib/ (compiler)   preview/ (gallery)
│       └── tests/  sprites.test.ts
├── apps/
│   ├── client/                     # Vite + React + Phaser
│   │   ├── public/assets/          # generated atlases (git-ignored)
│   │   ├── public/maps/            # *.tmj
│   │   └── src/
│   │       ├── main.tsx
│   │       ├── ui/                 # React: Hud, AvatarEditor, Chat
│   │       ├── bridge/events.ts    # only link between React and Phaser
│   │       ├── state/store.ts      # zustand
│   │       └── game/
│   │           ├── config.ts
│   │           ├── scenes/  Boot.ts  Preload.ts  Room.ts  Overlay.ts
│   │           ├── entities/ Player.ts  RemotePlayer.ts
│   │           ├── systems/  movement.ts  interaction.ts
│   │           ├── render/   avatarComposer.ts  nameTag.ts
│   │           └── net/      client.ts
│   └── server/                     # Colyseus (step 8)
└── package.json                    # npm workspaces
```

## Data flow

- Art: `packages/art/src` (data) → `art:build` → `apps/client/public/assets` (PNG + JSON) → loaded by Phaser in `Preload`.
- Game to UI: a Phaser scene emits on the bridge → `state/store.ts` updates → React re-renders.
- UI to game: a React component emits on the bridge → a Phaser scene or system handles it.
