/** Loads data (registry, map, furniture manifest), then the images they reference. */
import Phaser from "phaser";
import type { ItemRegistry } from "@ft/shared";
import { store } from "../../state/store";

const A = "assets/";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  preload() {
    this.load.json("items", A + "characters/items.json");
    this.load.json("furniture", A + "furniture/furniture.json");
    this.load.tilemapTiledJSON("town", A + "maps/town.tmj");
    this.load.image("tiles:terrain", A + "tilesets/terrain.png");
  }

  create() {
    const furniture = this.cache.json.get("furniture") as { name: string }[];
    for (const f of furniture) this.load.image(`furn:${f.name}`, `${A}furniture/${f.name}.png`);
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      store.set({ registry: this.cache.json.get("items") as ItemRegistry });
      this.scene.start("World");
    });
    this.load.start();
  }
}
