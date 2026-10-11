import { store } from "../store";
import { ui } from "../ui";
import { masteredPhrases } from "../ui/Backpack";
import { W, WorldScene, type WorldConfig } from "./WorldScene";

/** The hostel: end of the day. */
export class Hostel extends WorldScene {
  protected readonly config: WorldConfig = {
    bg: "hostel_bg",
    bgColor: 0x6b4f3a,
    doors: [{ name: "street", to: "Street", x: 480, y: 490, w: 96, h: 40 }],
    npcs: [],
    solids: [
      { x: 480, y: 120, w: 200, h: 40, color: 0x9c6644, label: "Réception" },
      { x: 160, y: 300, w: 64, h: 112, color: 0x457b9d, label: "Lit" },
      { x: 800, y: 300, w: 64, h: 112, color: 0x457b9d, label: "Lit" },
    ],
    spawns: { default: { x: 480, y: 400 } },
  };

  constructor() {
    super("Hostel");
  }

  protected setup() {
    this.label(W / 2, 40, "Auberge de jeunesse", "#ffd6a5").setFontSize(20);
    const s = store.state;
    if (s) ui.toast(`Day summary: ${masteredPhrases(s).length} phrases learned · €${s.player.euros} left`);
  }
}
