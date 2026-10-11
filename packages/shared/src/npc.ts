import { z } from "zod";
import { Mood } from "./ids";

export const NpcTurnResponse = z.object({
  reply_fr: z.string(),
  reply_en_hint: z.string(),
  heard: z.string(),
  phrases_used: z.array(z.string()),
  phrases_missed: z.array(z.string()),
  hint: z.string(),
  mission_complete: z.boolean().nullable(),
  mood: Mood,
});
export type NpcTurnResponse = z.infer<typeof NpcTurnResponse>;
