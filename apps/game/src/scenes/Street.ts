import Phaser from "phaser";
import type { PlayerState } from "@backpack/shared";
import { store } from "../store";
import { ui } from "../ui";
import { MARKET_DOOR as MARKET, streetLayout } from "./layouts/street";
import { WorldScene, type DoorDef, type WorldConfig } from "./WorldScene";

/** One open Paris street: café, boulangerie, the (locked) market and the hostel. */
export class Street extends WorldScene {
  protected readonly config: WorldConfig = { bg: "street_bg", bgColor: 0x7d8597, layout: streetLayout };

  private shutter!: Phaser.GameObjects.Rectangle;
  private sign!: Phaser.GameObjects.Text;
  private marketOpen = false;

  constructor() {
    super("Street");
  }

  protected setup() {
    const hasBg = this.textures.exists("street_bg");
    if (!hasBg) {
      this.label(48, 360, "← Aéroport", "#ffd6a5");
      this.label(860, 330, "Auberge →", "#ffd6a5");
    }
    // With the art, the drawn gate is the shutter; the overlay only tints the doorway.
    this.shutter = this.add
      .rectangle(MARKET.x, MARKET.y, MARKET.w, MARKET.h, 0x3a3a3a, hasBg ? 0.35 : 1)
      .setStrokeStyle(3, 0x000000, hasBg ? 0.5 : 1);
    this.sign = this.label(MARKET.x, MARKET.y, "FERMÉ", "#ff6b6b").setFontSize(16);
    this.marketOpen = false;
    this.applyUnlocks(store.state, false);
    const unsubscribe = store.subscribe((s) => this.applyUnlocks(s, true));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubscribe);
  }

  protected onDoor(door: DoorDef) {
    if (door.name === "cafe") return ui.toast("Le Café — talk to the barista");
    if (door.name === "market") {
      if (this.marketOpen) return ui.toast("Le marché est ouvert ! (coming soon)");
      ui.toast("Fermé — the market is closed for now");
      return this.bounce(MARKET.x, MARKET.y + 60);
    }
    super.onDoor(door);
  }

  private applyUnlocks(s: PlayerState | null, animate: boolean) {
    if (this.marketOpen || !s?.unlocks.includes("market")) return;
    this.marketOpen = true;
    this.sign.setText("OUVERT !").setColor("#a5ffd6");
    this.shutter.setFillStyle(0x6a994e, 0.35);
    if (animate) {
      this.cameras.main.flash(400, 165, 255, 214);
      this.tweens.add({ targets: this.sign, scale: 1.4, yoyo: true, repeat: 2, duration: 180 });
      ui.toast("The market district is now open!");
    }
  }
}
