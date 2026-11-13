/**
 * Pointer → studio intents. While the studio is open, the pointer on the canvas edits the office:
 * positions go to the editing logic in world pixels (`state/studio.ts`), which decides what a press
 * means; a press on nothing drags the camera. This controller never changes the layout itself.
 */
import Phaser from "phaser";
import { studioDown, studioHover, studioLeave, studioMove, studioUp } from "../../state/studio";
import type { CameraControls } from "../render/camera";
import { HANDLE_PX } from "../render/StudioOverlay";

/** How close (screen px) the pointer must be to an edge of the selected space to grab it. */
const REACH_PX = HANDLE_PX + 3;

export class StudioInput {
  enabled = false;
  private panning = false;
  private last = { x: 0, y: 0 };

  constructor(private scene: Phaser.Scene, camera: CameraControls) {
    const cam = scene.cameras.main;
    const reach = () => REACH_PX / cam.zoom;
    const world = (p: Phaser.Input.Pointer) => (p.updateWorldPoint(cam), p);

    scene.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (!this.enabled) return;
      world(p);
      this.last = { x: p.x, y: p.y };
      this.panning = p.button !== 0 || !studioDown(p.worldX, p.worldY, reach());
      if (this.panning) this.cursor("grabbing");
    });
    scene.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (!this.enabled) return;
      world(p);
      if (this.panning) {
        camera.panBy(p.x - this.last.x, p.y - this.last.y);
        this.last = { x: p.x, y: p.y };
      } else if (p.isDown) studioMove(p.worldX, p.worldY);
      else this.cursor(studioHover(p.worldX, p.worldY, reach()));
    });
    const release = () => {
      if (!this.enabled) return;
      this.panning = false;
      studioUp();
    };
    scene.input.on("pointerup", release);
    scene.input.on("pointerupoutside", release);
    scene.input.on(Phaser.Input.Events.GAME_OUT, () => this.enabled && !scene.input.activePointer.isDown && studioLeave());
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    this.panning = false;
    this.cursor("");
  }

  private cursor(name: string) {
    this.scene.game.canvas.style.cursor = name;
  }
}
