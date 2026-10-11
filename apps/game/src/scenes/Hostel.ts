import { store } from "../store";
import { ui } from "../ui";
import { masteredPhrases } from "../ui/Backpack";
import { hostelLayout } from "./layouts/hostel";
import { W, WorldScene, type WorldConfig } from "./WorldScene";

/** The hostel: end of the day. */
export class Hostel extends WorldScene {
  protected readonly config: WorldConfig = { bg: "hostel_bg", bgColor: 0x6b4f3a, layout: hostelLayout };

  constructor() {
    super("Hostel");
  }

  protected setup() {
    if (!this.textures.exists("hostel_bg")) this.label(W / 2, 40, "Auberge de jeunesse", "#ffd6a5").setFontSize(20);
    const s = store.state;
    if (s) ui.toast(`Day summary: ${masteredPhrases(s).length} phrases learned · €${s.player.euros} left`);
  }
}
