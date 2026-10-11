// Stage-0 gate: the shared contract boots and its storage works. Must stay green in every lane.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { seedAgent, seedLearner, startCoach, type Coach } from "./helpers";

let coach: Coach;
beforeEach(async () => {
  coach = await startCoach();
});
afterEach(() => coach.close());

describe("coach contract", () => {
  it("boots on PGlite with pgvector and answers /health", async () => {
    expect(await (await coach.get("/health")).json()).toEqual({ ok: true });
    const { rows } = await coach.deps.db.query<{ v: string }>(`SELECT '[1,2,3]'::vector::text AS v`);
    expect(rows[0].v).toBe("[1,2,3]");
  });

  it("repo: agents by number, idempotent learners, events deduped on dial_id, recent events oldest first", async () => {
    const agent = await seedAgent(coach.deps);
    expect((await coach.deps.repo.agentByNumber("+15550100001"))?.id).toBe(agent.id);
    expect((await coach.deps.repo.agentByNumber("num_camille"))?.id).toBe(agent.id);
    const learner = await seedLearner(coach.deps, agent);
    const again = await coach.deps.repo.upsertLearner(agent.id, learner.phone);
    expect(again).toMatchObject({ created: false, learner: { id: learner.id } });

    const a = await coach.deps.repo.addEvent({ learner_id: learner.id, channel: "sms", direction: "in", text: "one", dial_id: "msg_1" });
    expect(a).not.toBeNull();
    expect(await coach.deps.repo.addEvent({ learner_id: learner.id, channel: "sms", direction: "in", text: "dup", dial_id: "msg_1" })).toBeNull();
    await coach.deps.repo.addEvent({ learner_id: learner.id, channel: "sms", direction: "out", text: "two", feedback: { correction: "x" } });
    const evs = await coach.deps.repo.recentEvents(learner.id);
    expect(evs.map((e) => e.text)).toEqual(["one", "two"]);
    expect(evs[1].feedback).toEqual({ correction: "x" });
    expect(typeof evs[0].created_at).toBe("string");
  });

  it("repo: media round-trips bytes", async () => {
    const id = await coach.deps.repo.putMedia(null, "audio/mpeg", Buffer.from("MP3DATA"));
    expect(id.length).toBeGreaterThanOrEqual(20);
    expect(await coach.deps.repo.getMedia(id)).toEqual({ mime_type: "audio/mpeg", data: Buffer.from("MP3DATA") });
  });

  it("mock Dial: a purchased number is provisioning, then ready with an E.164 number", async () => {
    const n = await coach.deps.dial.purchaseNumber({ consent: "ok", imessage: true });
    expect(n.setupStatus).toBe("provisioning");
    const r = await coach.deps.dial.getNumber(n.id);
    expect(r.setupStatus).toBe("ready");
    expect(r.number).toMatch(/^\+1\d{10}$/);
  });
});
