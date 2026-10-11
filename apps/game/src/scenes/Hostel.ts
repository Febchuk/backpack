import Phaser from "phaser";

/** L0 placeholder. Game lane builds the real scene. */
export class Hostel extends Phaser.Scene {
  constructor() {
    super("Hostel");
  }
  create() {
    this.add.text(20, 20, "Hostel", { fontFamily: "monospace", fontSize: "24px", color: "#ffffff" });
  }
}
