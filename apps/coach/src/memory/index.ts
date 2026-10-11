import type { Db } from "../db/db";
import type { Repo } from "../db/repo";
import type { Embedder, Llm, Memory } from "../coach/contract";
import { createInMemoryMemory } from "../mocks";

/** Lane B replaces this with the Postgres knowledge graph (kg_*) + pgvector store (memories). */
export function createMemory(_deps: { db: Db; repo: Repo; llm: Llm; embedder: Embedder }): Memory {
  return createInMemoryMemory();
}
