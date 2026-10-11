import type { GoogleGenAI } from "@google/genai";
import type { Llm } from "../coach/contract";

/** Lane A: Gemini JSON-mode reply (thinking off). */
export function geminiReply(_ai: GoogleGenAI, _model: string): Llm["reply"] {
  return async () => {
    throw new Error("not implemented: llm/reply.ts (lane A)");
  };
}
