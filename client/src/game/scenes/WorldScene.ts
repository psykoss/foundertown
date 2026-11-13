/**
 * The world: map + characters + camera + input + debug.
 * Update order each frame: input → logic (Character.update) → render (CharacterView.update).
 *
 * Multiplayer: the player moves locally at once (prediction) and reports each step; the server
 * validates it and may send the player back (`snap`). Everyone else is a Character walking toward
 * the tile the server last reported for them (`store.players`).
 *
 * The world is rebuilt in place whenever its data changes: another lobby (the town map or the
 * office map), a new office layout, or the studio holding a space in hand (`studio.preview`).
 * In the studio the same world is shown without characters, under a free camera.
 */
import Phaser from "phaser";
import {
  TILE, buildWorld, findPath, mapOf, sanitizeAvatar, spaceAt,
  type ItemRegistry, type MapName, type TiledMap, type WorldData,
} from "@ft/shared";
import { sendMove } from "../../net/room";
import { store, type RemotePlayer } from "../../state/store";
import { Character } from "../entities/Character";
import { CharacterView } from "../entities/CharacterView";
import { InputController } from "../input/InputController";
import { StudioInput } from "../input/StudioInput";
import { setupCamera, type CameraControls } from "../render/camera";
import { FocusVeil } from "../render/FocusVeil";
import { StudioOverlay } from "../render/StudioOverlay";
import { TileCursor } from "../render/TileCursor";
import { WorldLayer } from "../render/WorldLayer";
import { DebugOverlay } from "../debug/DebugOverlay";
import { WorldView } from "../world/WorldView";

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
  /** The map on screen (`town` or `office`), its Tiled data and its tile layers. */
  private mapName: MapName | null = null;
  private raw!: TiledMap;
  private view!: WorldView;
  private camera?: CameraControls;
  private player!: CharacterView;
  private items!: ItemRegistry;
  private remotes = new Map<string, Remote>();
  /** Last position reported to the server. */
  private sent = { x: -1, y: -1, dir: "" };
  private input_!: InputController;
  private studioInput!: StudioInput;
  private studioOverlay!: StudioOverlay;
  private veil!: FocusVeil;
  private debug?: DebugOverlay;
  private cursor!: TileCursor;
  private hudTimer = 0;

  constructor() {
    super("World");
  }

  create() {
    const registry = (this.items = store.get().registry as ItemRegistry);
    new WorldLayer(this);
    this.veil = new FocusVeil(this);
    this.loadWorld();

    const spawn = this.world.spawns.find((s) => s.name === "main") ?? { tileX: 1, tileY: 1 };
    const avatar = sanitizeAvatar(store.get().avatar, registry);
    const me = new Character("me", store.get().playerName, avatar, spawn.tileX, spawn.tileY);
    this.player = new CharacterView(this, me, registry);

    this.input_ = new InputController(this);
    this.debug = new DebugOverlay(this, this.world);
    this.cursor = new TileCursor(this);

    const camera = (this.camera = setupCamera(this, this.player.sprite, this.view.widthPx, this.view.heightPx, (zoom) => store.set((s) => ({ hud: { ...s.hud, zoom } }))));
    store.watch((s) => s.zoomCmd, (c) => camera.zoomStep(c.dir));
    this.studioInput = new StudioInput(this, camera);
    this.studioOverlay = new StudioOverlay(this);
    this.player.label.onClick(() => store.set({ popover: "profile" }));

    // World data → world: another lobby (map), another office layout, a space in hand in the studio
    store.watch((s) => s.net.lobby, () => this.loadWorld());
    store.watch((s) => s.office, () => this.loadWorld());
    store.watch((s) => s.studio.preview, () => this.loadWorld());
    const studio = (on: boolean) => {
      camera.setFree(on);
      this.studioInput.setEnabled(on);
      this.player.setShown(!on);
      for (const r of this.remotes.values()) r.view.setShown(!on);
    };
    store.watch((s) => s.view === "studio", studio);
    if (store.get().view === "studio") studio(true);

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
  }

  /**
   * Bring the world in line with the store: the map of the lobby we are in, with the office layout
   * (or the studio's preview of it) laid over. The tile layers are rebuilt only when the map changes.
   */
  private loadWorld() {
    const s = store.get();
    const name = mapOf(s.net.lobby);
    if (name !== this.mapName) {
      this.view?.destroy();
      this.mapName = name;
      this.raw = this.cache.tilemap.get(name).data as TiledMap;
      this.view = new WorldView(this, name);
      this.camera?.setWorld(this.view.widthPx, this.view.heightPx);
    }
    const preview = s.studio.preview;
    this.world = buildWorld(this.raw, preview?.layout ?? s.office);
    this.view.setWorld(this.world);
    this.debug?.setWorld(this.world);
    if (!preview) this.publishPlan();
  }

  /** Floor plan for the minimap (walls, thin walls, furniture footprints, spaces) and the floor the studio can build on. */
  private publishPlan() {
    const { width, height, grid, build, spaces } = this.world;
    const walls = new Uint8Array(width * height);
    this.raw.layers.find((l) => l.name === "collision" && l.type === "tilelayer")?.data?.forEach((gid, i) => (walls[i] = gid ? 1 : 0));
    const edges: { x: number; y: number; side: "W" | "N" }[] = [];
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        for (const side of ["W", "N"] as const) if (grid.hasEdge(x, y, side)) edges.push({ x, y, side });
    const furniture = this.world.furniture
      .filter((f) => f.footprint.w > 0 && f.footprint.h > 0)
      .map((f) => ({ x: f.x / TILE, y: f.y / TILE - f.footprint.h, w: f.width / TILE, h: f.footprint.h }));
    store.set({ minimap: { width, height, walls, edges, furniture, spaces }, build });
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
    this.debug?.update([this.player.feet(), ...[...this.remotes.values()].map((r) => r.view.feet())]);
    const { view: page, studio, office, build } = store.get();
    const editing = page === "studio";
    this.studioOverlay.update(editing ? studio : null, office, build);
    // focus: standing in a space blurs everything outside it (one tile more above it, where heads and desk tops reach)
    const here = editing ? undefined : spaceAt(this.world.spaces, at.x, at.y);
    this.veil.set(here ? { x: here.x * TILE, y: (here.y - 1) * TILE, width: here.w * TILE, height: (here.h + 1) * TILE } : null);

    // HUD (4 Hz)
    this.hudTimer += delta;
    if (this.hudTimer > 250) {
      this.hudTimer = 0;
      const t = me.tile;
      const px = t.x * TILE + TILE / 2;
      const py = t.y * TILE + TILE / 2;
      const zone = this.world.zones.find((z) => px >= z.x && px < z.x + z.width && py >= z.y && py < z.y + z.height);
      const dept = spaceAt(this.world.spaces, t.x, t.y)?.kind ?? null;
      store.set((s) => ({ hud: { ...s.hud, fps: Math.round(this.game.loop.actualFps), tileX: t.x, tileY: t.y, zone: zone?.name ?? null, dept } }));
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
        view.setShown(store.get().view !== "studio");
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
