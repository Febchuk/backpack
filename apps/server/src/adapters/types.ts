import type { NpcTurnResponse } from "@backpack/shared";

export interface NpcTurnInput {
  persona: string;
  missionGoal: string | null;
  targetPhrases: string[];
  requiredPhrases: string[];
  level: number;
  audio?: { data: Buffer; mimeType: string };
  text?: string;
}

export interface GeminiAdapter {
  npcTurn(input: NpcTurnInput): Promise<NpcTurnResponse>;
}

export interface DialCallInput {
  to: string;
  kind: "intro" | "debrief";
  instruction: string;
  player_id: string;
}

export interface DialAdapter {
  call(input: DialCallInput): Promise<{ call_id: string }>;
  sms(input: { to: string; body: string }): Promise<{ id: string }>;
}

export interface Adapters {
  gemini: GeminiAdapter;
  dial: DialAdapter;
}
