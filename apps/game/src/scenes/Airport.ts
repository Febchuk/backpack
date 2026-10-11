import { airportLayout } from "./layouts/airport";
import { W, WorldScene, type WorldConfig } from "./WorldScene";

/** Charles de Gaulle arrivals: the SIM kiosk and the exit to the street. */
export class Airport extends WorldScene {
  protected readonly config: WorldConfig = { bg: "airport_bg", bgColor: 0x8a9bb0, layout: airportLayout };

  constructor() {
    super("Airport");
  }

  protected setup() {
    if (!this.textures.exists("airport_bg")) this.label(W / 2, 40, "Bienvenue à Paris", "#ffd6a5").setFontSize(20);
    this.label(480, 468, "SORTIE ↓", "#ffd6a5").setDepth(999);
  }
}
