/**
 * The world: map + characters + camera + input + debug.
 * Update order each frame: input → logic (Character.update) → render (CharacterView.update).
 *
 * Multiplayer: the player moves locally at once (prediction) and reports each step; the server
 * validates it and may send the player back (`snap`). Everyone else is a Character walking toward
 * the tile the server last reported for them (`store.players`).
 */
import Phaser from "phaser";
import {
  TILE, findPath, parseWorld, sanitizeAvatar,
  type ItemRegistry, type TiledMap, type WorldData,
} from "@ft/shared";
import { sendMove } from "../../net/room";
import { store, type RemotePlayer } from "../../state/store";
import { Character } from "../entities/Character";
import { CharacterView } from "../entities/CharacterView";
import { InputController } from "../input/InputController";
import { setupCamera } from "../render/camera";
import { TileCursor } from "../render/TileCursor";
import { DebugOverlay } from "../debug/DebugOverlay";
import { WorldView, DEPTH_ABOVE } from "../world/WorldView";

/** A remote player further than this from where we last drew them is moved at once instead of walked. */
const WALK_RANGE = 10;
/** Remote players that fell behind their reported position walk this much faster until they catch up. */
const CATCH_UP = 1.5;

interface Remote {
  view: CharacterView;
  /** The store snapshot this view was last synced to. */
  data: RemotePlayer;
}

export class WorldScene extends Phaser.Scene {
  private world!: WorldData;
  private player!: CharacterView;
  private items!: ItemRegistry;
  private remotes = new Map<string, Remote>();
  /** Last position reported to the server. */
  private sent = { x: -1, y: -1, dir: "" };
  private input_!: InputController;
  private debug!: DebugOverlay;
  private cursor!: TileCursor;
  private hudTimer = 0;

  constructor() {
    super("World");
  }

  create() {
    const registry = (this.items = store.get().registry as ItemRegistry);
    const raw = this.cache.tilemap.get("town").data as TiledMap;
    this.world = parseWorld(raw);
    const view = new WorldView(this, "town", raw, this.world);

    const spawn = this.world.spawns.find((s) => s.name === "main") ?? { tileX: 1, tileY: 1 };
    const avatar = sanitizeAvatar(store.get().avatar, registry);
    const me = new Character("me", store.get().playerName, avatar, spawn.tileX, spawn.tileY);
    this.player = new CharacterView(this, me, registry);

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
    store.watch((s) => !!s.modal || s.view !== "map", (away) => (this.input_.enabled = !away));
    store.watch((s) => s.speaking, (on) => this.player.label.setSpeaking(on));

    // Net → world bindings
    store.watch((s) => s.snap, ({ x, y }) => {
      me.teleport(x, y);
      this.sent = { x, y, dir: "" }; // the tile is the server's; the facing still has to be reported
    });
    store.watch((s) => s.players, () => this.syncRemotes());
    store.watch((s) => s.selfId, () => this.syncRemotes());
    this.syncRemotes();

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
    const at = me.tile;
    const dir = me.walker.dir;
    if (at.x !== this.sent.x || at.y !== this.sent.y || dir !== this.sent.dir) {
      this.sent = { x: at.x, y: at.y, dir };
      sendMove({ x: at.x, y: at.y, dir });
    }
    for (const { view, data } of this.remotes.values()) {
      const c = view.character;
      c.update(c.path.length > 2 ? dt * CATCH_UP : dt, null, this.world.grid);
      c.face(data.dir);
    }

    // render
    this.player.update();
    for (const { view } of this.remotes.values()) view.update();
    this.debug.update([this.player.feet(), ...[...this.remotes.values()].map((r) => r.view.feet())]);

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

  /** Bring the remote characters in line with `store.players`: add, remove, retarget, restyle. */
  private syncRemotes() {
    const { players, selfId } = store.get();
    for (const [id, r] of this.remotes) {
      if (players[id] && id !== selfId) continue;
      r.view.destroy();
      this.remotes.delete(id);
    }
    for (const p of Object.values(players)) {
      if (p.id === selfId) continue;
      let r = this.remotes.get(p.id);
      if (!r) {
        const c = new Character(p.id, p.name, sanitizeAvatar(p.avatar, this.items), p.x, p.y, p.dir);
        const view = new CharacterView(this, c, this.items);
        view.onClick(() => store.set({ popover: "player", selected: p.id }));
        this.remotes.set(p.id, (r = { view, data: p }));
      } else if (r.data !== p) {
        const c = r.view.character;
        c.name = p.name;
        if (p.avatar !== r.data.avatar) {
          c.avatar = sanitizeAvatar(p.avatar, this.items);
          r.view.refreshAvatar();
        }
        if (p.x !== r.data.x || p.y !== r.data.y) {
          const from = c.tile;
          const near = Math.abs(p.x - from.x) + Math.abs(p.y - from.y) <= WALK_RANGE;
          const path = near ? findPath(this.world.grid, from, p, 500) : null;
          if (path) c.setPath(path);
          else c.teleport(p.x, p.y, p.dir);
        }
        r.data = p;
      }
      r.view.label.setSpeaking(p.speaking);
    }
  }
}
