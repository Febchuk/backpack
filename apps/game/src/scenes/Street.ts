import Phaser from "phaser";

/** L0 placeholder. Game lane builds the real scene. */
export class Street extends Phaser.Scene {
  constructor() {
    super("Street");
  }
  create() {
    this.add.text(20, 20, "Street", { fontFamily: "monospace", fontSize: "24px", color: "#ffffff" });
  }
}
