import type { Db } from "../db/db";
import type { Repo } from "../db/repo";
import type { Embedder, Llm, Memory } from "../coach/contract";
import { createGraph } from "./graph";
import { createVectors } from "./vectors";
import { factSentence } from "./sentences";

/** Facts below this extraction confidence are dropped. */
export const MIN_CONFIDENCE = 0.6;
const RECALL_K = 5;

/** The learner's memory: a knowledge graph (kg_*) of typed facts plus a pgvector store (memories) of free text. */
export function createMemory({ db, repo, llm, embedder }: { db: Db; repo: Repo; llm: Llm; embedder: Embedder }): Memory {
  const graph = createGraph(db);
  const vectors = createVectors(db, embedder);

  const memory: Memory = {
    async remember(learnerId, eventId) {
      try {
        const event = await repo.getEvent(eventId);
        if (!event || event.learner_id !== learnerId || !event.text.trim()) return;
        const learner = await repo.getLearner(learnerId);
        const agent = learner && (await repo.getAgent(learner.agent_id));
        if (!agent) return;
        const known = (await graph.facts(learnerId)).map((f) => factSentence(f.rel, f.object));
        const { facts, memory: text } = await llm.extractFacts({ text: event.text, language: agent.language, known });
        for (const f of facts) {
          if (f.confidence >= MIN_CONFIDENCE) await graph.upsertEdge(learnerId, f.rel, f.object, event.id);
        }
        if (text?.trim()) await vectors.addMemory(learnerId, text.trim(), event.channel, event.id);
      } catch (e) {
        console.warn(`[memory] remember learner=${learnerId} event=${eventId} failed: ${(e as Error).message}`);
      }
    },

    async rememberFact(learnerId, { rel, object }, evidenceEventId = null) {
      await graph.upsertEdge(learnerId, rel, object, evidenceEventId);
    },

    async recall(learnerId, query) {
      const facts = await graph.facts(learnerId);
      let memories: string[] = [];
      try {
        memories = await vectors.searchMemories(learnerId, query, RECALL_K);
      } catch (e) {
        console.warn(`[memory] recall search learner=${learnerId} failed: ${(e as Error).message}`);
      }
      return {
        facts: facts.map((f) => factSentence(f.rel, f.object)),
        memories,
        struggles: facts.filter((f) => f.rel === "struggles_with").map((f) => f.object),
      };
    },

    async profile(learnerId) {
      return { facts: await graph.facts(learnerId), memories: await vectors.list(learnerId) };
    },

    async forget(learnerId) {
      await graph.forget(learnerId);
      await vectors.forget(learnerId);
    },
  };
  return memory;
}
