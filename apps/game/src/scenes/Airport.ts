import { W, WorldScene, type WorldConfig } from "./WorldScene";

/** Charles de Gaulle arrivals: the SIM kiosk and the exit to the street. */
export class Airport extends WorldScene {
  protected readonly config: WorldConfig = {
    bg: "airport_bg",
    bgColor: 0x8a9bb0,
    doors: [{ name: "exit", to: "Street", x: 480, y: 490, w: 96, h: 40 }],
    npcs: [{ id: "clerk", x: 720, y: 236, color: 0xe76f51 }],
    solids: [
      { x: 720, y: 180, w: 128, h: 56, color: 0x2a9d8f, label: "SIM · Cartes SIM" },
      { x: 200, y: 120, w: 200, h: 40, color: 0x5c677d, label: "Bagages" },
    ],
    spawns: { default: { x: 480, y: 300 }, Street: { x: 480, y: 420 } },
  };

  constructor() {
    super("Airport");
  }

  protected setup() {
    this.label(W / 2, 40, "Bienvenue à Paris", "#ffd6a5").setFontSize(20);
    this.label(480, 462, "SORTIE ↓", "#ffd6a5");
  }
}
