import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MISSIONS, NpcTurnResponse } from "@backpack/shared";
import {
  createRealGeminiAdapter,
  getLatencyStats,
  resetLatencyStats,
  type GeminiClient,
} from "../../apps/server/src/adapters/gemini";
import type { NpcTurnInput } from "../../apps/server/src/adapters/types";
import { loadConfig } from "../../apps/server/src/config";
import { PERSONAS } from "../../apps/server/src/npc/personas";
import { startTestServer } from "../helpers/server";
import { npcTurn } from "../helpers/fakes";

type GenerateContentParameters = Parameters<GeminiClient["models"]["generateContent"]>[0];

const config = loadConfig({ dbPath: ":memory:", mockGemini: false, geminiApiKey: "test-key" });
const sim = MISSIONS.sim_kiosk;

const clerkInput = (over: Partial<NpcTurnInput> = {}): NpcTurnInput => ({
  npcId: "clerk",
  persona: PERSONAS.clerk,
  missionGoal: sim.goal,
  targetPhrases: [...sim.required, ...sim.bonus],
  requiredPhrases: [...sim.required],
  level: 1,
  ...over,
});

const valid: NpcTurnResponse = {
  reply_fr: "Voilà votre carte SIM !",
  reply_en_hint: "Here's your SIM card!",
  heard: "bonjour je voudrais une carte sim",
  phrases_used: ["bonjour", "je voudrais une carte SIM"],
  phrases_missed: ["merci"],
  hint: "Très bien !",
  mission_complete: true,
  mood: "warm",
};

/** A fake @google/genai client that returns the queued response texts in order and records every request. */
function fakeClient(...texts: string[]) {
  const calls: GenerateContentParameters[] = [];
  const client: GeminiClient = {
    models: {
      async generateContent(params) {
        calls.push(params);
        return { text: texts[Math.min(calls.length, texts.length) - 1] };
      },
    },
  };
  return { client, calls };
}

beforeEach(() => {
  resetLatencyStats();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("L2 voice: real Gemini adapter (fake client)", () => {
  it("valid JSON passes through, with persona prompt and JSON mode", async () => {
    const { client, calls } = fakeClient(JSON.stringify(valid));
    const r = await createRealGeminiAdapter(config, client).npcTurn(clerkInput({ text: "Bonjour, je voudrais une carte SIM" }));
    expect(NpcTurnResponse.parse(r)).toEqual(valid);
    expect(calls).toHaveLength(1);
    const cfg = calls[0].config!;
    expect(cfg.responseMimeType).toBe("application/json");
    expect(cfg.responseSchema).toBeTruthy();
    expect(String(cfg.systemInstruction)).toContain(PERSONAS.clerk);
    expect(calls[0].model).toMatch(/flash/);
  });

  it("malformed JSON then valid JSON retries once", async () => {
    const { client, calls } = fakeClient("{not json", JSON.stringify(valid));
    const r = await createRealGeminiAdapter(config, client).npcTurn(clerkInput({ text: "bonjour je voudrais une carte sim" }));
    expect(calls).toHaveLength(2);
    expect(r.reply_fr).toBe(valid.reply_fr);
    expect(r.mission_complete).toBe(true);
  });

  it("malformed twice gives the in-character fallback", async () => {
    const { client, calls } = fakeClient("nope", JSON.stringify({ reply_fr: 42 }));
    const r = await createRealGeminiAdapter(config, client).npcTurn(clerkInput({ text: "euh" }));
    expect(calls).toHaveLength(2);
    expect(r.reply_fr).toBe("Pardon ? Vous pouvez répéter ?");
    expect(r.phrases_used).toEqual([]);
    expect(r.phrases_missed).toEqual(["bonjour", "je voudrais une carte SIM", "merci"]);
    expect(r.mission_complete).toBe(false);
    expect(NpcTurnResponse.safeParse(r).success).toBe(true);

    const open = await createRealGeminiAdapter(config, fakeClient("x").client).npcTurn(
      clerkInput({ npcId: "girard", persona: PERSONAS.girard, missionGoal: null, targetPhrases: ["bonjour"], requiredPhrases: [] }),
    );
    expect(open.mission_complete).toBeNull();
  });

  it("a thrown API error retries and then falls back instead of failing the turn", async () => {
    let n = 0;
    const client: GeminiClient = {
      models: {
        async generateContent() {
          n++;
          throw new Error("503");
        },
      },
    };
    const r = await createRealGeminiAdapter(config, client).npcTurn(clerkInput({ text: "bonjour" }));
    expect(n).toBe(2);
    expect(r.reply_fr).toBe("Pardon ? Vous pouvez répéter ?");
  });

  it("union grading counts 'Bonjour je voudrais une carte sim' even when Gemini says missed", async () => {
    const stingy: NpcTurnResponse = {
      ...valid,
      heard: "Bonjour je voudrais une carte sim",
      phrases_used: [],
      phrases_missed: ["bonjour", "je voudrais une carte SIM", "merci"],
      hint: "Try: je voudrais une carte SIM",
      mission_complete: false,
    };
    const { client } = fakeClient(JSON.stringify(stingy));
    const r = await createRealGeminiAdapter(config, client).npcTurn(clerkInput({ audio: { data: Buffer.from([1]), mimeType: "audio/webm" } }));
    expect(r.phrases_used).toEqual(["bonjour", "je voudrais une carte SIM"]);
    expect(r.phrases_missed).toEqual(["merci"]);
    expect(r.mission_complete).toBe(true);
    expect(r.reply_fr).toBe(stingy.reply_fr);
    expect(r.hint).toBe(stingy.hint);
  });

  it("union keeps Gemini's intent judgement and drops invented phrases; open play stays null", async () => {
    const generous = { ...valid, heard: "bonjou, je voudré une carte", phrases_used: ["Bonjour", "je voudrais une carte SIM", "au revoir"] };
    const r = await createRealGeminiAdapter(config, fakeClient(JSON.stringify(generous)).client).npcTurn(clerkInput());
    expect(r.phrases_used).toEqual(["bonjour", "je voudrais une carte SIM"]);
    expect(r.mission_complete).toBe(true);

    const open = await createRealGeminiAdapter(config, fakeClient(JSON.stringify({ ...valid, mission_complete: true })).client).npcTurn(
      clerkInput({ missionGoal: null, requiredPhrases: [], targetPhrases: ["bonjour", "merci"] }),
    );
    expect(open.mission_complete).toBeNull();
    expect(open.phrases_used).toEqual(["bonjour"]);
  });

  it("audio is sent as base64 inlineData with a Gemini-friendly mimeType", async () => {
    const { client, calls } = fakeClient(JSON.stringify(valid));
    const data = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01]);
    await createRealGeminiAdapter(config, client).npcTurn(clerkInput({ audio: { data, mimeType: "audio/webm;codecs=opus" } }));
    const contents = calls[0].contents as { role: string; parts: { inlineData?: { data: string; mimeType: string } }[] }[];
    const inline = contents[0].parts.find((p) => p.inlineData)?.inlineData;
    expect(inline).toEqual({ data: data.toString("base64"), mimeType: "audio/webm" });
  });

  it("records latency per turn and exposes a rolling p50", async () => {
    const adapter = createRealGeminiAdapter(config, fakeClient(JSON.stringify(valid)).client);
    expect(getLatencyStats().count).toBe(0);
    await adapter.npcTurn(clerkInput({ text: "bonjour" }));
    await adapter.npcTurn(clerkInput({ text: "bonjour" }));
    const stats = getLatencyStats();
    expect(stats.count).toBe(2);
    expect(stats.p50).toBeGreaterThanOrEqual(0);
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/^\[gemini\] npc=clerk \d+ms/));
  });

  it("route passes npcId and the last 3 turns with that NPC as memory", async () => {
    const { client, calls } = fakeClient(JSON.stringify(valid));
    const s = await startTestServer({ gemini: createRealGeminiAdapter(config, client) });
    try {
      const id = s.deps.repo.createPlayer();
      for (let i = 1; i <= 4; i++) expect((await npcTurn(s.url, "girard", id, `bonjour ${i}`)).status).toBe(200);
      await npcTurn(s.url, "theo", id, "salut");
      const last = String(calls.at(-1)!.config!.systemInstruction);
      expect(last).toContain(PERSONAS.theo);
      expect(last).toContain("first time");
      const girard4 = String(calls[3].config!.systemInstruction);
      expect(girard4).toContain("MEMORY");
      expect((girard4.match(/- Player:/g) ?? []).length).toBe(3);
      expect(String(calls[1].config!.systemInstruction)).toContain("Voilà votre carte SIM");
    } finally {
      await s.close();
    }
  });
});

describe.skipIf(!(process.env.LIVE === "1" && process.env.GEMINI_API_KEY))("@live Gemini NPC turn", () => {
  it("@live clerk answers 'Bonjour, je voudrais une carte SIM' with a valid turn", async () => {
    vi.restoreAllMocks();
    const adapter = createRealGeminiAdapter(loadConfig({ mockGemini: false }));
    const r = await adapter.npcTurn(clerkInput({ text: "Bonjour, je voudrais une carte SIM" }));
    console.log("[live] turn", r, "latency", getLatencyStats());
    expect(NpcTurnResponse.safeParse(r).success).toBe(true);
    expect(r.reply_fr).not.toBe("Pardon ? Vous pouvez répéter ?");
    expect(r.mission_complete).toBe(true);
  }, 30_000);
});
