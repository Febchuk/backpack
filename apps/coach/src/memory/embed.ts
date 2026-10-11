import type { Config } from "../config";
import type { Embedder } from "../coach/contract";
import { createMockEmbedder } from "../mocks";

/** Lane B: real embedder is gemini-embedding-001 at outputDimensionality 768. */
export function createEmbedder(config: Config): Embedder {
  if (config.mockGemini) return createMockEmbedder();
  throw new Error("not implemented: memory/embed.ts real embedder (lane B)");
}
