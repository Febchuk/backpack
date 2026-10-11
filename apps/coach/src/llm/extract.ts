import type { GoogleGenAI } from "@google/genai";
import type { Llm } from "../coach/contract";

/** Lane B: Gemini JSON-mode fact extraction. */
export function geminiExtract(_ai: GoogleGenAI, _model: string): Llm["extractFacts"] {
  return async () => {
    throw new Error("not implemented: llm/extract.ts (lane B)");
  };
}
