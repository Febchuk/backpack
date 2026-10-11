import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NpcTurnResponse } from "@backpack/shared";
import { startTestServer, type TestServer } from "../helpers/server";
import { npcTurn } from "../helpers/fakes";
import { buildSystemPrompt } from "../../apps/server/src/npc/prompt";
import { PERSONAS } from "../../apps/server/src/npc/personas";
import { mockGrade } from "../../apps/server/src/npc/mockGrader";

let s: TestServer;
beforeEach(async () => {
  s = await startTestServer();
});
afterEach(() => s.close());

const newPlayer = () => s.deps.repo.createPlayer();
const state = (id: string) => s.deps.repo.getState(id)!;
const turn = async (npc: string, id: string, text: string, missionKey?: string) => {
  const res = await npcTurn(s.url, npc, id, text, missionKey);
  expect(res.status).toBe(200);
  return NpcTurnResponse.parse(await res.json());
};

describe("L1 voice lane (unit, repo-backed players)", () => {
  it("clerk completes sim_kiosk and activates cafe_order", async () => {
    const id = newPlayer();
    const r = await turn("clerk", id, "Bonjour ! Je voudrais une carte SIM, merci.");
    expect(r.mission_complete).toBe(true);
    expect(r.phrases_used).toEqual(expect.arrayContaining(["bonjour", "je voudrais une carte SIM", "merci"]));
    expect(r.heard).toBe("Bonjour ! Je voudrais une carte SIM, merci.");
    const st = state(id);
    expect(st.missions.find((m) => m.mission_key === "sim_kiosk")?.status).toBe("done");
    expect(st.missions.find((m) => m.mission_key === "cafe_order")?.status).toBe("active");
  });

  it("barista: missing s'il vous plaît is reported, hinted, logged, and counted", async () => {
    const id = newPlayer();
    const r = await turn("barista", id, "bonjour, je voudrais un cafe");
    expect(r.mission_complete).toBe(false);
    expect(r.phrases_missed).toContain("s'il vous plaît");
    expect(r.hint).toContain("s'il vous plaît");
    const st = state(id);
    expect(st.phrases.find((p) => p.text_fr === "s'il vous plaît")?.status).toBe("missed");
    expect(st.phrases.find((p) => p.text_fr === "je voudrais un café")?.status).toBe("practicing");
    expect(st.missions.find((m) => m.mission_key === "cafe_order")?.hints_used).toBe(1);
  });

  it("journey: sim then barista fumble then complete; bonjour mastered", async () => {
    const id = newPlayer();
    expect((await turn("clerk", id, "Bonjour, je voudrais une carte SIM s'il vous plaît")).mission_complete).toBe(true);
    const fumble = await turn("barista", id, "bonjour je voudrais un café");
    expect(fumble.phrases_missed).toContain("s'il vous plaît");
    const ok = await turn("barista", id, "bonjour, je voudrais un café s'il vous plaît");
    expect(ok.mission_complete).toBe(true);
    expect(ok.reply_fr).not.toBe(fumble.reply_fr);
    const st = state(id);
    expect(st.missions.every((m) => m.status === "done")).toBe(true);
    expect(st.phrases.find((p) => p.text_fr === "bonjour")?.status).toBe("mastered");
    expect(st.phrases.find((p) => p.text_fr === "s'il vous plaît")?.status).toBe("practicing");
  });

  it("open play: mission_complete null, phrases logged, margaux cold without bonjour", async () => {
    const id = newPlayer();
    const g = await turn("girard", id, "bonjour monsieur");
    expect(g.mission_complete).toBeNull();
    expect(state(id).phrases.find((p) => p.text_fr === "bonjour")?.status).toBe("practicing");
    expect((await turn("margaux", id, "une baguette")).mood).toBe("cold");
    expect((await turn("margaux", id, "Bonjour, une baguette")).mood).toBe("patient");
  });

  it("explicit mission_key overrides; bad mission_key → 400", async () => {
    const id = newPlayer();
    const r = await turn("girard", id, "bonjour je voudrais une carte sim", "sim_kiosk");
    expect(r.mission_complete).toBe(true);
    expect((await npcTurn(s.url, "girard", id, "x", "nope")).status).toBe(400);
  });

  it("404 for unknown npc, unknown or missing player", async () => {
    const id = newPlayer();
    expect((await npcTurn(s.url, "napoleon", id, "bonjour")).status).toBe(404);
    expect((await npcTurn(s.url, "clerk", "p_nope", "bonjour")).status).toBe(404);
    const form = new FormData();
    form.set("text", "bonjour");
    expect((await fetch(`${s.url}/npc/clerk/turn`, { method: "POST", body: form })).status).toBe(404);
  });

  it("audio path with no text grades as empty text", async () => {
    const id = newPlayer();
    const form = new FormData();
    form.set("player_id", id);
    form.set("audio", new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])], { type: "audio/webm" }), "turn.webm");
    const res = await fetch(`${s.url}/npc/clerk/turn`, { method: "POST", body: form });
    expect(res.status).toBe(200);
    const r = NpcTurnResponse.parse(await res.json());
    expect(r.mission_complete).toBe(false);
    expect(r.phrases_used).toEqual([]);
    expect(r.heard).toBe("");
  });

  it("mock grader is accent/case-insensitive and pure", () => {
    const input = {
      persona: PERSONAS.barista,
      missionGoal: "Order a coffee",
      targetPhrases: ["bonjour", "s'il vous plaît", "c'est combien ?"],
      requiredPhrases: ["bonjour", "s'il vous plaît"],
      level: 1,
      text: "BONJOUR, s'il vous plait. C'est combien?",
    };
    const r = mockGrade(input);
    expect(r.phrases_used).toEqual(["bonjour", "s'il vous plaît", "c'est combien ?"]);
    expect(r.mission_complete).toBe(true);
    expect(mockGrade(input)).toEqual(r);
  });

  it("system prompt carries persona, goal, phrases, level and the JSON shape", () => {
    const p = buildSystemPrompt({
      persona: PERSONAS.clerk,
      missionGoal: "Buy a SIM card",
      targetPhrases: ["bonjour", "je voudrais une carte SIM", "merci"],
      requiredPhrases: ["bonjour", "je voudrais une carte SIM"],
      level: 1,
    });
    expect(p).toContain(PERSONAS.clerk);
    expect(p).toContain("Buy a SIM card");
    expect(p).toContain('Required phrases (all must be used, by intent, to complete the mission): "bonjour", "je voudrais une carte SIM"');
    expect(p).toContain('Bonus phrases: "merci"');
    expect(p).toContain("level is 1");
    for (const k of ["reply_fr", "reply_en_hint", "heard", "phrases_used", "phrases_missed", "hint", "mission_complete", "mood"])
      expect(p).toContain(`"${k}"`);
    const open = buildSystemPrompt({ persona: PERSONAS.theo, missionGoal: null, targetPhrases: ["salut"], requiredPhrases: [], level: 1 });
    expect(open).toContain("OPEN PLAY");
    expect(open).toContain("null");
  });
});
