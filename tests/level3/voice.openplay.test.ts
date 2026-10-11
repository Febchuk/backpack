import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRealGeminiAdapter } from "../../apps/server/src/adapters/gemini";
import { loadConfig } from "../../apps/server/src/config";
import { OPEN_PLAY_PHRASES } from "../../apps/server/src/npc/mockGrader";
import { PERSONAS } from "../../apps/server/src/npc/personas";
import { startTestServer, type TestServer } from "../helpers/server";
import { phraseStatus, scriptedClient, systemPrompt, turn } from "./voice.helpers";

const realConfig = loadConfig({ dbPath: ":memory:", mockGemini: false, geminiApiKey: "test-key" });

let s: TestServer;
afterEach(async () => {
  await s?.close();
  vi.restoreAllMocks();
});
beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("L3 voice: open-play phrases and personas", () => {
  it("Girard teaches beginner small talk; Margaux teaches boulangerie ordering and haggling", () => {
    expect(OPEN_PLAY_PHRASES.girard).toEqual(expect.arrayContaining(["bonjour", "ça va ?"]));
    expect(OPEN_PLAY_PHRASES.margaux).toEqual(expect.arrayContaining(["bonjour", "une baguette", "c'est combien ?", "c'est trop cher"]));
    for (const list of [OPEN_PLAY_PHRASES.girard, OPEN_PLAY_PHRASES.margaux]) {
      expect(list.length).toBeGreaterThanOrEqual(4);
      expect(list.length).toBeLessThanOrEqual(6);
      expect(new Set(list).size).toBe(list.length);
    }
    expect(PERSONAS.girard).toMatch(/retired/i);
    expect(PERSONAS.girard).toMatch(/dog/i);
    expect(PERSONAS.girard).toMatch(/history/i);
    expect(PERSONAS.margaux).toMatch(/boulangerie/i);
    expect(PERSONAS.margaux).toMatch(/bonjour/i);
    expect(PERSONAS.margaux).toMatch(/cold/i);
    expect(PERSONAS.margaux).toMatch(/c'est combien/i);
  });
});

describe("L3 voice: open play on the mock path", () => {
  beforeEach(async () => {
    s = await startTestServer();
  });

  it("Girard: mission_complete null, used phrases practicing, the rest missed", async () => {
    const id = s.deps.repo.createPlayer();
    const r = await turn(s, "girard", id, "Bonjour monsieur ! Ça va ?");
    expect(r.mission_complete).toBeNull();
    expect(r.phrases_used).toEqual(["bonjour", "ça va ?"]);
    expect(r.phrases_missed).toEqual(OPEN_PLAY_PHRASES.girard.filter((p) => p !== "bonjour" && p !== "ça va ?"));
    expect(phraseStatus(s, id, "bonjour")).toBe("practicing");
    expect(phraseStatus(s, id, "ça va ?")).toBe("practicing");
    expect(phraseStatus(s, id, "il fait beau")).toBe("missed");
    // Open play never touches missions.
    expect(s.deps.repo.getState(id)!.missions.find((m) => m.mission_key === "sim_kiosk")?.status).toBe("active");
  });

  it("Margaux: cold and unserved without bonjour, served after; haggling phrases logged", async () => {
    const id = s.deps.repo.createPlayer();
    const rude = await turn(s, "margaux", id, "Une baguette.");
    expect(rude.mood).toBe("cold");
    expect(rude.mission_complete).toBeNull();
    expect(rude.phrases_used).toEqual(["une baguette"]);
    expect(rude.hint).toMatch(/bonjour/i);

    const polite = await turn(s, "margaux", id, "Bonjour madame ! Une baguette, c'est combien ? C’est trop cher !");
    expect(polite.mood).toBe("patient");
    expect(polite.reply_fr).not.toBe(rude.reply_fr);
    expect(polite.phrases_used).toEqual(["bonjour", "une baguette", "c'est combien ?", "c'est trop cher"]);
    expect(polite.phrases_missed).toEqual(["un croissant"]);
    expect(phraseStatus(s, id, "une baguette")).toBe("mastered");
    expect(phraseStatus(s, id, "c'est trop cher")).toBe("practicing");
    expect(phraseStatus(s, id, "un croissant")).toBe("missed");
    expect(s.deps.repo.missedPhrases(id)).toContain("un croissant");
  });
});

describe("L3 voice: open play on the real Gemini path (fake client)", () => {
  it("Margaux: prompt is open play with her phrases; a stray mission_complete is forced to null", async () => {
    const { client, calls } = scriptedClient(() => ({
      heard: "bonjour je voudrais une baguette",
      reply_fr: "Bonjour ! Voilà votre baguette.",
      phrases_used: ["bonjour", "une baguette", "un pain au chocolat"],
      mission_complete: true,
      mood: "warm",
    }));
    s = await startTestServer({ gemini: createRealGeminiAdapter(realConfig, client) });
    const id = s.deps.repo.createPlayer();
    const r = await turn(s, "margaux", id, "bonjour je voudrais une baguette");

    expect(r.mission_complete).toBeNull();
    expect(r.phrases_used).toEqual(["bonjour", "une baguette"]);
    expect(r.phrases_missed).toEqual(OPEN_PLAY_PHRASES.margaux.filter((p) => p !== "bonjour" && p !== "une baguette"));
    expect(r.reply_fr).toBe("Bonjour ! Voilà votre baguette.");

    const prompt = systemPrompt(calls[0]);
    expect(prompt).toContain(PERSONAS.margaux);
    expect(prompt).toContain("OPEN PLAY");
    expect(prompt).not.toContain("MISSION:");
    for (const p of OPEN_PLAY_PHRASES.margaux) expect(prompt).toContain(`"${p}"`);

    expect(phraseStatus(s, id, "une baguette")).toBe("practicing");
    expect(phraseStatus(s, id, "c'est combien ?")).toBe("missed");
    expect(s.deps.repo.getState(id)!.missions.find((m) => m.mission_key === "sim_kiosk")?.status).toBe("active");
  });

  it("Girard: grading unions Gemini's judgement with what was heard, and remembers past turns", async () => {
    const { client, calls } = scriptedClient((_p, n) =>
      n === 1
        ? { heard: "bonjour, ca va?", phrases_used: [], mission_complete: false }
        : { heard: "je m appelle Sam", phrases_used: ["Je m'appelle"], mission_complete: null },
    );
    s = await startTestServer({ gemini: createRealGeminiAdapter(realConfig, client) });
    const id = s.deps.repo.createPlayer();

    const first = await turn(s, "girard", id, "");
    expect(first.mission_complete).toBeNull();
    expect(first.phrases_used).toEqual(["bonjour", "ça va ?"]);

    const second = await turn(s, "girard", id, "");
    expect(second.mission_complete).toBeNull();
    expect(second.phrases_used).toEqual(["je m'appelle"]);
    expect(systemPrompt(calls[1])).toContain('- Player: "bonjour, ca va?"');
    expect(phraseStatus(s, id, "bonjour")).toBe("missed");
    expect(phraseStatus(s, id, "je m'appelle")).toBe("practicing");
  });
});
