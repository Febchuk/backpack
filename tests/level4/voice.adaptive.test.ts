import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MISSIONS, NpcTurnResponse } from "@backpack/shared";
import { createRealGeminiAdapter, spokenReply } from "../../apps/server/src/adapters/gemini";
import { loadConfig } from "../../apps/server/src/config";
import { GESTURES, mockGrade, withGesture } from "../../apps/server/src/npc/mockGrader";
import { PERSONAS } from "../../apps/server/src/npc/personas";
import { buildSystemPrompt, levelGuidance } from "../../apps/server/src/npc/prompt";
import { LEVEL1_TTS_SPEED, lunaTtsOverride } from "../../apps/server/src/voice/prompt";
import { splitStageDirection, ttsRateForLevel, TTS_RATE_BEGINNER, TTS_RATE_DEFAULT } from "../../apps/game/src/voice/ttsRate";
import { startTestServer, type TestServer } from "../helpers/server";
import { scriptedClient, systemPrompt, turn } from "../level3/voice.helpers";

const realConfig = loadConfig({ dbPath: ":memory:", mockGemini: false, geminiApiKey: "test-key" });
const cafe = MISSIONS.cafe_order;
const input = (level: number, npcId = "barista") => ({
  npcId,
  persona: PERSONAS[npcId as keyof typeof PERSONAS],
  missionGoal: npcId === "barista" ? cafe.goal : null,
  targetPhrases: [...cafe.required, ...cafe.bonus],
  requiredPhrases: npcId === "barista" ? [...cafe.required] : [],
  level,
});

let s: TestServer | undefined;
beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  await s?.close();
  s = undefined;
  vi.restoreAllMocks();
});

describe("L4 voice: adaptive NPC prompts", () => {
  it("level 1: slow, short sentences, simple words, and asterisk stage directions only in reply_en_hint", () => {
    const p = buildSystemPrompt(input(1));
    expect(p).toContain(levelGuidance(1));
    expect(p).toMatch(/slowly/i);
    expect(p).toMatch(/short sentence/i);
    expect(p).toMatch(/at most 8 words/);
    expect(p).toContain('"reply_en_hint" may begin with a short stage direction in asterisks');
    expect(p).toContain("*points at the menu*");
    expect(p).toMatch(/Never put stage directions or asterisks in "reply_fr"/);
  });

  it("level 2+: natural pace, no gesture instructions", () => {
    for (const level of [2, 3]) {
      const p = buildSystemPrompt(input(level));
      expect(p).toContain(`French level is ${level}`);
      expect(p).toMatch(/natural pace/);
      expect(p).not.toMatch(/stage direction/);
      expect(p).not.toMatch(/at most 8 words/);
    }
  });

  it("fast talkers slow down for beginners too", () => {
    expect(buildSystemPrompt(input(1, "theo"))).toMatch(/Even if you are normally fast or slangy, slow down/);
  });

  it("the route passes the player's level to the model", async () => {
    const { client, calls } = scriptedClient();
    s = await startTestServer({ gemini: createRealGeminiAdapter(realConfig, client) });
    const id = s.deps.repo.createPlayer();
    await turn(s, "girard", id, "bonjour");
    expect(s.deps.repo.getState(id)!.player.level).toBe(1);
    expect(systemPrompt(calls[0])).toContain(levelGuidance(1));
  });
});

describe("L4 voice: stage directions", () => {
  it("real path: a stage direction in reply_en_hint is kept; one leaked into reply_fr is stripped (it is spoken)", async () => {
    const { client } = scriptedClient(() => ({
      heard: "bonjour",
      reply_fr: "*sourit* Bonjour ! Un café ?",
      reply_en_hint: "*points at the menu* Hello! A coffee?",
    }));
    const r = await createRealGeminiAdapter(realConfig, client).npcTurn({ ...input(1), text: "bonjour" });
    expect(r.reply_fr).toBe("Bonjour ! Un café ?");
    expect(r.reply_en_hint).toBe("*points at the menu* Hello! A coffee?");
    expect(NpcTurnResponse.safeParse(r).success).toBe(true);
    expect(spokenReply("*sourit*")).toBe("*sourit*");
  });

  it("mock path: level-1 hints start with the NPC's gesture; level 2 hints do not", () => {
    const l1 = mockGrade({ ...input(1), text: "bonjour je voudrais un café s'il vous plaît" });
    expect(l1.reply_en_hint.startsWith(`${GESTURES.barista} `)).toBe(true);
    expect(l1.mission_complete).toBe(true);
    const l2 = mockGrade({ ...input(2), text: "bonjour je voudrais un café s'il vous plaît" });
    expect(l2.reply_en_hint).not.toMatch(/^\*/);
    expect(l2.reply_fr).toBe(l1.reply_fr);
    for (const g of Object.values(GESTURES)) expect(g).toMatch(/^\*[^*]+\*$/);
    expect(withGesture("*waves* Hi", "barista", 1)).toBe("*waves* Hi");
  });

  it("the game can split the stage direction off for italics", () => {
    expect(splitStageDirection("*points at the menu* What would you like?")).toEqual({
      direction: "points at the menu",
      text: "What would you like?",
    });
    expect(splitStageDirection("Hello!")).toEqual({ direction: null, text: "Hello!" });
  });
});

describe("L4 voice: slower TTS at level 1", () => {
  it("browser speechSynthesis rate", () => {
    expect(ttsRateForLevel(1)).toBe(TTS_RATE_BEGINNER);
    expect(ttsRateForLevel(undefined)).toBe(TTS_RATE_BEGINNER);
    expect(ttsRateForLevel(2)).toBe(TTS_RATE_DEFAULT);
    expect(TTS_RATE_BEGINNER).toBeLessThan(TTS_RATE_DEFAULT);
  });

  it("Luna's ElevenLabs tts override: slower at level 1 only when the speed override is enabled", () => {
    expect(lunaTtsOverride({ voiceId: "v1", level: 1, speedOverride: true })).toEqual({ voice_id: "v1", speed: LEVEL1_TTS_SPEED });
    expect(lunaTtsOverride({ voiceId: "v1", level: 2, speedOverride: true })).toEqual({ voice_id: "v1" });
    expect(lunaTtsOverride({ voiceId: "v1", level: 1 })).toEqual({ voice_id: "v1" });
    expect(lunaTtsOverride({ level: 1 })).toBeUndefined();
    expect(LEVEL1_TTS_SPEED).toBeGreaterThanOrEqual(0.7);
    expect(LEVEL1_TTS_SPEED).toBeLessThan(1);
  });
});
