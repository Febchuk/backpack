// Lane A gate: the agent texts first and learns the trip, level, activities and worries.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LEARNER_PHONE, deliver, messageReceived, seedAgent, startCoach, waitFor, type Coach } from "./helpers";

let coach: Coach;
beforeEach(async () => {
  coach = await startCoach();
});
afterEach(() => coach.close());

describe("coach onboarding", () => {
  it("texts first, asks four questions, records each answer as a graph fact, then chats normally", async () => {
    const agent = await seedAgent(coach.deps);
    const { learner } = await coach.deps.repo.upsertLearner(agent.id, LEARNER_PHONE, "Sam");
    await coach.deps.engine.startOnboarding(agent, learner);
    expect(coach.dial.messages).toHaveLength(1);
    expect(coach.dial.messages[0]).toMatchObject({ from: agent.dial_number_id, to: LEARNER_PHONE });
    expect(coach.dial.messages[0].body).toMatch(/trip|voyage/i);

    const answers = [
      ["going to Lyon in three weeks", "level"],
      ["A2, I can order a coffee", "activities"],
      ["food markets and live jazz", "worries"],
      ["nervous about asking for directions", "done"],
    ] as const;
    for (const [i, [answer, next]] of answers.entries()) {
      await deliver(coach, messageReceived({ body: answer }));
      await waitFor(() => coach.dial.messages.length >= i + 2);
      expect((await coach.deps.repo.getLearner(learner.id))!.onboarding_step).toBe(next);
    }

    const after = (await coach.deps.repo.getLearner(learner.id))!;
    expect(after.level).toBe("A2");
    const rels = (await coach.deps.memory.profile(learner.id)).facts.map((f) => f.rel);
    expect(rels).toEqual(expect.arrayContaining(["trip_to", "level", "interested_in", "anxious_about"]));
    const trip = (await coach.deps.memory.profile(learner.id)).facts.find((f) => f.rel === "trip_to");
    expect(trip?.object).toMatch(/lyon/i);

    // Onboarding over: an ordinary reply.
    await deliver(coach, messageReceived({ body: "Merci !" }));
    await waitFor(() => coach.dial.messages.length >= 6);
    expect(coach.dial.messages[5].body).toContain("Mock reply to: Merci !");
  });

  it("startOnboarding is idempotent for a learner already past the first step", async () => {
    const agent = await seedAgent(coach.deps);
    const { learner } = await coach.deps.repo.upsertLearner(agent.id, LEARNER_PHONE);
    await coach.deps.repo.updateLearner(learner.id, { onboarding_step: "done" });
    await coach.deps.engine.startOnboarding(agent, (await coach.deps.repo.getLearner(learner.id))!);
    expect(coach.dial.messages).toHaveLength(0);
  });
});
