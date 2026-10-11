import type { NpcTurnResponse } from "@backpack/shared";

export interface NpcTurnInput {
  npcId: string;
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
  /** Fetches a finished call's transcript (Dial: GET /v1/calls/{id}). Speakers: agent → luna, user → player. */
  getCall(callId: string): Promise<DialCallRecord>;
}

export interface DialCallRecord {
  id: string;
  turns: { speaker: "luna" | "player"; text: string }[];
}

export interface Adapters {
  gemini: GeminiAdapter;
  dial: DialAdapter;
}
