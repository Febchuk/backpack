import type { SceneLayout } from "./types";

/** hostel_bg.png: lockers and reception along the back wall, three beds on the right, exit door on the left. */
export const hostelLayout: SceneLayout = {
  doors: [{ name: "street", to: "Street", x: 26, y: 292, w: 40, h: 96 }],
  // Inès works the reception desk; talk to her from the front of it.
  npcs: [{ id: "ines", x: 480, y: 164, color: 0xe9c46a }],
  colliders: [
    { label: "back wall", x1: 0, y1: 0, x2: 960, y2: 110 },
    { label: "left wall", x1: 0, y1: 0, x2: 16, y2: 540 },
    { label: "lockers", x1: 40, y1: 110, x2: 276, y2: 176 },
    { label: "reception desk", x1: 358, y1: 110, x2: 602, y2: 196 },
    { label: "bed blue", x1: 668, y1: 206, x2: 746, y2: 382 },
    { label: "bed green", x1: 760, y1: 206, x2: 840, y2: 382 },
    { label: "bed red", x1: 852, y1: 206, x2: 932, y2: 382 },
    { label: "plant west", x1: 38, y1: 482, x2: 68, y2: 512 },
    { label: "plant east", x1: 278, y1: 482, x2: 308, y2: 512 },
  ],
  spawns: { default: { x: 480, y: 460 }, Street: { x: 96, y: 292 } },
};
