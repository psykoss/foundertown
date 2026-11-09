import {
  CHARACTER_ANCHOR,
  CHARACTER_SIZE,
  DEFAULT_AVATAR,
  TICK_HZ,
} from "@founder-town/shared";
import type { Direction, PropMeta } from "@founder-town/shared";
import Phaser from "phaser";
import { bridge } from "../../bridge/events";
import { PLAYER_HEAD_HEIGHT, Player } from "../entities/Player";
import { composeAvatar } from "../render/avatarComposer";
import { cameraScroll, chooseZoom, worldToScreen } from "../systems/camera";
import { parseMap } from "../systems/map";
import type { GameMap } from "../systems/map";
import { DirectionInput } from "../systems/movement";
import type { Overlay } from "./Overlay";
import { OFFICE_MAP, PROP_ATLAS, TILE_ATLAS } from "./Preload";

const STEP_MS = 1000 / TICK_HZ;
const STEP_SECONDS = 1 / TICK_HZ;
/** Limits catch-up after a stall, such as a background tab. */
const MAX_FRAME_MS = 100;
const FLOOR_DEPTH = -1;
const TAG_GAP = 2;
const PLAYER_NAME = "Founder";

const KEY_BINDINGS: readonly (readonly [string, Direction])[] = [
  ["LEFT", "left"],
  ["A", "left"],
  ["RIGHT", "right"],
  ["D", "right"],
  ["UP", "up"],
  ["W", "up"],
  ["DOWN", "down"],
  ["S", "down"],
];

export class Room extends Phaser.Scene {
  private map!: GameMap;
  private player!: Player;
  private zoom = 1;
  private readonly directionInput = new DirectionInput();
  private accumulator = 0;

  constructor() {
    super("Room");
  }

  create(): void {
    this.map = parseMap(this.cache.json.get(OFFICE_MAP));
    this.renderTiles();
    this.renderProps();

    this.player = new Player(
      this,
      composeAvatar(this, DEFAULT_AVATAR),
      this.map,
      this.map.spawn,
      CHARACTER_ANCHOR,
      CHARACTER_SIZE,
    );

    this.bindKeys();
    this.updateZoom();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.updateZoom, this);
    this.renderFrame();

    bridge.emit("game:ready", { scene: this.scene.key });
  }

  override update(_time: number, delta: number): void {
    this.accumulator += Math.min(delta, MAX_FRAME_MS);
    while (this.accumulator >= STEP_MS) {
      this.player.step(this.directionInput.current, STEP_SECONDS);
      this.accumulator -= STEP_MS;
    }
    this.renderFrame();
  }

  private renderFrame(): void {
    this.player.render();
    const { w, h } = this.viewSize();
    const scroll = cameraScroll(this.player.feet, { w, h }, this.zoom, {
      w: this.map.width * this.map.tileSize,
      h: this.map.height * this.map.tileSize,
    });
    this.cameras.main.setScroll(scroll.x, scroll.y);

    if (this.scene.isActive("Overlay")) {
      const { x, y } = this.player.feet;
      const tag = worldToScreen(
        { x, y: y - PLAYER_HEAD_HEIGHT },
        scroll,
        { w, h },
        this.zoom,
      );
      (this.scene.get("Overlay") as Overlay).placeTag(
        "local",
        PLAYER_NAME,
        tag.x,
        tag.y - TAG_GAP * (window.devicePixelRatio || 1),
      );
    }
  }

  private viewSize(): { w: number; h: number } {
    return { w: this.scale.gameSize.width, h: this.scale.gameSize.height };
  }

  private updateZoom(): void {
    this.zoom = chooseZoom(
      window.innerWidth,
      window.innerHeight,
      window.devicePixelRatio || 1,
    );
    this.cameras.main.setZoom(this.zoom);
  }

  private bindKeys(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) return;
    for (const [code, direction] of KEY_BINDINGS) {
      const key = keyboard.addKey(code);
      key.on("down", () => this.directionInput.press(direction));
      key.on("up", () => this.directionInput.release(direction));
    }
    this.game.events.on(Phaser.Core.Events.BLUR, () =>
      this.directionInput.clear(),
    );
  }

  private renderTiles(): void {
    const { width, tileSize, floor, walls } = this.map;
    const place = (frame: string | null, index: number, isWall: boolean) => {
      if (!frame) return;
      const x = (index % width) * tileSize;
      const y = Math.floor(index / width) * tileSize;
      this.add
        .image(x, y, TILE_ATLAS, frame)
        .setOrigin(0, 0)
        .setDepth(isWall ? y + tileSize : FLOOR_DEPTH);
    };
    floor.forEach((frame, index) => place(frame, index, false));
    walls.forEach((frame, index) => place(frame, index, true));
  }

  /**
   * Splits props at the footprint's top edge. The base sorts at the front of
   * the footprint and the overhang at the back, so someone standing behind the
   * prop is covered by it.
   */
  private renderProps(): void {
    const texture = this.textures.get(PROP_ATLAS);
    const { props: metas } = (
      texture.customData as { meta: { props: Record<string, PropMeta> } }
    ).meta;
    for (const { id, x, y } of this.map.props) {
      const meta = metas[id];
      if (!meta) throw new Error(`Unknown prop "${id}" in map`);
      const frame = texture.get(id);
      const { origin } = meta;
      const overhangFrame = `${id}:overhang`;
      const baseFrame = `${id}:base`;
      if (!texture.has(baseFrame)) {
        texture.add(
          overhangFrame,
          0,
          frame.cutX,
          frame.cutY,
          frame.cutWidth,
          origin.y,
        );
        texture.add(
          baseFrame,
          0,
          frame.cutX,
          frame.cutY + origin.y,
          frame.cutWidth,
          frame.cutHeight - origin.y,
        );
      }
      const left = x - origin.x;
      this.add
        .image(left, y - origin.y, PROP_ATLAS, overhangFrame)
        .setOrigin(0, 0)
        .setDepth(y);
      this.add
        .image(left, y, PROP_ATLAS, baseFrame)
        .setOrigin(0, 0)
        .setDepth(y + meta.footprint.h * this.map.tileSize);
    }
  }
}
