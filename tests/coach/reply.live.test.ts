import "dotenv/config";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../apps/coach/src/config";
import { createLlm } from "../../apps/coach/src/llm/gemini";
import { buildSystemPrompt } from "../../apps/coach/src/coach/prompt";
import type { Agent, Learner } from "../../apps/coach/src/db/repo";
import type { Llm } from "../../apps/coach/src/coach/contract";

const LIVE = process.env.LIVE === "1" && !!process.env.GEMINI_API_KEY;

const agent: Agent = {
  id: "ag_live",
  name: "Camille",
  language: "fr-FR",
  persona_city: "Lyon",
  voice_id: null,
  voice_source: null,
  voice_description: null,
  el_agent_id: null,
  dial_number_id: "num_live",
  dial_number: "+15550100001",
  setup_status: "ready",
  created_at: new Date().toISOString(),
};
const learner: Learner = {
  id: "ln_live",
  agent_id: agent.id,
  phone: "+447700900123",
  display_name: "Sam",
  level: "A2",
  onboarding_step: "done",
  created_at: new Date().toISOString(),
};
const recall = { facts: ["Travelling to lyon"], memories: [], struggles: [] };

describe.skipIf(!LIVE)("@live coach Gemini reply (real API)", () => {
  const reply: Llm["reply"] = (input) => createLlm(loadConfig({ mockGemini: false })).reply(input);

  it("@live answers in French and corrects a mistake", async () => {
    const r = await reply({ system: buildSystemPrompt({ agent, learner, recall }), history: [], message: "Je suis allé au marché et je mangé une crêpe" });
    console.log("[live]", JSON.stringify(r));
    expect(r.reply.length).toBeGreaterThan(0);
    expect(r.reply).toMatch(/[àâçéèêëîïôûùüÿœ]|\b(le|la|les|tu|je|et)\b/i);
    expect(r.correction).toBeTruthy();
  }, 30_000);

  it("@live extracts the onboarding trip facts", async () => {
    const r = await reply({
      system: buildSystemPrompt({
        agent,
        learner: { ...learner, level: null, onboarding_step: "trip" },
        recall: { facts: [], memories: [], struggles: [] },
        onboarding: { step: "trip", nextQuestion: "How's your French right now?" },
      }),
      history: [{ role: "agent", text: "Coucou Sam! Tell me about your trip: where are you going, when, and who with?" }],
      message: "Going to Lyon in three weeks with my sister",
      expectFacts: ["trip_to", "trip_date", "travelling_with"],
    });
    console.log("[live]", JSON.stringify(r));
    expect(r.facts.find((f) => f.rel === "trip_to")?.object).toMatch(/lyon/i);
    expect(r.facts.some((f) => f.rel === "travelling_with")).toBe(true);
  }, 30_000);
});
