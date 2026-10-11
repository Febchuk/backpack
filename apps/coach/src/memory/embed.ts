import { GoogleGenAI } from "@google/genai";
import type { Config } from "../config";
import type { Embedder } from "../coach/contract";
import { createMockEmbedder } from "../mocks";

export const EMBED_MODEL = "gemini-embedding-001";
const DIMS = 768;
/** Gemini's batch limit per embedContent request. */
const BATCH = 100;

/** The slice of the @google/genai client we use. */
export interface EmbedClient {
  models: Pick<GoogleGenAI["models"], "embedContent">;
}

const normalize = (v: number[]) => {
  const norm = Math.hypot(...v) || 1;
  return v.map((x) => x / norm);
};

/** gemini-embedding-001 at 768 dims. Gemini only normalizes 3072-dim output, so vectors are L2-normalized here. */
export function geminiEmbedder(ai: EmbedClient): Embedder {
  return {
    dims: DIMS,
    async embed(texts) {
      const out: number[][] = [];
      for (let i = 0; i < texts.length; i += BATCH) {
        const batch = texts.slice(i, i + BATCH);
        const res = await ai.models.embedContent({
          model: EMBED_MODEL,
          contents: batch,
          config: { outputDimensionality: DIMS, taskType: "SEMANTIC_SIMILARITY" },
        });
        const values = res.embeddings?.map((e) => e.values ?? []) ?? [];
        if (values.length !== batch.length || values.some((v) => v.length !== DIMS))
          throw new Error(`embedContent returned ${values.length} embeddings for ${batch.length} texts`);
        out.push(...values.map(normalize));
      }
      return out;
    },
  };
}

export function createEmbedder(config: Config): Embedder {
  if (config.mockGemini) return createMockEmbedder();
  if (!config.geminiApiKey) throw new Error("MOCK_GEMINI=0 but GEMINI_API_KEY is not set");
  return geminiEmbedder(new GoogleGenAI({ apiKey: config.geminiApiKey }));
}
