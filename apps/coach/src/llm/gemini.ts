import { GoogleGenAI } from "@google/genai";
import type { Config } from "../config";
import type { Llm } from "../coach/contract";
import { createMockLlm } from "../mocks";
import { geminiReply } from "./reply";
import { geminiTranscribe } from "./transcribe";
import { geminiExtract } from "./extract";

export function createLlm(config: Config): Llm {
  if (config.mockGemini) return createMockLlm();
  if (!config.geminiApiKey) throw new Error("MOCK_GEMINI=0 but GEMINI_API_KEY is not set");
  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
  return {
    reply: geminiReply(ai, config.geminiModel),
    transcribeAudio: geminiTranscribe(ai, config.geminiModel),
    extractFacts: geminiExtract(ai, config.geminiModel),
  };
}
