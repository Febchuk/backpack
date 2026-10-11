import Phaser from "phaser";
import type { PlayerState } from "@backpack/shared";
import { store } from "../store";
import { ui } from "../ui";
import { WorldScene, type DoorDef, type WorldConfig } from "./WorldScene";

const MARKET = { x: 720, y: 140, w: 120, h: 44 };

/** One open Paris street: café, boulangerie, the (locked) market and the hostel. */
export class Street extends WorldScene {
  protected readonly config: WorldConfig = {
    bg: "street_bg",
    bgColor: 0x7d8597,
    doors: [
      { name: "airport", to: "Airport", x: 48, y: 300, w: 40, h: 96 },
      { name: "cafe", to: "Street", x: 250, y: 140, w: 140, h: 44 },
      { name: "market", to: "Market", ...MARKET },
      { name: "hostel", to: "Hostel", x: 912, y: 300, w: 40, h: 96 },
    ],
    npcs: [
      { id: "barista", x: 250, y: 200, color: 0x9c6644 },
      { id: "margaux", x: 480, y: 200, color: 0xf4a261 },
      { id: "girard", x: 600, y: 398, color: 0x6d6875 },
    ],
    solids: [
      { x: 250, y: 63, w: 160, h: 94, color: 0x9c6644, label: "Café" },
      { x: 480, y: 63, w: 160, h: 94, color: 0xe9c46a, label: "Boulangerie" },
      { x: 720, y: 63, w: 160, h: 94, color: 0x6a994e, label: "Marché" },
      { x: 600, y: 430, w: 96, h: 20, color: 0x8d6e63, label: "banc" },
    ],
    spawns: { default: { x: 110, y: 300 }, Airport: { x: 110, y: 300 }, Hostel: { x: 850, y: 300 } },
  };

  private shutter!: Phaser.GameObjects.Rectangle;
  private sign!: Phaser.GameObjects.Text;
  private marketOpen = false;

  constructor() {
    super("Street");
  }

  protected setup() {
    this.label(48, 240, "← Aéroport", "#ffd6a5");
    this.label(912, 240, "Auberge →", "#ffd6a5");
    this.shutter = this.add.rectangle(MARKET.x, MARKET.y, MARKET.w, MARKET.h, 0x3a3a3a).setStrokeStyle(3, 0x000000);
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
