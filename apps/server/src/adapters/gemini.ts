import type { Config } from "../config";
import type { GeminiAdapter } from "./types";
import fixture from "@backpack/shared/fixtures/npcTurn.cafe.json" with { type: "json" };
import { NpcTurnResponse } from "@backpack/shared";

/** L0 stub: always returns the café fixture. Voice lane replaces with deterministic mock + real Gemini. */
export function createGeminiAdapter(_config: Config): GeminiAdapter {
  return {
    async npcTurn() {
      return NpcTurnResponse.parse(fixture);
    },
  };
}
