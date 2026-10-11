import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import { MISSIONS, NpcTurnResponse, type MissionKey, type NpcId } from "@backpack/shared";
import { createRealGeminiAdapter, fallbackTurn, getLatencyStats } from "../../apps/server/src/adapters/gemini";
import type { NpcTurnInput } from "../../apps/server/src/adapters/types";
import { loadConfig } from "../../apps/server/src/config";
import { PERSONAS } from "../../apps/server/src/npc/personas";
import { OPEN_PLAY_PHRASES } from "../../apps/server/src/npc/mockGrader";

const LIVE = process.env.LIVE === "1" && !!process.env.GEMINI_API_KEY;
const TURN_BUDGET_MS = 5000;

function missionInput(npc: NpcId, key: MissionKey, text: string): NpcTurnInput {
  const m = MISSIONS[key];
  return {
    npcId: npc,
    persona: PERSONAS[npc],
    missionGoal: m.goal,
    targetPhrases: [...m.required, ...m.bonus],
    requiredPhrases: [...m.required],
    level: 1,
    text,
  };
}

describe.skipIf(!LIVE)("@live L2 Gemini NPC contract (real API)", () => {
  const adapter = createRealGeminiAdapter(loadConfig({ mockGemini: false }));
  const timings: { label: string; ms: number }[] = [];

  /** One real turn: schema-valid, not the adapter's "say again" fallback, under the per-turn budget. */
  async function turn(label: string, input: NpcTurnInput) {
    const t0 = performance.now();
    const r = await adapter.npcTurn(input);
    const ms = Math.round(performance.now() - t0);
    timings.push({ label, ms });
    console.log(`[live] ${label} ${ms}ms`, JSON.stringify(r));
    expect(NpcTurnResponse.safeParse(r).success, "schema").toBe(true);
    expect(r.reply_fr, "adapter fell back (API error or unparseable JSON)").not.toBe(fallbackTurn(input).reply_fr);
    expect(ms, `${label} took ${ms}ms`).toBeLessThan(TURN_BUDGET_MS);
    return r;
  }

  afterAll(() => console.log("[live] timings", timings, "adapter stats", getLatencyStats()));

  it("@live clerk: a correct line completes the SIM mission", async () => {
    const r = await turn("clerk correct", missionInput("clerk", "sim_kiosk", "Bonjour, je voudrais une carte SIM, s'il vous plaît."));
    expect(r.mission_complete).toBe(true);
    expect(r.phrases_used).toEqual(expect.arrayContaining(["bonjour", "je voudrais une carte SIM"]));
  }, 30_000);

  it("@live barista: an order without 's'il vous plaît' lists it in phrases_missed", async () => {
    const r = await turn("barista no-svp", missionInput("barista", "cafe_order", "Bonjour, je voudrais un café."));
    expect(r.phrases_missed).toContain("s'il vous plaît");
    expect(r.mission_complete).toBe(false);
  }, 30_000);

  it("@live girard: open play returns mission_complete null", async () => {
    const r = await turn("girard open", {
      npcId: "girard",
      persona: PERSONAS.girard,
      missionGoal: null,
      targetPhrases: OPEN_PLAY_PHRASES.girard,
      requiredPhrases: [],
      level: 1,
      text: "Bonjour monsieur ! Ça va ? Il est mignon, votre chien.",
    });
    expect(r.mission_complete).toBeNull();
  }, 30_000);

  it(`@live every turn above finished under ${TURN_BUDGET_MS} ms`, () => {
    expect(timings).toHaveLength(3);
    for (const t of timings) expect(t.ms, t.label).toBeLessThan(TURN_BUDGET_MS);
  });
});
