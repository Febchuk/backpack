import { Type, type GoogleGenAI, type Schema } from "@google/genai";
import { z } from "zod";
import { RELATIONS } from "@backpack/shared/coach";
import type { Extraction, Llm } from "../coach/contract";

const RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    facts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          rel: { type: Type.STRING, enum: [...RELATIONS] },
          object: { type: Type.STRING },
          confidence: { type: Type.NUMBER },
        },
        required: ["rel", "object", "confidence"],
        propertyOrdering: ["rel", "object", "confidence"],
      },
    },
    memory: { type: Type.STRING, nullable: true },
  },
  required: ["facts", "memory"],
  propertyOrdering: ["facts", "memory"],
};

const SYSTEM = `You extract what a language learner says about themselves, for their tutor's memory.

Relations:
- goal: why they are learning ("order food in restaurants", "talk to my in-laws")
- trip_to: a place they are going ("lyon")
- trip_date: when the trip is ("june 2026", "next month")
- interested_in, likes, dislikes: topics, activities, food, things ("jazz", "hiking", "tea")
- travelling_with: who they travel with ("my sister")
- struggles_with: a language difficulty ("the subjunctive", "rolling r")
- knows_phrase: a target-language phrase they already use correctly, verbatim
- anxious_about: situations that worry them ("ordering food", "phone calls")
- level: CEFR level A1, A2, B1, B2 or C1, only if they state it

Rules:
- Only facts the learner states about themselves. Never infer from the tutor's words, questions, hypotheticals or quotes.
- Objects are short (1-4 words) and in English, except knows_phrase, which stays in the target language.
- Skip facts already in KNOWN unless the message changes them.
- confidence is calibrated: 0.9+ stated plainly, 0.6-0.8 clearly implied, below 0.5 a guess.
- memory: one self-contained English sentence in the third person worth remembering about the learner ("Their sister lives in Lyon and they visit every summer"), or null if the message has nothing personal.
- An empty facts array is a normal answer.`;

const ExtractionJson = z.object({
  facts: z
    .array(z.object({ rel: z.enum(RELATIONS), object: z.string().trim().min(1), confidence: z.number().min(0).max(1) }).nullable().catch(null))
    .catch([])
    .transform((fs) => fs.filter((f) => f !== null)),
  memory: z.string().trim().nullable().catch(null).transform((m) => m || null),
});

export function parseExtraction(text: string | undefined): Extraction {
  if (!text) return { facts: [], memory: null };
  return ExtractionJson.parse(JSON.parse(text));
}

/** Gemini JSON-mode fact extraction, thinking off. */
export function geminiExtract(ai: Pick<GoogleGenAI, "models">, model: string): Llm["extractFacts"] {
  return async ({ text, language, known }) => {
    const res = await ai.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Target language: ${language}\nKNOWN:\n${known.length ? known.map((k) => `- ${k}`).join("\n") : "(nothing yet)"}\n\nLearner's message:\n${text}`,
            },
          ],
        },
      ],
      config: {
        systemInstruction: SYSTEM,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.2,
        maxOutputTokens: 512,
        ...(model.startsWith("gemini-2.5-flash") ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
      },
    });
    return parseExtraction(res.text);
  };
}
