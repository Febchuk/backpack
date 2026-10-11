import { NpcTurnResponse } from "@backpack/shared";
import { expect } from "vitest";
import type { GeminiClient } from "../../apps/server/src/adapters/gemini";
import type { TestServer } from "../helpers/server";
import { npcTurn } from "../helpers/fakes";

export type GenerateContentParameters = Parameters<GeminiClient["models"]["generateContent"]>[0];

/** A fake @google/genai client: each request is answered with `respond(params, n)` merged over a valid turn. */
export function scriptedClient(respond: (params: GenerateContentParameters, n: number) => Partial<NpcTurnResponse> = () => ({})) {
  const calls: GenerateContentParameters[] = [];
  const client: GeminiClient = {
    models: {
      async generateContent(params) {
        calls.push(params);
        const base: NpcTurnResponse = {
          reply_fr: "D'accord.",
          reply_en_hint: "Okay.",
          heard: "",
          phrases_used: [],
          phrases_missed: [],
          hint: "",
          mission_complete: false,
          mood: "patient",
        };
        return { text: JSON.stringify({ ...base, ...respond(params, calls.length) }) };
      },
    },
  };
  return { client, calls };
}

export const systemPrompt = (p: GenerateContentParameters) => String(p.config!.systemInstruction);

export async function turn(s: TestServer, npc: string, id: string, text: string, missionKey?: string) {
  const res = await npcTurn(s.url, npc, id, text, missionKey);
  expect(res.status).toBe(200);
  return NpcTurnResponse.parse(await res.json());
}

export const phraseStatus = (s: TestServer, id: string, text: string) =>
  s.deps.repo.getState(id)!.phrases.find((p) => p.text_fr === text)?.status;

export const mission = (s: TestServer, id: string, key: string) =>
  s.deps.repo.getState(id)!.missions.find((m) => m.mission_key === key);
