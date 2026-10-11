import { nanoid } from "nanoid";
import type { MemoryView } from "@backpack/shared/coach";
import { toVector, type Db } from "../db/db";
import type { Embedder } from "../coach/contract";

/** Cosine similarity above which a new memory overwrites an existing one instead of being added. */
export const DUPLICATE_SIMILARITY = 0.92;

export function createVectors(db: Db, embedder: Embedder) {
  const embedOne = async (text: string) => toVector((await embedder.embed([text]))[0]);

  return {
    async addMemory(learnerId: string, text: string, source: string, sourceEventId: string | null = null) {
      const embedding = await embedOne(text);
      const { rows } = await db.query<{ id: string }>(
        `SELECT id FROM memories WHERE learner_id = $1 AND embedding <=> $2::vector < $3
         ORDER BY embedding <=> $2::vector LIMIT 1`,
        [learnerId, embedding, 1 - DUPLICATE_SIMILARITY],
      );
      if (rows[0]) {
        await db.query(`UPDATE memories SET text = $2, source_event_id = $3, embedding = $4::vector WHERE id = $1`, [
          rows[0].id,
          text,
          sourceEventId,
          embedding,
        ]);
        return;
      }
      await db.query(
        `INSERT INTO memories (id, learner_id, text, source, source_event_id, embedding) VALUES ($1, $2, $3, $4, $5, $6::vector)`,
        [`mem_${nanoid(12)}`, learnerId, text, source, sourceEventId, embedding],
      );
    },

    /** The learner's `k` memories closest to `query`, closest first. */
    async searchMemories(learnerId: string, query: string, k = 5): Promise<string[]> {
      const embedding = await embedOne(query);
      const { rows } = await db.query<{ text: string }>(
        `SELECT text FROM memories WHERE learner_id = $1 ORDER BY embedding <=> $2::vector LIMIT $3`,
        [learnerId, embedding, k],
      );
      return rows.map((r) => r.text);
    },

    /** Newest first. */
    async list(learnerId: string): Promise<MemoryView[]> {
      const { rows } = await db.query<{ id: string; text: string; source: string; created_at: unknown }>(
        `SELECT id, text, source, created_at FROM memories WHERE learner_id = $1 ORDER BY created_at DESC, id`,
        [learnerId],
      );
      return rows.map((r) => ({
        ...r,
        created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      }));
    },

    async forget(learnerId: string) {
      await db.query(`DELETE FROM memories WHERE learner_id = $1`, [learnerId]);
    },
  };
}

export type Vectors = ReturnType<typeof createVectors>;
