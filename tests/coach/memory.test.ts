// Lane B gate: the Postgres knowledge graph (kg_*) + pgvector store (memories) behind the Memory interface.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemory } from "../../apps/coach/src/memory/index";
import type { Memory } from "../../apps/coach/src/coach/contract";
import type { Learner } from "../../apps/coach/src/db/repo";
import { seedAgent, startCoach, type Coach } from "./helpers";

let coach: Coach;
let memory: Memory;
let learner: Learner;
let other: Learner;

async function said(l: Learner, text: string) {
  const ev = await coach.deps.repo.addEvent({ learner_id: l.id, channel: "sms", direction: "in", text });
  await memory.remember(l.id, ev!.id);
  return ev!;
}

beforeEach(async () => {
  coach = await startCoach();
  memory = createMemory({ db: coach.deps.db, repo: coach.deps.repo, llm: coach.deps.llm, embedder: coach.deps.embedder });
  const agent = await seedAgent(coach.deps);
  learner = (await coach.deps.repo.upsertLearner(agent.id, "+15550000001")).learner;
  other = (await coach.deps.repo.upsertLearner(agent.id, "+15550000002")).learner;
});
afterEach(() => coach.close());

describe("coach memory: graph", () => {
  it("stores facts in kg_edges and reads them back as a profile and as sentences", async () => {
    await memory.rememberFact(learner.id, { rel: "trip_to", object: "Lyon" });
    await memory.rememberFact(learner.id, { rel: "anxious_about", object: "ordering food" });
    const { rows } = await coach.deps.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM kg_edges WHERE src = $1`, [`learner:${learner.id}`]);
    expect(rows[0].n).toBe(2);
    const profile = await memory.profile(learner.id);
    expect(profile.facts.map((f) => [f.rel, f.object.toLowerCase()])).toEqual(
      expect.arrayContaining([
        ["trip_to", "lyon"],
        ["anxious_about", "ordering food"],
      ]),
    );
    const recall = await memory.recall(learner.id, "anything");
    expect(recall.facts).toEqual(expect.arrayContaining([expect.stringMatching(/Travelling to lyon/i), expect.stringMatching(/Anxious about ordering food/i)]));
  });

  it("repeating a fact strengthens one edge instead of duplicating it", async () => {
    await memory.rememberFact(learner.id, { rel: "likes", object: "jazz" });
    await memory.rememberFact(learner.id, { rel: "likes", object: "Jazz" });
    const facts = (await memory.profile(learner.id)).facts.filter((f) => f.rel === "likes");
    expect(facts).toHaveLength(1);
    expect(facts[0].weight).toBeGreaterThan(1);
  });

  it("likes and dislikes of the same thing replace each other", async () => {
    await memory.rememberFact(learner.id, { rel: "likes", object: "tea" });
    await memory.rememberFact(learner.id, { rel: "dislikes", object: "tea" });
    let rels = (await memory.profile(learner.id)).facts.filter((f) => f.object === "tea").map((f) => f.rel);
    expect(rels).toEqual(["dislikes"]);
    await memory.rememberFact(learner.id, { rel: "likes", object: "tea" });
    rels = (await memory.profile(learner.id)).facts.filter((f) => f.object === "tea").map((f) => f.rel);
    expect(rels).toEqual(["likes"]);
  });

  it("only one level at a time, and struggles come back most recent first", async () => {
    await memory.rememberFact(learner.id, { rel: "level", object: "A1" });
    await memory.rememberFact(learner.id, { rel: "level", object: "A2" });
    expect((await memory.profile(learner.id)).facts.filter((f) => f.rel === "level").map((f) => f.object)).toEqual(["A2"]);
    await memory.rememberFact(learner.id, { rel: "struggles_with", object: "the subjunctive" });
    await new Promise((r) => setTimeout(r, 5));
    await memory.rememberFact(learner.id, { rel: "struggles_with", object: "rolling r" });
    expect((await memory.recall(learner.id, "x")).struggles).toEqual(["rolling r", "the subjunctive"]);
  });
});

describe("coach memory: vectors and extraction", () => {
  it("remember(event) extracts facts into the graph and a memory into pgvector", async () => {
    const ev = await said(learner, "I love jazz and I'm going to Lyon with my sister");
    const profile = await memory.profile(learner.id);
    expect(profile.facts.map((f) => f.rel)).toEqual(expect.arrayContaining(["likes", "trip_to", "travelling_with"]));
    expect(profile.memories).toHaveLength(1);
    const { rows } = await coach.deps.db.query<{ source_event_id: string; dims: number }>(
      `SELECT source_event_id, vector_dims(embedding) AS dims FROM memories WHERE learner_id = $1`,
      [learner.id],
    );
    expect(rows).toEqual([{ source_event_id: ev.id, dims: 768 }]);
  });

  it("recall ranks the memory closest to the query first", async () => {
    await said(learner, "I love jazz clubs and live music at night");
    await said(learner, "I'm going to Lyon with my sister");
    await said(learner, "I hate getting lost on the metro");
    const { memories } = await memory.recall(learner.id, "where can I hear jazz music tonight");
    expect(memories[0]).toMatch(/jazz/);
  });

  it("a near-duplicate memory updates instead of inserting", async () => {
    await said(learner, "I love jazz and I'm going to Lyon");
    await said(learner, "I love jazz and I'm going to Lyon");
    expect((await memory.profile(learner.id)).memories).toHaveLength(1);
  });

  it("drops low-confidence facts", async () => {
    const llm = { ...coach.deps.llm, extractFacts: async () => ({ facts: [{ rel: "likes" as const, object: "maybe opera", confidence: 0.3 }], memory: null }) };
    memory = createMemory({ db: coach.deps.db, repo: coach.deps.repo, llm, embedder: coach.deps.embedder });
    await said(learner, "hmm opera?");
    expect((await memory.profile(learner.id)).facts).toHaveLength(0);
  });

  it("remember never throws (unknown event, failing LLM)", async () => {
    await expect(memory.remember(learner.id, "ev_missing")).resolves.toBeUndefined();
    const llm = { ...coach.deps.llm, extractFacts: async () => Promise.reject(new Error("boom")) };
    memory = createMemory({ db: coach.deps.db, repo: coach.deps.repo, llm, embedder: coach.deps.embedder });
    const ev = await coach.deps.repo.addEvent({ learner_id: learner.id, channel: "sms", direction: "in", text: "x" });
    await expect(memory.remember(learner.id, ev!.id)).resolves.toBeUndefined();
  });
});

describe("coach memory: scope and deletion", () => {
  it("never leaks one learner's memory to another, and forget wipes graph and vectors", async () => {
    await said(learner, "I love jazz and I'm going to Lyon with my sister");
    expect((await memory.profile(other.id)).facts).toHaveLength(0);
    expect((await memory.recall(other.id, "jazz")).memories).toHaveLength(0);
    await memory.forget(learner.id);
    const p = await memory.profile(learner.id);
    expect(p.facts).toHaveLength(0);
    expect(p.memories).toHaveLength(0);
  });
});
