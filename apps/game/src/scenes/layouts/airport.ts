import type { SceneLayout } from "./types";

/**
 * airport_bg.png. The clerk stands at (720, 236) and the exit is the bottom edge below the benches:
 * both positions are pinned by the L1 e2e tests (talk at (720, 280); walk south from (480, 400)).
 * The two middle seats of each bench row are painted over with floor to open an aisle to the exit.
 */
export const airportLayout: SceneLayout = {
  doors: [{ name: "exit", to: "Street", x: 480, y: 494, w: 96, h: 40 }],
  npcs: [{ id: "clerk", x: 720, y: 236, color: 0xe76f51 }],
  colliders: [
    { label: "back wall", x1: 0, y1: 0, x2: 960, y2: 112 },
    { label: "right wall", x1: 888, y1: 0, x2: 960, y2: 540 },
    { label: "SIM kiosk", x1: 100, y1: 184, x2: 262, y2: 334 },
    { label: "SIM sign", x1: 272, y1: 312, x2: 324, y2: 340 },
    { label: "plant NW", x1: 298, y1: 112, x2: 330, y2: 150 },
    { label: "plant NE", x1: 838, y1: 112, x2: 870, y2: 150 },
    { label: "plant SW", x1: 342, y1: 474, x2: 372, y2: 512 },
    { label: "plant SE", x1: 696, y1: 474, x2: 726, y2: 512 },
    { label: "benches row 1 west", x1: 360, y1: 392, x2: 440, y2: 418 },
    { label: "benches row 1 east", x1: 500, y1: 392, x2: 692, y2: 418 },
    { label: "benches row 2 west", x1: 360, y1: 452, x2: 440, y2: 478 },
    { label: "benches row 2 east", x1: 500, y1: 452, x2: 692, y2: 478 },
    { label: "luggage", x1: 744, y1: 390, x2: 800, y2: 428 },
  ],
  patches: [
    { label: "aisle row 1", x1: 440, y1: 388, x2: 500, y2: 424, dy: -96 },
    { label: "aisle row 2", x1: 440, y1: 448, x2: 500, y2: 484, dy: -96 },
  ],
  spawns: { default: { x: 480, y: 300 }, Street: { x: 480, y: 440 } },
};
