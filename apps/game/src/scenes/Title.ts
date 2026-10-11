import Phaser from "phaser";
import { startSession } from "../game/actions";
import { ui } from "../ui";

export class Title extends Phaser.Scene {
  private busy = false;

  constructor() {
    super("Title");
  }

  create() {
    ui.setScene("Title");
    const { width, height } = this.scale;
    this.add.text(width / 2, height / 2 - 40, "BACKPACK", { fontFamily: "monospace", fontSize: "48px", color: "#ffd6a5" }).setOrigin(0.5);
    const status = this.add
      .text(width / 2, height / 2 + 30, "Start your trip — press ENTER", { fontFamily: "monospace", fontSize: "18px", color: "#ffffff" })
      .setOrigin(0.5);
    this.busy = false;
    this.input.keyboard?.on("keydown-ENTER", async () => {
      if (this.busy) return;
      this.busy = true;
      status.setText("Boarding…");
      try {
        await startSession();
        this.scene.start("Airport");
      } catch (e) {
        console.error("[backpack] could not start", e);
        status.setText("Server unreachable — press ENTER to retry");
        this.busy = false;
      }
    });
  }
}
