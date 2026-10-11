// Lane A gate: Dial message.received → engine → reply, from the agent's own number.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { VoiceNotes } from "../../apps/coach/src/coach/contract";
import { LEARNER_PHONE, deliver, messageReceived, seedAgent, seedLearner, startCoach, waitFor, type Coach } from "./helpers";

const SECRET = "whsec_test";
let coach: Coach;

afterEach(() => coach.close());

describe("coach webhook: texts", () => {
  beforeEach(async () => {
    coach = await startCoach();
  });

  it("answers a learner's text from the agent's Dial number, mostly via the LLM reply", async () => {
    const agent = await seedAgent(coach.deps);
    const learner = await seedLearner(coach.deps, agent);
    const res = await deliver(coach, messageReceived({ body: "Salut ! Je suis fatigué aujourd'hui" }));
    expect(res.status).toBe(200);
    const sent = await waitFor(() => coach.dial.messages[0]);
    expect(sent).toMatchObject({ from: agent.dial_number_id, to: LEARNER_PHONE });
    expect(sent.body).toContain("Mock reply to: Salut ! Je suis fatigué aujourd'hui");
    const events = await coach.deps.repo.recentEvents(learner.id);
    expect(events.map((e) => [e.channel, e.direction])).toEqual([
      ["sms", "in"],
      ["sms", "out"],
    ]);
    expect(events[0].text).toBe("Salut ! Je suis fatigué aujourd'hui");
  });

  it("puts the learner's memory and recent conversation into the system prompt", async () => {
    const agent = await seedAgent(coach.deps);
    const learner = await seedLearner(coach.deps, agent);
    await coach.deps.memory.rememberFact(learner.id, { rel: "trip_to", object: "lyon" });
    const systems: string[] = [];
    const reply = coach.deps.llm.reply;
    coach.deps.llm.reply = async (input) => (systems.push(input.system), reply(input));
    await deliver(coach, messageReceived({ body: "On parle de mon voyage ?" }));
    await waitFor(() => coach.dial.messages[0]);
    expect(systems[0]).toMatch(/Travelling to lyon/);
    expect(systems[0]).toMatch(/French/);
    expect(systems[0]).toMatch(/A2/);
  });

  it("stores facts the reply extracted", async () => {
    const agent = await seedAgent(coach.deps);
    const learner = await seedLearner(coach.deps, agent);
    await deliver(coach, messageReceived({ body: "I love jazz" }));
    await waitFor(async () => (await coach.deps.memory.profile(learner.id)).facts.find((f) => f.rel === "likes"));
  });

  it("a text from a new phone registers the learner and starts onboarding", async () => {
    const agent = await seedAgent(coach.deps);
    await deliver(coach, messageReceived({ from: "+15557778888", body: "hello?" }));
    const sent = await waitFor(() => coach.dial.messages[0]);
    expect(sent.to).toBe("+15557778888");
    const learner = await coach.deps.repo.learnerByPhone(agent.id, "+15557778888");
    expect(learner?.onboarding_step).toBe("trip");
  });

  it("is idempotent: the same Dial event or message delivered twice gets one reply", async () => {
    const agent = await seedAgent(coach.deps);
    await seedLearner(coach.deps, agent);
    const env = messageReceived({ body: "Bonjour" });
    await Promise.all([deliver(coach, env), deliver(coach, env)]);
    await deliver(coach, { ...env, id: "evt_redelivered_same_message" });
    await waitFor(() => coach.dial.messages[0]);
    await new Promise((r) => setTimeout(r, 100));
    expect(coach.dial.messages).toHaveLength(1);
  });

  it("ignores messages to numbers no agent owns, reactions, and other event types (200, no reply)", async () => {
    await seedAgent(coach.deps);
    for (const env of [
      messageReceived({ to: "+15550000000", body: "hi" }),
      messageReceived({ body: "", reaction: "❤️" }),
      { id: "evt_x", type: "message.status_changed", data: {} },
    ]) {
      const res = await deliver(coach, env);
      expect(res.status).toBe(200);
    }
    await new Promise((r) => setTimeout(r, 100));
    expect(coach.dial.messages).toHaveLength(0);
  });
});

describe("coach webhook: signatures", () => {
  beforeEach(async () => {
    coach = await startCoach({}, { dialWebhookSecret: SECRET });
  });

  it("rejects a bad or missing signature with 401 and accepts a good one", async () => {
    const agent = await seedAgent(coach.deps);
    await seedLearner(coach.deps, agent);
    expect((await deliver(coach, messageReceived({ body: "a" }))).status).toBe(401);
    expect((await deliver(coach, messageReceived({ body: "b" }), "whsec_wrong")).status).toBe(401);
    expect((await deliver(coach, messageReceived({ body: "c" }), SECRET)).status).toBe(200);
    await waitFor(() => coach.dial.messages[0]);
    expect(coach.dial.messages).toHaveLength(1);
  });
});

describe("coach webhook: voice notes go through VoiceNotes", () => {
  it("transcribes an inbound audio message, replies in text, then sends a voice-note reply", async () => {
    const transcribed: string[] = [];
    const spoken: string[] = [];
    const voiceNotes: VoiceNotes = {
      transcribe: async ({ url }) => (transcribed.push(url), { transcript: "je voudrais un café", notes: "Watch the 'r' in voudrais" }),
      speak: async ({ text }) => (spoken.push(text), { url: "https://example.test/media/abc.mp3" }),
    };
    coach = await startCoach({ voiceNotes });
    const agent = await seedAgent(coach.deps);
    const learner = await seedLearner(coach.deps, agent);
    await deliver(coach, messageReceived({ body: "", media: [{ url: "https://getdial.ai/public-media/v1.m4a", contentType: "audio/x-m4a" }] }));
    await waitFor(() => coach.dial.messages.length >= 2 && coach.dial.messages);
    expect(transcribed).toEqual(["https://getdial.ai/public-media/v1.m4a"]);
    expect(coach.dial.messages[0].body).toContain("Mock reply to: je voudrais un café");
    expect(coach.dial.messages[1]).toMatchObject({ from: agent.dial_number_id, to: LEARNER_PHONE, mediaUrls: ["https://example.test/media/abc.mp3"] });
    expect(spoken).toHaveLength(1);
    const events = await coach.deps.repo.recentEvents(learner.id);
    const inbound = events.find((e) => e.direction === "in")!;
    expect(inbound).toMatchObject({ channel: "voice_note", text: "je voudrais un café", media_url: "https://getdial.ai/public-media/v1.m4a" });
    expect(inbound.feedback?.notes).toBe("Watch the 'r' in voudrais");
    expect(events.some((e) => e.direction === "out" && e.channel === "voice_note" && e.media_url === "https://example.test/media/abc.mp3")).toBe(true);
  });
});
