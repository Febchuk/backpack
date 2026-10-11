import { Type, type GenerateContentParameters, type GoogleGenAI, type Schema } from "@google/genai";
import { z } from "zod";
import { RELATIONS } from "@backpack/shared/coach";
import type { Llm, ReplyInput, ReplyOutput } from "../coach/contract";

const RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    reply: { type: Type.STRING },
    correction: { type: Type.STRING, nullable: true },
    voice_reply: { type: Type.BOOLEAN },
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
      },
    },
  },
  required: ["reply", "correction", "voice_reply", "facts"],
  propertyOrdering: ["facts", "correction", "reply", "voice_reply"],
};

/** Lenient: only `reply` is essential; bad facts are dropped one by one. */
const Fact = z.object({ rel: z.enum(RELATIONS), object: z.string().min(1), confidence: z.number().min(0).max(1) });
const ModelReply = z.object({
  reply: z.string().min(1),
  correction: z.string().nullable().catch(null),
  voice_reply: z.boolean().catch(false),
  facts: z.array(z.unknown()).catch([]),
});

export function parseReply(text: string | undefined): ReplyOutput | null {
  if (!text) return null;
  try {
    const r = ModelReply.safeParse(JSON.parse(text));
    if (!r.success) return null;
    const facts = r.data.facts.flatMap((f) => {
      const p = Fact.safeParse(f);
      return p.success ? [p.data] : [];
    });
    return { ...r.data, correction: r.data.correction?.trim() || null, facts };
  } catch {
    return null;
  }
}

/** The conversation as one user turn: Gemini needs user-first alternation and the history often starts with us. */
function userText({ history, message, expectFacts }: ReplyInput): string {
  const lines = history.map((h) => `${h.role === "agent" ? "You" : "Learner"}: ${h.text}`);
  return [
    lines.length ? `Conversation so far (oldest first):\n${lines.join("\n")}\n` : "",
    `The learner now says: ${message}`,
    expectFacts?.length ? `\nThis answers your onboarding question. Extract facts with rel in [${expectFacts.join(", ")}], using their words for "object".` : "",
  ].join("\n");
}

/** Gemini JSON-mode reply (thinking off on Flash). Retries once on an error or unparseable JSON, then throws. */
export function geminiReply(ai: GoogleGenAI, model: string): Llm["reply"] {
  return async (input) => {
    const params: GenerateContentParameters = {
      model,
      contents: [{ role: "user", parts: [{ text: userText(input) }] }],
      config: {
        systemInstruction: input.system,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.8,
        maxOutputTokens: 1024,
        ...(model.startsWith("gemini-2.5-flash") ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
      },
    };
    let lastError: unknown = "unparseable response";
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const reply = parseReply((await ai.models.generateContent(params)).text);
        if (reply) return reply;
        lastError = "unparseable response";
      } catch (e) {
        lastError = e;
      }
      console.warn(`[gemini:reply] attempt ${attempt} failed: ${lastError instanceof Error ? lastError.message : lastError}`);
    }
    throw new Error(`Gemini reply failed: ${lastError instanceof Error ? lastError.message : lastError}`);
  };
}
