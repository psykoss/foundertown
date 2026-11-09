/**
 * Input → intents. Keyboard: arrows/WASD (most recent key wins). Mouse/touch: click a tile to walk there.
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

export class InputController {
  private held: Dir[] = [];
  private clicked: TilePos | null = null;
  enabled = true;

  constructor(scene: Phaser.Scene) {
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

    scene.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (!this.enabled) return;
      this.clicked = { x: Math.floor(p.worldX / TILE), y: Math.floor(p.worldY / TILE) };
    });
  }

  /** Current held direction (null if none). */
  get direction(): Dir | null {
    return this.enabled ? (this.held.at(-1) ?? null) : null;
  }

  /** Tile clicked since last call (consumed). */
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
