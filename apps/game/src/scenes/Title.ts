import Phaser from "phaser";

export class Title extends Phaser.Scene {
  constructor() {
    super("Title");
  }
  create() {
    const { width, height } = this.scale;
    this.add.text(width / 2, height / 2 - 40, "BACKPACK", { fontFamily: "monospace", fontSize: "48px", color: "#ffd6a5" }).setOrigin(0.5);
    this.add.text(width / 2, height / 2 + 30, "Start your trip — press ENTER", { fontFamily: "monospace", fontSize: "18px", color: "#ffffff" }).setOrigin(0.5);
    this.input.keyboard?.once("keydown-ENTER", () => this.scene.start("Airport"));
  }
}
