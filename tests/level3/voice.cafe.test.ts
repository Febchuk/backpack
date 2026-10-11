import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MISSIONS } from "@backpack/shared";
import { createRealGeminiAdapter } from "../../apps/server/src/adapters/gemini";
import { loadConfig } from "../../apps/server/src/config";
import { phraseKey, reconcileGrading, saysPhrase } from "../../apps/server/src/npc/grading";
import { mockGrade } from "../../apps/server/src/npc/mockGrader";
import { PERSONAS } from "../../apps/server/src/npc/personas";
import { startTestServer, type TestServer } from "../helpers/server";
import { mission, phraseStatus, scriptedClient, systemPrompt, turn } from "./voice.helpers";

const realConfig = loadConfig({ dbPath: ":memory:", mockGemini: false, geminiApiKey: "test-key" });
const cafe = MISSIONS.cafe_order;
const cafeInput = (text?: string) => ({
  npcId: "barista",
  persona: PERSONAS.barista,
  missionGoal: cafe.goal,
  targetPhrases: [...cafe.required, ...cafe.bonus],
  requiredPhrases: [...cafe.required],
  level: 1,
  text,
});

let s: TestServer;
beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  await s?.close();
  vi.restoreAllMocks();
});

describe("L3 voice: phrase matching", () => {
  it("is case-, accent-, punctuation- and apostrophe-insensitive, on whole words", () => {
    expect(phraseKey("S’il vous plaît !")).toBe(phraseKey("s'il vous plait"));
    expect(saysPhrase("Un café, s’il vous plaît.", "s'il vous plaît")).toBe(true);
    expect(saysPhrase("C'EST COMBIEN?", "c'est combien ?")).toBe(true);
    expect(saysPhrase("je voudrais un cafe", "je voudrais un café")).toBe(true);
    expect(saysPhrase("mercimerci", "merci")).toBe(false);
    expect(saysPhrase("", "merci")).toBe(false);
  });

  it("the mock grader accepts curly apostrophes from phone keyboards", () => {
    const r = mockGrade(cafeInput("Bonjour, je voudrais un café s’il vous plaît"));
    expect(r.mission_complete).toBe(true);
    expect(r.phrases_used).toEqual(["bonjour", "je voudrais un café", "s'il vous plaît"]);
  });
});

describe("L3 voice: café grading on the real Gemini path (fake client)", () => {
  it("prompt lists required and bonus phrases and the barista persona", async () => {
    const { client, calls } = scriptedClient();
    await createRealGeminiAdapter(realConfig, client).npcTurn(cafeInput("bonjour"));
    const prompt = systemPrompt(calls[0]);
    expect(prompt).toContain(PERSONAS.barista);
    expect(prompt).toContain(`MISSION: the player's goal is "${cafe.goal}"`);
    expect(prompt).toContain(`Required phrases (all must be used, by intent, to complete the mission): "bonjour", "je voudrais un café", "s'il vous plaît"`);
    expect(prompt).toContain(`Bonus phrases: "c'est combien ?", "merci"`);
  });

  it("union with the mock grader: phrases the mock would count are used even if Gemini missed them", async () => {
    const r = reconcileGrading(cafeInput("bonjour je voudrais un café s'il vous plaît merci"), {
      reply_fr: "Et voilà !",
      reply_en_hint: "Here you go!",
      heard: "bonjour je voudrais un cafe",
      phrases_used: [],
      phrases_missed: [...cafe.required, ...cafe.bonus],
      hint: "",
      mission_complete: false,
      mood: "warm",
    });
    const mock = mockGrade(cafeInput("bonjour je voudrais un café s'il vous plaît merci"));
    for (const p of mock.phrases_used) expect(r.phrases_used).toContain(p);
    expect(r.phrases_used).toEqual(["bonjour", "je voudrais un café", "s'il vous plaît", "merci"]);
    expect(r.phrases_missed).toEqual(["c'est combien ?"]);
    expect(r.mission_complete).toBe(true);
  });

  it("Gemini's transcript with a curly apostrophe completes the mission; bonus phrases are logged", async () => {
    const { client } = scriptedClient(() => ({
      heard: "Bonjour, je voudrais un café, s’il vous plaît. C’est combien ?",
      phrases_used: ["bonjour"],
      mission_complete: false,
    }));
    s = await startTestServer({ gemini: createRealGeminiAdapter(realConfig, client) });
    const id = s.deps.repo.createPlayer();
    s.deps.repo.completeMission(id, "sim_kiosk");

    const r = await turn(s, "barista", id, "");
    expect(r.mission_complete).toBe(true);
    expect(r.phrases_used).toEqual(["bonjour", "je voudrais un café", "s'il vous plaît", "c'est combien ?"]);
    expect(r.phrases_missed).toEqual(["merci"]);
    expect(mission(s, id, "cafe_order")?.status).toBe("done");
    expect(phraseStatus(s, id, "c'est combien ?")).toBe("practicing");
    expect(phraseStatus(s, id, "merci")).toBe("missed");
  });

  it("an overeager Gemini cannot complete the mission when a required phrase is missing, and the hint names it", async () => {
    const { client } = scriptedClient(() => ({
      heard: "bonjour, un café",
      phrases_used: ["bonjour", "je voudrais un café", "s'il vous plaît-ish"],
      hint: "Très bien !",
      mission_complete: true,
    }));
    s = await startTestServer({ gemini: createRealGeminiAdapter(realConfig, client) });
    const id = s.deps.repo.createPlayer();
    s.deps.repo.completeMission(id, "sim_kiosk");

    const r = await turn(s, "barista", id, "");
    expect(r.mission_complete).toBe(false);
    expect(r.phrases_used).toEqual(["bonjour", "je voudrais un café"]);
    expect(r.phrases_missed).toEqual(["s'il vous plaît", "c'est combien ?", "merci"]);
    expect(r.hint).toBe("Try: s'il vous plaît");
    expect(mission(s, id, "cafe_order")).toMatchObject({ status: "active", hints_used: 1 });
    expect(phraseStatus(s, id, "s'il vous plaît")).toBe("missed");
  });

  it("keeps Gemini's own hint when it already names a missing required phrase", async () => {
    const r = reconcileGrading(cafeInput(), {
      reply_fr: "Oui ?",
      reply_en_hint: "Yes?",
      heard: "bonjour",
      phrases_used: ["bonjour"],
      phrases_missed: [],
      hint: "Order politely: « Je voudrais un café, s'il vous plaît »",
      mission_complete: false,
      mood: "patient",
    });
    expect(r.hint).toBe("Order politely: « Je voudrais un café, s'il vous plaît »");
    expect(r.mission_complete).toBe(false);
  });

  it("fumble then success across turns on the real path", async () => {
    const { client } = scriptedClient((_p, n) =>
      n === 1
        ? { heard: "bonjour je voudrais un cafe", phrases_used: ["bonjour", "je voudrais un café"] }
        : { heard: "je voudrais un café s'il vous plaît, merci", phrases_used: ["je voudrais un café", "s'il vous plaît", "merci"] },
    );
    s = await startTestServer({ gemini: createRealGeminiAdapter(realConfig, client) });
    const id = s.deps.repo.createPlayer();
    s.deps.repo.completeMission(id, "sim_kiosk");

    const fumble = await turn(s, "barista", id, "");
    expect(fumble.mission_complete).toBe(false);
    expect(fumble.hint).toContain("s'il vous plaît");
    // "bonjour" was said one turn earlier: it still counts toward completion, but is only logged for that turn.
    const second = await turn(s, "barista", id, "");
    expect(second.mission_complete).toBe(true);
    expect(second.phrases_used).toEqual(["je voudrais un café", "s'il vous plaît", "merci"]);
    expect(second.phrases_missed).toContain("bonjour");
    expect(mission(s, id, "cafe_order")?.status).toBe("done");
    expect(phraseStatus(s, id, "je voudrais un café")).toBe("mastered");
  });
});
