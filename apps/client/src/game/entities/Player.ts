import { PLAYER_SPEED, frameKey } from "@founder-town/shared";
import type { Direction, Point } from "@founder-town/shared";
import type Phaser from "phaser";
import { walkAnimationKey } from "../render/avatarComposer";
import type { GameMap } from "../systems/map";
import { moveWithCollision } from "../systems/movement";

/** Height of the sprite's head above the feet anchor, in pixels. */
export const PLAYER_HEAD_HEIGHT = 42;

export class Player {
  readonly sprite: Phaser.GameObjects.Sprite;
  private position: Point;
  private facing: Direction = "down";
  private moving = false;

  constructor(
    scene: Phaser.Scene,
    private readonly textureKey: string,
    private readonly map: GameMap,
    spawn: Point,
    anchor: Point,
    frameSize: { w: number; h: number },
  ) {
    this.position = { ...spawn };
    this.sprite = scene.add
      .sprite(spawn.x, spawn.y, textureKey, frameKey("down", "idle"))
      .setOrigin(anchor.x / frameSize.w, anchor.y / frameSize.h);
  }

  /** Whole-pixel feet position. */
  get feet(): Point {
    return {
      x: Math.round(this.position.x),
      y: Math.round(this.position.y),
    };
  }

  /** Advances the simulation by one fixed step. */
  step(direction: Direction | null, seconds: number): void {
    this.moving = direction !== null;
    if (!direction) return;
    this.facing = direction;
    this.position = moveWithCollision(
      this.map,
      this.position,
      direction,
      PLAYER_SPEED * seconds,
    );
  }

  /** Updates the sprite to match the simulation. */
  render(): void {
    const { x, y } = this.feet;
    this.sprite.setPosition(x, y).setDepth(y);
    if (this.moving) {
      this.sprite.play(walkAnimationKey(this.textureKey, this.facing), true);
    } else {
      this.sprite.stop();
      this.sprite.setFrame(frameKey(this.facing, "idle"));
    }
  }
}
