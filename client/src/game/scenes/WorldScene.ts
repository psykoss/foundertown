/**
 * The world: map + characters + camera + input + debug.
 * Update order each frame: input → logic (Character.update) → render (CharacterView.update).
 */
import Phaser from "phaser";
import {
  TILE, findPath, parseWorld, randomAvatar, rng, sanitizeAvatar,
  type ItemRegistry, type TiledMap, type WorldData,
} from "@ft/shared";
import { store } from "../../state/store";
import { Character } from "../entities/Character";
import { CharacterView } from "../entities/CharacterView";
import { InputController } from "../input/InputController";
import { setupCamera } from "../render/camera";
import { TileCursor } from "../render/TileCursor";
import { DebugOverlay } from "../debug/DebugOverlay";
import { WorldView, DEPTH_ABOVE } from "../world/WorldView";

const NPC_NAMES = ["Lucía", "Wei", "Amara", "Jonas", "Priya", "Mateo", "Sofia", "Kenji"];

interface Npc {
  view: CharacterView;
  waitMs: number;
}

export class WorldScene extends Phaser.Scene {
  private world!: WorldData;
  private player!: CharacterView;
  private npcs: Npc[] = [];
  private input_!: InputController;
  private debug!: DebugOverlay;
  private cursor!: TileCursor;
  private hudTimer = 0;
  private rand = rng(7);

  constructor() {
    super("World");
  }

  create() {
    const registry = store.get().registry as ItemRegistry;
    const raw = this.cache.tilemap.get("town").data as TiledMap;
    this.world = parseWorld(raw);
    const view = new WorldView(this, "town", raw, this.world);

    const spawn = this.world.spawns.find((s) => s.name === "main") ?? { tileX: 1, tileY: 1 };
    const avatar = sanitizeAvatar(store.get().avatar, registry);
    const me = new Character("me", store.get().playerName, avatar, spawn.tileX, spawn.tileY);
    this.player = new CharacterView(this, me, registry);

    // NPCs stand in for remote players until multiplayer exists.
    NPC_NAMES.forEach((name, i) => {
      const tile = this.randomFreeTile();
      const c = new Character(`npc${i}`, name, randomAvatar(registry, this.rand), tile.x, tile.y);
      this.npcs.push({ view: new CharacterView(this, c, registry), waitMs: this.rand() * 3000 });
    });

    this.input_ = new InputController(this);
    this.debug = new DebugOverlay(this, this.world);
    this.cursor = new TileCursor(this);

    const camera = setupCamera(this, this.player.sprite, view.widthPx, view.heightPx, (zoom) => store.set((s) => ({ hud: { ...s.hud, zoom } })));
    store.watch((s) => s.zoomCmd, (c) => camera.zoomStep(c.dir));

    // Minimap floor plan (walls, thin walls, furniture footprints) + own name tag opens the profile card
    const { width, height, grid } = this.world;
    const walls = new Uint8Array(width * height);
    raw.layers.find((l) => l.name === "collision" && l.type === "tilelayer")?.data?.forEach((gid, i) => (walls[i] = gid ? 1 : 0));
    const edges: { x: number; y: number; side: "W" | "N" }[] = [];
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        for (const side of ["W", "N"] as const) if (grid.hasEdge(x, y, side)) edges.push({ x, y, side });
    const furniture = this.world.furniture
      .filter((f) => f.footprint.w > 0 && f.footprint.h > 0)
      .map((f) => ({ x: f.x / TILE, y: f.y / TILE - f.footprint.h, w: f.width / TILE, h: f.footprint.h }));
    store.set({ minimap: { width, height, walls, edges, furniture } });
    this.player.label.onClick(() => store.set({ popover: "profile" }));

    // Store → world bindings
    store.watch((s) => s.avatar, (a) => {
      me.avatar = sanitizeAvatar(a, registry);
      this.player.refreshAvatar();
    });
    store.watch((s) => s.playerName, (n) => (me.name = n));
    store.watch((s) => s.modal, (m) => (this.input_.enabled = !m));

    store.set({ ready: true });
    void DEPTH_ABOVE;
  }

  update(_time: number, delta: number) {
    const dt = Math.min(delta, 100); // avoid huge jumps after tab switch
    const me = this.player.character;

    // input
    const click = this.input_.takeClick();
    if (click) {
      const path = findPath(this.world.grid, me.tile, click);
      if (path) {
        me.setPath(path);
        this.cursor.click(click);
      }
    }
    // hover shadow only where you could actually walk
    const hover = this.input_.hoverTile;
    this.cursor.setHover(hover && this.world.grid.inBounds(hover.x, hover.y) && !this.world.grid.isBlocked(hover.x, hover.y) ? hover : null);

    // logic
    me.update(dt, this.input_.direction, this.world.grid);
    for (const npc of this.npcs) this.updateNpc(npc, dt);

    // render
    this.player.update();
    for (const npc of this.npcs) npc.view.update();
    this.debug.update([this.player.feet(), ...this.npcs.map((n) => n.view.feet())]);

    // HUD (4 Hz)
    this.hudTimer += delta;
    if (this.hudTimer > 250) {
      this.hudTimer = 0;
      const t = me.tile;
      const px = t.x * TILE + TILE / 2;
      const py = t.y * TILE + TILE / 2;
      const zone = this.world.zones.find((z) => px >= z.x && px < z.x + z.width && py >= z.y && py < z.y + z.height);
      store.set((s) => ({ hud: { ...s.hud, fps: Math.round(this.game.loop.actualFps), tileX: t.x, tileY: t.y, zone: zone?.name ?? null } }));
    }
  }

  private updateNpc(npc: Npc, dt: number) {
    const c = npc.view.character;
    if (!c.path.length && !c.walker.moving) {
      npc.waitMs -= dt;
      if (npc.waitMs <= 0) {
        npc.waitMs = 1500 + this.rand() * 4000;
        const t = c.tile;
        for (let tries = 0; tries < 10; tries++) {
          const goal = { x: t.x + Math.floor(this.rand() * 13) - 6, y: t.y + Math.floor(this.rand() * 13) - 6 };
          const path = findPath(this.world.grid, t, goal, 800);
          if (path && path.length) {
            c.setPath(path);
            break;
          }
        }
      }
    }
    c.update(dt, null, this.world.grid);
  }

  private randomFreeTile() {
    for (;;) {
      const x = 2 + Math.floor(this.rand() * (this.world.width - 4));
      const y = 15 + Math.floor(this.rand() * (this.world.height - 17));
      if (!this.world.grid.isBlocked(x, y)) return { x, y };
    }
  }
}
