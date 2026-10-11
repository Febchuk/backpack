import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRealGeminiAdapter } from "../../apps/server/src/adapters/gemini";
import { loadConfig } from "../../apps/server/src/config";
import { OPEN_PLAY_PHRASES } from "../../apps/server/src/npc/mockGrader";
import { PERSONAS } from "../../apps/server/src/npc/personas";
import { startTestServer, type TestServer } from "../helpers/server";
import { phraseStatus, scriptedClient, systemPrompt, turn } from "../level3/voice.helpers";

const realConfig = loadConfig({ dbPath: ":memory:", mockGemini: false, geminiApiKey: "test-key" });

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

describe("L4 voice: Inès and Théo personas", () => {
  it("Inès: hostel receptionist, half-bilingual, directions and next missions", () => {
    expect(PERSONAS.ines).toMatch(/hostel/i);
    expect(PERSONAS.ines).toMatch(/half-bilingual/i);
    expect(PERSONAS.ines).toMatch(/English/);
    expect(PERSONAS.ines).toMatch(/à gauche/);
    expect(PERSONAS.ines).toMatch(/café/);
    expect(PERSONAS.ines).toMatch(/market/i);
    expect(OPEN_PLAY_PHRASES.ines).toEqual(expect.arrayContaining(["bonjour", "où est", "à gauche", "à droite"]));
  });

  it("Théo: busker, fast talker, slang and verlan", () => {
    expect(PERSONAS.theo).toMatch(/busk/i);
    expect(PERSONAS.theo).toMatch(/fast talker/i);
    expect(PERSONAS.theo).toMatch(/slang/i);
    expect(PERSONAS.theo).toMatch(/verlan/i);
    expect(PERSONAS.theo).toMatch(/tutoie/);
    expect(OPEN_PLAY_PHRASES.theo).toEqual(expect.arrayContaining(["salut", "ça roule ?", "c'est ouf", "à plus"]));
  });
});

describe("L4 voice: Inès and Théo in open play (mock)", () => {
  beforeEach(async () => {
    s = await startTestServer();
  });

  it("Inès: directions phrases logged, mission_complete null, gesture at level 1", async () => {
    const id = s!.deps.repo.createPlayer();
    const r = await turn(s!, "ines", id, "Bonjour ! Où est le café ? À gauche ?");
    expect(r.mission_complete).toBeNull();
    expect(r.phrases_used).toEqual(["bonjour", "où est", "à gauche"]);
    expect(r.phrases_missed).toEqual(["c'est loin ?", "à droite"]);
    expect(r.reply_en_hint).toMatch(/^\*[^*]+\* /);
    expect(phraseStatus(s!, id, "où est")).toBe("practicing");
    expect(phraseStatus(s!, id, "à droite")).toBe("missed");
  });

  it("Théo: slang logged; a turn without his phrases gets a hint to say salut", async () => {
    const id = s!.deps.repo.createPlayer();
    const r = await turn(s!, "theo", id, "Salut ! Ça roule ? C'est ouf !");
    expect(r.mission_complete).toBeNull();
    expect(r.phrases_used).toEqual(["salut", "ça roule ?", "c'est ouf"]);
    expect(phraseStatus(s!, id, "c'est ouf")).toBe("practicing");
    const lost = await turn(s!, "theo", id, "euh...");
    expect(lost.hint).toBe("Try: salut");
    expect(lost.mood).toBe("patient");
  });
});

describe("L4 voice: Inès and Théo in open play (real Gemini path, fake client)", () => {
  it("prompts carry their persona and phrases; mission_complete is forced to null", async () => {
    const { client, calls } = scriptedClient((p) =>
      String(p.config!.systemInstruction).includes(PERSONAS.theo)
        ? { heard: "salut ça roule", phrases_used: ["salut"], mission_complete: true }
        : { heard: "où est la boulangerie", phrases_used: [], mission_complete: false },
    );
    s = await startTestServer({ gemini: createRealGeminiAdapter(realConfig, client) });
    const id = s.deps.repo.createPlayer();

    const theo = await turn(s, "theo", id, "");
    expect(theo.mission_complete).toBeNull();
    expect(theo.phrases_used).toEqual(["salut", "ça roule ?"]);
    expect(systemPrompt(calls[0])).toContain(PERSONAS.theo);
    for (const p of OPEN_PLAY_PHRASES.theo) expect(systemPrompt(calls[0])).toContain(`"${p}"`);

    const ines = await turn(s, "ines", id, "");
    expect(ines.mission_complete).toBeNull();
    expect(ines.phrases_used).toEqual(["où est"]);
    expect(systemPrompt(calls[1])).toContain(PERSONAS.ines);
    expect(systemPrompt(calls[1])).toContain("OPEN PLAY");
  });
});
