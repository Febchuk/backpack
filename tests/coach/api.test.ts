// Lane E gate: the console API — create agent, provision voice + ElevenLabs agent, buy a Dial number, add learner.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgentView, LearnerMemoryView, LearnerView, LibraryVoice, DesignedPreview } from "@backpack/shared/coach";
import { createMockVoiceProvisioner } from "../../apps/coach/src/mocks";
import type { Engine } from "../../apps/coach/src/coach/contract";
import { LEARNER_PHONE, startCoach, waitFor, type Coach } from "./helpers";

let coach: Coach;
let el: ReturnType<typeof createMockVoiceProvisioner>;
/** Lane A owns onboarding; here we only check the API asks for it. */
let onboarded: string[];
const engine: Engine = {
  handleInbound: async () => {},
  startOnboarding: async (_agent, learner) => void onboarded.push(learner.phone),
};

beforeEach(async () => {
  el = createMockVoiceProvisioner();
  onboarded = [];
  coach = await startCoach({ provisioner: el.provisioner, engine });
});
afterEach(() => coach.close());

const json = async <T>(res: Response | Promise<Response>, status = 200): Promise<T> => {
  const r = await res;
  const body = await r.json();
  expect(r.status, JSON.stringify(body)).toBe(status);
  return body as T;
};

async function createAgent() {
  return json<AgentView>(coach.post("/api/agents", { name: "Camille", language: "fr-FR", persona_city: "Lyon" }), 201);
}

describe("coach console API", () => {
  it("creates and lists agents; validates the body", async () => {
    const a = await createAgent();
    expect(a).toMatchObject({ name: "Camille", language: "fr-FR", persona_city: "Lyon", setup_status: "none", voice_id: null });
    expect((await json<AgentView[]>(coach.get("/api/agents"))).map((x) => x.id)).toEqual([a.id]);
    expect((await coach.post("/api/agents", { name: "", language: "fr-FR", persona_city: "Lyon" })).status).toBe(400);
    expect((await coach.post("/api/agents", { name: "X", language: "xx-XX", persona_city: "Lyon" })).status).toBe(400);
  });

  it("lists library voices and designs voices for a language", async () => {
    const lib = await json<LibraryVoice[]>(coach.get("/api/voices/library?language=fr-FR"));
    expect(lib.length).toBeGreaterThan(0);
    const previews = await json<DesignedPreview[]>(coach.post("/api/voices/design", { language: "fr-FR", description: "warm Parisian woman, early 30s" }));
    expect(previews).toHaveLength(3);
  });

  it("provisions a library voice and creates the agent's ElevenLabs agent; a second voice updates the same agent", async () => {
    const a = await createAgent();
    const v1 = await json<AgentView>(coach.post(`/api/agents/${a.id}/voice`, { source: "library", voice_id: "lib_fr_0", public_owner_id: "owner_0", name: "Camille" }));
    expect(v1).toMatchObject({ voice_id: "voice_lib_fr_0", voice_source: "library", el_agent_id: "el_agent_1" });
    const elAgent = el.agents.get("el_agent_1")!;
    expect(elAgent).toMatchObject({ language: "fr-FR", voiceId: "voice_lib_fr_0" });
    expect(elAgent.prompt).toMatch(/Lyon/);

    const v2 = await json<AgentView>(
      coach.post(`/api/agents/${a.id}/voice`, { source: "designed", generated_voice_id: "gen_1", name: "Camille v2", description: "warm Parisian woman" }),
    );
    expect(v2).toMatchObject({ voice_id: "voice_gen_1", voice_source: "designed", voice_description: "warm Parisian woman", el_agent_id: "el_agent_1" });
    expect(el.agents.size).toBe(1);
    expect(el.agents.get("el_agent_1")!.voiceId).toBe("voice_gen_1");
  });

  it("buys a Dial number with the operator's consent and reports provisioning → ready", async () => {
    const a = await createAgent();
    expect((await coach.post(`/api/agents/${a.id}/number`, {})).status).toBe(400); // consent required
    const bought = await json<AgentView>(coach.post(`/api/agents/${a.id}/number`, { consent: "I approve buying this number", imessage: true }));
    expect(bought).toMatchObject({ setup_status: "provisioning", dial_number_id: "mock_num_1" });
    const ready = await waitFor(async () => {
      const ag = await json<AgentView>(coach.get(`/api/agents/${a.id}`));
      return ag.setup_status === "ready" && ag;
    });
    expect(ready.dial_number).toMatch(/^\+1\d{10}$/);
    expect((await coach.deps.repo.agentByNumber(ready.dial_number!))?.id).toBe(a.id);
    // A second purchase for the same agent is refused.
    expect((await coach.post(`/api/agents/${a.id}/number`, { consent: "again" })).status).toBe(409);
  });

  it("adding a learner needs a ready number; it starts onboarding, and re-adding is idempotent", async () => {
    const a = await createAgent();
    expect((await coach.post(`/api/agents/${a.id}/learners`, { phone: LEARNER_PHONE })).status).toBe(409);
    await coach.post(`/api/agents/${a.id}/number`, { consent: "ok" });
    await waitFor(async () => (await json<AgentView>(coach.get(`/api/agents/${a.id}`))).setup_status === "ready");
    expect((await coach.post(`/api/agents/${a.id}/learners`, { phone: "not a phone" })).status).toBe(400);
    const l = await json<LearnerView>(coach.post(`/api/agents/${a.id}/learners`, { phone: LEARNER_PHONE, display_name: "Sam" }), 201);
    expect(l).toMatchObject({ phone: LEARNER_PHONE, onboarding_step: "trip" });
    await waitFor(() => onboarded[0]);
    const again = await json<LearnerView>(coach.post(`/api/agents/${a.id}/learners`, { phone: LEARNER_PHONE }), 200);
    expect(again.id).toBe(l.id);
    expect(onboarded).toEqual([LEARNER_PHONE]);
    expect((await json<LearnerView[]>(coach.get(`/api/agents/${a.id}/learners`))).map((x) => x.id)).toEqual([l.id]);
  });

  it("places a call to a learner and shows their memory", async () => {
    const a = await createAgent();
    await coach.post(`/api/agents/${a.id}/number`, { consent: "ok" });
    const ready = await waitFor(async () => {
      const ag = await json<AgentView>(coach.get(`/api/agents/${a.id}`));
      return ag.setup_status === "ready" && ag;
    });
    const l = await json<LearnerView>(coach.post(`/api/agents/${a.id}/learners`, { phone: LEARNER_PHONE }), 201);
    const { call_id } = await json<{ call_id: string }>(coach.post(`/api/learners/${l.id}/call`));
    expect(call_id).toBe("mock_call_1");
    expect(coach.dial.calls[0]).toMatchObject({ from: ready.dial_number_id, to: LEARNER_PHONE, language: "fr-FR" });

    await coach.deps.memory.rememberFact(l.id, { rel: "trip_to", object: "lyon" });
    const mem = await json<LearnerMemoryView>(coach.get(`/api/learners/${l.id}/memory`));
    expect(mem.learner.id).toBe(l.id);
    expect(mem.facts.map((f) => f.rel)).toContain("trip_to");
    expect(Array.isArray(mem.events)).toBe(true);
  });

  it("deleting a learner wipes their memory", async () => {
    const a = await createAgent();
    await coach.post(`/api/agents/${a.id}/number`, { consent: "ok" });
    await waitFor(async () => (await json<AgentView>(coach.get(`/api/agents/${a.id}`))).setup_status === "ready");
    const l = await json<LearnerView>(coach.post(`/api/agents/${a.id}/learners`, { phone: LEARNER_PHONE }), 201);
    await coach.deps.memory.rememberFact(l.id, { rel: "likes", object: "jazz" });
    expect((await coach.send("DELETE", `/api/learners/${l.id}`)).status).toBe(204);
    expect((await coach.deps.memory.profile(l.id)).facts).toHaveLength(0);
    expect(await coach.deps.repo.getLearner(l.id)).toBeNull();
  });
});

describe("coach console API: auth", () => {
  it("requires the ADMIN_TOKEN bearer when one is configured", async () => {
    await coach.close();
    coach = await startCoach({ provisioner: el.provisioner, engine }, { adminToken: "s3cret" });
    expect((await coach.get("/api/agents")).status).toBe(401);
    expect((await fetch(`${coach.url}/api/agents`, { headers: { authorization: "Bearer s3cret" } })).status).toBe(200);
    // Webhooks and media are not behind the admin token.
    expect((await coach.get("/health")).status).toBe(200);
  });
});
