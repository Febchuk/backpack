import { GoogleGenAI, Type, type GenerateContentParameters, type Part, type Schema } from "@google/genai";
import { z } from "zod";
import { Mood, NpcTurnResponse } from "@backpack/shared";
import type { Config } from "../config";
import type { GeminiAdapter, NpcTurnInput } from "./types";
import { mockGrade } from "../npc/mockGrader";
import { buildSystemPrompt } from "../npc/prompt";
import { reconcileGrading } from "../npc/grading";
import type { NpcTurnInputWithHistory } from "../npc/history";

/** Deterministic mock (CONTRACT.md). The audio path with no text grades as empty text. */
export function createMockGeminiAdapter(): GeminiAdapter {
  return {
    async npcTurn(input) {
      return mockGrade(input);
    },
  };
}

/**
 * Stable GA Flash model with audio input. Override with GEMINI_NPC_MODEL (e.g. "gemini-3-flash-preview").
 * Thinking is disabled for it below to stay inside the 3 s reply budget.
 */
export const DEFAULT_NPC_MODEL = "gemini-2.5-flash";

/** The slice of the @google/genai client we use, so tests can inject a fake. */
export interface GeminiClient {
  models: { generateContent(params: GenerateContentParameters): Promise<{ text?: string }> };
}

const RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    reply_fr: { type: Type.STRING },
    reply_en_hint: { type: Type.STRING },
    heard: { type: Type.STRING },
    phrases_used: { type: Type.ARRAY, items: { type: Type.STRING } },
    phrases_missed: { type: Type.ARRAY, items: { type: Type.STRING } },
    hint: { type: Type.STRING },
    mission_complete: { type: Type.BOOLEAN, nullable: true },
    mood: { type: Type.STRING, enum: [...Mood.options] },
  },
  required: ["reply_fr", "reply_en_hint", "heard", "phrases_used", "phrases_missed", "hint", "mission_complete", "mood"],
  propertyOrdering: ["heard", "reply_fr", "reply_en_hint", "phrases_used", "phrases_missed", "hint", "mission_complete", "mood"],
};

/** Lenient parse of the model's JSON: grading fields are recomputed afterwards, so only the reply is essential. */
const ModelTurn = NpcTurnResponse.extend({
  phrases_used: z.array(z.string()).catch([]),
  phrases_missed: z.array(z.string()).catch([]),
  hint: z.string().catch(""),
  mission_complete: z.boolean().nullable().catch(null),
  mood: Mood.catch("patient"),
});

function parseTurn(text: string | undefined): NpcTurnResponse | null {
  if (!text) return null;
  try {
    const r = ModelTurn.safeParse(JSON.parse(text));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

/** In-character "say again", with every target phrase missed. */
export function fallbackTurn(input: NpcTurnInput): NpcTurnResponse {
  return {
    reply_fr: "Pardon ? Vous pouvez répéter ?",
    reply_en_hint: "Sorry? Can you say that again?",
    heard: input.text ?? "",
    phrases_used: [],
    phrases_missed: [...input.targetPhrases],
    hint: "Try again, a little slower.",
    mission_complete: input.missionGoal ? false : null,
    mood: "patient",
  };
}

/** reply_fr is spoken aloud: drop any `*stage direction*` the model put there (they belong in reply_en_hint). */
export function spokenReply(reply: string): string {
  const spoken = reply.replace(/\*[^*]*\*/g, " ").replace(/\s+/g, " ").trim();
  return spoken || reply;
}

/** Gemini wants a bare media type; browsers send e.g. "audio/webm;codecs=opus" or nothing useful. */
export function audioMimeType(mimeType: string | undefined): string {
  const base = (mimeType ?? "").split(";")[0].trim().toLowerCase();
  return base.startsWith("audio/") ? base : "audio/webm";
}

function userParts(input: NpcTurnInput): Part[] {
  const parts: Part[] = [];
  if (input.audio)
    parts.push(
      { text: "The player just said this (audio). Transcribe it into \"heard\", then reply in character." },
      { inlineData: { data: input.audio.data.toString("base64"), mimeType: audioMimeType(input.audio.mimeType) } },
    );
  if (input.text) parts.push({ text: `The player says: ${input.text}` });
  if (!parts.length) parts.push({ text: "The player said nothing." });
  return parts;
}

// Rolling latency window for every real turn (including retries), exported for logs and the demo.
const LATENCY_WINDOW = 50;
const latencies: number[] = [];
let turnCount = 0;

function recordLatency(ms: number) {
  turnCount++;
  latencies.push(ms);
  if (latencies.length > LATENCY_WINDOW) latencies.shift();
}

export function getLatencyStats(): { count: number; p50: number | null; last: number | null; window: number[] } {
  const sorted = [...latencies].sort((a, b) => a - b);
  const p50 = sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : null;
  return { count: turnCount, p50, last: latencies.at(-1) ?? null, window: [...latencies] };
}

export function resetLatencyStats() {
  latencies.length = 0;
  turnCount = 0;
}

export function createRealGeminiAdapter(config: Config, client?: GeminiClient): GeminiAdapter {
  const model = process.env.GEMINI_NPC_MODEL || DEFAULT_NPC_MODEL;
  let ai = client;
  const getClient = (): GeminiClient => {
    if (ai) return ai;
    if (!config.geminiApiKey) throw new Error("GEMINI_API_KEY is required when MOCK_GEMINI=0");
    return (ai = new GoogleGenAI({ apiKey: config.geminiApiKey }));
  };

  return {
    async npcTurn(raw) {
      const input = raw as NpcTurnInputWithHistory;
      const params: GenerateContentParameters = {
        model,
        contents: [{ role: "user", parts: userParts(input) }],
        config: {
          systemInstruction: buildSystemPrompt(input),
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0.7,
          maxOutputTokens: 512,
          ...(model.startsWith("gemini-2.5-flash") ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        },
      };

      const started = Date.now();
      let turn: NpcTurnResponse | null = null;
      for (let attempt = 1; attempt <= 2 && !turn; attempt++) {
        try {
          const res = await getClient().models.generateContent(params);
          turn = parseTurn(res.text);
          if (!turn) console.warn(`[gemini] npc=${input.npcId} attempt ${attempt}: unparseable response`);
        } catch (e) {
          console.warn(`[gemini] npc=${input.npcId} attempt ${attempt} failed: ${(e as Error).message}`);
        }
      }
      const ms = Date.now() - started;
      recordLatency(ms);
      console.log(`[gemini] npc=${input.npcId} ${ms}ms${turn ? "" : " (fallback)"} p50=${getLatencyStats().p50}ms`);
      return turn ? reconcileGrading(input, { ...turn, reply_fr: spokenReply(turn.reply_fr) }) : fallbackTurn(input);
    },
  };
}

export function createGeminiAdapter(config: Config): GeminiAdapter {
  return config.mockGemini ? createMockGeminiAdapter() : createRealGeminiAdapter(config);
}
