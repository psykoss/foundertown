/**
 * Input → intents. Keyboard: arrows/WASD (most recent key wins). Mouse/touch: double-click a tile to walk there;
 * the tile under the mouse is exposed as the hover tile.
 * The controller never moves anything itself.
 */
import Phaser from "phaser";
import { TILE, type Dir, type TilePos } from "@ft/shared";

const KEYMAP: Record<string, Dir> = {
  ArrowUp: "up", KeyW: "up",
  ArrowDown: "down", KeyS: "down",
  ArrowLeft: "left", KeyA: "left",
  ArrowRight: "right", KeyD: "right",
};

/** Longest gap between the two presses of a double click. */
const DOUBLE_CLICK_MS = 350;

export class InputController {
  private held: Dir[] = [];
  private clicked: TilePos | null = null;
  private lastDown: { tile: TilePos; time: number } | null = null;
  private overGame = false;
  enabled = true;

  constructor(private scene: Phaser.Scene) {
    const kb = scene.input.keyboard!;
    kb.on("keydown", (e: KeyboardEvent) => {
      if (!this.enabled || isTyping(e)) return;
      const d = KEYMAP[e.code];
      if (!d) return;
      e.preventDefault();
      this.held = [...this.held.filter((x) => x !== d), d];
    });
    kb.on("keyup", (e: KeyboardEvent) => {
      const d = KEYMAP[e.code];
      if (d) this.held = this.held.filter((x) => x !== d);
    });
    scene.game.events.on(Phaser.Core.Events.BLUR, () => (this.held = []));

    scene.input.on(Phaser.Input.Events.GAME_OVER, () => (this.overGame = true));
    scene.input.on(Phaser.Input.Events.GAME_OUT, () => (this.overGame = false));
    scene.input.on("pointermove", () => (this.overGame = true));

    // Walking takes a double click (two presses on the same tile within DOUBLE_CLICK_MS); a single click does nothing.
    scene.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (!this.enabled) return;
      const tile = { x: Math.floor(p.worldX / TILE), y: Math.floor(p.worldY / TILE) };
      const prev = this.lastDown;
      if (prev && p.downTime - prev.time <= DOUBLE_CLICK_MS && prev.tile.x === tile.x && prev.tile.y === tile.y) {
        this.clicked = tile;
        this.lastDown = null;
      } else this.lastDown = { tile, time: p.downTime };
    });
  }

  /** Current held direction (null if none). */
  get direction(): Dir | null {
    return this.enabled ? (this.held.at(-1) ?? null) : null;
  }

  /** Tile under the mouse right now (null when the mouse is elsewhere, on touch, or input is disabled). */
  get hoverTile(): TilePos | null {
    const p = this.scene.input.activePointer;
    if (!this.enabled || !this.overGame || p.wasTouch) return null;
    p.updateWorldPoint(this.scene.cameras.main); // the camera moves under a still mouse
    return { x: Math.floor(p.worldX / TILE), y: Math.floor(p.worldY / TILE) };
  }

  /** Tile double-clicked since last call (consumed). */
  takeClick(): TilePos | null {
    const c = this.clicked;
    this.clicked = null;
    return c;
  }
}

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
}
