import { z } from "zod";

export const routes = {
  health: "/health",
  players: "/players",
  state: (playerId: string) => `/state/${playerId}`,
  npcTurn: (npcId: string) => `/npc/${npcId}/turn`,
  activate: "/activate",
  skipEvening: "/skip-evening",
  dialWebhook: "/dial/webhook",
  mcp: "/mcp",
  devReset: "/dev/reset",
} as const;

export const DEFAULT_PORT = 8787;
export const STATE_POLL_MS = 2000;

export const ActivateRequest = z.object({ player_id: z.string(), phone: z.string().min(5) });
export const SkipEveningRequest = z.object({ player_id: z.string() });
export const CallResponse = z.object({ ok: z.literal(true), call_id: z.string() });
export type CallResponse = z.infer<typeof CallResponse>;
export const OkResponse = z.object({ ok: z.literal(true) });

export const DialTranscript = z.object({
  call_id: z.string(),
  player_id: z.string(),
  kind: z.enum(["intro", "debrief"]),
  turns: z.array(z.object({ speaker: z.enum(["luna", "player"]), text: z.string() })),
});
export type DialTranscript = z.infer<typeof DialTranscript>;
