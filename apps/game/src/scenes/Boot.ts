import Phaser from "phaser";
import { fetchManifest } from "../assets";

/** Loads every image listed in assets/manifest.json, then hands off to Title. Missing files are fine. */
export class Boot extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  async create() {
    const images = (await fetchManifest()).images ?? {};
    const entries = Object.entries(images);
    if (entries.length === 0) return this.scene.start("Title");
    for (const [key, file] of entries) this.load.image(key, `assets/${file}`);
    this.load.on("loaderror", (f: Phaser.Loader.File) => console.warn("[backpack] missing asset", f.key));
    this.load.once("complete", () => this.scene.start("Title"));
    this.load.start();
  }
}
