import { z } from "zod";

export const PhraseStatus = z.enum(["missed", "practicing", "mastered"]);
export const MissionStatus = z.enum(["locked", "active", "done"]);

export const Phrase = z.object({
  id: z.string(),
  text_fr: z.string(),
  text_en: z.string().nullable(),
  status: PhraseStatus,
  last_seen: z.string(),
});
export type Phrase = z.infer<typeof Phrase>;

export const Mission = z.object({
  mission_key: z.string(),
  status: MissionStatus,
  stars: z.number().int().min(0).max(3),
  hints_used: z.number().int().min(0),
});
export type Mission = z.infer<typeof Mission>;

export const Message = z.object({
  id: z.string(),
  from: z.literal("luna"),
  body: z.string(),
  created_at: z.string(),
});
export type Message = z.infer<typeof Message>;

export const PlayerState = z.object({
  player: z.object({
    id: z.string(),
    phone: z.string().nullable(),
    level: z.number().int(),
    euros: z.number().int(),
    city: z.literal("paris"),
  }),
  phrases: z.array(Phrase),
  missions: z.array(Mission),
  unlocks: z.array(z.string()),
  messages: z.array(Message),
});
export type PlayerState = z.infer<typeof PlayerState>;
