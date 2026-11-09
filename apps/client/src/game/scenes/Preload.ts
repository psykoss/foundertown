import Phaser from "phaser";
import { CHARACTER_ATLAS } from "../render/avatarComposer";

export const TILE_ATLAS = "tiles";
export const PROP_ATLAS = "props";
export const OFFICE_MAP = "office";

export class Preload extends Phaser.Scene {
  constructor() {
    super("Preload");
  }

  preload(): void {
    this.load.on(
      Phaser.Loader.Events.FILE_LOAD_ERROR,
      (file: Phaser.Loader.File) => {
        throw new Error(`Could not load ${file.src}. Run npm run art:build.`);
      },
    );
    for (const atlas of [CHARACTER_ATLAS, TILE_ATLAS, PROP_ATLAS]) {
      this.load.atlas(atlas, `assets/${atlas}.png`, `assets/${atlas}.json`);
    }
    this.load.json(OFFICE_MAP, "maps/office.tmj");
  }

  create(): void {
    this.scene.start("Room");
    this.scene.launch("Overlay");
  }
}
