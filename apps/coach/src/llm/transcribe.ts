import { Type, type GoogleGenAI, type Schema } from "@google/genai";
import { z } from "zod";
import type { Level } from "@backpack/shared/coach";
import type { Llm } from "../coach/contract";
import { geminiAudioMime } from "../voice/audio";

const RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    transcript: { type: Type.STRING },
    notes: { type: Type.STRING, nullable: true },
  },
  required: ["transcript", "notes"],
  propertyOrdering: ["transcript", "notes"],
};

const Parsed = z.object({ transcript: z.string(), notes: z.string().nullable().catch(null) });

export function languageName(tag: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(tag) ?? tag;
  } catch {
    return tag;
  }
}

export function transcribePrompt(language: string, level: Level | null): string {
  const lang = languageName(language);
  const cefr = level ?? "A2";
  return [
    `You are a ${lang} pronunciation coach listening to a voice note from a learner at CEFR level ${cefr}.`,
    `1. "transcript": exactly what they said, verbatim, in the language they spoke (usually ${lang}). Keep their mistakes and hesitations; do not correct or translate. Empty string if nothing intelligible was said.`,
    `2. "notes": 1 to 3 short, specific remarks in English on their pronunciation or grammar, pitched at ${cefr}: quote the word or phrase, say what to change. Skip anything too advanced for ${cefr}. null if it was fine or nothing was said.`,
  ].join("\n");
}

function parse(text: string | undefined) {
  if (!text) return null;
  try {
    const r = Parsed.safeParse(JSON.parse(text));
    if (!r.success) return null;
    const notes = r.data.notes?.trim() || null;
    return { transcript: r.data.transcript.trim(), notes };
  } catch {
    return null;
  }
}

/** Gemini audio-in → verbatim transcript + level-pitched pronunciation/grammar notes. Thinking off. */
export function geminiTranscribe(ai: GoogleGenAI, model: string): Llm["transcribeAudio"] {
  return async ({ audio, mimeType, language, level }) => {
    const params = {
      model,
      contents: [
        {
          role: "user",
          parts: [
            { text: "Transcribe and assess this voice note." },
            { inlineData: { data: audio.toString("base64"), mimeType: geminiAudioMime(mimeType) ?? mimeType } },
          ],
        },
      ],
      config: {
        systemInstruction: transcribePrompt(language, level),
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.2,
        maxOutputTokens: 1024,
        ...(model.startsWith("gemini-2.5-flash") ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
      },
    };
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const out = parse((await ai.models.generateContent(params)).text);
        if (out) return out;
        lastError = new Error("unparseable transcription response");
      } catch (e) {
        lastError = e;
      }
      console.warn(`[gemini] transcribe attempt ${attempt} failed: ${(lastError as Error).message}`);
    }
    throw new Error(`transcription failed: ${(lastError as Error).message}`);
  };
}
