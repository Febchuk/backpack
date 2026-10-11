import Phaser from "phaser";

/** L0 placeholder. Game lane builds the real scene. */
export class Airport extends Phaser.Scene {
  constructor() {
    super("Airport");
  }
  create() {
    this.add.text(20, 20, "Airport", { fontFamily: "monospace", fontSize: "24px", color: "#ffffff" });
  }
}
