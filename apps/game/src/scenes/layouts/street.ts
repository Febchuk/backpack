import type { DoorDef, SceneLayout } from "./types";

/** The locked market gate, on the sidewalk in front of the drawn MARCHÉ gate. */
export const MARKET_DOOR: DoorDef = { name: "market", to: "Market", x: 760, y: 174, w: 120, h: 36 };

/** street_bg.png: facades along the top, the sidewalk (y 152–195) is walkable, the hostel on the right. */
export const streetLayout: SceneLayout = {
  doors: [
    { name: "airport", to: "Airport", x: 36, y: 420, w: 40, h: 96 },
    { name: "cafe", to: "Street", x: 200, y: 174, w: 160, h: 36 },
    MARKET_DOOR,
    { name: "hostel", to: "Hostel", x: 852, y: 400, w: 48, h: 80 },
  ],
  npcs: [
    { id: "barista", x: 250, y: 200, color: 0x9c6644 },
    { id: "margaux", x: 470, y: 196, color: 0xf4a261 },
    { id: "girard", x: 500, y: 368, color: 0x6d6875 },
    // Busking on the corner of the hostel block.
    { id: "theo", x: 812, y: 252, color: 0x2a9d8f },
  ],
  colliders: [
    { label: "café", x1: 0, y1: 0, x2: 352, y2: 150 },
    { label: "boulangerie", x1: 352, y1: 0, x2: 540, y2: 150 },
    { label: "building", x1: 540, y1: 0, x2: 672, y2: 150 },
    { label: "marché gate", x1: 672, y1: 0, x2: 852, y2: 150 },
    { label: "building east", x1: 852, y1: 0, x2: 960, y2: 150 },
    { label: "hostel building", x1: 852, y1: 237, x2: 960, y2: 540 },
    { label: "plant west", x1: 342, y1: 176, x2: 370, y2: 198 },
    { label: "plant east", x1: 634, y1: 176, x2: 662, y2: 198 },
    { label: "plant hostel", x1: 822, y1: 426, x2: 850, y2: 448 },
    { label: "café table 1", x1: 72, y1: 204, x2: 116, y2: 226 },
    { label: "café table 2", x1: 172, y1: 218, x2: 216, y2: 240 },
    { label: "café table 3", x1: 272, y1: 204, x2: 316, y2: 226 },
    { label: "airport sign post", x1: 56, y1: 330, x2: 70, y2: 364 },
    { label: "tree trunk", x1: 388, y1: 382, x2: 414, y2: 412 },
    { label: "bench", x1: 454, y1: 356, x2: 546, y2: 400 },
    { label: "lamp post", x1: 564, y1: 390, x2: 582, y2: 410 },
  ],
  spawns: { default: { x: 110, y: 420 }, Airport: { x: 110, y: 420 }, Hostel: { x: 790, y: 400 } },
};
