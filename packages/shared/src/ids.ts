import { z } from "zod";

export const NpcId = z.enum(["clerk", "barista", "girard", "margaux", "ines", "theo"]);
export type NpcId = z.infer<typeof NpcId>;

export const MissionKey = z.enum(["sim_kiosk", "cafe_order"]);
export type MissionKey = z.infer<typeof MissionKey>;

export const District = z.enum(["market"]);
export type District = z.infer<typeof District>;

export const SceneKey = z.enum(["Title", "Airport", "Street", "Hostel"]);
export type SceneKey = z.infer<typeof SceneKey>;

export const Mood = z.enum(["patient", "impatient", "warm", "cold", "amused"]);
export type Mood = z.infer<typeof Mood>;
