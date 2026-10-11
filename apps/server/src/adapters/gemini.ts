import type { Config } from "../config";
import type { GeminiAdapter } from "./types";
import { mockGrade } from "../npc/mockGrader";

/** Deterministic mock (CONTRACT.md). The audio path with no text grades as empty text. */
export function createMockGeminiAdapter(): GeminiAdapter {
  return {
    async npcTurn(input) {
      return mockGrade(input);
    },
  };
}

export function createRealGeminiAdapter(_config: Config): GeminiAdapter {
  return {
    async npcTurn() {
      throw new Error("Real Gemini adapter not implemented until L2");
    },
  };
}

export function createGeminiAdapter(config: Config): GeminiAdapter {
  return config.mockGemini ? createMockGeminiAdapter() : createRealGeminiAdapter(config);
}
