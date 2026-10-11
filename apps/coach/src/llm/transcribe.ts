import type { GoogleGenAI } from "@google/genai";
import type { Llm } from "../coach/contract";

/** Lane C: Gemini audio-in → transcript + pronunciation/grammar notes. */
export function geminiTranscribe(_ai: GoogleGenAI, _model: string): Llm["transcribeAudio"] {
  return async () => {
    throw new Error("not implemented: llm/transcribe.ts (lane C)");
  };
}
